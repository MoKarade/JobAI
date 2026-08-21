// lib/budgetRoutes.ts — le frein des appels Routes, compté dans l'UNITÉ qui se facture.
//
// ⚠️ L'ÉLÉMENT, PAS L'APPEL. Un computeRoutes vaut 1 élément ; une matrice de 12
// destinations en vaut 12 dans le MÊME appel HTTP. Compter les appels laisserait la
// matrice consommer douze fois le budget d'un coup sans que le compteur ne bouge que de
// un — la leçon « un plafond se vérifie à l'unité de COÛT réelle » du CLAUDE.md global,
// payée sur les quotas Gmail de DriveAI.
//
// Consommé AVANT l'appel : un appel parti est facturé même si sa réponse est illisible.

import { lireEtat, ecrireEtat } from "./etat";

/** Plafond d'ÉLÉMENTS Routes par jour. Le filet ne se désactive jamais ; il se dit. */
export const ROUTES_ELEMENTS_MAX_PAR_JOUR = 50;

const CLE_COMPTEUR = "routes-compteur";

function aujourdhuiQuebec(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type ResultatBudget =
  | { ok: true; restant: number }
  | { ok: false; raison: string };

/**
 * Réserve `elements` sur le budget du jour, ou refuse EN LE DISANT.
 *
 * Le refus arrive AVANT toute dépense : l'appelant qui le reçoit n'a rien payé.
 */
export async function consommerBudgetRoutes(elements: number): Promise<ResultatBudget> {
  const jour = aujourdhuiQuebec();
  const compteur = await lireEtat<{ jour: string; n: number }>(CLE_COMPTEUR, { jour, n: 0 });
  const n = compteur.jour === jour ? compteur.n : 0;
  if (n + elements > ROUTES_ELEMENTS_MAX_PAR_JOUR) {
    return {
      ok: false,
      raison: `Budget Routes du jour épuisé (${n}/${ROUTES_ELEMENTS_MAX_PAR_JOUR} éléments) — demain, ou le lien Google Maps.`,
    };
  }
  await ecrireEtat(CLE_COMPTEUR, { jour, n: n + elements });
  return { ok: true, restant: ROUTES_ELEMENTS_MAX_PAR_JOUR - n - elements };
}
