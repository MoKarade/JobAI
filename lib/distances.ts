// lib/distances.ts — décider quelles distances calculer, et lesquelles ne pas toucher.
//
// POURQUOI CE FICHIER EXISTE
// Les 40 offres entrées le 2026-07-31 portent toutes `km: null` : le déposant ne peut pas
// mesurer une distance, et il a eu raison de ne pas en inventer. Mais le barème donne 10
// points sur 20 à une distance INCONNUE — autant qu'à 25 km. Une offre hors rayon peut donc
// figurer haut dans la liste, alors que le rayon est le critère numéro un de Marc.
//
// GARDE-FOU N°1 — le domicile ne sort JAMAIS
// Le calcul se fait ici, côté serveur, à partir de `DOMICILE_LAT`/`DOMICILE_LON`. Seule la
// DISTANCE est écrite en base et affichée. Les coordonnées ne partent ni au navigateur, ni
// vers un service tiers, ni dans un fichier versionné. C'est ce qui permet d'afficher
// « 12 km » sans jamais publier d'où on compte.
//
// CE QU'ON NE RECALCULE PAS
// Une distance déjà relevée à la main par Marc, et une note `manuel`. Elles viennent de sa
// lecture ; une mesure automatique n'a pas à les écraser — même si elle est plus précise,
// c'est lui qui décide. Fonctions PURES : la décision se teste sans base ni réseau.

import { computeScore, PLAFOND_NOTE_CALCULEE } from "./scoring";
import { PROFIL_DEFAUT, type Profil } from "./profil";
import { memeEmployeur, positionDe } from "./employeurs";
import type { Offre } from "./types";

/** Une position géocodée, avec ce qu'elle vaut vraiment. */
export interface Position {
  lat: number;
  lon: number;
  /** `exacte` = l'employeur lui-même ; `ville` = repli au centre de sa municipalité. */
  precision: "exacte" | "ville";
}

/** Ce qu'il faut écrire pour une offre. */
export interface MiseAJourDistance {
  id: string;
  km: number;
  /** Recalculée avec la vraie distance. `null` si la note ne doit pas changer. */
  score: number | null;
  precision: "exacte" | "ville";
}

/** Arrondi au dixième : afficher « 12,3 km » est honnête, « 12,3184 km » ne l'est pas. */
export function arrondirKm(km: number): number {
  return Math.round(km * 10) / 10;
}

/**
 * Efface la distance déjà mesurée des offres dont l'employeur vient d'être PRÉCISÉ
 * (« ville » → « exacte »), pour que `planifierDistances` la recalcule.
 *
 * ⚠️ POURQUOI ÇA MANQUAIT (chantier #07 / [CARTE-03], 2026-08-12, mesuré en production) :
 * `planifierDistances` ne retouche JAMAIS une offre dont `km` est déjà connu — à raison,
 * sinon l'affichage bougerait sans cause à chaque passe. Mais quand le raffinage Nominatim
 * fait passer un employeur du centre-ville à sa vraie adresse, le `km` déjà écrit reste
 * celui du CENTRE-VILLE : honnête au moment où il a été posé, faux depuis. Mesuré : deux
 * entreprises précisées dans une même passe, `mesurees=0` — rien ne redemandait leur
 * distance tant que ce vide n'était pas comblé.
 *
 * Le nom vient d'`entreprisesLieux` (le géocodage), pas de l'offre — `memeEmployeur` fait
 * donc le même rapprochement que `positionDe`, jamais une comparaison littérale : une
 * entreprise ingérée sous une variante de raison sociale (ADR-0006) doit être reconnue
 * pareil ici que partout où une position se résout.
 */
export function invaliderDistancesPrecisees(
  offres: readonly Offre[],
  entreprisesPrecisees: readonly string[],
): Offre[] {
  if (entreprisesPrecisees.length === 0) return [...offres];
  return offres.map((o) =>
    o.km !== null && entreprisesPrecisees.some((nom) => memeEmployeur(o.entreprise, nom))
      ? { ...o, km: null }
      : o,
  );
}

/**
 * Quelles offres peuvent recevoir une distance, et laquelle.
 *
 * @param offres     Le suivi actuel.
 * @param positions  Les employeurs géocodés, par nom d'entreprise.
 * @param distance   Le calcul de distance depuis le domicile (injecté : le domicile ne
 *                   traverse jamais cette frontière autrement que par cette fonction).
 */
