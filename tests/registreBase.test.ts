// tests/registreBase.test.ts — éprouve la lecture en comptes et par lots du registre des entreprises.
//
// Données FICTIVES (données publiques/fictives seulement).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { registreNoms } from "../lib/db/schema";

let requetesCount = 0;
let mockNomsLignes: Array<{ cle?: string; neq?: string; n?: number }> = [];
let mockEtablissementsLignes: Array<{ cle?: string; neq?: string; n?: number }> = [];

vi.mock("../lib/db", () => ({
  db: {
    select: () => {
      requetesCount++;
      return {
        from: (table: unknown) => {
          const getLignes = () =>
            table === registreNoms ? mockNomsLignes : mockEtablissementsLignes;
          return {
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(getLignes()).then(resolve),
            where: async () => getLignes(),
          };
        },
      };
    },
  },
}));

const { lireClesRegistre, compterRegistre } = await import("../lib/registreBase");

beforeEach(() => {
  requetesCount = 0;
  mockNomsLignes = [];
  mockEtablissementsLignes = [];
});

describe("registreBase", () => {
  describe("lireClesRegistre", () => {
    it("rend une Map vide et n'interroge pas la base quand la liste de clés est vide", async () => {
      const res = await lireClesRegistre([]);
      expect(res).toEqual(new Map());
      expect(res.size).toBe(0);
      expect(requetesCount).toBe(0);
    });

    it("une clé dans les dénominations ET établissements avec même NEQ compte 1, et avec deux NEQ différents compte 2", async () => {
      // Même NEQ dans les deux tables -> compte 1
      mockNomsLignes = [{ cle: "cle-fictive-alpha", neq: "neq-100" }];
      mockEtablissementsLignes = [{ cle: "cle-fictive-alpha", neq: "neq-100" }];

      const resMemeNeq = await lireClesRegistre(["cle-fictive-alpha"]);
      expect(resMemeNeq.get("cle-fictive-alpha")).toBe(1);

      // Deux NEQ différents -> compte 2
      mockNomsLignes = [{ cle: "cle-fictive-beta", neq: "neq-101" }];
      mockEtablissementsLignes = [{ cle: "cle-fictive-beta", neq: "neq-102" }];

      const resDeuxNeq = await lireClesRegistre(["cle-fictive-beta"]);
      expect(resDeuxNeq.get("cle-fictive-beta")).toBe(2);
    });

    it("2 500 clés font 3 lots, donc 6 requêtes select au total (2 par lot)", async () => {
      const cles = Array.from({ length: 2500 }, (_, i) => `cle-fictive-${i}`);
      requetesCount = 0;

      await lireClesRegistre(cles);
      expect(requetesCount).toBe(6);
    });
  });

  describe("compterRegistre", () => {
    it("rend les deux comptes de la base, et 0 pour une table dont le compte est absent", async () => {
      // Comptes présents pour les deux tables
      mockNomsLignes = [{ n: 1200 }];
      mockEtablissementsLignes = [{ n: 3400 }];

      const resComplet = await compterRegistre();
      expect(resComplet).toEqual({ noms: 1200, etablissements: 3400 });

      // Compte absent pour une table
      mockNomsLignes = [{ n: 500 }];
      mockEtablissementsLignes = [];

      const resIncomplet = await compterRegistre();
      expect(resIncomplet).toEqual({ noms: 500, etablissements: 0 });
    });
  });
});
