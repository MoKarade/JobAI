"use server";

// lib/actionsMetiers.ts — choisir les métiers retenus dans le flux du Guichet, depuis l'app.
//
// ⚠️ POURQUOI UN FICHIER À PART, ENCORE UNE FOIS. Même raison que `lib/actionsRayon.ts` et
// `lib/actionsVeille.ts` : `lib/actions.ts` importe déjà les modules du barème, et l'import
// inverse ferait un cycle ESM. Un cycle ne casse pas toujours — les déclarations de fonctions
// sont hissées — jusqu'au jour où l'ordre d'évaluation change et où un module lit `undefined`
// au chargement. C'est la panne qui n'apparaît qu'en production et jamais au typecheck.
//
// ⚠️ CE RÉGLAGE ALLUME UNE SOURCE. Tant que la liste est vide, le flux complet du Guichet
// n'est pas interrogé du tout ; dès qu'elle porte un code, la passe quotidienne lit ~130 Mo
// et peut faire entrer des dizaines d'offres d'un coup. L'écran doit le dire avant, pas
// laisser Marc le découvrir au lendemain matin.

import { revalidatePath } from "next/cache";
import { exigerSession } from "./session";
import { lireEtat, ecrireEtat } from "./etat";
import {
  CLE_METIERS,
  CLE_MODE_FLUX,
  MAX_METIERS,
  METIERS_DEFAUT,
  metiersRedondants,
  normaliserMetiers,
  normaliserModeFlux,
  type ModeFlux,
} from "./metiersRetenus";

export type ResultatMetiers =
  | {
      ok: true;
      codes: string[];
      /** Les fragments refusés, tels que saisis. Dits, jamais avalés. */
      rejets: string[];
      /** Les codes complets qu'un préfixe rend inutiles. Informatif. */
      redondants: string[];
      /** La source du flux est-elle active après ce réglage ? */
      active: boolean;
    }
  | { ok: false; erreur: string };

/**
 * Le mode d'ingestion du flux, tel que la passe le lira.
 *
 * ⚠️ LU AVEC LA LISTE, jamais seul : sans mode enregistré, c'est la liste qui dit ce que
 * Marc voulait (non vide ⇒ `domaine`). Lire le mode sans elle rendrait `eteint` et
 * afficherait « source coupée » sur une source qui tourne.
 */
export async function lireModeFlux(): Promise<ModeFlux> {
  const [brut, codes] = await Promise.all([
    lireEtat<string | null>(CLE_MODE_FLUX, null),
    lireMetiers(),
  ]);
  return normaliserModeFlux(brut, codes);
}

/** Enregistre le mode d'ingestion du flux (ADR-0013, D3). */
export async function reglerModeFlux(
  mode: string,
): Promise<{ ok: true; mode: ModeFlux } | { ok: false; erreur: string }> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }
  // ⚠️ NORMALISÉ SANS LA LISTE, ET C'EST VOULU. Ici la valeur vient d'un FORMULAIRE, pas de
  // l'état : une valeur inconnue est une saisie fautive, et le défaut sûr d'une saisie
  // fautive est d'éteindre, jamais de déduire une intention de la liste.
  const choisi = normaliserModeFlux(mode);
  try {
    await ecrireEtat(CLE_MODE_FLUX, choisi);
    revalidatePath("/sources");
    return { ok: true, mode: choisi };
  } catch (err) {
    console.error("[metiers] mode du flux non enregistré", err);
    return { ok: false, erreur: "Le mode n’a pas pu être enregistré. Voir les journaux." };
  }
}

/** Les métiers retenus, pour l'affichage et pour la passe. */
export async function lireMetiers(): Promise<string[]> {
  const lus = await lireEtat<string[]>(CLE_METIERS, [...METIERS_DEFAUT]);
  // ⚠️ RE-NORMALISÉ À LA LECTURE. L'état est du JSON écrit par une version antérieure du
  // code : rien ne garantit qu'il porte encore des codes lisibles. Faire confiance à ce
  // qu'on a écrit hier est exactement la supposition qui a laissé deux listes de tables
  // recopiées diverger. La normalisation est pure et coûte un tri.
  return Array.isArray(lus) ? normaliserMetiers(lus).codes : [];
}

/**
 * Enregistre les métiers retenus.
 *
 * ⚠️ UNE SAISIE PARTIELLEMENT ILLISIBLE EST ENREGISTRÉE POUR SA PART VALIDE, ET LES REJETS
 * SONT RENDUS. Refuser tout le formulaire parce qu'une entrée sur douze est mal tapée ferait
 * perdre le reste de la sélection ; l'accepter en silence ferait croire à Marc qu'il a retenu
 * un métier que la source ne verra jamais. Les deux comptes partent à l'écran.
 */
export async function reglerMetiers(saisie: string): Promise<ResultatMetiers> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  const { codes, rejets, troplong } = normaliserMetiers(saisie);
  if (troplong) {
    return {
      ok: false,
      erreur: `Trop de codes (maximum ${MAX_METIERS}). Un préfixe de deux chiffres en remplace des dizaines.`,
    };
  }

  try {
    await ecrireEtat(CLE_METIERS, codes);
    revalidatePath("/sources");
    return {
      ok: true,
      codes,
      rejets,
      redondants: metiersRedondants(codes),
      active: codes.length > 0,
    };
  } catch (err) {
    console.error("[metiers] réglage impossible", err);
    return { ok: false, erreur: "Le réglage n’a pas pu être enregistré. Voir les journaux." };
  }
}
