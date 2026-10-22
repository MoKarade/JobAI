// lib/gmail/reponsesStore.ts — lire et garder les propositions de statut de l'accueil. (JobAI#219, ADR-0043)
//
// Les I/O du bloc « Réponses de recruteurs » : l'état est gardé dans `sync_state` (pas de table, pas de migration). Gmail n'est interrogé
// que par `actualiserPropositions`, appelée APRÈS la réponse de l'accueil (`after()`), au plus une fois par `DELAI_ACTUALISATION_MS` : le
// chemin critique de l'affichage ne touche jamais le réseau, et une page rechargée dix fois ne lit pas dix fois la boîte.

import { db } from "../db";
import { ecrireEtat, lireEtat } from "../etat";
import { reserverPasse } from "../synchro";
import type { Offre } from "../types";
import { lireCourrielsRecus } from "./acces";
import { proposerStatuts } from "./proposition";
import {
  CLE_PASSE_GMAIL,
  CLE_PROPOSITIONS,
  CLE_TRAITEES,
  DELAI_ACTUALISATION_MS,
  LECTURE_ACCUEIL,
  lirePropositionsGardees,
  lireTraitees,
  reponsesAConfirmer,
  type PropositionsGardees,
  type ReponseAConfirmer,
  type Traitee,
} from "./reponses";

export async function lireGardees(): Promise<PropositionsGardees | null> {
  return lirePropositionsGardees(await lireEtat<unknown>(CLE_PROPOSITIONS, null));
}

export async function lireTraiteesGardees(): Promise<Traitee[]> {
  return lireTraitees(await lireEtat<unknown>(CLE_TRAITEES, []));
}

export async function ecrireTraitees(liste: readonly Traitee[]): Promise<void> {
  await ecrireEtat(CLE_TRAITEES, liste);
}

/** Les réponses à confirmer, pour l'accueil. Une lecture illisible rend une liste vide : le bloc se tait, il n'emporte pas la page. */
export async function lireReponsesAConfirmer(offres: readonly Offre[]): Promise<ReponseAConfirmer[]> {
  try {
    const [gardees, traitees] = await Promise.all([lireGardees(), lireTraiteesGardees()]);
    return reponsesAConfirmer(gardees, traitees, offres);
  } catch (err) {
    console.error("[accueil] réponses de recruteurs illisibles, bloc omis", err);
    return [];
  }
}

/**
 * Relit la boîte et garde les propositions. Ne fait RIEN si Gmail n'est pas configuré, pas connecté ou refuse : l'état gardé reste celui
 * d'avant (un refus de Google n'efface pas des propositions déjà lues). Jamais d'écriture dans le suivi.
 */
export async function actualiserPropositions(offres: readonly Offre[], maintenant: Date): Promise<void> {
  const lecture = await lireCourrielsRecus(LECTURE_ACCUEIL);
  if (lecture.etat !== "ok") return;
  const bilan = proposerStatuts(lecture.courriels, offres);
  const gardees: PropositionsGardees = {
    luLe: maintenant.toISOString(),
    courrielsLus: bilan.courrielsLus,
    propositions: bilan.propositions.map((p) => ({
      courrielId: p.courrielId,
      recuLe: p.recuLe,
      offreId: p.offreId,
      statutPropose: p.statutPropose,
      sens: p.sens,
      phrase: p.phrase,
      sujet: p.sujet,
      expediteur: p.expediteur,
    })),
  };
  await ecrireEtat(CLE_PROPOSITIONS, gardees);
}

/**
 * Le déclencheur de l'accueil : réserve la passe (au plus une par délai, atomique en base) puis actualise. Les erreurs sont journalisées,
 * jamais avalées, et ne remontent pas à la page.
 */
export async function actualiserSiPerime(offres: readonly Offre[], maintenant: Date): Promise<void> {
  try {
    if (!(await reserverPasse(db, CLE_PASSE_GMAIL, DELAI_ACTUALISATION_MS, maintenant))) return;
    await actualiserPropositions(offres, maintenant);
  } catch (err) {
    console.error("[accueil] actualisation des réponses de recruteurs impossible", err);
  }
}
