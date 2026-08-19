// app/.well-known/oauth-protected-resource/route.ts — RFC 9728.
//
// Dit quelle ressource est protégée et QUI délivre les jetons pour elle. C'est le document
// que le client va chercher quand `/api/mcp` lui répond 401 avec un en-tête
// `WWW-Authenticate` : sans lui, un 401 est un mur, avec lui c'est une invitation à se
// connecter. Publique par nécessité, comme les métadonnées du serveur d'autorisation.

import { metadonneesRessource } from "@/lib/mcp/oauth";
import { origineDe } from "@/lib/mcp/origine";

export const dynamic = "force-dynamic";

export function GET(requete: Request): Response {
  return Response.json(metadonneesRessource(origineDe(requete)), {
    headers: { "Cache-Control": "no-store" },
  });
}
