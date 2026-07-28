// tests/reference.test.ts — l'intégrité des données de référence.
//
// Ce sont des constats saisis à la main. Ils ne « plantent » jamais : ils vieillissent, ou
// ils se contredisent en silence. D'où des tests sur ce qui doit rester vrai.

import { describe, it, expect } from "vitest";
import { ENTREPRISES_CIBLES, SALAIRES_MARCHE, SWOT } from "../lib/reference";
import { RAYON_MAX_KM } from "../lib/scoring";
import { SEED } from "../lib/seed";

describe("volume", () => {
  it("les trois jeux de référence sont peuplés", () => {
    // Un tableau vide passerait silencieusement tous les tests « pour chaque … ».
    expect(ENTREPRISES_CIBLES.length).toBeGreaterThan(15);
    expect(SALAIRES_MARCHE.length).toBeGreaterThan(4);
    expect(SWOT).toHaveLength(4);
  });
});

describe("repères de salaire", () => {
  it("chaque repère porte une source ET une date", () => {
    // Un chiffre de marché sans provenance est invérifiable six mois plus tard, donc
    // inutilisable comme argument.
    for (const s of SALAIRES_MARCHE) {
      expect(s.source, `repère « ${s.poste} »`).toMatch(/20\d\d/);
      expect(s.source.length, `repère « ${s.poste} »`).toBeGreaterThan(10);
      expect(s.fourchette.length).toBeGreaterThan(0);
    }
  });
});

describe("entreprises cibles", () => {
  it("sont triées de la plus proche à la plus lointaine", () => {
    const km = ENTREPRISES_CIBLES.map((e) => e.km);
    expect([...km].sort((a, b) => a - b)).toEqual(km);
  });

  it("ont des identités uniques et des distances plausibles", () => {
    const noms = ENTREPRISES_CIBLES.map((e) => e.nom);
    expect(new Set(noms).size).toBe(noms.length);
    for (const e of ENTREPRISES_CIBLES) {
      expect(e.km, `entreprise ${e.nom}`).toBeGreaterThan(0);
      expect(e.km, `entreprise ${e.nom}`).toBeLessThan(200);
      expect(e.ville.length, `entreprise ${e.nom}`).toBeGreaterThan(0);
      expect(e.lecture.length, `entreprise ${e.nom}`).toBeGreaterThan(20);
    }
  });

  it("celles qui sont hors rayon le disent dans leur lecture", () => {
    // Sinon elles passeraient pour des cibles atteignables.
    for (const e of ENTREPRISES_CIBLES.filter((x) => x.km > RAYON_MAX_KM)) {
      expect(e.lecture, `entreprise ${e.nom}`).toMatch(/rayon|écarter/i);
    }
  });

  it("aucune adresse municipale (garde-fou n°1)", () => {
    const motif = /\b\d{3,5},?\s+(av\.|avenue|rue|boul\.|boulevard|ch\.|chemin)\s/i;
    const fautives = ENTREPRISES_CIBLES.filter(
      (e) => motif.test(e.ville) || motif.test(e.lecture),
    ).map((e) => e.nom);
    expect(fautives).toEqual([]);
  });

  it("couvrent les employeurs des offres actives", () => {
    // Si une offre cite un employeur absent de cette liste, l'une des deux sources est
    // en retard sur l'autre — et c'est le genre d'écart qu'on ne voit jamais à l'œil.
    const connues = new Set(ENTREPRISES_CIBLES.map((e) => e.nom.toLowerCase()));
    const manquantes = SEED.filter((o) => !o.histo)
      .map((o) => o.entreprise)
      .filter((nom) => {
        const n = nom.toLowerCase();
        return ![...connues].some((c) => n.includes(c) || c.includes(n));
      });
    expect(manquantes).toEqual([]);
  });
});

describe("analyse de position", () => {
  it("couvre les quatre quadrants, chacun avec des points", () => {
    expect(SWOT.map((q) => q.cle)).toEqual([
      "forces",
      "faiblesses",
      "opportunites",
      "menaces",
    ]);
    for (const q of SWOT) {
      expect(q.points.length, `quadrant ${q.cle}`).toBeGreaterThanOrEqual(3);
      for (const p of q.points) expect(p.length).toBeGreaterThan(20);
    }
  });

  it("ne nomme pas l'employeur actuel ni de personne", () => {
    // Le contexte suffit (« l'employeur actuel ») : nommer n'ajoute rien et fait entrer
    // des tiers dans le dépôt.
    const texte = SWOT.flatMap((q) => q.points).join(" ");
    expect(texte).not.toMatch(/\b(M\.|Mme|Monsieur|Madame)\s+[A-ZÉÈÀ]/);
  });
});
