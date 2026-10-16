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

import { noterOffre, type Bareme } from "./noteOffre";
import { distanceKm, RAYON_VALIDATION_KM } from "./geocodage";
import { cleGroupement, creerRecherchePosition, memeEmployeur } from "./employeurs";
import { estDansLaRegion, normaliserLieu } from "./ingest/region";
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
 * Le centre d'une municipalité, quand on le connaît. `null` = on ne sait pas.
 *
 * Injecté plutôt que lu : `lib/distances.ts` reste PUR, et c'est ce qui permet d'éprouver
 * la garde ci-dessous sans base ni réseau.
 */
export type CentreDe = (ville: string | null) => Position | { lat: number; lon: number } | null;

/**
 * Cette position peut-elle être celle d'une offre annoncée dans CETTE ville ? PURE.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE — ADR-0021, mesuré le 2026-09-21 en production.
 * `entreprises_lieux.nom` est la clé primaire : un employeur n'a QU'UNE position. `villeDe`
 * (`lib/actions.ts`) la dérive de la PREMIÈRE offre de cet employeur qui porte une ville, et
 * toutes ses autres offres en héritent. L'Université du Québec et la Société québécoise des
 * infrastructures ont leur siège à Québec et publient à Montréal : leurs offres montréalaises
 * affichaient **5,1 km** et **6,1 km**, notées 76 et 74, en tête de la liste de Marc. Avant
 * ADR-0019 toutes les offres étaient régionales et l'erreur valait quelques dizaines de
 * kilomètres ; depuis, elle vaut la largeur du Québec.
 *
 * ⚠️ ELLE NE REFUSE QUE CE QU'ELLE PEUT PROUVER. Centre de la ville inconnu ⇒ on ne sait pas,
 * et on laisse passer : refuser ici retirerait aussi les distances JUSTES des employeurs
 * correctement situés dans une ville que la table ne connaît pas encore. La moitié qui traite
 * les centres douteux est ailleurs (re-vérification de `villes.verifie_le`) : une fois un
 * centre corrigé, la position stockée devient invraisemblable ICI et le km tombe.
 *
 * Le rayon est `RAYON_VALIDATION_KM`, la constante que `deciderPrecision` emploie déjà pour
 * la même question posée à l'autre bout du pipeline. Une règle, trois consommateurs.
 */
export function positionInvraisemblable(
  position: { lat: number; lon: number },
  centre: { lat: number; lon: number } | null,
): boolean {
  if (centre === null) return false;
  return distanceKm(position, centre) > RAYON_VALIDATION_KM;
}

/** La ville d'une offre, ramenée à une forme comparable : « Lavaltrie, QC » = « lavaltrie ». */
function villeComparable(ville: string): string {
  return normaliserLieu((ville.split(",")[0] ?? ville).split("(")[0] ?? ville);
}

/**
 * Les villes où chaque employeur annonce ses offres (hors candidatures historiques). PURE.
 *
 * Clé : `cleGroupement`, la même identité que celle qui rapproche l'employeur de sa position.
 */
export function villesParEmployeur(offres: readonly Offre[]): Map<string, Set<string>> {
  const parEmployeur = new Map<string, Set<string>>();
  for (const o of offres) {
    if (o.histo || !o.ville) continue;
    const cle = cleGroupement(o.entreprise, o.id);
    const villes = parEmployeur.get(cle) ?? new Set<string>();
    villes.add(villeComparable(o.ville));
    parEmployeur.set(cle, villes);
  }
  return parEmployeur;
}

