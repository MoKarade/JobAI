"use server";

// lib/actions.ts — les écritures, et les SEULES.
//
// Garde-fou n°2 : ce fichier est le seul autorisé à modifier les champs qui appartiennent
// à Marc. Chaque action commence par revérifier la session, puis valide son entrée par Zod
// avant de toucher la base — un point d'entrée POST généré par Next est appelable
// directement, le middleware ne le couvre pas.
//
// Ces actions renvoient un résultat plutôt que de lever : l'interface doit pouvoir afficher
// « ça n'a pas marché » sans se casser. Une erreur avalée en silence, en revanche, serait
// pire que l'échec — d'où le journal côté serveur.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { offers } from "./db/schema";
import { exigerSession } from "./session";
import { MiseAJourOffreSchema } from "./types";

export type Resultat = { ok: true } | { ok: false; erreur: string };

/**
 * Modifie une offre. Seuls les champs de `MiseAJourOffreSchema` peuvent bouger : un
 * appelant qui tenterait de changer un score ou une justification par ce chemin n'a aucun
 * effet, parce que ces clés ne survivent pas au parse.
 */
export async function modifierOffre(
  id: string,
  patch: unknown,
): Promise<Resultat> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  const parse = MiseAJourOffreSchema.safeParse(patch);
  if (!parse.success) {
    return { ok: false, erreur: "Modification invalide." };
  }

  const champs = parse.data;
  if (Object.keys(champs).length === 0) return { ok: true };

  try {
    const [avant] = await db
      .select({ dateEnvoi: offers.dateEnvoi })
      .from(offers)
      .where(eq(offers.id, id))
      .limit(1);

    if (!avant) return { ok: false, erreur: "Offre introuvable." };

    // Date d'envoi posée automatiquement au passage à « CV envoyé », et SEULEMENT si elle
    // est encore vide : réappliquer le statut ne doit pas réécrire une date déjà connue.
    const dateEnvoi =
      champs.statut === "CVenvoye" && !avant.dateEnvoi && !champs.dateEnvoi
        ? new Date().toISOString().slice(0, 10)
        : champs.dateEnvoi;

    await db
      .update(offers)
      .set({
        ...champs,
        ...(dateEnvoi === undefined ? {} : { dateEnvoi }),
        majLe: new Date(),
      })
      .where(eq(offers.id, id));

    // Le tableau de bord et le widget dérivent des mêmes lignes : ils doivent changer
    // ensemble, sinon un compteur reste faux jusqu'au prochain rechargement.
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("[actions] modification impossible", { id, err });
    return { ok: false, erreur: "Enregistrement impossible. Réessaie." };
  }
}
