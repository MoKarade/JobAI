// app/api/hub/summary/route.ts
//
// Endpoint consommé par le hub perso (hubperso.com), contrat @mokarade/hub-contract v1.
// Le hub appelle GET /api/hub/summary avec le header x-hub-token ; 401 sinon (échec fermé),
// réponse toujours en Cache-Control: no-store (un summary est un instantané).
//
// CONTRAT D'ÉCHEC (ADR-0001, figé une fois pour toutes) :
//   HUB_TOKEN absent côté serveur  → 503 « intégration hub non configurée »
//     (l'app fonctionne ; c'est l'intégration qui n'est pas branchée, pas une panne serveur)
//   x-hub-token absent ou invalide → 401
//   méthode ≠ GET                  → 405 (aucun autre verbe n'est exporté)
//   panne en lisant l'état         → 200 + status "error", jamais un 500 muet : le hub sait
//     alors afficher un widget honnête plutôt qu'un « injoignable » qui accuse le réseau.
//
// ⚠️ Cette route DOIT rester HORS du middleware d'authentification utilisateur : elle porte
// sa propre auth par jeton. L'ajouter au matcher renverrait au hub une redirection HTML vers
// la page de connexion au lieu du JSON attendu — le widget afficherait « injoignable » en
// permanence. C'était le défaut n°1 du squelette du 27/07.

import {
  HUB_TOKEN_HEADER,
  buildingSummary,
  type HubSummary,
} from "@mokarade/hub-contract";
import { hubTokenValid } from "@/lib/hubToken";
import { APP, construireSummary } from "@/lib/hubSummary";
import { getTrackerState } from "@/lib/trackerState";

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Jamais de cache statique : le hub veut l'état courant à chaque appel.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.HUB_TOKEN ?? "";
  if (!expected) {
    return Response.json(
      { error: "Intégration hub non configurée (HUB_TOKEN absent)." },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!hubTokenValid(request.headers.get(HUB_TOKEN_HEADER), expected)) {
    return Response.json(
      { error: `Header ${HUB_TOKEN_HEADER} absent ou invalide.` },
      { status: 401, headers: NO_STORE },
    );
  }

  let summary: HubSummary;
  try {
    const etat = await getTrackerState();
    summary = etat
      ? construireSummary(etat, new Date().toISOString())
      : // null = moteur pas encore branché. Honnête, et distinct d'une panne.
        buildingSummary(APP, {
          alertLabel: "Suivi pas encore en ligne — aucune donnée à publier.",
        });
  } catch (err) {
    // Une panne réelle se DIT. On répond 200 avec un statut d'erreur : le hub affiche
    // alors un widget explicite, là où un 500 se confondrait avec une app injoignable.
    console.error("[hub/summary] lecture de l'état impossible", err);
    summary = {
      ...buildingSummary(APP),
      status: "error",
      alerts: [{ label: "État du suivi illisible — voir les journaux.", severity: "alert" }],
    };
  }

  return Response.json(summary, { headers: NO_STORE });
}
