// lib/doublonsAnnonce.ts — MESURER combien d'annonces comptent pour plusieurs offres, et combien d'enseignes sont éclatées.
//
// Demande (JobAI#195) : avant de corriger, dire l'ampleur du défaut. Cette fonction ne corrige rien et n'écrit rien : elle
// compte, sur tout le suivi hors historique 2025 (la même assise que les signaux d'employeur), ce qu'un lecteur du suivi
// voit de travers.
//
// Rend des NOMBRES, plus quelques exemples d'enseignes (des noms d'employeurs, publics dans les annonces ; jamais un
// intitulé, un lien ni une description). Fonction PURE.

import { cleGroupement } from "./employeurs";
import { cleEnseigne } from "./enseigne";
import { numeroAnnonce } from "./annonce";
import type { Offre } from "./types";

/** Combien d'exemples d'enseignes éclatées on rend au plus. */
const MAX_EXEMPLES = 5;

export interface MesureDoublons {
  /** Offres suivies (hors historique) examinées. */
  offres: number;
  /** Parmi elles, celles dont le lien porte un numéro d'annonce du Guichet. */
  avecNumeroAnnonce: number;
  /** Numéros d'annonce distincts. */
  annoncesDistinctes: number;
  /** Numéros portés par au moins deux offres suivies. */
  annoncesEnDouble: number;
  /** Offres « en trop » : somme, sur chaque annonce en double, de (offres − 1). */
  offresEnTrop: number;
  /** Les annonces en double dont les offres portent des NOMS d'employeur différents (le cas du renommage). */
  annoncesRenommees: number;
  /** Enseignes (nom sans numéro de succursale) que plusieurs noms d'employeur se partagent. */
  enseignesEclatees: number;
  /** Noms d'employeur concernés par ces enseignes (somme). */
  nomsDansLesEnseignesEclatees: number;
  /** Les enseignes les plus éclatées : la clé d'enseigne, le nombre de noms et d'offres. */
  exemples: { enseigne: string; noms: number; offres: number }[];
}

/** La mesure sur un ensemble d'offres. PURE. */
export function mesurerDoublonsAnnonce(offres: readonly Offre[]): MesureDoublons {
  const suivies = offres.filter((o) => !o.histo);

  const parAnnonce = new Map<string, Offre[]>();
  let avecNumeroAnnonce = 0;
  for (const o of suivies) {
    const n = numeroAnnonce(o.lien);
    if (n === null) continue;
    avecNumeroAnnonce++;
    const l = parAnnonce.get(n);
    if (l) l.push(o);
    else parAnnonce.set(n, [o]);
  }

  let annoncesEnDouble = 0;
  let offresEnTrop = 0;
  let annoncesRenommees = 0;
  for (const liste of parAnnonce.values()) {
    if (liste.length < 2) continue;
    annoncesEnDouble++;
    offresEnTrop += liste.length - 1;
    const noms = new Set(liste.map((o) => cleGroupement(o.entreprise, o.id)));
    if (noms.size > 1) annoncesRenommees++;
  }

  const parEnseigne = new Map<string, { noms: Set<string>; offres: number }>();
  for (const o of suivies) {
    const cle = cleEnseigne(o.entreprise, o.id);
    const e = parEnseigne.get(cle) ?? { noms: new Set<string>(), offres: 0 };
    e.noms.add(cleGroupement(o.entreprise, o.id));
    e.offres++;
    parEnseigne.set(cle, e);
  }
  const eclatees = [...parEnseigne.entries()]
    .filter(([, e]) => e.noms.size > 1)
    .map(([enseigne, e]) => ({ enseigne, noms: e.noms.size, offres: e.offres }))
    .sort((a, b) => b.offres - a.offres || a.enseigne.localeCompare(b.enseigne, "fr"));

  return {
    offres: suivies.length,
    avecNumeroAnnonce,
    annoncesDistinctes: parAnnonce.size,
    annoncesEnDouble,
    offresEnTrop,
    annoncesRenommees,
    enseignesEclatees: eclatees.length,
    nomsDansLesEnseignesEclatees: eclatees.reduce((n, e) => n + e.noms, 0),
    exemples: eclatees.slice(0, MAX_EXEMPLES),
  };
}

/**
 * Les offres regroupées par annonce : chaque groupe réunit les copies d'une même annonce du Guichet (même numéro dans
 * le lien), une offre sans numéro lisible formant un groupe à elle seule. L'ordre est celui de la première copie
 * rencontrée. PURE.
 */
export function copiesParAnnonce(offres: readonly Offre[]): Offre[][] {
  const groupes: Offre[][] = [];
  const parNumero = new Map<string, Offre[]>();
  for (const o of offres) {
    const n = numeroAnnonce(o.lien);
    if (n === null) {
      groupes.push([o]);
      continue;
    }
    const g = parNumero.get(n);
    if (g) g.push(o);
    else {
      const neuf = [o];
      parNumero.set(n, neuf);
      groupes.push(neuf);
    }
  }
  return groupes;
}

/** Marc a-t-il touché à cette offre ? (champs qui lui appartiennent : garde-fou n°2, `CHAMPS_UTILISATEUR`.) */
export function touchee(o: Offre): boolean {
  return o.statut !== "Identifiee" || o.dateEnvoi !== "" || o.userNote !== "";
}

/**
 * Celle des copies qui parle pour l'annonce : une offre ouverte avant une périmée, puis la plus récemment repérée,
 * puis l'identifiant (pour que le choix ne dépende pas de l'ordre de lecture). PURE.
 */
export function representante(copies: readonly Offre[]): Offre {
  return [...copies].sort((a, b) => {
    const ouverteA = a.perimeeLe === null ? 0 : 1;
    const ouverteB = b.perimeeLe === null ? 0 : 1;
    if (ouverteA !== ouverteB) return ouverteA - ouverteB;
    if (a.dateReperage !== b.dateReperage) return a.dateReperage < b.dateReperage ? 1 : -1;
    return a.id.localeCompare(b.id);
  })[0]!;
}

/**
 * Retire des RÉSULTATS d'une lecture les copies d'une même annonce : une annonce, une offre.
 *
 * ⚠️ NE TOUCHE À RIEN DANS LE SUIVI, et ne cache jamais ce qui appartient à Marc. Quand deux copies, ou plus, portent
 * chacune un statut, une date d'envoi ou une note de Marc, on les garde toutes : choisir laisserait de côté une
 * décision qu'il a prise. Quand une seule en porte, c'est elle qui reste. Sinon, `representante` tranche.
 * `masquees` dit combien de copies ont été retirées, pour que l'absence ne se lise pas comme un vide.
 */
export function unePourChaqueAnnonce(offres: readonly Offre[]): { offres: Offre[]; masquees: number } {
  const gardees = new Set<Offre>();
  let masquees = 0;
  for (const copies of copiesParAnnonce(offres)) {
    if (copies.length === 1) {
      gardees.add(copies[0]!);
      continue;
    }
    const touchees = copies.filter(touchee);
    if (touchees.length >= 2) {
      for (const c of copies) gardees.add(c);
      continue;
    }
    gardees.add(touchees[0] ?? representante(copies));
    masquees += copies.length - 1;
  }
  return { offres: offres.filter((o) => gardees.has(o)), masquees };
}
