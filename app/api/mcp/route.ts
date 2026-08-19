// app/api/mcp/route.ts — le point d'entrée du connecteur MCP.
//
// ⚠️ GARDÉE AUTREMENT, PAS OUVERTE. Comme l'endpoint du hub et le point de dépôt : la garde
// de session lui renverrait une redirection HTML au lieu du JSON attendu, et un client MCP
// n'a pas de session Google. Elle porte donc sa propre authentification, en ÉCHEC FERMÉ —
// secret absent : 503 ; jeton faux : 401 ; comparaison en temps constant.
//
// ⚠️ CE JETON EST UNE ÉTAPE, PAS LA DESTINATION. claude.ai n'accepte QUE OAuth 2.0/2.1 pour
// un connecteur personnalisé (mesuré sur FinanceAI) : ce `MCP_TOKEN` rend le connecteur
// utilisable et testable dès maintenant depuis un client qui accepte un en-tête, et le lot 3
// (ADR-0011) le remplace par un vrai serveur d'autorisation. Le laisser en place APRÈS
// serait un second chemin d'entrée sur la même surface d'écriture : il se retire dans le
// même commit que l'arrivée d'OAuth.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { offers } from "@/lib/db/schema";
import { lireOffres } from "@/lib/donnees";
import { creerServeur } from "@/lib/mcp/serveur";
import { hubTokenValid } from "@/lib/hubToken";
import { aujourdhui } from "@/lib/ajout";
import { CHAMPS_UTILISATEUR, type Offre } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function refus(statut: number, erreur: string): Response {
  return new Response(JSON.stringify({ ok: false, erreur }), {
    status: statut,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Écrit UNIQUEMENT les champs qui appartiennent à Marc.
 *
 * ⚠️ PAS TOUTE LA LIGNE, ET C'EST LA CONDITION N°2 DE L'ADR-0011. `preparerEcriture` a déjà
 * fait passer la demande par `appliquerModification`, donc seuls ces champs ont pu bouger —
 * mais écrire la ligne entière donnerait quand même à ce chemin le POUVOIR d'écraser un
 * score ou une péremption le jour où quelqu'un modifierait la règle en amont. On écrit ce
 * qu'on a le droit d'écrire, pas ce qui se trouve dans l'objet.
 */
async function enregistrer(offre: Offre): Promise<void> {
  const champs = Object.fromEntries(CHAMPS_UTILISATEUR.map((c) => [c, offre[c]]));
  await db
    .update(offers)
    .set({ ...champs, majLe: new Date() })
    .where(eq(offers.id, offre.id));
}

export async function POST(requete: Request): Promise<Response> {
  const attendu = process.env.MCP_TOKEN ?? "";
  // Échec fermé : sans secret configuré, le connecteur n'existe pas. Une variable peut
  // disparaître d'un déploiement à l'autre ; ce jour-là on se tait, on ne s'ouvre pas.
  if (attendu === "") return refus(503, "connecteur désactivé");

  const entete = requete.headers.get("authorization") ?? "";
  const porteur = entete.toLowerCase().startsWith("bearer ") ? entete.slice(7).trim() : null;
  if (!hubTokenValid(porteur, attendu)) return refus(401, "non autorisé");

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Sans état : chaque requête est autonome. Une fonction serverless ne garde rien entre
    // deux invocations, et un identifiant de session y survivrait le temps d'une instance —
    // donc parfois, ce qui est pire qu'un « jamais » assumé.
    sessionIdGenerator: undefined,
    // Réponses JSON plutôt qu'un flux SSE : un flux ouvert sur une fonction serverless est
    // facturé jusqu'à son mur de temps et se ferme sans prévenir.
    enableJsonResponse: true,
  });

  const serveur = creerServeur({
    lireOffres,
    enregistrer,
    // ⚠️ Le fuseau de Marc, jamais UTC : Vercel tourne en UTC et Marc vit à UTC−4, donc un
    // CV marqué envoyé après 20 h locale daterait du lendemain.
    aujourdhui: () => aujourdhui(new Date()),
  });

  await serveur.connect(transport);
  try {
    return await transport.handleRequest(requete);
  } finally {
    // Rien ne survit à la requête : sans cette fermeture, chaque invocation laisserait un
    // serveur et son transport attachés l'un à l'autre dans l'instance recyclée.
    await transport.close().catch(() => undefined);
  }
}

/**
 * Le protocole permet à un client d'ouvrir un flux d'événements par `GET`.
 *
 * On ne le sert pas : sans état, il n'y a rien à y pousser, et un flux ouvert sur une
 * fonction serverless coûte son mur de temps pour ne rien transporter. Un 405 explicite vaut
 * mieux qu'une connexion qui pend jusqu'au délai.
 */
export function GET(): Response {
  return refus(405, "flux d'événements non servi : ce connecteur est sans état");
}