/**
 * La position de l'employeur est-elle SANS PREUVE pour la ville de CETTE offre ? PURE.
 *
 * ⚠️ POURQUOI ELLE S'AJOUTE À `positionInvraisemblable` (JobAI#90, mesuré en production le
 * 2026-10-16). Cette dernière ne refuse que ce qu'elle PROUVE faux, donc elle laisse passer
 * quand le centre de la ville de l'offre n'est pas connu. Or `villes` se remplit à huit
 * villes par passe : les offres de Lavaltrie de Coffrages Synergy, un employeur à deux sites
 * (Québec et Lavaltrie), affichaient encore 6,1 km — la position de Québec — des semaines
 * après ADR-0021, parce que le centre de Lavaltrie n'était pas encore géocodé. L'attente du
 * centre était le trou : tant qu'il dure, un chiffre faux est affiché au sommet de la liste.
 *
 * LA RÈGLE, ET CE QU'ELLE NE FAIT PAS. Sans centre connu, la position d'un employeur ne mesure
 * pas une offre annoncée dans une ville que l'app ne reconnaît pas comme régionale quand ce
 * même employeur annonce AUSSI ailleurs : un employeur n'a qu'une position, tirée de la ville
 * d'UNE de ses offres, et rien n'établit qu'elle est celle de cette offre-ci. Mieux vaut
 * « distance à mesurer » qu'un chiffre de quartier pour un emploi à 200 km.
 *   · un employeur qui n'annonce que dans une ville n'est PAS touché : sa position vient de
 *     cette ville, ses distances justes restent ;
 *   · une offre d'une ville reconnue comme régionale n'est PAS touchée : l'erreur possible y
 *     reste dans la région, c'est le comportement d'avant ;
 *   · dès que le centre de la ville est connu, `positionInvraisemblable` reprend la décision.
 */
export function positionNonProuvee(
  offre: Offre,
  centre: { lat: number; lon: number } | null,
  villesDeLEmployeur: ReadonlySet<string> | undefined,
): boolean {
  if (centre !== null) return false;
  if (!offre.ville || villesDeLEmployeur === undefined) return false;
  if (estDansLaRegion(offre.ville)) return false;
  const ici = villeComparable(offre.ville);
  for (const autre of villesDeLEmployeur) if (autre !== ici) return true;
  return false;
}

/**
 * Efface les distances écrites depuis une position qu'on sait maintenant INVRAISEMBLABLE
 * pour la ville de l'offre.
 *
 * Même nécessité qu'`invaliderDistancesPrecisees`, et pour la même raison mécanique :
 * `planifierDistances` ne retouche JAMAIS une offre dont le `km` est déjà écrit. Sans cette
 * passe, les chiffres faux déjà en base y resteraient — la garde ne protégerait que l'avenir,
 * et Lavaltrie garderait ses 6,1 km.
 */
export function invaliderDistancesImplausibles(
  offres: readonly Offre[],
  positions: ReadonlyMap<string, Position>,
  centreDe: CentreDe,
): Offre[] {
  const positionDe = creerRecherchePosition(positions);
  const villes = villesParEmployeur(offres);
  return offres.map((o) => {
    if (o.km === null || o.histo) return o;
    const pos = positionDe(o.entreprise);
    if (!pos) return o;
    const centre = centreDe(o.ville) ?? null;
    const faux =
      positionInvraisemblable(pos, centre) ||
      positionNonProuvee(o, centre, villes.get(cleGroupement(o.entreprise, o.id)));
    return faux ? { ...o, km: null } : o;
  });
}

/**
 * Les villes à géocoder, les plus PORTEUSES d'abord. PURE.
 *
 * ⚠️ L'ORDRE EST LA POLITIQUE D'ALLOCATION D'UN QUOTA RARE. Nominatim accepte une requête par
 * seconde et la passe en fait huit (`MAX_VILLES_PAR_PASSE`) : l'ordre décide donc de ce que
 * Marc voit bouger cette semaine. Il était celui de l'itération sur les employeurs, c'est-à-dire
 * arbitraire — une ville qui débloque une offre passait avant une ville qui en débloque
 * quarante. Le nombre d'employeurs en attente est le meilleur proxy disponible ici : c'est
 * exactement ce que la passe a sous la main, sans requête de plus.
 *
 * Départage par NOM à égalité : sans lui l'ordre dépendrait de l'ordre d'insertion, et deux
 * passes successives pourraient se disputer les mêmes huit places sans converger.
 */
