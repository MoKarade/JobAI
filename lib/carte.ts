// lib/carte.ts — situer les offres sur une carte, honnêtement.
//
// PURE : elle reçoit les offres, les entreprises cibles et les positions déjà géocodées,
// et rend des épingles. Aucun accès réseau, aucun accès base.
//
// DEPUIS [UX-09], LA CARTE MONTRE DES ENTREPRISES, PAS DES MUNICIPALITÉS — c'était la
// demande : voir chaque employeur à son emplacement, avec ses offres. Mais OpenStreetMap ne
// connaît pas toutes les PME : une entreprise introuvable est posée au CENTRE DE SA VILLE,
// avec `precision: "ville"` AFFICHÉE. Présenter un centre-ville comme l'adresse d'un
// employeur serait du fake data — le dire est la condition pour l'afficher.
//
// CE QUE LA CARTE NE MONTRE PAS : le domicile de Marc (garde-fou n°1 — le trajet passe par
// un lien Google Maps qui ne porte que la destination, `lib/lienTrajet.ts`).
//
// ⚠️ En revanche, depuis que les filtres sont partagés avec la liste, la page carte envoie
// au navigateur les offres COMPLÈTES — `notes` et `userNote` incluses. La recherche libre
// les parcourt, et c'est ce qui rend les filtres identiques des deux côtés. Ce n'est pas
// une extension d'exposition : l'accueil le fait déjà, même session, même navigateur. Mais
// ce commentaire a affirmé le contraire pendant une journée, et une garantie fausse est
// pire qu'une absence de garantie — un audit s'y fierait.
//
// LA CARTE PART DES OFFRES, PAS D'UNE LISTE TENUE À LA MAIN (2026-07-31). Tout employeur
// portant une offre vivante y a sa place dès qu'il est situé, qu'il figure ou non dans les
// entreprises cibles — sinon la carte montre la liste de chasse et non le marché.
//
// CE QUI MANQUE EST COMPTÉ, JAMAIS MASQUÉ, et les deux manques ne se valent pas :
// `aSituer` se réglera à la prochaine passe de géocodage, `sansLieu` jamais sans que la
// source annonce une ville. Une carte qui affiche 12 épingles pour 20 entreprises sans le
// signaler laisse croire à une couverture qu'elle n'a pas.

import type { EntrepriseCible } from "./reference";
import type { Offre } from "./types";
import { villeGeocodable } from "./geocodage";
import { apparier as apparierNoms, positionDe } from "./employeurs";

// L'appariement des noms d'employeur vit dans `lib/employeurs.ts` : la carte n'est pas
// seule à s'en servir, et la mesure des distances comparait les noms littéralement — deux
// règles pour une même question, dont la moins bonne gagnait là où on ne regardait pas.
export { LONGUEUR_MIN_APPARIEMENT, apparier } from "./employeurs";

/** Le libellé de ville de la référence, ou `null` si l'employeur n'y figure pas. */
export function villeDeLEntreprise(
  entreprise: string,
  cibles: readonly EntrepriseCible[],
): string | null {
  return cibles.find((c) => apparierNoms(entreprise, c.nom))?.ville ?? null;
}

export interface OffreSurCarte {
  id: string;
  entreprise: string;
  poste: string;
  score: number | null;
  km: number | null;
  statut: Offre["statut"];
}

