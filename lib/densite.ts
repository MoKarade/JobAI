// lib/densite.ts — le poids des « bonnes offres » d'un lieu, pour le calque de densité
// (ADR-0016, lot G). PUR, calculé localement : ce lot ne coûte AUCUN appel.

import { SEUIL_PALIER_B } from "./scoring";
import type { Epingle } from "./carte";

/**
 * Le poids d'une épingle : la somme de ses bonnes offres, graduée.
 *
 * ⚠️ « BONNE » EST DÉJÀ DÉFINI DANS L'APP : le palier B (`SEUIL_PALIER_B`). Inventer un
 * second seuil ici ferait deux définitions de « bon » qui divergeraient au premier
 * réglage du barème. Une offre au seuil pèse 1 ; chaque vingt points au-dessus ajoutent 1.
 * Une offre sans note ne pèse RIEN — elle n'est pas mauvaise, elle n'est pas jugée.
 */
export function poidsEpingle(epingle: Pick<Epingle, "entreprises">): number {
  let poids = 0;
  for (const e of epingle.entreprises) {
    for (const o of e.offres) {
      if (o.score !== null && o.score >= SEUIL_PALIER_B) {
        poids += 1 + (o.score - SEUIL_PALIER_B) / 20;
      }
    }
  }
  return poids;
}

/**
 * Le rayon du cercle de densité, en mètres.
 *
 * ⚠️ LA SURFACE SUIT LE POIDS, PAS LE RAYON : quatre fois plus de bonnes offres = un
 * disque quatre fois plus GRAND, donc un rayon deux fois plus long (√). Un rayon linéaire
 * ferait paraître un pôle de quatre offres seize fois plus gros qu'une offre isolée.
 * Plafonné : au-delà, le disque recouvrirait la moitié de la ville et ne dirait plus rien.
 */
export const RAYON_DENSITE_MAX_M = 2500;

export function rayonDensiteM(poids: number): number {
  if (poids <= 0) return 0;
  return Math.min(RAYON_DENSITE_MAX_M, Math.round(500 + 400 * Math.sqrt(poids)));
}
