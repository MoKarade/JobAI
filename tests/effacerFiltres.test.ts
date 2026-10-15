// tests/effacerFiltres.test.ts — carte 12 : quand les filtres ne laissent rien, un bouton
// « Effacer les filtres » remet tout à zéro, sur la liste comme sur la carte.
//
// Verrou de source : vitest ne collecte pas les `.tsx`, et ces composants clients ne se
// rendent pas sans navigateur.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("bouton « Effacer les filtres » (carte 12)", () => {
  it("la liste le propose quand aucune offre ne correspond, et remet FILTRES_VIDES", () => {
    const src = lire("components/ListeOffres.tsx");
    expect(src).toContain("Effacer les filtres");
    expect(src).toContain("setFiltres(FILTRES_VIDES)");
  });

  it("la carte le propose quand un filtre vide la carte, et remet FILTRES_VIDES", () => {
    const src = lire("components/CarteFiltrable.tsx");
    expect(src).toContain("Effacer les filtres");
    expect(src).toContain("setFiltres(FILTRES_VIDES)");
  });
});