/** Une entreprise cible telle que la carte la présente : ses faits, et ses offres vivantes. */
export interface EntrepriseSurCarte {
  nom: string;
  ville: string;
  /**
   * Distance MESURÉE de la référence — jamais recalculée depuis l'épingle, et `null`
   * quand elle n'a pas été relevée. La carte le dit plutôt que d'afficher un chiffre.
   */
  km: number | null;
  /**
   * L'adresse d'OpenStreetMap, ou `null`.
   *
   * ⚠️ SAVOIR OÙ ELLE EST ET POUVOIR L'ÉPINGLER SONT DEUX CHOSES DIFFÉRENTES, depuis que
   * le registre des entreprises alimente ce champ. Une adresse issue d'OpenStreetMap
   * accompagne toujours une position exacte ; une adresse du REGISTRE peut très bien
   * coexister avec une épingle au centre-ville, parce qu'on connaît alors l'adresse sans
   * qu'un géocodeur ait su la placer. Ce n'était pas vrai quand seul OSM écrivait ici, et
   * ce commentaire l'affirmait encore : une doc périmée ment mieux qu'elle n'informe.
   *
   * Ce qui reste interdit : reprendre l'adresse rendue par un repli au centre-ville — ce
   * serait l'adresse de la mairie affichée pour une usine. `null` se dit à l'écran
   * (« adresse inconnue ») — c'est honnête, contrairement à une adresse plausible et fausse.
   */
  adresse: string | null;
  /**
   * D'OÙ vient cette adresse, quand il y en a une. Demande de Marc : « et l'indiquer ».
   *
   * `osm` = un objet cartographié À SON EMPLACEMENT. `registre` = l'adresse de
   * l'ÉTABLISSEMENT déclarée au registre des entreprises — le lieu où l'entreprise opère,
   * pas son domicile légal (on lit `Etablissements.csv`, jamais les domiciles). Vraie,
   * mais sans garantie que l'épingle soit dessus. Les afficher pareil reviendrait à donner
   * la même valeur à une position mesurée et à une adresse déclarée.
   */
  adresseSource: "osm" | "registre" | null;
  /**
   * Les bornes de recharge à cinq minutes à pied — TROIS états, jamais deux.
   *
   * `null` = jamais interrogé. `{ nombre: 0 }` = interrogé, aucune borne. Les confondre
   * ferait passer un lieu non mesuré pour un lieu sans borne.
   */
  bornes: { nombre: number; plusProcheM: number | null; nom: string | null } | null;
  lecture: string;
  offres: OffreSurCarte[];
}

/** Ce que la position EST : l'entreprise elle-même, ou le centre de sa ville (repli dit). */
export type PrecisionEpingle = "exacte" | "ville";

export interface Epingle {
  lat: number;
  lon: number;
  precision: PrecisionEpingle;
  /** Ville de rattachement — le libellé de l'épingle approximative, l'info de contexte sinon. */
  ville: string;
  /** Une seule entreprise sur une épingle exacte ; toutes celles de la ville sur un repli. */
  entreprises: EntrepriseSurCarte[];
}

export interface VueCarte {
  epingles: Epingle[];
  /**
   * Entreprises SANS position en base mais dont la ville est connue : une passe de
   * géocodage les fera apparaître. Cibles et employeurs d'offres confondus — depuis que la
   * carte part des offres, être hors de la liste de chasse n'empêche plus d'être situé.
   */
  aSituer: string[];
  /**
   * Employeurs d'offres vivantes qu'on ne peut PAS situer : la source n'a annoncé aucune
   * ville, et « ISS » seul est une recherche mondiale. Ce n'est pas un oubli de la liste de
   * chasse — c'est une donnée manquante à la source, et aucune passe n'y changera rien.
   */
  sansLieu: string[];
}

export interface PositionEntreprise {
  lat: number;
  lon: number;
  precision: PrecisionEpingle;
  adresse: string | null;
  adresseSource: "osm" | "registre" | null;
  /** `null` tant que les bornes n'ont pas été interrogées pour ce lieu. */
  bornes: { nombre: number; plusProcheM: number | null; nom: string | null } | null;
}

/** Les offres qu'une carte de recherche d'emploi doit montrer : celles qui sont vivantes. */
function estVivante(o: Offre): boolean {
  return !o.histo && o.perimeeLe === null;
}

/**
 * Assemble la vue, en partant des OFFRES autant que des entreprises cibles.
 *
 * ⚠️ CHANGEMENT DU 2026-07-31, DEMANDE DE MARC : « je veux que pour toutes les offres elles
 * soient visibles sur la carte ». La version précédente bouclait sur les seules
 * `ENTREPRISES_CIBLES` — une liste tenue à la main. Tout employeur apporté par l'ingestion
 * (ISS, LSM…) était donc invisible, quelle que soit sa note et même une fois sa position
 * connue : la carte montrait la liste de chasse, pas le marché.
 *
 * Une cible sans offre active reste affichée : « Poly-Robotics — candidature spontanée
 * possible » est une information de carte, pas un vide à masquer.
 *
 * CE QUI MANQUE RESTE COMPTÉ, et la distinction est utile : `aSituer` se réglera tout seul
 * à la prochaine passe de géocodage ; `sansLieu` ne se réglera jamais sans que la source
 * annonce une ville. Les confondre ferait attendre un remède qui ne viendra pas.
 */
