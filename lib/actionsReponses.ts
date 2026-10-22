"use server";

// lib/actionsReponses.ts — les deux gestes du bloc « Réponses de recruteurs » : confirmer ou écarter. (JobAI#219, ADR-0043)
//
// Garde-fou n°2 : SEUL « Confirmer » écrit un statut, et il l'écrit par `modifierOffre`, le chemin du menu de statut (même validation, même
// date d'envoi, même revalidation). Le statut écrit est celui que le SERVEUR a gardé pour ce courriel, jamais une valeur envoyée par le
// client : une requête forgée ne peut pas poser un autre statut. « Écarter » n'écrit rien dans le suivi.
// Chaque action revérifie la session (une Server Action est un point d'entrée POST appelable directement).

import { revalidatePath } from "next/cache";
import { modifierOffre } from "./actions";
import { lireOffre } from "./donnees";
import { faitAvancer } from "./gmail/proposition";
import { ajouterTraitee } from "./gmail/reponses";
import { ecrireTraitees, lireGardees, lireTraiteesGardees } from "./gmail/reponsesStore";
import { exigerSession } from "./session";

export type ResultatReponse = { ok: true } | { ok: false; erreur: string };

const NON_CONNECTE: ResultatReponse = { ok: false, erreur: "Authentification requise." };

async function marquer(courrielId: string, action: "confirmee" | "ecartee"): Promise<void> {
  const traitees = await lireTraiteesGardees();
  await ecrireTraitees(ajouterTraitee(traitees, { courrielId, action, le: new Date().toISOString() }));
}

export async function confirmerReponse(courrielId: string): Promise<ResultatReponse> {
  try {
    await exigerSession();
  } catch {
    return NON_CONNECTE;
  }
  if (typeof courrielId !== "string" || courrielId === "") return { ok: false, erreur: "Réponse inconnue." };

  try {
    const gardees = await lireGardees();
    const proposition = gardees?.propositions.find((p) => p.courrielId === courrielId);
    if (proposition === undefined) return { ok: false, erreur: "Cette réponse n'est plus proposée. Recharge la page." };
    if ((await lireTraiteesGardees()).some((t) => t.courrielId === courrielId)) return { ok: true };

    const offre = await lireOffre(proposition.offreId);
    if (offre === null) return { ok: false, erreur: "Offre introuvable." };
    // Marc a pu changer le statut à la main depuis la lecture : on n'écrit pas par-dessus et on ne fait jamais reculer une offre.
    if (!faitAvancer(offre.statut, proposition.sens)) {
      revalidatePath("/");
      return { ok: false, erreur: "Le statut de l'offre a changé depuis : rien n'est écrit." };
    }

    const r = await modifierOffre(offre.id, { statut: proposition.statutPropose });
    if (!r.ok) return { ok: false, erreur: r.erreur };
    await marquer(courrielId, "confirmee");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("[reponses] confirmation impossible", { courrielId, err });
    return { ok: false, erreur: "Enregistrement impossible. Réessaie." };
  }
}

export async function ecarterReponse(courrielId: string): Promise<ResultatReponse> {
  try {
    await exigerSession();
  } catch {
    return NON_CONNECTE;
  }
  if (typeof courrielId !== "string" || courrielId === "") return { ok: false, erreur: "Réponse inconnue." };

  try {
    await marquer(courrielId, "ecartee");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("[reponses] écart impossible", { courrielId, err });
    return { ok: false, erreur: "Enregistrement impossible. Réessaie." };
  }
}