export function villesParUrgence(
  aSituer: readonly { nom: string; ville: string }[],
): string[] {
  const compte = new Map<string, number>();
  for (const e of aSituer) compte.set(e.ville, (compte.get(e.ville) ?? 0) + 1);
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([ville]) => ville);
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
   * Le centre de la ville d'une offre, quand il est connu.
   *
   * ⚠️ REQUIS, ET PLACÉ AVANT `profil` EXPRÈS. Un paramètre optionnel à défaut permissif
   * ferait de l'appel le plus court l'appel le moins gardé — c'est ainsi que le remplissage
   * de `villes` a accepté des rues homonymes pendant des mois (ADR-0021). Le compilateur
   * oblige chaque appelant à dire ce qu'il sait des villes.
   */
  centreDe: CentreDe,
  /**
   * Le barème à appliquer, rayon réglé compris.
   *
   * ⚠️ IL DOIT ARRIVER JUSQU'ICI, sinon le réglage de Marc ne fait que la MOITIÉ du chemin :
   * une ville entrerait dans la région élargie, mais l'offre garderait une note de distance
   * calculée sur l'ancien rayon — donc zéro dès qu'elle dépasse 75 km, alors qu'elle est
   * désormais dans le rayon voulu. Deux moitiés d'une même décision qui ne se parlent pas.
   *
   * ⚠️ `null` = LE BARÈME DE MARC EST ILLISIBLE : les distances s'écrivent (c'est le critère
   * n°1), les notes NE BOUGENT PAS. Noter avec un autre barème que le sien, c'est le défaut
   * que JobAI#149 retire.
   */
  bareme: Bareme | null,
): MiseAJourDistance[] {
  const majs: MiseAJourDistance[] = [];
  const positionDe = creerRecherchePosition(positions);
  const villes = villesParEmployeur(offres);

  for (const o of offres) {
    // L'historique n'a pas de distance à porter : ce sont des candidatures de 2025.
    if (o.histo) continue;
    // Une distance déjà connue reste : elle vient d'un relevé de Marc, ou d'un calcul
    // précédent. La recalculer à chaque passage ferait bouger l'affichage sans raison.
    if (o.km !== null) continue;

    // `positionDe` : l'employeur peut être situé sous un autre nom que celui de l'annonce
    // (« Laserax » côté liste de chasse, « Laserax inc. » côté offre). La comparaison
    // littérale d'avant laissait l'offre sans distance alors que la position existait.
    const pos = positionDe(o.entreprise);
    if (!pos) continue;

    // La position d'un EMPLOYEUR ne mesure pas une offre annoncée ailleurs (ADR-0021).
    // Mieux vaut « distance à mesurer » que 6,1 km pour un emploi à 200 km.
    const centre = centreDe(o.ville) ?? null;
    if (positionInvraisemblable(pos, centre)) continue;
    // Et quand le centre n'est pas encore connu, un employeur à plusieurs sites ne prouve rien
    // pour une ville non régionale (JobAI#90).
    if (positionNonProuvee(o, centre, villes.get(cleGroupement(o.entreprise, o.id)))) continue;

    const km = arrondirKm(distance(pos));
    // Une distance aberrante trahit une résolution fausse (homonyme, signe inversé) : on
    // préfère ne rien écrire plutôt qu'un chiffre qui ferait douter de tous les autres.
    if (!Number.isFinite(km) || km < 0 || km > 500) continue;

    majs.push({
      id: o.id,
      km,
      score: bareme === null ? null : scoreAvecDistance(o, km, bareme),
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
export function scoreAvecDistance(offre: Offre, km: number | null, bareme: Bareme): number | null {
  if (offre.scoreSource !== "calcule") return null;
  // La même fonction que l'ingestion et la re-notation (ADR-0025) : l'offre est notée avec ce
  // qui est gardé d'elle, et la distance qu'on vient de mesurer.
  return noterOffre(offre, bareme.profil, bareme.metiers, km).total;
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
  const positionDe = creerRecherchePosition(positions);

  for (const o of offres) {
    if (o.histo || o.km !== null) continue;
    // Même règle que partout : un employeur déjà situé sous un autre nom n'est PAS à
    // situer. Sans ça, on redemande à Nominatim ce qu'on sait déjà — un appel de plus à
    // un service bénévole, et une seconde ligne pour un même lieu.
    if (positionDe(o.entreprise) !== null || vus.has(o.entreprise)) continue;
    vus.add(o.entreprise);

    const ville = villeConnue(o.entreprise);
    // Sans ville, Nominatim chercherait « ISS » dans le monde entier et rendrait n'importe
    // quoi. Mieux vaut ne pas demander que d'accepter une réponse ingouvernable.
    if (!ville) continue;
    liste.push({ nom: o.entreprise, ville });
  }

  return liste;
}