export function construireVue(
  offres: readonly Offre[],
  cibles: readonly EntrepriseCible[],
  positions: ReadonlyMap<string, PositionEntreprise>,
): VueCarte {
  const vivantes = offres.filter(estVivante);

  const parEntreprise = new Map<string, EntrepriseSurCarte>();

  // Les cibles d'abord : leur nom fait autorité, et leurs faits relevés à la main
  // (distance de référence, lecture) valent mieux que ce qu'une offre en dit.
  for (const c of cibles) {
    parEntreprise.set(c.nom, {
      nom: c.nom,
      ville: villeGeocodable(c.ville) ?? c.ville,
      km: c.km,
      adresse: null,
      adresseSource: null,
      bornes: null,
      lecture: c.lecture,
      offres: [],
    });
  }

  const sansLieu = new Set<string>();

  for (const o of vivantes) {
    // Une offre se rattache à UNE entreprise : la cible qui apparie, sinon un employeur
    // déjà rencontré qui apparie, sinon l'employeur tel que l'offre le nomme.
    //
    // Le second essai compte : deux sources nomment le même employeur différemment
    // (« Groupe Test » et « Groupe Test Canada »), et sans lui la carte porterait DEUX
    // épingles pour un seul lieu — plus un géocodage inutile chacune. L'appariement reste
    // borné par le plancher de longueur : un sigle court (« ISS ») exige l'égalité stricte
    // et ne fusionne donc pas, ce qui est voulu — sous quatre lettres, la sous-chaîne
    // apparierait n'importe quoi.
    const cible = cibles.find((c) => apparierNoms(o.entreprise, c.nom));
    const nom =
      cible?.nom ??
      [...parEntreprise.keys()].find((connu) => apparierNoms(o.entreprise, connu)) ??
      o.entreprise;
    const villeOffre = o.ville ? (villeGeocodable(o.ville) ?? o.ville) : "";

    let entreprise = parEntreprise.get(nom);
    if (!entreprise) {
      entreprise = {
        nom,
        ville: villeOffre,
        // Pas de distance de référence pour un employeur hors liste : elle sera reprise
        // des offres plus bas, MESURÉE, jamais déduite de l'épingle.
        km: null,
        adresse: null,
        adresseSource: null,
        bornes: null,
        lecture: "",
        offres: [],
      };
      parEntreprise.set(nom, entreprise);
    }

    // La ville d'une cible fait foi ; pour les autres, la première ville annoncée sert.
    if (entreprise.ville === "" && villeOffre !== "") entreprise.ville = villeOffre;

    entreprise.offres.push({
      id: o.id,
      entreprise: o.entreprise,
      poste: o.poste,
      score: o.score,
      km: o.km,
      statut: o.statut,
    });
  }

  const epingles: Epingle[] = [];
  const aSituer: string[] = [];
  // Les replis d'une même ville partagent la même position : une épingle par ville, qui
  // liste ses entreprises — dix cercles empilés au centre-ville se masqueraient l'un l'autre.
  const groupesVille = new Map<string, Epingle>();

  for (const entreprise of parEntreprise.values()) {
    // `positionDe` et non `positions.get` : la position peut avoir été inscrite sous le nom
    // de la cible OU sous celui que porte une annonce — la mesure des distances géocode
    // `offre.entreprise`, la passe de la carte géocode `cible.nom`. La règle est partagée
    // avec `lib/distances.ts` (`lib/employeurs.ts`), sinon les deux divergent.
    const position = positionDe(entreprise.nom, positions);

    if (!position) {
      // Sans ville, aucune passe ne pourra la situer : le dire plutôt que de la faire
      // patienter dans une file qui n'avancera pas.
      if (entreprise.ville === "") sansLieu.add(entreprise.nom);
      else aSituer.push(entreprise.nom);
      continue;
    }

    // L'adresse vient de la POSITION retenue, quelle que soit sa précision : le registre
    // peut avoir renseigné l'adresse d'une entreprise que le géocodeur n'a pas su placer.
    // La filtrer sur « exacte » ferait disparaître de l'écran tout ce que le registre
    // apporte — l'information serait en base et invisible.
    entreprise.adresse = position.adresse;
    entreprise.adresseSource = position.adresseSource;
    entreprise.bornes = position.bornes;

    // La meilleure note en tête : c'est elle qui teinte l'épingle.
    entreprise.offres.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    // Un employeur hors liste de chasse n'a pas de distance relevée à la main : celle de
    // ses offres est MESURÉE (`mesurerDistances`), donc utilisable telle quelle. Sans ça,
    // la fiche dirait « distance non mesurée » à côté d'offres qui affichent leur km.
    if (entreprise.km === null) {
      entreprise.km = entreprise.offres.find((o) => o.km !== null)?.km ?? null;
    }

    if (position.precision === "exacte") {
      epingles.push({ ...position, ville: entreprise.ville, entreprises: [entreprise] });
      continue;
    }

    const groupe = groupesVille.get(entreprise.ville);
    if (groupe) groupe.entreprises.push(entreprise);
    else {
      const nouveau: Epingle = {
        ...position,
        ville: entreprise.ville,
        entreprises: [entreprise],
      };
      groupesVille.set(entreprise.ville, nouveau);
      epingles.push(nouveau);
    }
  }

  // Ordre STABLE : sans lui, deux rendus successifs réordonnent les épingles sans raison.
  for (const e of epingles) {
    e.entreprises.sort((a, b) => a.nom.localeCompare(b.nom, "fr-CA"));
  }
  epingles.sort(
    (a, b) =>
      a.ville.localeCompare(b.ville, "fr-CA") ||
      (a.entreprises[0]?.nom ?? "").localeCompare(b.entreprises[0]?.nom ?? "", "fr-CA"),
  );

  return {
    epingles,
    aSituer: aSituer.sort((a, b) => a.localeCompare(b, "fr-CA")),
    sansLieu: [...sansLieu].sort((a, b) => a.localeCompare(b, "fr-CA")),
  };
}

