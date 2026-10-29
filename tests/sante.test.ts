// tests/sante.test.ts — GET /api/sante : santé publique pour la vigie de l'Atelier.
//
// `lib/db` n'est PAS importé par les tests (voir son en-tête) : la seule branche testable
// sans base réelle est « base non configurée », exactement le patron déjà suivi par
// tests/hubSummary.test.ts. La branche « base configurée mais injoignable » délègue tout à
// Drizzle/Neon (`db.execute`) et n'a pas de logique propre à re-tester ici.

import { describe, it, expect } from "vitest";
import { GET } from "../app/api/sante/route";
import { baseConfiguree } from "../lib/db";

async function withDatabaseUrl(value: string | undefined, fn: () => Promise<void>) {
  const before = process.env.DATABASE_URL;
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = before;
  }
}

describe("GET /api/sante", () => {
  it('503 { ok: false, cause: "base" } si DATABASE_URL non configuré', async () => {
    await withDatabaseUrl(undefined, async () => {
      const res = await GET();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, cause: "base" });
    });
  });

  it("ne renvoie ni donnée d'offre ni message d'erreur brut", async () => {
    await withDatabaseUrl(undefined, async () => {
      const corps = await (await GET()).text();
      expect(corps).not.toMatch(/DATABASE_URL|neon|postgres/i);
    });
  });

  it("Cache-Control: no-store, dans les deux cas", async () => {
    await withDatabaseUrl(undefined, async () => {
      const res = await GET();
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });
});

async function withCommit(value: string | undefined, fn: () => Promise<void>) {
  const before = process.env.VERCEL_GIT_COMMIT_SHA;
  if (value === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = before;
  }
}

// JobAI#324 : le commit servi, pour voir un alias figé après un retour en arrière (.github#822).
// Ici seule la réponse 503 est atteignable sans base réelle ; la réponse 200 est couverte dans tests/santeOk.test.ts.
describe("GET /api/sante : commit servi", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  it("rend les 7 premiers caractères du commit, même dans la réponse 503", async () => {
    await withDatabaseUrl(undefined, async () => {
      await withCommit(SHA, async () => {
        const res = await GET();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ ok: false, cause: "base", commit: "0123456" });
      });
    });
  });

  it("met en minuscules un commit en majuscules", async () => {
    await withDatabaseUrl(undefined, async () => {
      await withCommit("ABCDEF1234567", async () => {
        expect((await (await GET()).json()).commit).toBe("abcdef1");
      });
    });
  });

  it("omet le champ si la variable est absente, vide, pas hexadécimale ou trop longue (41 caractères)", async () => {
    await withDatabaseUrl(undefined, async () => {
      for (const valeur of [undefined, "", "   ", "pas-un-commit", "0123xyz", "abc12", "a".repeat(41)]) {
        await withCommit(valeur, async () => {
          const corps = await (await GET()).json();
          expect(corps).toEqual({ ok: false, cause: "base" });
          expect(corps).not.toHaveProperty("commit");
        });
      }
    });
  });
});

describe("baseConfiguree", () => {
  it("refuse l'absence, le vide et le blanc", () => {
    expect(baseConfiguree({})).toBe(false);
    expect(baseConfiguree({ DATABASE_URL: "" })).toBe(false);
    expect(baseConfiguree({ DATABASE_URL: "   " })).toBe(false);
  });

  it("accepte une valeur non blanche", () => {
    expect(baseConfiguree({ DATABASE_URL: "postgres://exemple" })).toBe(true);
  });
});
