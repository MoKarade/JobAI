// app/.well-known/oauth-authorization-server/route.ts — RFC 8414.
//
// claude.ai lit ce document AVANT de tenter quoi que ce soit. Sans lui, il refuse de se
// connecter, et l'erreur affichée ne dit pas laquelle des pièces manque — donc on ne peut
// pas déboguer par tâtonnement. Publique par nécessité : le client n'a encore aucun jeton.

import { metadonneesAutorisation } from "@/lib/mcp/oauth";
import { origineDe } from "@/lib/mcp/origine";

export const dynamic = "force-dynamic";

export function GET(requete: Request): Response {
  return Response.json(metadonneesAutorisation(origineDe(requete)), {
    headers: { "Cache-Control": "no-store" },
  });
}
