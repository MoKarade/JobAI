// app/api/gmail/connexion/route.ts — démarre la connexion de Marc à Gmail (lecture seule). ADR-0041, JobAI#107.
//
// Derrière la garde de session (NON listée dans `estCheminPublic`) ; la session est revérifiée ici (défense en profondeur).
// ÉCHEC FERMÉ : sans les variables, 503 et rien ne part vers Google.

import { auth } from "@/auth";
import { configGmail } from "@/lib/gmail/config";
import { COOKIE_PKCE, genererPkce, urlAutorisation } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "non_authentifie" }, { status: 401, headers: NO_STORE });

  const cfg = configGmail();
  if (!cfg.ok) {
    return Response.json({ error: "gmail_non_configure", manquantes: cfg.manquantes }, { status: 503, headers: NO_STORE });
  }

  const pkce = genererPkce();
  const reponse = new Response(null, {
    status: 302,
    headers: { Location: urlAutorisation(cfg, pkce), ...NO_STORE },
  });
  // Le `state` et le verifier voyagent dans un cookie à durée courte, lisible par le seul chemin de retour.
  reponse.headers.append(
    "Set-Cookie",
    `${COOKIE_PKCE}=${pkce.state}.${pkce.verifier}; Path=/api/gmail; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  );
  return reponse;
}
