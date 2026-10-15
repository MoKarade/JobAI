// lib/oauthJeton.ts — la règle PURE de validité d'un jeton, sortie de `lib/oauthStore.ts`
// pour être éprouvée sans base.

export interface JetonValide {
  clientId: string;
  sujet: string;
}

/**
 * Le jeton lu en base est-il utilisable à `maintenant` ? PURE.
 *
 * Aucune distinction entre absent, révoqué et expiré : un refus est un refus. L'échéance est
 * EXCLUSIVE — un jeton qui expire à l'instant exact est déjà refusé.
 */
export function jetonUtilisable(
  ligne: { clientId: string; sujet: string; expireLe: Date; revoqueLe: Date | null } | undefined,
  maintenant: Date,
): JetonValide | null {
  if (ligne === undefined) return null;
  if (ligne.revoqueLe !== null) return null;
  if (ligne.expireLe.getTime() <= maintenant.getTime()) return null;
  return { clientId: ligne.clientId, sujet: ligne.sujet };
}
