// tests/densite.test.ts — le calque de densité : un poids dérivé du palier EXISTANT.

import { describe, it, expect } from "vitest";
import { poidsEpingle, rayonDensiteM, RAYON_DENSITE_MAX_M } from "@/lib/densite";
import { SEUIL_PALIER_B } from "@/lib/scoring";

const epingle = (scores: (number | null)[]) => ({
  entreprises: [
    {
      offres: scores.map((score, i) => ({ id: String(i), score })),
    } as never,
  ],
});

describe("poidsEpingle — « bonne » est le palier B, pas un second seuil", () => {
  it("dérive du SEUIL existant : au seuil = 1, sous le seuil = 0", () => {
    expect(poidsEpingle(epingle([SEUIL_PALIER_B]))).toBe(1);
    expect(poidsEpingle(epingle([SEUIL_PALIER_B - 1]))).toBe(0);
    expect(poidsEpingle(epingle([SEUIL_PALIER_B + 20]))).toBe(2);
  });

  it("une offre SANS note ne pèse rien — pas jugée n'est pas mauvaise", () => {
    expect(poidsEpingle(epingle([null, null]))).toBe(0);
    expect(poidsEpingle(epingle([null, SEUIL_PALIER_B]))).toBe(1);
  });
});

describe("rayonDensiteM — la SURFACE suit le poids", () => {
  it("zéro poids = zéro cercle, jamais un point décoratif", () => {
    expect(rayonDensiteM(0)).toBe(0);
  });
  it("⚠️ croissance en racine : ×4 de poids = ×2 de rayon (à la constante près)", () => {
    const r1 = rayonDensiteM(1) - 500;
    const r4 = rayonDensiteM(4) - 500;
    expect(r4).toBe(2 * r1);
  });
  it("plafonne — un disque plus grand ne dirait plus rien", () => {
    expect(rayonDensiteM(10_000)).toBe(RAYON_DENSITE_MAX_M);
  });
});
