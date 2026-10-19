// tests/rangOffre.test.ts — le rang d'une offre par note, qui décide qui peut être comparée (JobAI#157, ADR-0034).
//
// La requête compte les offres OUVERTES de note STRICTEMENT plus haute : on éprouve ici ce que la fonction fait du
// résultat de la base, et les cas où elle ne doit même pas l'interroger.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

let lignes: { n: number }[] = [];
const interrogations: string[] = [];
let condition: SQL | undefined;

vi.mock("../lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async (cond: SQL) => {
          condition = cond;
          interrogations.push("where");
          return lignes;
        },
      }),
    }),
  },
}));
vi.mock("../lib/migrations", () => ({ assurerMigrations: async () => {} }));
vi.mock("../lib/synchro", () => ({ assurerSeedAJour: async () => {} }));

const { rangParNote } = await import("../lib/donnees");

beforeEach(() => {
  lignes = [];
  interrogations.length = 0;
  process.env.DATABASE_URL = "postgres://exemple/base-de-test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("rangParNote", () => {
  it("vaut 1 + le nombre d'offres ouvertes mieux notées", () => {
    lignes = [{ n: 11 }];
    return expect(rangParNote({ score: 70 })).resolves.toBe(12);
  });

  it("une offre que personne ne dépasse est la première", () => {
    lignes = [{ n: 0 }];
    return expect(rangParNote({ score: 90 })).resolves.toBe(1);
  });

  it("une offre sans note n'a pas de rang et n'interroge pas la base", async () => {
    expect(await rangParNote({ score: null })).toBeNull();
    expect(interrogations).toHaveLength(0);
  });

  it("sans base configurée, pas de rang (jamais un rang inventé)", async () => {
    delete process.env.DATABASE_URL;
    expect(await rangParNote({ score: 70 })).toBeNull();
    expect(interrogations).toHaveLength(0);
  });

  it("la requête ne compte que les offres OUVERTES de note STRICTEMENT plus haute", async () => {
    lignes = [{ n: 3 }];
    await rangParNote({ score: 70 });
    const { sql, params } = new PgDialect().sqlToQuery(condition as SQL);
    expect(sql).toContain('"histo" = $1');
    expect(sql).toContain('"perimee_le" is null');
    expect(sql).toContain('"score" > $2');
    expect(params).toEqual([false, 70]);
  });
});
