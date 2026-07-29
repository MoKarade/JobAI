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
// un lien Google Maps qui ne porte que la destination, `lib/lienTrajet.ts`), et le contenu
// personnel des offres (`notes`, `userNote`) qui ne sert pas à la carte.
//
// CE QUI MANQUE EST COMPTÉ, JAMAIS MASQUÉ : entreprises restant à situer, employeurs hors
// des cibles. Une carte qui affiche 12 épingles pour 20 entreprises sans le signaler laisse
// croire à une couverture qu'elle n'a pas.

import type { EntrepriseCible } from "./reference";
import type { Offre } from "./types";
import { villeGeocodable } from "./geocodage";

/**
 * Deux noms d'entreprise désignent-ils le même employeur ?
 *
 * Règle par SOUS-CHAÎNE, avec une longueur minimale. Le suivi écrit « Groupe Leclerc » là
 * où la référence écrit « Groupe Leclerc », mais aussi « Laserax » face à « Laserax ». Sans
 * plancher de longueur, un nom de deux lettres apparierait la moitié de la liste — c'est le
 * piège classique du matching par sous-chaîne, et il ne se voit qu'une fois le mal fait.
 */
export const LONGUEUR_MIN_APPARIEMENT = 4;

export function apparier(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length < LONGUEUR_MIN_APPARIEMENT || y.length < LONGUEUR_MIN_APPARIEMENT) {
    return x === y && x.length > 0;
  }
  return x === y || x.includes(y) || y.includes(x);
}

/** Le libellé de ville de la référence, ou `null` si l'employeur n'y figure pas. */
export function villeDeLEntreprise(
  entreprise: string,
  cibles: readonly EntrepriseCible[],
): string | null {
  return cibles.find((c) => apparier(entreprise, c.nom))?.ville ?? null;
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
  /** Distance mesurée de la référence — jamais recalculée depuis l'épingle. */
  km: number;
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
  /** Entreprises cibles SANS position en base : une passe de géocodage les fera apparaître. */
  aSituer: string[];
  /** Employeurs d'offres vivantes absents des entreprises cibles : insituables. */
  horsCibles: string[];
}

export interface PositionEntreprise {
  lat: number;
  lon: number;
  precision: PrecisionEpingle;
}

/** Les offres qu'une carte de recherche d'emploi doit montrer : celles qui sont vivantes. */
function estVivante(o: Offre): boolean {
  return !o.histo && o.perimeeLe === null;
}

/**
 * Assemble la vue, en partant des ENTREPRISES CIBLES — pas des offres.
 *
 * Une cible sans offre active reste sur la carte : c'est la liste de chasse de Marc
 * (« Poly-Robotics — candidature spontanée possible » est une information de carte, pas un
 * vide à masquer). Les offres s'y rattachent ; celles dont l'employeur n'apparie aucune
 * cible sont COMPTÉES dans `horsCibles`, jamais perdues en silence.
 */
export function construireVue(
  offres: readonly Offre[],
  cibles: readonly EntrepriseCible[],
  positions: ReadonlyMap<string, PositionEntreprise>,
): VueCarte {
  const vivantes = offres.filter(estVivante);

  // Rattachement offre → cible. Une offre ne se rattache qu'à UNE entreprise : la première
  // qui apparie (l'appariement est déjà borné par le plancher de longueur).
  const offresParCible = new Map<string, OffreSurCarte[]>();
  const horsCibles = new Set<string>();

  for (const o of vivantes) {
    const cible = cibles.find((c) => apparier(o.entreprise, c.nom));
    if (!cible) {
      horsCibles.add(o.entreprise);
      continue;
    }
    const liste = offresParCible.get(cible.nom) ?? [];
    liste.push({
      id: o.id,
      entreprise: o.entreprise,
      poste: o.poste,
      score: o.score,
      km: o.km,
      statut: o.statut,
    });
    offresParCible.set(cible.nom, liste);
  }

  const epingles: Epingle[] = [];
  const aSituer: string[] = [];
  // Les replis d'une même ville partagent la même position : une épingle par ville, qui
  // liste ses entreprises — dix cercles empilés au centre-ville se masqueraient l'un l'autre.
  const groupesVille = new Map<string, Epingle>();

  for (const c of cibles) {
    const position = positions.get(c.nom);
    if (!position) {
      aSituer.push(c.nom);
      continue;
    }

    const offresDeLaCible = offresParCible.get(c.nom) ?? [];
    // La meilleure note en tête : c'est elle qui teinte l'épingle.
    offresDeLaCible.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    const ville = villeGeocodable(c.ville) ?? c.ville;
    const entreprise: EntrepriseSurCarte = {
      nom: c.nom,
      ville,
      km: c.km,
      lecture: c.lecture,
      offres: offresDeLaCible,
    };

    if (position.precision === "exacte") {
      epingles.push({ ...position, ville, entreprises: [entreprise] });
      continue;
    }

    const groupe = groupesVille.get(ville);
    if (groupe) groupe.entreprises.push(entreprise);
    else {
      const nouveau: Epingle = { ...position, ville, entreprises: [entreprise] };
      groupesVille.set(ville, nouveau);
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
    horsCibles: [...horsCibles].sort((a, b) => a.localeCompare(b, "fr-CA")),
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
