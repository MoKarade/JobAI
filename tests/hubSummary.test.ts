// tests/hubSummary.test.ts — l'endpoint du hub et la construction du summary.
//
// Le payload est validé par le VRAI schéma du contrat (`validateSummary`), jamais par une
// copie locale : si le contrat évolue et que JobAI ne suit pas, ces tests doivent tomber.

import { describe, it, expect } from "vitest";
import {
  CONTRACT_VERSION,
  HUB_TOKEN_HEADER,
  validateSummary,
} from "@mokarade/hub-contract";
import { GET } from "../app/api/hub/summary/route";
import { APP, construireSummary } from "../lib/hubSummary";
import { resumer } from "../lib/suivi";
import { SEED } from "../lib/seed";
import type { ResumeSuivi } from "../lib/types";

const JETON = "jeton-de-test-jobai-0123456789abcdef";
const LE = "2026-07-28T12:00:00.000Z";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://emploi.hubperso.com/api/hub/summary", { headers });
}

async function withHubToken(value: string | undefined, fn: () => Promise<void>) {
  const before = process.env.HUB_TOKEN;
  if (value === undefined) delete process.env.HUB_TOKEN;
  else process.env.HUB_TOKEN = value;
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env.HUB_TOKEN;
    else process.env.HUB_TOKEN = before;
  }
}

describe("GET /api/hub/summary", () => {
  // ADR-0001 : 503 et non 500 — l'app fonctionne, c'est l'intégration qui n'est pas branchée.
  it("503 si HUB_TOKEN non configuré, sans fuite de summary", async () => {
    await withHubToken(undefined, async () => {
      const res = await GET(req({ [HUB_TOKEN_HEADER]: JETON }));
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("contractVersion");
    });
  });

  it("401 sans jeton et avec un jeton invalide", async () => {
    await withHubToken(JETON, async () => {
      expect((await GET(req())).status).toBe(401);
      expect((await GET(req({ [HUB_TOKEN_HEADER]: "mauvais" }))).status).toBe(401);
    });
  });

  it("200 « en construction » tant qu'aucune donnée réelle n'existe", async () => {
    // Sans DATABASE_URL, `getTrackerState` rend null : c'est « pas branché », pas une panne
    // et surtout pas des compteurs à zéro.
    await withHubToken(JETON, async () => {
      const res = await GET(req({ [HUB_TOKEN_HEADER]: JETON }));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");

      const summary = validateSummary(await res.json());
      expect(summary.contractVersion).toBe(CONTRACT_VERSION);
      expect(summary.status).toBe("building");
      expect(summary.metrics).toEqual([]);
    });
  });

  it("publie l'identité JobAI attendue par le hub", async () => {
    // L'`id` est la clé de rapprochement avec `Hubperso/lib/sources.ts` : le changer sans
    // changer l'entrée du hub casse le widget en silence.
    await withHubToken(JETON, async () => {
      const summary = validateSummary(await (await GET(req({ [HUB_TOKEN_HEADER]: JETON }))).json());
      expect(summary.app).toEqual(APP);
      expect(summary.app.id).toBe("jobai");
      expect(summary.app.color).toBe("#f2a31b");
    });
  });
});

