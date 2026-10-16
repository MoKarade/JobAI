// tests/adresse.test.ts — ce que l'écran dit d'une adresse (lib/adresse.ts).
//
// Le texte de la mention n'est écrit qu'à UN endroit : ces tests le figent, parce qu'une
// mention qui dérive vers « à confirmer » partout (ou nulle part) change ce que Marc croit
// savoir d'une adresse sans qu'aucune erreur ne le dise.

import { describe, expect, it } from "vitest";
import { ADRESSE_ABSENTE, mentionSource, type SourceAdresse } from "../lib/adresse";

describe("mentionSource", () => {
  const attendu: [SourceAdresse, string][] = [
    ["osm", "OpenStreetMap"],
    ["google", "Google Maps"],
    ["registre", "registre des entreprises — domicile légal"],
    ["offre", "annoncée dans l'offre"],
    ["recherche", "trouvée sur le web — à confirmer"],
  ];

  it.each(attendu)("la source %s se dit « %s »", (source, mention) => {
    expect(mentionSource(source)).toBe(mention);
  });

  it("sans source, aucune mention (rien à dire plutôt qu'une mention inventée)", () => {
    expect(mentionSource(null)).toBe("");
  });

  it("seule la recherche web demande à être confirmée", () => {
    const confirmer = attendu.filter(([s]) => mentionSource(s).includes("à confirmer"));
    expect(confirmer.map(([s]) => s)).toEqual(["recherche"]);
  });

  it("chaque source a une mention distincte (sinon deux provenances se confondent à l'écran)", () => {
    const mentions = attendu.map(([s]) => mentionSource(s));
    expect(new Set(mentions).size).toBe(mentions.length);
  });
});

describe("ADRESSE_ABSENTE", () => {
  it("dit ce qui a été tenté et renvoie vers Maps, au lieu d'un « non trouvée »", () => {
    expect(ADRESSE_ABSENTE).toContain("sources ouvertes");
    expect(ADRESSE_ABSENTE).toContain("Maps");
  });
});
