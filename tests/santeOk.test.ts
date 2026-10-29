// tests/santeOk.test.ts — GET /api/sante, branche « la base répond » (JobAI#324).
//
// tests/sante.test.ts n'atteint que la réponse 503 (pas de base réelle). Ici la base est simulée pour
// vérifier que le commit servi figure AUSSI dans la réponse 200 : c'est elle que la vigie lit en temps normal.

import { afterEach, describe, expect, it, vi } from "vitest";

let baseRepond = true;

vi.mock("../lib/db", () => ({
  baseConfiguree: () => true,
  db: {
    execute: vi.fn(async () => {
      if (!baseRepond) throw new Error("402 quota dépassé");
      return [];
    }),
  },
}));
vi.mock("../lib/migrations", () => ({ assurerMigrations: vi.fn(async () => {}) }));

const { GET } = await import("../app/api/sante/route");

afterEach(() => {
  baseRepond = true;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  vi.restoreAllMocks();
});

describe("GET /api/sante avec une base configurée", () => {
  it("200 { ok: true, commit } quand la base répond", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "fedcba9876543210fedcba9876543210fedcba98";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, commit: "fedcba9" });
  });

  it("200 { ok: true } sans le champ quand la variable est absente", async () => {
    const corps = await (await GET()).json();
    expect(corps).toEqual({ ok: true });
    expect(corps).not.toHaveProperty("commit");
  });

  it("503 { ok: false, cause: base, commit } quand la base est injoignable, sans message d'erreur brut", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    baseRepond = false;
    process.env.VERCEL_GIT_COMMIT_SHA = "fedcba9876543210";
    const res = await GET();
    expect(res.status).toBe(503);
    const texte = await res.text();
    expect(JSON.parse(texte)).toEqual({ ok: false, cause: "base", commit: "fedcba9" });
    expect(texte).not.toMatch(/402|quota/i);
  });
});
