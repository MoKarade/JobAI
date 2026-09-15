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

/**
 * Rend au budget des éléments réservés pour un appel que Google N'A PAS facturé.
 *
 * ⚠️ POURQUOI CETTE FONCTION EXISTE — INCIDENT DU 2026-09-15. La réservation se fait AVANT
 * l'appel, et c'est juste : un appel PARTI est facturé même si sa réponse est illisible.
 * Mais un 403 `API_KEY_SERVICE_BLOCKED` n'est pas un appel parti — Google refuse la clé à
 * la porte et ne calcule aucune route. Ce jour-là, quatre passes refusées ont brûlé
 * 48 des 50 éléments sans produire un seul trajet ; le frein posé pour protéger l'argent a
 * fini par bloquer la VÉRIFICATION du correctif qui venait de régler ce même 403. Un frein
 * qui compte ce que personne n'a dépensé ne protège rien, il enferme.
 *
 * ⚠️ CE QU'ELLE NE FAIT PAS, ET C'EST VOLONTAIRE. Elle ne rend RIEN sur un 429 (le quota
 * est justement ce qu'on protège), ni sur un 5xx (on ne sait pas si la route a été
 * calculée), ni sur une réponse illisible d'un appel ACCEPTÉ. Le sens conservateur reste le
 * défaut ; seul un refus PROUVÉ gratuit est rendu — c'est `nonFacture` qui le porte
 * (`lib/trajetRoutes.ts`), posé par le SITE D'APPEL qui a vu la réponse, jamais deviné ici.
 *
 * ⚠️ ET ELLE NE PEUT PAS FABRIQUER DU BUDGET. Le compteur ne descend jamais sous zéro, et
 * un rendu qui arrive le LENDEMAIN (passe à cheval sur minuit) ne crédite pas le jour neuf :
 * il ne rend qu'au jour qui avait réservé.
 */
export async function rendreBudgetRoutes(elements: number, jourReserve?: string): Promise<void> {
  if (!Number.isFinite(elements) || elements <= 0) return;
  const jour = aujourdhuiQuebec();
  // Une réservation d'hier ne se rend pas au budget d'aujourd'hui : elle n'y a rien pris.
  if (jourReserve !== undefined && jourReserve !== jour) return;
  const compteur = await lireEtat<{ jour: string; n: number }>(CLE_COMPTEUR, { jour, n: 0 });
  if (compteur.jour !== jour) return;
  await ecrireEtat(CLE_COMPTEUR, { jour, n: Math.max(0, compteur.n - elements) });
}

/** Le jour (fuseau de Marc) auquel une réservation se rattache — à rendre avec elle. */
export function jourBudgetRoutes(): string {
  return aujourdhuiQuebec();
}
