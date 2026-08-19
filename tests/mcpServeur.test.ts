// tests/mcpServeur.test.ts — le serveur MCP, éprouvé par un VRAI client.
//
// POURQUOI UN CLIENT PLUTÔT QUE D'APPELER LES HANDLERS
// Appeler un handler directement contourne tout ce que le SDK fait autour : la validation
// des schémas, la forme des réponses, la liste des outils. C'est exactement le piège déjà
// consigné pour FinanceAI — « un test qui appelle le HANDLER directement BYPASS la
// validation Zod du SDK ». Ici le client parle au serveur par un transport, donc ce qui est
// éprouvé est ce que claude.ai verra.
//
// Aucune base, aucun réseau : les entrées/sorties sont injectées. C'est ce qui rend ce test
// possible, et c'est aussi la condition n°2 de l'ADR-0011 — le serveur ne PEUT pas atteindre
// la base tout seul.

import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { creerServeur, type EntreesSorties } from "../lib/mcp/serveur";
import type { Offre } from "../lib/types";

const BASE: Offre = {
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

const offre = (p: Partial<Offre> = {}): Offre => ({ ...BASE, ...p });

/** Un client branché sur un serveur, avec les écritures observées. */
async function brancher(io: Partial<EntreesSorties> = {}) {
  const enregistrees: Offre[] = [];
  const serveur = creerServeur({
    lireOffres: async () => [offre()],
    enregistrer: async (o) => {
      enregistrees.push(o);
    },
    aujourdhui: () => "2026-08-19",
    ...io,
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([serveur.connect(b), client.connect(a)]);
  return { client, enregistrees };
}

/**
 * Le JSON d'une réponse d'outil.
 *
 * Typée `unknown` en entrée : le résultat d'un appel est une UNION côté SDK (une variante
 * porte `content`, une autre `toolResult`), et la contraindre trop tôt casse le typage sans
 * rien protéger — c'est le test qui sait ce qu'il vient de demander.
 */
function corps(resultat: unknown): Record<string, unknown> {
  const c = (resultat as { content?: { type: string; text: string }[] }).content;
  return JSON.parse(c?.[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("la surface exposée à claude.ai", () => {
  it("publie exactement les outils prévus, et rien de plus", async () => {
    // La liste des outils EST le contrat public : un outil ajouté sans décision devient
    // appelable par un modèle. On la capture plutôt que de la supposer.
    const { client } = await brancher();
    const noms = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(noms).toEqual(["chercher_offres", "lire_offre", "modifier_suivi", "resume_suivi"]);
  });

  it("annonce quels outils LISENT et lequel ÉCRIT", async () => {
    // `readOnlyHint` est ce qui permet à un client de traiter différemment une lecture et
    // une écriture. Le déclarer faux par omission ferait passer une écriture pour anodine.
    const { client } = await brancher();
    const outils = (await client.listTools()).tools;
    const parNom = new Map(outils.map((t) => [t.name, t.annotations?.readOnlyHint]));
    expect(parNom.get("chercher_offres")).toBe(true);
    expect(parNom.get("resume_suivi")).toBe(true);
    expect(parNom.get("modifier_suivi")).toBe(false);
  });
});

describe("une base muette ne se déguise JAMAIS en suivi vide", () => {
  it("rend une ERREUR, pas une liste vide", async () => {
    // « Tu n'as aucune offre » et « je n'ai pas pu regarder » sont deux phrases opposées.
    // Les confondre est la panne qui a laissé la veille muette trois jours durant.
    const { client } = await brancher({ lireOffres: async () => null });
    const r = await client.callTool({ name: "chercher_offres", arguments: {} });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("pas pu regarder");
  });

  it("vaut pour TOUS les outils, pas seulement la recherche", async () => {
    const { client } = await brancher({ lireOffres: async () => null });
    for (const name of ["resume_suivi", "lire_offre", "modifier_suivi"]) {
      const args = name === "chercher_offres" ? {} : { id: "x", patch: { priorite: "Haute" } };
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError, name).toBe(true);
    }
  });
});

describe("les lectures", () => {
  it("rend les offres et dit si la liste est tronquée", async () => {
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "chercher_offres", arguments: {} }));
    expect(r.correspondances).toBe(1);
    expect(r.tronque).toBe(false);
  });

  it("distingue « introuvable » d'une panne", async () => {
    // L'un se corrige en changeant d'identifiant, l'autre en attendant la base.
    const { client } = await brancher();
    const r = await client.callTool({ name: "lire_offre", arguments: { id: "inconnue" } });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("identifiant");
  });

  it("rend les statuts à zéro dans le résumé", async () => {
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "resume_suivi", arguments: {} }));
    expect((r.parStatut as Record<string, number>)["Entrevue"]).toBe(0);
  });
});

