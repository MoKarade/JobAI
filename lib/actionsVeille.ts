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
import type { RapportVeille } from "./rapportVeille";

/**
 * Ce qu'une veille lancée à la main rapporte à l'écran.
 *
 * ⚠️ C'EST LE RAPPORT LUI-MÊME, PLUS UNE COPIE DE SES CHAMPS. La version précédente relisait
 * une douzaine de nombres un par un depuis un `Record<string, unknown>` — et s'est trompée
 * deux fois de suite : `ingerees` au lieu de `nouvelles`, `sources` traité comme un nombre
 * alors que c'est un tableau. Les deux rendaient 0, donc « 0 ingérée sur 100 trouvées », un
 * compte rendu qui se contredisait lui-même. Un champ absent d'un `Record` ne lève pas : il
 * vaut `undefined`, et un défaut à 0 le déguise en mesure.
 *
 * Une structure TYPÉE traversée telle quelle ne peut pas faire cette erreur : le typecheck
 * refuse un champ mal nommé.
 */
export type ResultatVeilleManuelle =
  | { ok: true; rapport: RapportVeille }
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

  revalidatePath("/");
  revalidatePath("/sources");
  return { ok: true, rapport: r.rapport };
}
