// tests/formulaireAjoutUnSeulPli.test.ts — carte 11 : le formulaire d'ajout ne se replie
// qu'une fois. La page l'enveloppe déjà dans un dépliant « Ajouter une offre » ; un second
// `<details>` à l'intérieur obligeait à deux clics pour voir les champs.
//
// Verrou de source : vitest ne collecte pas les `.tsx`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("formulaire d'ajout : un seul pli (carte 11)", () => {
  it("le formulaire ne contient plus de <details> ni de <summary>", () => {
    const src = lire("components/FormulaireAjout.tsx");
    expect(src).not.toMatch(/<details[\s>]/);
    expect(src).not.toMatch(/<summary[\s>]/);
  });

  it("la page garde le dépliant « Ajouter une offre » autour du formulaire", () => {
    const src = lire("app/page.tsx");
    expect(src).toContain('titre="Ajouter une offre"');
  });
});
