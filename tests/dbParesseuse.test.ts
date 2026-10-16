// tests/dbParesseuse.test.ts — la connexion Neon paresseuse (lib/db/index.ts).
//
// Le module est importé au build par Next : il ne doit rien exiger tant qu'aucune requête n'est
// émise, et l'erreur d'une base non configurée doit dire ce qu'elle est (pas « undefined is not
// a function » au milieu d'un build). Les tests du schéma passent par PGlite, jamais par ce
// module — c'est donc ici, et seulement ici, que sa paresse est exercée.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseConfiguree } from "../lib/db/index";

// URL de forme valide, sur un hôte qui ne résout jamais : `neon()` ne se connecte pas à la
// création, seulement à la première requête, que ces tests n'émettent pas.
const URL_FICTIVE = "postgresql://essai:essai@exemple.invalide/essai";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("baseConfiguree", () => {
  const avec = (v: string) => ({ DATABASE_URL: v });

  it.each([
    ["une URL", avec(URL_FICTIVE), true],
    ["une URL entourée d'espaces", avec(`  ${URL_FICTIVE}  `), true],
    ["une valeur vide", avec(""), false],
    ["une valeur blanche", avec("   "), false],
    ["aucune variable", {}, false],
  ])("%s → %s", (_cas, env, attendu) => {
    expect(baseConfiguree(env)).toBe(attendu);
  });

  it("lit process.env quand aucun environnement n'est passé", () => {
    vi.stubEnv("DATABASE_URL", URL_FICTIVE);
    expect(baseConfiguree()).toBe(true);
    vi.stubEnv("DATABASE_URL", "");
    expect(baseConfiguree()).toBe(false);
  });
});

describe("db (proxy paresseux)", () => {
  it("s'importe sans DATABASE_URL : rien n'est exigé avant la première requête", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("../lib/db/index")).resolves.toHaveProperty("db");
  });

  it("à l'usage, une base non configurée lève une erreur qui le dit", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { db } = await import("../lib/db/index");
    expect(() => db.select).toThrow(/DATABASE_URL manquant/);
  });

  it("à l'usage, une base configurée rend de vraies méthodes Drizzle", async () => {
    vi.stubEnv("DATABASE_URL", URL_FICTIVE);
    const { db } = await import("../lib/db/index");
    expect(typeof db.select).toBe("function");
    expect(typeof db.insert).toBe("function");
  });

  it("n'ouvre la connexion qu'une fois : deux accès, la même instance", async () => {
    vi.stubEnv("DATABASE_URL", URL_FICTIVE);
    const { db } = await import("../lib/db/index");
    // `$client` est le client Neon que Drizzle garde ; le même objet d'un accès à l'autre
    // prouve que `connect()` n'a pas reconstruit l'instance.
    const client = (d: object) => (d as unknown as { $client: unknown }).$client;
    expect(client(db)).toBeDefined();
    expect(client(db)).toBe(client(db));
  });

  it("réexporte le schéma pour que les appelants n'aient qu'un import", async () => {
    const { schema } = await import("../lib/db/index");
    expect(schema).toHaveProperty("syncState");
  });
});
