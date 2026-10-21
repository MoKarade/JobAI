// app/api/gmail/retour/route.ts — retour de Google : échange le code, garde le jeton chiffré. ADR-0041, JobAI#107.
//
// ÉCHEC FERMÉ à chaque marche : pas de session, pas de configuration, `state` absent ou différent, scope autre que `gmail.readonly`,
// pas de jeton de rafraîchissement : rien n'est gardé. Les messages d'erreur ne portent jamais le corps d'une réponse de Google.

import { auth } from "@/auth";
import { configGmail } from "@/lib/gmail/config";
import { chiffrerJeton } from "@/lib/gmail/jeton";
import { COOKIE_PKCE, echangerCode, egalConstant, GoogleErreur } from "@/lib/gmail/oauth";
import { enregistrerJetonChiffre } from "@/lib/gmail/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function lireCookie(entete: string | null, nom: string): string | null {
  for (const part of (entete ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === nom) return v.join("=");
  }
  return null;
}

function fin(statut: number, error: string): Response {
  // Le cookie du flux est supprimé dans tous les cas : un `state` ne sert qu'une fois.
  const r = Response.json({ error }, { status: statut, headers: NO_STORE });
  r.headers.append("Set-Cookie", `${COOKIE_PKCE}=; Path=/api/gmail; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return r;
}

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return fin(401, "non_authentifie");

  const cfg = configGmail();
  if (!cfg.ok) return fin(503, "gmail_non_configure");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = lireCookie(req.headers.get("cookie"), COOKIE_PKCE);
  const [stateCookie, verifier] = (cookie ?? "").split(".");
  if (!code || !state || !stateCookie || !verifier || !egalConstant(state, stateCookie)) {
    return fin(400, "flux_invalide");
  }

  try {
    const { refreshToken } = await echangerCode(cfg, code, verifier, fetch);
    await enregistrerJetonChiffre(chiffrerJeton(refreshToken, cfg.secretChiffrement));
  } catch (err) {
    // Le nom et le statut seulement : jamais le corps de Google ni le jeton.
    console.error("[gmail] connexion échouée", { name: err instanceof Error ? err.name : typeof err, statut: err instanceof GoogleErreur ? err.statut : null });
    return fin(502, "echange_echoue");
  }

  const r = new Response(null, { status: 302, headers: { Location: "/?gmail=connecte", ...NO_STORE } });
  r.headers.append("Set-Cookie", `${COOKIE_PKCE}=; Path=/api/gmail; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return r;
}
