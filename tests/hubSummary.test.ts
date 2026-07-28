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
import { hubTokenValid } from "../lib/hubToken";
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

describe("hubTokenValid", () => {
  it("accepte le bon jeton, refuse le reste", () => {
    expect(hubTokenValid(JETON, JETON)).toBe(true);
    expect(hubTokenValid("autre", JETON)).toBe(false);
    expect(hubTokenValid(null, JETON)).toBe(false);
    expect(hubTokenValid("", JETON)).toBe(false);
  });

  it("tolère les espaces de bord, des DEUX côtés", () => {
    // Le hub applique déjà `.trim()` à son jeton. Sans le même traitement ici, un espace
    // ou un retour à la ligne collé par erreur dans une variable d'environnement donne un
    // 401 permanent entre deux valeurs qui paraissent identiques à l'écran.
    expect(hubTokenValid(` ${JETON}`, JETON)).toBe(true);
    expect(hubTokenValid(`${JETON}\n`, JETON)).toBe(true);
    expect(hubTokenValid(JETON, ` ${JETON} `)).toBe(true);
    expect(hubTokenValid(`  ${JETON}  `, `\n${JETON}\n`)).toBe(true);
  });

  it("ne relâche rien d'autre : le jeton est comparé en entier", () => {
    expect(hubTokenValid(JETON.slice(0, -1), JETON)).toBe(false);
    expect(hubTokenValid(`${JETON}x`, JETON)).toBe(false);
    // La casse compte : un jeton base64url n'est pas insensible à la casse.
    expect(hubTokenValid(JETON.toUpperCase(), JETON)).toBe(false);
    // Un espace INTERNE n'est pas un espace de bord.
    expect(hubTokenValid(JETON.replace("-", " "), JETON)).toBe(false);
  });

  it("échoue fermé quand le jeton attendu est vide ou composé d'espaces", () => {
    // Le cas dangereux : HUB_TOKEN non configuré. Deux chaînes vides ne doivent pas
    // « correspondre » et ouvrir l'endpoint.
    expect(hubTokenValid("", "")).toBe(false);
    expect(hubTokenValid("   ", "   ")).toBe(false);
    expect(hubTokenValid(JETON, "   ")).toBe(false);
  });
});

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
  const resume = resumer(SEED);

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
    const vide = resumer([]);
    const s = construireSummary(vide, LE);
    // Pas de meilleure offre : la position 0 ne doit pas être occupée par un faux héros.
    expect(s.metrics[0]?.label).toBe("Offres suivies");
    expect(s.metrics[0]?.value).toBe(0);
    expect(s.alerts.some((a) => a.severity === "info")).toBe(true);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("reporte fidèlement les compteurs du résumé", () => {
    const s = construireSummary(resume, LE);
    const parLibelle = Object.fromEntries(s.metrics.map((m) => [m.label, m.value]));
    expect(parLibelle["Offres suivies"]).toBe(resume.actives);
    expect(parLibelle["CV envoyés"]).toBe(resume.cvEnvoyes);
    expect(parLibelle["Réponses"]).toBe(resume.reponses);
  });

  it("horodate avec la date fournie, sans lire l'horloge", () => {
    expect(construireSummary(resume, LE).generatedAt).toBe(LE);
  });
});
