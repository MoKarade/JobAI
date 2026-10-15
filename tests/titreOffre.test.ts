// tests/titreOffre.test.ts — le titre d'onglet d'une offre dit le poste ET l'entreprise.
import { describe, expect, it } from "vitest";
import { titreOffre } from "@/lib/titreOffre";

describe("titreOffre", () => {
  it("met le poste puis l'entreprise", () => {
    expect(titreOffre({ poste: "Analyste TI", entreprise: "Acme" })).toBe(
      "Analyste TI · Acme — JobAI",
    );
  });

  it("retombe sur l'entreprise seule quand le poste est vide", () => {
    expect(titreOffre({ poste: "  ", entreprise: "Acme" })).toBe("Acme — JobAI");
  });

  it("retombe sur un titre neutre quand l'offre est absente", () => {
    expect(titreOffre(null)).toBe("Offre — JobAI");
  });
});
