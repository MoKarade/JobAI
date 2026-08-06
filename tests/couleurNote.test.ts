// tests/couleurNote.test.ts — le dégradé de la note.
//
// Une couleur qui ENCODE une donnée n'est pas du style : c'est un calcul. Ce qui est
// vérifié ici, c'est ce sur quoi Marc a été explicite — « de plus en plus verte plus ça se
// rapproche de 100 » — plus les deux invariants qui rendent ce dégradé utilisable :
// la clarté ne bouge pas (sans quoi le nombre écrit dedans deviendrait illisible quelque
// part au milieu de l'échelle), et une note ABSENTE n'emprunte jamais la couleur d'une
// mauvaise note.

import { describe, it, expect } from "vitest";
import {
  NOTE_PLAFOND,
  NOTE_PLANCHER,
  couleurNote,
  encreSurNote,
  positionSurEchelle,
} from "../lib/couleurNote";

/** Extrait les trois composantes d'un `oklch(L C H)`. */
function lire(couleur: string): { clarte: number; chroma: number; teinte: number } {
  const m = couleur.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/);
  if (m === null) throw new Error(`couleur illisible : ${couleur}`);
  return { clarte: Number(m[1]), chroma: Number(m[2]), teinte: Number(m[3]) };
}

describe("plus la note monte, plus le cercle verdit", () => {
  it("la teinte progresse de l'ambre vers le vert", () => {
    // Le fait demandé, vérifié sur la SUITE et pas sur deux points choisis : une fonction
    // qui monte puis redescend passerait un test à deux valeurs.
    const teintes = [50, 60, 70, 80, 90, 95].map((n) => lire(couleurNote(n)).teinte);
    for (let i = 1; i < teintes.length; i++) {
      expect(teintes[i], `note ${[50, 60, 70, 80, 90, 95][i]}`).toBeGreaterThan(
        teintes[i - 1] as number,
      );
    }
  });

  it("la couleur s'affirme aussi en saturation", () => {
    expect(lire(couleurNote(95)).chroma).toBeGreaterThan(lire(couleurNote(50)).chroma);
  });

  it("les extrêmes sont bien l'ambre et le vert", () => {
    // Les bornes sont DÉRIVÉES des constantes, jamais recopiées : un test qui code en dur
    // « 45 » ment au premier rajustement du plancher.
    expect(lire(couleurNote(NOTE_PLANCHER)).teinte).toBeLessThan(90);
    expect(lire(couleurNote(NOTE_PLAFOND)).teinte).toBeGreaterThan(140);
  });

  it("au-delà des bornes, la couleur ne s'emballe pas", () => {
    // Une note hors échelle (100, ou une future note négative) ne doit pas produire une
    // teinte qui repart dans le bleu ou le rouge en faisant le tour du cercle chromatique.
    expect(couleurNote(100)).toBe(couleurNote(NOTE_PLAFOND));
    expect(couleurNote(0)).toBe(couleurNote(NOTE_PLANCHER));
    expect(positionSurEchelle(1000)).toBe(1);
    expect(positionSurEchelle(-1000)).toBe(0);
  });
});

describe("ce qui rend le nombre lisible dessus", () => {
  it("la clarté ne bouge JAMAIS sur toute l'échelle", () => {
    // ⚠️ L'invariant qui porte l'accessibilité. Si la clarté variait, le texte foncé posé
    // dans le cercle passerait sous le contraste minimum quelque part au milieu — et aucun
    // test de teinte ne le verrait. Une seule couleur d'encre suffit BECAUSE la clarté est
    // constante : les deux décisions tiennent ensemble ou tombent ensemble.
    const clartes = [0, 45, 55, 65, 75, 85, 95, 100].map((n) => lire(couleurNote(n)).clarte);
    expect(new Set(clartes).size).toBe(1);
    expect(lire(couleurNote(null)).clarte).toBe(clartes[0]);
  });

  it("l'encre du nombre est unique et foncée", () => {
    expect(lire(encreSurNote()).clarte).toBeLessThan(0.35);
  });
});

describe("une note ABSENTE n'est pas une mauvaise note", () => {
  it("rend un gris, jamais la couleur du bas de l'échelle", () => {
    // Une offre historique n'a jamais été notée. Lui donner l'ambre des notes faibles
    // afficherait un jugement qu'on n'a pas porté — plausible et faux (garde-fou n°3).
    const absente = lire(couleurNote(null));
    expect(absente.chroma).toBeLessThan(lire(couleurNote(NOTE_PLANCHER)).chroma);
  });

  it("traite une valeur non finie comme une absence", () => {
    expect(couleurNote(Number.NaN)).toBe(couleurNote(null));
    expect(couleurNote(Number.POSITIVE_INFINITY)).toBe(couleurNote(null));
  });
});
