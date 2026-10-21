// app/api/gmail/courriels/route.ts — les courriels reçus récents, lus en lecture seule. ADR-0041, JobAI#107.
//
// Derrière la garde de session (revérifiée ici). Chaque marche de l'échec fermé a son propre état nommé, pour que Marc sache QUOI faire :
// `non-configure` (variables Vercel), `non-connecte` (ouvrir /api/gmail/connexion), `jeton-illisible` (AUTH_SECRET a changé : se reconnecter),
// `google-refuse` (jeton révoqué ou quota). Aucun corps de réponse de Google n'est repris. Rien n'est écrit, ni chez Gmail ni dans le suivi.

import { auth } from "@/auth";
import { configGmail } from "@/lib/gmail/config";
import { dechiffrerJeton } from "@/lib/gmail/jeton";
import { lireCourriels } from "@/lib/gmail/lecture";
import { GoogleErreur, rafraichir } from "@/lib/gmail/oauth";
import { lireJetonChiffre } from "@/lib/gmail/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function repondre(statut: number, corps: Record<string, unknown>): Response {
  return Response.json(corps, { status: statut, headers: NO_STORE });
}

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) return repondre(401, { etat: "non-authentifie" });

  const cfg = configGmail();
  if (!cfg.ok) return repondre(503, { etat: "non-configure", manquantes: cfg.manquantes });

  const blob = await lireJetonChiffre();
  if (blob === null) return repondre(409, { etat: "non-connecte" });
  const refreshToken = dechiffrerJeton(blob, cfg.secretChiffrement);
  if (refreshToken === null) return repondre(409, { etat: "jeton-illisible" });

  try {
    const acces = await rafraichir(cfg, refreshToken, fetch);
    const courriels = await lireCourriels(acces, { depuisJours: 14, max: 20 }, fetch);
    return repondre(200, { etat: "ok", courriels });
  } catch (err) {
    console.error("[gmail] lecture échouée", { name: err instanceof Error ? err.name : typeof err, statut: err instanceof GoogleErreur ? err.statut : null });
    return repondre(502, { etat: "google-refuse", statut: err instanceof GoogleErreur ? err.statut : null });
  }
}
