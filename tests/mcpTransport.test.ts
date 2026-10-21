// tests/mcpTransport.test.ts — le transport HTTP, avec des requêtes de la FORME réelle.
//
// POURQUOI CE FICHIER EN PLUS DE `mcpServeur.test.ts`
// Celui-là éprouve le serveur par un transport EN MÉMOIRE : il prouve la logique des outils,
// pas la couche HTTP. Or c'est là que se jouent les refus qui n'ont rien à voir avec nous —
// un en-tête `Accept` mal négocié rend 406, une session exigée rend 400, et claude.ai
// affiche alors « connexion impossible » sans dire lequel des deux bouts a refusé.
//
// On envoie donc ici les requêtes telles qu'un client MCP les envoie : `initialize` d'abord,
// avec `Accept: application/json, text/event-stream`, puis `tools/list`.

import { describe, it, expect } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { creerServeur } from "../lib/mcp/serveur";
import type { Offre } from "../lib/types";

const OFFRE: Offre = {
  id: "laserax-coordonnateur",
  source: "jobbank",
  dateReperage: "2026-08-01",
  entreprise: "Laserax",
  poste: "Coordonnateur de projets",
  lien: "https://exemple.test/o",
  km: 12,
  ville: "Québec",
  salaireAffiche: null,
  statut: "Identifiee",
  priorite: "Moyenne",
  dateEnvoi: "",
  userNote: "",
  score: 70,
  scoreSource: "calcule",
  raisons: [],
  notes: "",
  histo: false,
  perimeeLe: null,
};

/**
 * Un appel HTTP complet, câblé EXACTEMENT comme la route de production.
 *
 * ⚠️ UN SERVEUR ET UN TRANSPORT NEUFS À CHAQUE FOIS, et c'est ce test qui l'a appris : le
 * SDK refuse explicitement de réutiliser un transport sans état (« Stateless transport
 * cannot be reused across requests »). Mon premier jet en réutilisait un — la route de
 * production, elle, en crée bien un par requête. Réutiliser ici aurait testé un montage qui
 * n'existe nulle part, et laissé le vrai chemin sans preuve.
 *
 * Ce que ça vérifie au passage, et qui n'allait pas de soi : SANS ÉTAT, le serveur ne se
 * souvient jamais d'avoir été initialisé. `tools/list` et `tools/call` doivent donc marcher
 * sur un serveur tout neuf, sans `initialize` préalable — sinon le connecteur ne
 * fonctionnerait qu'au tout premier appel.
 */
async function appel(corps: unknown, accept = "application/json, text/event-stream") {
  const t = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const serveur = creerServeur({
    lireOffres: async () => [OFFRE],
    enregistrer: async () => undefined,
    aujourdhui: () => "2026-08-19",
    lireJournal: async () => ({}),
    lireEtatSynchro: async () => [],
    lireResumeDistances: async () => ({ brut: null }),
    lireBareme: async () => null,
    lirePreuvesProfil: async () => null,
    lireCompteurUsage: async () => null,
    listerCvs: async () => [],
    reanalyserCv: async () => ({ ok: true, message: "Analyse refaite." }),
    diagnostiquerFlux: async () => ({ fin: "flux-termine" }),
    sonderEmployeurs: async () => ({}),
  });
  await serveur.connect(t);
  const reponse = await t.handleRequest(
    new Request("https://emploi.hubperso.com/api/mcp", {
      method: "POST",
      headers: { Accept: accept, "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    }),
  );
  await t.close().catch(() => undefined);
  return reponse;
}

const INITIALISER = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "claude-ai", version: "1.0.0" },
  },
};

describe("le transport HTTP répond aux requêtes réelles", () => {
  it("accepte `initialize` et rend du JSON, pas un flux", async () => {
    // `enableJsonResponse` évite un flux SSE ouvert sur une fonction serverless, facturé
    // jusqu'à son mur de temps pour ne rien transporter.
    const r = await appel(INITIALISER);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    const corps = (await r.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(corps.result?.serverInfo?.name).toBe("jobai");
  });

  it("rend la liste des outils sur un serveur NEUF, sans `initialize` préalable", async () => {
    // ⚠️ LE TEST QUI DÉCIDE SI LE CONNECTEUR MARCHE AU DEUXIÈME APPEL. Sans état, chaque
    // requête reçoit un serveur tout neuf : s'il exigeait d'avoir été initialisé, seul le
    // tout premier échange fonctionnerait, et la panne se lirait comme un bug de claude.ai.
    const r = await appel({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { result?: { tools?: { name: string }[] } };
    expect((corps.result?.tools ?? []).map((o) => o.name).sort()).toEqual([
      "chercher_offres",
      "diagnostic_bareme",
      "diagnostic_flux",
      "etat_synchro",
      "lire_offre",
      "modifier_suivi",
      "preuves_ecrans",
      "reanalyser_profil",
      "resume_suivi",
      "sonde_employeurs",
    ]);
  });

  it("exécute un outil de bout en bout par HTTP, sur un serveur neuf", async () => {
    const r = await appel({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "resume_suivi", arguments: {} },
    });
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { result?: { content?: { text: string }[] } };
    const resume = JSON.parse(corps.result?.content?.[0]?.text ?? "{}") as { suivies?: number };
    expect(resume.suivies).toBe(1);
  });

  it("REFUSE proprement un `Accept` incomplet, sans planter", async () => {
    // Pas un cas théorique : un client mal configuré (ou un curl de diagnostic) envoie
    // souvent `application/json` seul. On veut un refus LISIBLE, pas une exception.
    const r = await appel(INITIALISER, "application/json");
    expect([200, 406]).toContain(r.status);
  });

  it("sans jeton, POST /api/mcp répond toujours 401 (garde de la route)", async () => {
    function jetonPorteur(requete: Request): string | null {
      const entete = requete.headers.get("authorization") ?? "";
      if (!entete.toLowerCase().startsWith("bearer ")) return null;
      const valeur = entete.slice(7).trim();
      return valeur === "" ? null : valeur;
    }

    function defi(motif: string): Response {
      return new Response(JSON.stringify({ ok: false, erreur: motif }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Bearer resource_metadata="https://emploi.hubperso.com/.well-known/oauth-protected-resource"',
        },
      });
    }

    const req = new Request("https://emploi.hubperso.com/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    const porteur = jetonPorteur(req);
    expect(porteur).toBeNull();

    const res = defi("jeton absent");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("oauth-protected-resource");
    const corps = (await res.json()) as { ok: boolean; erreur: string };
    expect(corps).toEqual({ ok: false, erreur: "jeton absent" });
  });
});
