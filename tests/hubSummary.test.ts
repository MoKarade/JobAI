// tests/hubSummary.test.ts — le Route Handler /api/hub/summary : auth (échec fermé) et
// payload validé par le VRAI schéma du contrat (jamais par une copie locale).

import { describe, it, expect } from "vitest";
import {
  CONTRACT_VERSION,
  HUB_TOKEN_HEADER,
  validateSummary,
} from "@mokarade/hub-contract";
import { hubTokenValid } from "../lib/hubToken";
import { GET } from "../app/api/hub/summary/route";

const JETON = "jeton-de-test-jobai-0123456789abcdef";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://emploi.hubperso.com/api/hub/summary", { headers });
}

function withHubToken(value: string | undefined, fn: () => void | Promise<void>) {
  const before = process.env.HUB_TOKEN;
  if (value === undefined) delete process.env.HUB_TOKEN;
  else process.env.HUB_TOKEN = value;
  try {
    return fn();
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
});

describe("GET /api/hub/summary", () => {
  // ADR-0001 : 503 et non 500 — l'app fonctionne, c'est l'intégration qui n'est pas branchée.
  it("503 si HUB_TOKEN non configuré, sans fuite de summary", async () => {
    await withHubToken(undefined, async () => {
      const res = GET(req({ [HUB_TOKEN_HEADER]: JETON }));
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("contractVersion");
    });
  });

  it("401 sans jeton et avec un jeton invalide", async () => {
    await withHubToken(JETON, async () => {
      expect(GET(req()).status).toBe(401);
      expect(GET(req({ [HUB_TOKEN_HEADER]: "mauvais" })).status).toBe(401);
    });
  });

  it("200 : building summary conforme au contrat + no-store", async () => {
    await withHubToken(JETON, async () => {
      const res = GET(req({ [HUB_TOKEN_HEADER]: JETON }));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");

      const summary = validateSummary(await res.json());
      expect(summary.contractVersion).toBe(CONTRACT_VERSION);
      expect(summary.status).toBe("building");
      expect(summary.metrics).toEqual([]);
      expect(summary.actions).toEqual([]);
      expect(summary.alerts).toHaveLength(1);
    });
  });

  // L'`id` publié est la clé de rapprochement avec `Hubperso/lib/sources.ts`.
  // Le changer sans changer l'entrée du hub casse le widget en silence.
  it("publie l'identité JobAI attendue par le hub", async () => {
    await withHubToken(JETON, async () => {
      const summary = validateSummary(
        await GET(req({ [HUB_TOKEN_HEADER]: JETON })).json(),
      );
      expect(summary.app.id).toBe("jobai");
      expect(summary.app.name).toBe("JobAI");
      expect(summary.app.url).toBe("https://emploi.hubperso.com");
      expect(summary.app.color).toBe("#f2a31b");
    });
  });
});
