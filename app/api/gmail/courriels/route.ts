// app/api/gmail/courriels/route.ts — les courriels reçus récents, lus en lecture seule. ADR-0041, JobAI#107.
//
// Derrière la garde de session (revérifiée ici). Les états de l'échec fermé viennent de `lireCourrielsRecus` : `non-configure` (variables Vercel),
// `non-connecte` (ouvrir /api/gmail/connexion), `jeton-illisible` (AUTH_SECRET a changé : se reconnecter), `google-refuse` (jeton révoqué ou quota).
// Aucun corps de réponse de Google n'est repris. Rien n'est écrit, ni chez Gmail ni dans le suivi.

import { auth } from "@/auth";
import { lireCourrielsRecus } from "@/lib/gmail/acces";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function repondre(statut: number, corps: Record<string, unknown>): Response {
  return Response.json(corps, { status: statut, headers: NO_STORE });
}

const STATUT_HTTP = { ok: 200, "non-configure": 503, "non-connecte": 409, "jeton-illisible": 409, "google-refuse": 502 } as const;

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) return repondre(401, { etat: "non-authentifie" });

  const lecture = await lireCourrielsRecus({ depuisJours: 14, max: 20 });
  return repondre(STATUT_HTTP[lecture.etat], lecture);
}
