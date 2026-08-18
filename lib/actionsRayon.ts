"use server";

// lib/actionsRayon.ts — régler le rayon de recherche depuis l'app.
//
// ⚠️ POURQUOI CE FICHIER PLUTÔT QU'UNE LIGNE DE PLUS DANS `lib/actions.ts`
// Même raison que `lib/actionsVeille.ts` : `lib/actions.ts` importe déjà `lib/rayon.ts`, et
// l'import inverse créerait un cycle. Un cycle ESM ne casse pas toujours — les déclarations
// de fonctions sont hissées — jusqu'au jour où l'ordre d'évaluation change et où un module
// lit `undefined` au chargement. C'est la panne qu'on ne diagnostique pas, parce qu'elle
// n'apparaît qu'en production et jamais au typecheck.

import { revalidatePath } from "next/cache";
import { exigerSession } from "./session";
import { lireEtat, ecrireEtat } from "./etat";
import { CLE_LIEUX } from "./veilleComplete";
import type { RegistreLieux } from "./ingest/lieux";
import {
  CLE_RAYON,
  RAYON_DEFAUT_KM,
  RAYON_MAX_REGLABLE_KM,
  RAYON_MIN_KM,
  compterBascules,
  normaliserRayon,
  rejugerRegistre,
} from "./rayon";

export type ResultatRayon =
  | {
      ok: true;
      rayonKm: number;
      /** Combien de lieux déjà mesurés changent de verdict. Dit, jamais silencieux. */
      bascules: number;
      /** Taille du registre re-jugé — pour que « 0 bascule » se distingue de « 0 lieu ». */
      lieux: number;
    }
  | { ok: false; erreur: string };

/** Le rayon courant, pour l'affichage. */
export async function lireRayon(): Promise<number> {
  return lireEtat<number>(CLE_RAYON, RAYON_DEFAUT_KM);
}

/**
 * Règle le rayon, et RE-JUGE tout ce qu'il périme.
 *
 * ⚠️ LE RE-JUGEMENT N'EST PAS UN BONUS, C'EST LA MOITIÉ DU TRAVAIL. Chaque verdict du
 * registre des lieux a été rendu SOUS un rayon donné. Écrire le nouveau nombre sans y
 * toucher laisserait « Baie-Comeau : hors région » en place alors qu'elle vient d'entrer
 * dans le rayon — et le registre est consulté AVANT toute nouvelle mesure, donc ce verdict
 * périmé ne serait jamais revu. Marc aurait élargi son rayon et rien n'aurait changé, sans
 * qu'aucune erreur ne s'affiche.
 *
 * Ça ne coûte aucune requête : le registre stocke la DISTANCE mesurée, pas seulement le
 * verdict. Re-juger est une fonction pure sur des nombres déjà en base.
 */
export async function reglerRayon(saisie: string): Promise<ResultatRayon> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  const rayonKm = normaliserRayon(saisie);
  if (rayonKm === null) {
    return {
      ok: false,
      erreur: `Un nombre entre ${RAYON_MIN_KM} et ${RAYON_MAX_REGLABLE_KM} km.`,
    };
  }

  try {
    const registre = await lireEtat<RegistreLieux>(CLE_LIEUX, {});
    const bascules = compterBascules(registre, rayonKm);

    // Le rayon D'ABORD : si l'écriture du registre échoue ensuite, on aura un rayon neuf et
    // des verdicts périmés — que la passe suivante corrigera en re-mesurant. L'ordre inverse
    // laisserait un registre re-jugé sous un rayon jamais écrit, donc incohérent avec ce que
    // l'écran affiche, et rien ne le rattraperait.
    await ecrireEtat(CLE_RAYON, rayonKm);
    if (bascules > 0) await ecrireEtat(CLE_LIEUX, rejugerRegistre(registre, rayonKm));

    revalidatePath("/");
    revalidatePath("/sources");
    revalidatePath("/carte");
    return { ok: true, rayonKm, bascules, lieux: Object.keys(registre).length };
  } catch (err) {
    console.error("[rayon] réglage impossible", err);
    return { ok: false, erreur: "Le réglage n’a pas pu être enregistré. Voir les journaux." };
  }
}