describe("construction du summary", () => {
  const resume = resumer(SEED, "2026-08-14");

  it("produit un payload conforme au vrai schéma du contrat", () => {
    expect(() => validateSummary(construireSummary(resume, LE))).not.toThrow();
  });

  it("met la meilleure offre en position 0 — le gros chiffre du widget", () => {
    const s = construireSummary(resume, LE);
    expect(s.metrics[0]?.value).toBe(92);
    expect(s.metrics[0]?.label).toContain("IEL");
  });

  it("respecte les bornes du contrat : 6 métriques au plus, libellés courts", () => {
    const s = construireSummary(resume, LE);
    expect(s.metrics.length).toBeLessThanOrEqual(6);
    for (const m of s.metrics) {
      expect(m.label.length, `libellé « ${m.label} »`).toBeLessThanOrEqual(40);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("tronque un nom d'entreprise trop long au lieu d'être rejeté par le contrat", () => {
    const long: ResumeSuivi = {
      ...resume,
      meilleure: {
        entreprise: "Entreprise au nom démesurément long qui dépasse la borne du contrat",
        poste: "Poste",
        score: 88,
      },
    };
    const s = construireSummary(long, LE);
    expect(s.metrics[0]!.label.length).toBeLessThanOrEqual(40);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("propose une action pour ouvrir l'app", () => {
    const s = construireSummary(resume, LE);
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0]?.kind).toBe("link");
    expect(s.actions[0]?.href).toBe(APP.url);
  });

  it("n'invente aucune métrique quand le suivi est vide", () => {
    const vide = resumer([], "2026-08-14");
    const s = construireSummary(vide, LE);
    // Pas de meilleure offre : la position 0 ne doit pas être occupée par un faux héros.
    // C'est « Nouvelles » qui prend la tête — un compteur à zéro y est une information
    // VRAIE (« rien n'est arrivé »), pas une métrique inventée.
    expect(s.metrics[0]?.label).toBe("Nouvelles (7 j)");
    expect(s.metrics[0]?.value).toBe(0);
    // ⚠️ Et la moyenne, elle, est ABSENTE : sans nouvelle à moyenner, publier un 0
    // annoncerait des offres nulles là où il n'y a pas d'offre (garde-fou n°3).
    expect(s.metrics.some((m) => m.label === "Note moyenne des nouvelles")).toBe(false);
    expect(s.alerts.some((a) => a.severity === "info")).toBe(true);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("reporte fidèlement les compteurs du résumé", () => {
    const s = construireSummary(resume, LE);
    const parLibelle = Object.fromEntries(s.metrics.map((m) => [m.label, m.value]));
    expect(parLibelle["Offres suivies"]).toBe(resume.actives);
    expect(parLibelle["Nouvelles (7 j)"]).toBe(resume.nouvelles);
    // Les deux compteurs de candidature tiennent dans UN créneau — le contrat en plafonne
    // six, et l'arbitrage est écrit dans `hubSummary.ts`. Les deux chiffres restent lisibles.
    expect(parLibelle["CV envoyés · réponses"]).toBe(
      `${resume.cvEnvoyes} · ${resume.reponses}`,
    );
  });

  /**
   * Le strict minimum que `resumer` lit — pas une `Offre` complète.
   *
   * Une fixture qui porte plus que ce que la fonction consulte finit par faire croire que
   * les champs en trop comptent : ici, la forme EST la documentation de ce qui est lu.
   */
  function pourResume(champs: { dateReperage: string; score: number | null }) {
    return {
      histo: false,
      statut: "Identifiee" as const,
      entreprise: "Entreprise",
      poste: "Poste",
      perimeeLe: null,
      ...champs,
    };
  }

  it("publie la note moyenne des nouvelles, et jamais plus de six métriques", () => {
    const avecNouvelles = resumer(
      [
        pourResume({ dateReperage: "2026-08-14", score: 82 }),
        pourResume({ dateReperage: "2026-08-14", score: 60 }),
      ],
      "2026-08-14",
    );
    const s = construireSummary(avecNouvelles, LE);
    const parLibelle = Object.fromEntries(s.metrics.map((m) => [m.label, m.value]));
    expect(parLibelle["Nouvelles (7 j)"]).toBe(2);
    expect(parLibelle["Note moyenne des nouvelles"]).toBe(71);
    // Le plafond du contrat est une contrainte DURE : le dépasser ferait échouer la
    // validation chez le hub, c'est-à-dire un widget cassé plutôt qu'une métrique en trop.
    expect(s.metrics.length).toBeLessThanOrEqual(6);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("horodate avec la date fournie, sans lire l'horloge", () => {
    expect(construireSummary(resume, LE).generatedAt).toBe(LE);
  });
});
