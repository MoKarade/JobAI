// tests/dateLisible.test.ts — une date AAAA-MM-JJ s'affiche en toutes lettres, en français.
import { describe, expect, it } from "vitest";
import { dateLisible } from "@/lib/dateLisible";

describe("dateLisible", () => {
  it("écrit le mois en toutes lettres", () => {
    expect(dateLisible("2026-09-14")).toBe("14 septembre 2026");
  });

  it("met « 1er » pour le premier du mois", () => {
    expect(dateLisible("2026-08-01")).toBe("1er août 2026");
  });

  it("rend le texte tel quel quand ce n'est pas une date valide", () => {
    expect(dateLisible("bientôt")).toBe("bientôt");
    expect(dateLisible("2026-13-40")).toBe("2026-13-40");
  });

  it("rend une chaîne vide telle quelle", () => {
    expect(dateLisible("")).toBe("");
  });
});
