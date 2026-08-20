// tests/historiqueVeille.test.ts — la trace des passes, et ce qu'elle refuse de perdre.

import { describe, it, expect } from "vitest";
import {
  MAX_ENTREES,
  ajouterEntree,
  lireHistorique,
  type EntreeHistorique,
} from "@/lib/historiqueVeille";

const entree = (jour: string, n = 0): EntreeHistorique => ({
  jour,
  fini: `${jour}T11:05:00.000Z`,
  declencheur: "cron-veille",
  trouvees: 1000 + n,
  nouvelles: n,
  perimees: 0,
  revenues: 0,
  enSursis: 0,
  noteMoyenneNouvelles: n > 0 ? 60 : null,
  suivies: 200 + n,
});

describe("ajouterEntree — la plus récente en tête, la liste bornée", () => {
  it("met la nouvelle en tête", () => {
    const h = ajouterEntree([entree("2026-08-19")], entree("2026-08-20"));
    expect(h[0]?.jour).toBe("2026-08-20");
    expect(h).toHaveLength(2);
  });

  it("borne la liste — dérivé de la constante, jamais de sa valeur du jour", () => {
    let h: EntreeHistorique[] = [];
    for (let i = 0; i < MAX_ENTREES + 10; i++) h = ajouterEntree(h, entree("2026-08-20", i));
    expect(h).toHaveLength(MAX_ENTREES);
    // La plus RÉCENTE survit, l'ancienne tombe : l'inverse effacerait ce qu'on vient de faire.
    expect(h[0]?.nouvelles).toBe(MAX_ENTREES + 9);
  });
});

describe("lireHistorique — tolérante PAR ENTRÉE, jamais par le tout", () => {
  it("saute une entrée corrompue et garde les autres", () => {
    // ⚠️ C'est l'invariant qui compte : rejeter la liste entière pour une ligne mal formée
    // effacerait trois mois de mesure, et l'analyse de marché repartirait de zéro en silence.
    const brut = [entree("2026-08-20", 5), { jour: "pas une date" }, null, entree("2026-08-19")];
    const h = lireHistorique(brut);
    expect(h).toHaveLength(2);
    expect(h.map((e) => e.jour)).toEqual(["2026-08-20", "2026-08-19"]);
  });

  it("rend une liste vide sur une valeur qui n'est pas un tableau", () => {
    for (const brut of [null, undefined, 42, "texte", {}]) {
      expect(lireHistorique(brut)).toEqual([]);
    }
  });

  it("un compte absent vaut 0, mais une note absente reste NULLE", () => {
    // Un 0 de note dirait « les offres étaient mauvaises » ; l'absence dit « il n'y en a
    // pas eu ». Les confondre fausserait toute moyenne calculée sur la série.
    const h = lireHistorique([{ jour: "2026-08-20" }]);
    expect(h[0]?.trouvees).toBe(0);
    expect(h[0]?.noteMoyenneNouvelles).toBeNull();
  });

  it("borne aussi à la LECTURE — un état gonflé par une version antérieure ne passe pas", () => {
    const brut = Array.from({ length: MAX_ENTREES + 50 }, (_, i) => entree("2026-08-20", i));
    expect(lireHistorique(brut)).toHaveLength(MAX_ENTREES);
  });
});
