// lib/carte.ts — situer les offres sur une carte, honnêtement.
//
// PURE : elle reçoit des offres, la liste des entreprises cibles et les coordonnées déjà
// géocodées, et rend des épingles. Aucun accès réseau, aucun accès base.
//
// CE QUE LA CARTE MONTRE, ET CE QU'ELLE NE MONTRE PAS
// Elle montre des MUNICIPALITÉS où se trouvent des offres. Elle ne montre PAS le domicile
// de Marc (garde-fou n°1 : il ne sort pas des variables d'environnement, et n'est jamais
// envoyé au navigateur), et elle ne prétend pas situer un employeur à sa porte — une
// épingle est un centre de municipalité.
//
// La distance, elle, est EXACTE : elle vient de `offers.km`, mesurée, pas déduite de la
// position de l'épingle. C'est ce qui permet d'assumer l'approximation géographique sans
// mentir sur le chiffre qui compte.
//
// CE QUI MANQUE EST COMPTÉ, JAMAIS MASQUÉ
// Une offre dont on ne connaît pas la ville, ou dont la ville n'est pas encore géocodée,
// n'apparaît pas — et l'interface DIT combien. Une carte qui affiche 12 épingles pour
// 23 offres sans le signaler laisse croire à une couverture qu'elle n'a pas.

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

export interface Epingle {
  /** Nom géocodable — celui de la table `villes`. */
  ville: string;
  lat: number;
  lon: number;
  offres: OffreSurCarte[];
}

export interface VueCarte {
  epingles: Epingle[];
  /** Offres dont l'employeur n'est dans aucune entreprise cible : ville inconnue. */
  sansVille: string[];
  /** Villes connues mais pas encore géocodées — un géocodage les fera apparaître. */
  villesAGeocoder: string[];
}

/** Les offres qu'une carte de recherche d'emploi doit montrer : celles qui sont vivantes. */
function estVivante(o: Offre): boolean {
  return !o.histo && o.perimeeLe === null;
}

/**
 * Assemble la vue.
 *
 * Les offres sont regroupées PAR VILLE : « Québec » porte une dizaine d'offres, et dix
 * épingles au même point seraient illisibles et se masqueraient l'une l'autre.
 */
export function construireVue(
  offres: readonly Offre[],
  cibles: readonly EntrepriseCible[],
  coordonnees: ReadonlyMap<string, { lat: number; lon: number }>,
): VueCarte {
  const parVille = new Map<string, OffreSurCarte[]>();
  const sansVille: string[] = [];
  const villesAGeocoder = new Set<string>();

  for (const o of offres.filter(estVivante)) {
    const libelle = villeDeLEntreprise(o.entreprise, cibles);
    const ville = libelle === null ? null : villeGeocodable(libelle);

    if (ville === null) {
      sansVille.push(o.entreprise);
      continue;
    }

    if (!coordonnees.has(ville)) {
      villesAGeocoder.add(ville);
      continue;
    }

    const liste = parVille.get(ville) ?? [];
    liste.push({
      id: o.id,
      entreprise: o.entreprise,
      poste: o.poste,
      score: o.score,
      km: o.km,
      statut: o.statut,
    });
    parVille.set(ville, liste);
  }

  const epingles: Epingle[] = [];
  for (const [ville, liste] of parVille) {
    const c = coordonnees.get(ville);
    if (!c) continue; // impossible ici, mais `get` rend `T | undefined` et on ne force rien
    // La meilleure note en tête : c'est elle qui décide de la couleur de l'épingle.
    liste.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    epingles.push({ ville, lat: c.lat, lon: c.lon, offres: liste });
  }

  // Ordre stable : sans lui, deux rendus successifs réordonnent les épingles sans raison.
  epingles.sort((a, b) => a.ville.localeCompare(b.ville, "fr-CA"));

  return {
    epingles,
    sansVille: [...new Set(sansVille)].sort((a, b) => a.localeCompare(b, "fr-CA")),
    villesAGeocoder: [...villesAGeocoder].sort((a, b) => a.localeCompare(b, "fr-CA")),
  };
}

/** Toutes les villes qu'il faudrait connaître pour situer toutes les offres vivantes. */
export function villesNecessaires(
  offres: readonly Offre[],
  cibles: readonly EntrepriseCible[],
): string[] {
  const villes = new Set<string>();
  for (const o of offres.filter(estVivante)) {
    const libelle = villeDeLEntreprise(o.entreprise, cibles);
    const v = libelle === null ? null : villeGeocodable(libelle);
    if (v !== null) villes.add(v);
  }
  return [...villes].sort((a, b) => a.localeCompare(b, "fr-CA"));
}

/**
 * Cadrage de la carte : le rectangle qui contient toutes les épingles.
 *
 * Rend `null` sans épingle — l'appelant affiche alors un état honnête, plutôt qu'une carte
 * centrée sur un point arbitraire. Et surtout : le cadrage se déduit des OFFRES, jamais du
 * domicile. Centrer sur le domicile le révélerait à qui regarde la carte.
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