export function planifierDistances(
  offres: readonly Offre[],
  positions: ReadonlyMap<string, Position>,
  distance: (p: Position) => number,
  /**
   * Le barème à appliquer, rayon réglé compris.
   *
   * ⚠️ IL DOIT ARRIVER JUSQU'ICI, sinon le réglage de Marc ne fait que la MOITIÉ du chemin :
   * une ville entrerait dans la région élargie, mais l'offre garderait une note de distance
   * calculée sur l'ancien rayon — donc zéro dès qu'elle dépasse 75 km, alors qu'elle est
   * désormais dans le rayon voulu. Deux moitiés d'une même décision qui ne se parlent pas.
   */
  profil: Profil = PROFIL_DEFAUT,
): MiseAJourDistance[] {
  const majs: MiseAJourDistance[] = [];

  for (const o of offres) {
    // L'historique n'a pas de distance à porter : ce sont des candidatures de 2025.
    if (o.histo) continue;
    // Une distance déjà connue reste : elle vient d'un relevé de Marc, ou d'un calcul
    // précédent. La recalculer à chaque passage ferait bouger l'affichage sans raison.
    if (o.km !== null) continue;

    // `positionDe` : l'employeur peut être situé sous un autre nom que celui de l'annonce
    // (« Laserax » côté liste de chasse, « Laserax inc. » côté offre). La comparaison
    // littérale d'avant laissait l'offre sans distance alors que la position existait.
    const pos = positionDe(o.entreprise, positions);
    if (!pos) continue;

    const km = arrondirKm(distance(pos));
    // Une distance aberrante trahit une résolution fausse (homonyme, signe inversé) : on
    // préfère ne rien écrire plutôt qu'un chiffre qui ferait douter de tous les autres.
    if (!Number.isFinite(km) || km < 0 || km > 500) continue;

    majs.push({
      id: o.id,
      km,
      score: scoreAvecDistance(o, km, profil),
      precision: pos.precision,
    });
  }

  return majs;
}

/**
 * La note, une fois la distance connue.
 *
 * `null` quand la note ne doit PAS changer — c'est le cas d'une note manuelle, qui vient de
 * la lecture de Marc et fait autorité sur toute note calculée (le barème plafonne d'ailleurs
 * les calculées à 85 pour cette raison même).
 */
export function scoreAvecDistance(
  offre: Offre,
  km: number,
  profil: Profil = PROFIL_DEFAUT,
): number | null {
  if (offre.scoreSource !== "calcule") return null;

  // Le titre et les justifications sont ce dont on dispose ici : la description complète
  // n'est pas conservée en base (elle ne sert qu'au moment du tri). La note bougera donc
  // surtout par la composante distance, ce qui est précisément le but.
  const texte = offre.raisons.map((r) => r.texte).join(" ");
  const r = computeScore({ titre: offre.poste, description: texte, km }, profil);
  return Math.min(r.total, PLAFOND_NOTE_CALCULEE);
}

/**
 * Les employeurs qui n'ont pas encore de position.
 *
 * Sert à étendre le géocodage AU-DELÀ des entreprises cibles : les offres ingérées
 * amènent des employeurs que Marc n'avait pas listés (ISS, LSM, Metalico…), et sans leur
 * position leur distance reste inconnue à vie.
 */
export function employeursASituer(
  offres: readonly Offre[],
  positions: ReadonlyMap<string, Position>,
  villeConnue: (entreprise: string) => string | null,
): { nom: string; ville: string }[] {
  const vus = new Set<string>();
  const liste: { nom: string; ville: string }[] = [];

  for (const o of offres) {
    if (o.histo || o.km !== null) continue;
    // Même règle que partout : un employeur déjà situé sous un autre nom n'est PAS à
    // situer. Sans ça, on redemande à Nominatim ce qu'on sait déjà — un appel de plus à
    // un service bénévole, et une seconde ligne pour un même lieu.
    if (positionDe(o.entreprise, positions) !== null || vus.has(o.entreprise)) continue;
    vus.add(o.entreprise);

    const ville = villeConnue(o.entreprise);
    // Sans ville, Nominatim chercherait « ISS » dans le monde entier et rendrait n'importe
    // quoi. Mieux vaut ne pas demander que d'accepter une réponse ingouvernable.
    if (!ville) continue;
    liste.push({ nom: o.entreprise, ville });
  }

  return liste;
}
