// app/.well-known/oauth-protected-resource/[...chemin]/route.ts — la même métadonnée, sous
// la forme SUFFIXÉE PAR LE CHEMIN de la ressource.
//
// POURQUOI CE DOUBLON APPARENT
// La RFC 9728 laisse deux façons de trouver ce document. Un client bien élevé suit
// l'en-tête `WWW-Authenticate` que rend `/api/mcp` — et le nôtre le rend, vérifié en
// production. Mais plusieurs clients MCP vont AUSSI le chercher directement à
// `/.well-known/oauth-protected-resource/api/mcp`, en collant le chemin de la ressource
// derrière. S'ils ne le trouvent pas, ils abandonnent la connexion en disant seulement
// « impossible de se connecter ».
//
// ⚠️ C'EST DE L'ASSURANCE, PAS DE LA COMPLAISANCE. Le coût est nul (le même document, rendu
// par la même fonction) et il ferme toute une classe de panne qu'on ne pourrait diagnostiquer
// que par tâtonnement — c'est-à-dire mal, parce que le message d'erreur côté client ne dit
// jamais quelle adresse a été essayée.

import { metadonneesRessource } from "@/lib/mcp/oauth";
import { origineDe } from "@/lib/mcp/origine";

export const dynamic = "force-dynamic";

export function GET(requete: Request): Response {
  return Response.json(metadonneesRessource(origineDe(requete)), {
    headers: { "Cache-Control": "no-store" },
  });
}
