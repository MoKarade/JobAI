import { describe, expect, it } from "vitest";
import { nomSource, phraseEchecSources } from "@/lib/libelleSource";

describe("nomSource", () => {
  it("nomme le flux du Guichet", () => {
    expect(nomSource("guichet-flux")).toBe("Guichet-Emplois");
  });
  it("laisse un identifiant inconnu tel quel", () => {
    expect(nomSource("autre")).toBe("autre");
  });
});

describe("phraseEchecSources", () => {
  it("vide si aucune source en échec", () => {
    expect(phraseEchecSources([])).toBe("");
  });
  it("accorde au singulier", () => {
    expect(phraseEchecSources(["guichet-flux"])).toBe("Guichet-Emplois n’a pas répondu à cette passe.");
  });
  it("accorde au pluriel", () => {
    expect(phraseEchecSources(["guichet-flux", "autre"])).toBe(
      "Guichet-Emplois, autre n’ont pas répondu à cette passe.",
    );
  });
});
