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
//
// ⚠️ Cette route DOIT rester HORS du middleware d'authentification utilisateur : elle porte
// sa propre auth par jeton. L'ajouter au matcher renverrait au hub une redirection HTML vers
// la page de connexion au lieu du JSON attendu — le widget afficherait « injoignable » en
// permanence. C'était le défaut n°1 du squelette du 27/07.
//
// HONNÊTETÉ (no-fake-data) : tant que la base ne contient aucune donnée réelle, on renvoie un
// summary « building » — zéro métrique inventée. Le point de bascule unique sera
// getTrackerState() : null = moteur pas encore branché, throw = panne réelle.

import {
  HUB_TOKEN_HEADER,
  buildingSummary,
  type HubSummary,
} from "@mokarade/hub-contract";
import { hubTokenValid } from "@/lib/hubToken";

/**
 * Identité publiée au hub. L'`id` doit rester IDENTIQUE à l'entrée correspondante de
 * `Hubperso/lib/sources.ts` — c'est la clé de rapprochement côté hub.
 * Couleur : l'ambre du tracker d'origine, distincte de FinanceAI (#0f766e),
 * DriveAI (#8ab4f8) et BatchChef (#c2410c).
 */
const APP: HubSummary["app"] = {
  id: "jobai",
  name: "JobAI",
  url: "https://emploi.hubperso.com",
  color: "#f2a31b",
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Jamais de cache statique : le hub veut l'état courant à chaque appel.
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
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

  // V1 : le suivi n'est pas encore en base. Voir BACKLOG [V1-03].
  const summary = buildingSummary(APP, {
    alertLabel: "App en construction — suivi pas encore en ligne.",
  });

  return Response.json(summary, { headers: NO_STORE });
}
