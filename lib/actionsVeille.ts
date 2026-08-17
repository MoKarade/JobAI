"use server";

// lib/actionsVeille.ts — lancer la veille depuis l'app, sans créer de cycle d'imports.
//
// ⚠️ POURQUOI CE FICHIER PLUTÔT QU'UNE LIGNE DE PLUS DANS `lib/actions.ts`.
//
// `lib/veilleComplete.ts` importe DÉJÀ `mesurerDistances` depuis `lib/actions.ts`. Ajouter
// l'import inverse dans `actions.ts` a créé un cycle — confirmé par `madge --circular`, qui
// n'en rendait aucun avant. Un cycle ESM ne casse pas toujours : les déclarations de
// fonctions sont hissées, donc « ça marche » jusqu'au jour où l'ordre d'évaluation change et
// où un module lit `undefined` au chargement. C'est précisément la panne qu'on ne diagnostique
// pas, parce qu'elle n'apparaît qu'en production et jamais au typecheck.
//
// Ce fichier casse le cycle par sa POSITION : il importe `veilleComplete`, et rien ne
// l'importe en retour.

import { revalidatePath } from "next/cache";
import { exigerSession } from "./session";
import { executerVeilleComplete } from "./veilleComplete";

/** Ce qu'une veille lancée à la main rapporte à l'écran. */
export type ResultatVeilleManuelle =
  | {
      ok: true;
      resume: string;
      trouvees: number;
      ingerees: number;
      perimees: number;
      sources: number;
    }
  | { ok: false; erreur: string };

/**
 * Lance la passe de veille complète, depuis l'app.
 *
 * ⚠️ CE BOUTON N'EXISTE QUE PARCE QUE LE COMPTEUR D'ABSENCES A ÉTÉ CORRIGÉ. Tant qu'il
 * comptait par PASSE, relancer la veille vieillissait le stock d'un cran à chaque clic et
 * trois clics le périmaient : le bon geste était alors d'INTERDIRE le bouton, pas de le
 * poser. Depuis que les absences se comptent par JOUR, le balayage est idempotent dans la
 * journée — relançable autant de fois qu'on veut, ce que Marc demandait.
 *
 * La réservation courte reste : elle n'empêche plus de relancer, elle empêche deux passes
 * SIMULTANÉES d'écrire les mêmes offres.
 */
export async function lancerVeille(): Promise<ResultatVeilleManuelle> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  const r = await executerVeilleComplete("bouton-app");
  if (!r.ok) return { ok: false, erreur: r.erreur };

  const c = r.compte as Record<string, unknown>;
  const nombre = (v: unknown): number => (typeof v === "number" ? v : 0);

  revalidatePath("/");
  revalidatePath("/sources");
  return {
    ok: true,
    resume: typeof c.resume === "string" ? c.resume : "",
    trouvees: nombre(c.trouvees),
    ingerees: nombre(c.ingerees),
    perimees: nombre(c.perimees),
    sources: nombre(c.sources),
  };
}