/**
 * Cadrage de la carte : le rectangle qui contient toutes les épingles.
 *
 * Rend `null` sans épingle — l'appelant affiche alors un état honnête, plutôt qu'une carte
 * centrée sur un point arbitraire. Et surtout : le cadrage se déduit des ENTREPRISES,
 * jamais du domicile. Centrer sur le domicile le révélerait à qui regarde la carte.
 */
export function cadrage(
  epingles: readonly Epingle[],
): { latMin: number; latMax: number; lonMin: number; lonMax: number } | null {
  const premiere = epingles[0];
  if (!premiere) return null;

  let latMin = premiere.lat;
  let latMax = premiere.lat;
  let lonMin = premiere.lon;
  let lonMax = premiere.lon;

  for (const e of epingles) {
    latMin = Math.min(latMin, e.lat);
    latMax = Math.max(latMax, e.lat);
    lonMin = Math.min(lonMin, e.lon);
    lonMax = Math.max(lonMax, e.lon);
  }

  return { latMin, latMax, lonMin, lonMax };
}

/**
 * Le centre du cadrage — le point autour duquel ouvrir une carte externe.
 *
 * GARDE-FOU N°1 : il se déduit des seules ÉPINGLES, donc des entreprises, exactement comme
 * `cadrage`. Centrer sur le domicile le révélerait à qui regarde l'URL, et une URL se
 * partage, se met en favori et finit dans un historique. Rend `null` sans épingle plutôt
 * qu'un point arbitraire.
 */
export function centreDuCadrage(
  cadre: { latMin: number; latMax: number; lonMin: number; lonMax: number } | null,
): { lat: number; lon: number } | null {
  if (cadre === null) return null;
  return {
    lat: (cadre.latMin + cadre.latMax) / 2,
    lon: (cadre.lonMin + cadre.lonMax) / 2,
  };
}