describe("l'écriture — l'exception de l'ADR-0011, vue du protocole", () => {
  it("persiste et rend l'AVANT/APRÈS", async () => {
    const { client, enregistrees } = await brancher();
    const r = corps(
      await client.callTool({
        name: "modifier_suivi",
        arguments: { id: BASE.id, patch: { statut: "CVenvoye" } },
      }),
    );
    expect(enregistrees).toHaveLength(1);
    expect(enregistrees[0]?.statut).toBe("CVenvoye");
    // La date d'envoi vient du jour INJECTÉ, pas d'une horloge lue dans le module.
    expect(enregistrees[0]?.dateEnvoi).toBe("2026-08-19");
    expect(r.changements).toContainEqual({ champ: "statut", avant: "Identifiee", apres: "CVenvoye" });
    expect(r.dateEnvoiPosee).toBe(true);
  });

  it("N'ÉCRIT PAS quand rien ne change", async () => {
    // Une écriture inutile fait bouger `majLe` et ment sur la fraîcheur de la ligne.
    const { client, enregistrees } = await brancher();
    const r = corps(
      await client.callTool({
        name: "modifier_suivi",
        arguments: { id: BASE.id, patch: { priorite: "Moyenne" } },
      }),
    );
    expect(enregistrees).toHaveLength(0);
    expect(r.changements).toEqual([]);
  });

  it("REFUSE une offre périmée, et n'écrit rien", async () => {
    const { client, enregistrees } = await brancher({
      lireOffres: async () => [offre({ perimeeLe: "2026-08-10T00:00:00.000Z" })],
    });
    const r = await client.callTool({
      name: "modifier_suivi",
      arguments: { id: BASE.id, patch: { statut: "CVenvoye" } },
    });
    expect(r.isError).toBe(true);
    expect(enregistrees).toHaveLength(0);
  });

  it("LAISSE TOMBER un champ hors du domaine de Marc, sans écrire de faux", async () => {
    // ⚠️ MESURÉ, ET CE N'EST PAS CE QUE JE CROYAIS. Zod STRIPPE les clés inconnues par
    // défaut, il ne lève pas : `{ score: 100 }` devient `{}`, donc le refus qu'on observe
    // est « patch vide » et non un rejet. Mon premier test portait un nom qui mentait sur
    // le mécanisme — il passait, et il aurait continué de passer si le stripping avait
    // disparu. On éprouve donc le cas qui COMPTE vraiment : une demande MIXTE.
    const { client, enregistrees } = await brancher();
    const r = corps(
      await client.callTool({
        name: "modifier_suivi",
        arguments: { id: BASE.id, patch: { priorite: "Haute", score: 100, perimeeLe: null } },
      }),
    );
    // La priorité bouge, les calculs du moteur ne bougent pas — condition n°4 de l'ADR-0011.
    expect(enregistrees[0]?.priorite).toBe("Haute");
    expect(enregistrees[0]?.score).toBe(70);
    expect(enregistrees[0]?.perimeeLe).toBeNull();
    // Et l'avant/après ne parle QUE de ce qui a réellement changé : annoncer un champ non
    // modifié ferait croire à Marc qu'un calcul a bougé.
    expect(r.changements).toEqual([{ champ: "priorite", avant: "Moyenne", apres: "Haute" }]);
  });

  it("refuse une demande qui ne porte QUE des champs hors domaine", async () => {
    // Elle se vide au parse et tombe donc sur « aucun champ à modifier » — un refus dit,
    // jamais un succès silencieux qui laisserait croire que le score a été posé.
    const { client, enregistrees } = await brancher();
    const r = await client.callTool({
      name: "modifier_suivi",
      arguments: { id: BASE.id, patch: { score: 100 } },
    });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("Aucun champ");
    expect(enregistrees).toHaveLength(0);
  });

  it("REJETTE un statut inventé — la validation du SDK fait son travail", async () => {
    const { client, enregistrees } = await brancher();
    const r = await client.callTool({
      name: "modifier_suivi",
      arguments: { id: BASE.id, patch: { statut: "Embauche" } },
    });
    expect(r.isError).toBe(true);
    expect(enregistrees).toHaveLength(0);
  });
});
