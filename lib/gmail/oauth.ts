// lib/gmail/oauth.ts — le flux OAuth 2.0 « code + PKCE » vers Google, sans SDK. (ADR-0041, JobAI#107)
//
// Pur sauf `echangerCode` et `rafraichir`, qui reçoivent `fetch` en paramètre (les tests n'émettent jamais de vraie requête).
// Aucune de ces fonctions n'écrit chez Google : on y demande un jeton, c'est tout.
//
// ⚠️ LE SCOPE ACCORDÉ EST VÉRIFIÉ, PAS SUPPOSÉ. Google rend dans la réponse les scopes réellement accordés ; si ce n'est pas exactement
// `gmail.readonly`, le jeton est refusé avant d'être gardé — la lecture seule est ainsi une propriété du code, pas de la demande.
//
// ⚠️ LE CORPS DES RÉPONSES D'ERREUR DE GOOGLE N'EST JAMAIS REPRIS dans un message : il peut citer le client ou l'adresse. On garde
// le statut et le code d'erreur standard (`invalid_grant`…), c'est tout.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SCOPE_GMAIL, type ConfigGmailPrete } from "./config";

const URL_AUTORISATION = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_JETON = "https://oauth2.googleapis.com/token";

/** Le cookie court qui porte `state.verifier` entre la connexion et le retour. */
export const COOKIE_PKCE = "gmail_pkce";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface Pkce {
  state: string;
  verifier: string;
  challenge: string;
}

export function genererPkce(): Pkce {
  const verifier = randomBytes(48).toString("base64url");
  return {
    state: randomBytes(24).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

/**
 * `access_type=offline` + `prompt=consent` : sans eux Google ne rend pas de jeton de rafraîchissement à la 2e connexion.
 * `include_granted_scopes` est ABSENT exprès : il ajouterait d'anciens scopes accordés et ferait échouer la vérification.
 */
export function urlAutorisation(cfg: ConfigGmailPrete, pkce: Pick<Pkce, "state" | "challenge">): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPE_GMAIL,
    access_type: "offline",
    prompt: "consent",
    state: pkce.state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
  });
  return `${URL_AUTORISATION}?${p.toString()}`;
}

/** Égalité en temps constant de deux chaînes (le `state` du cookie contre celui du retour). */
export function egalConstant(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const ReponseJetonSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().min(1),
});

const ReponseRafraichissementSchema = z.object({ access_token: z.string().min(1) });

export class GoogleErreur extends Error {
  constructor(
    message: string,
    readonly statut: number | null,
  ) {
    super(message);
    this.name = "GoogleErreur";
  }
}

async function posterJeton(fetchFn: FetchFn, corps: Record<string, string>): Promise<unknown> {
  let rep: Response;
  try {
    rep = await fetchFn(URL_JETON, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(corps).toString(),
    });
  } catch {
    throw new GoogleErreur("Google injoignable.", null);
  }
  if (!rep.ok) {
    const code = await rep
      .json()
      .then((j: unknown) => (typeof (j as { error?: unknown })?.error === "string" ? (j as { error: string }).error : null))
      .catch(() => null);
    throw new GoogleErreur(`Google a refusé la demande de jeton (${rep.status}${code ? `, ${code}` : ""}).`, rep.status);
  }
  return rep.json().catch(() => {
    throw new GoogleErreur("Réponse de Google illisible.", rep.status);
  });
}

/** Échange le code contre un jeton de rafraîchissement. Refuse tout scope autre que `gmail.readonly`. */
export async function echangerCode(
  cfg: ConfigGmailPrete,
  code: string,
  verifier: string,
  fetchFn: FetchFn,
): Promise<{ refreshToken: string }> {
  const brut = await posterJeton(fetchFn, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
  });
  const lu = ReponseJetonSchema.safeParse(brut);
  if (!lu.success) throw new GoogleErreur("Réponse de Google hors schéma.", null);
  const scopes = lu.data.scope.split(/\s+/).filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== SCOPE_GMAIL) {
    throw new GoogleErreur("Scope accordé inattendu : seule la lecture seule est acceptée.", null);
  }
  if (!lu.data.refresh_token) {
    throw new GoogleErreur("Google n'a pas rendu de jeton de rafraîchissement.", null);
  }
  return { refreshToken: lu.data.refresh_token };
}

/** Un jeton d'accès de courte durée, à partir du jeton de rafraîchissement. */
export async function rafraichir(cfg: ConfigGmailPrete, refreshToken: string, fetchFn: FetchFn): Promise<string> {
  const brut = await posterJeton(fetchFn, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const lu = ReponseRafraichissementSchema.safeParse(brut);
  if (!lu.success) throw new GoogleErreur("Réponse de Google hors schéma.", null);
  return lu.data.access_token;
}
