"use server";

// lib/actionsCandidature.ts — le bouton « brouillon de CV et de lettre », côté serveur.
//
// ⚠️ FICHIER À PART, comme `actionsAnalyse` : `lib/actions.ts` importe les modules du barème,
// et l'import inverse ferait un cycle ESM.
//
// ⚠️ UN APPEL PAYANT NE SE DÉCLENCHE JAMAIS TOUT SEUL : uniquement au clic de Marc, jamais au
// chargement d'une fiche ni par la veille. Le brouillon n'est PAS conservé : il n'est ni écrit
// en base ni mêlé au suivi (statut, date d'envoi, notes restent à Marc, garde-fou n°2).

import { exigerSession } from "./session";
import { lireOffre } from "./donnees";
import { profilActif } from "./cv/depot";
import { redigerCandidature } from "./candidatureLlm";
import type { Brouillon } from "./candidature";

export type ResultatBrouillon =
  | { ok: true; brouillon: Brouillon }
  | { ok: false; erreur: string };

/** Prépare le brouillon de CV et de lettre pour l'offre `id`. */
export async function preparerBrouillon(id: string): Promise<ResultatBrouillon> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  // Un point d'entrée POST généré par Next reçoit n'importe quoi : on borne avant de lire.
  if (typeof id !== "string" || id.length === 0 || id.length > 80) {
    return { ok: false, erreur: "Offre introuvable." };
  }

  let offre;
  try {
    offre = await lireOffre(id);
  } catch (err) {
    console.error("[candidature] lecture de l'offre impossible", { id, err });
    return { ok: false, erreur: "La base n'a pas répondu. Voir les journaux." };
  }
  if (!offre) return { ok: false, erreur: "Offre introuvable." };

  let faits;
  try {
    faits = (await profilActif()).faits;
  } catch (err) {
    // `profilActif` lève sur un profil illisible, et c'est voulu : on ne rédige pas un CV
    // sur le profil par défaut en faisant croire que c'est celui de Marc.
    console.error("[candidature] profil illisible", err);
    return { ok: false, erreur: "Le profil n'a pas pu être lu. Voir les journaux." };
  }

  const r = await redigerCandidature(offre, faits);
  if (!r.ok) return { ok: false, erreur: r.raison };
  return { ok: true, brouillon: r.brouillon };
}
