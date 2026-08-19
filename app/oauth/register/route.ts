// app/oauth/register/route.ts — enregistrement dynamique de client (RFC 7591).
//
// ⚠️ C'EST L'ENDPOINT PUBLIC LE PLUS EXPOSÉ DE TOUTE L'APP, et c'est là que FinanceAI s'est
// fait prendre. claude.ai s'enregistre LUI-MÊME : il n'y a pas de client pré-partagé, donc
// pas de secret pour filtrer l'appelant. N'importe qui peut poser une adresse de redirection.
// Tout tient donc à `jugerRedirectUri` — et sa version fautive (`startsWith`) laissait passer
// `http://127.0.0.1.evil.com/cb` et `http://127.0.0.1@evil.com/cb`, c'est-à-dire une prise
// de contrôle de compte par hameçonnage. Les deux chaînes sont dans `tests/mcpOauth.test.ts`.
//
// Ce qu'un enregistrement NE DONNE PAS : aucun accès. Il faut ensuite que Marc se connecte à
// Google et autorise. Un client enregistré par un inconnu reste une ligne inutile.

import { z } from "zod";
import { genererSecret, jugerRedirectUri } from "@/lib/mcp/oauth";
import { enregistrerClient } from "@/lib/oauthStore";

export const dynamic = "force-dynamic";

/** Le sous-ensemble de la RFC qu'on accepte. Le reste est ignoré, pas refusé. */
const DemandeSchema = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
});

function erreur(code: string, description: string, statut = 400): Response {
  return Response.json(
    { error: code, error_description: description },
    { status: statut, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(requete: Request): Promise<Response> {
  let brut: unknown;
  try {
    brut = await requete.json();
  } catch {
    return erreur("invalid_client_metadata", "Corps illisible : JSON attendu.");
  }

  const parse = DemandeSchema.safeParse(brut);
  if (!parse.success) {
    return erreur("invalid_client_metadata", "`redirect_uris` est obligatoire (1 à 10 adresses).");
  }

  // ⚠️ CHAQUE adresse est jugée, pas seulement la première. Un client qui en enregistre
  // trois n'a qu'à en glisser une mauvaise en deuxième position pour que le contrôle soit
  // inutile — et un `some` au lieu d'un `every` produit exactement ça.
  for (const uri of parse.data.redirect_uris) {
    const verdict = jugerRedirectUri(uri);
    if (!verdict.ok) {
      return erreur("invalid_redirect_uri", `Adresse refusée (${verdict.motif}) : ${uri}`);
    }
  }

  const id = genererSecret(16);
  await enregistrerClient(id, parse.data.client_name ?? "", parse.data.redirect_uris);

  return Response.json(
    {
      client_id: id,
      // Client PUBLIC : pas de secret. Un secret stocké dans une app tierce n'en est pas un,
      // et OAuth 2.1 s'appuie sur PKCE plutôt que sur lui pour les clients de ce genre.
      token_endpoint_auth_method: "none",
      redirect_uris: parse.data.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
