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
