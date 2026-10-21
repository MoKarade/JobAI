// tests/resumePasse.test.ts — `[OBS-02]` / tâche #95 : le résumé de la passe de distances est
// écrit par étapes sous une forme que la lecture sait relire, et ne ment pas quand il ne le peut pas.

import { describe, it, expect } from "vitest";
import {
  CLE_RESUME_DISTANCES,
  ResumeDistancesSchema,
  construireResume,
  lireResume,
  resumeVierge,
  type EntreeResume,
} from "../lib/resumePasse";

const ENTREE: EntreeResume = {
  derniereEtape: "mesure",
  mesurees: 12,
  situees: 3,
  candidatesSituees: 9,
  placees: 4,
  villesManquantes: 41,
  distancesEffacees: 2,
  distancesPostales: 7,
  lieuInconnuSansDistance: 3200,
  centresCorriges: 1,
  bornesMesurees: 5,
  bornesCandidates: 8,
  budgetRestantMs: 6400,
  etapes: [
    { nom: "villes", ms: 20 },
    { nom: "centres", ms: 1800 },
  ],
};
const ECRIT = new Date("2026-10-15T07:31:00.000Z");

describe("construireResume / lireResume", () => {
  it("aller-retour : ce qui est écrit se relit à l'identique", () => {
    const ecrit = construireResume(ENTREE, ECRIT, true);
    expect(ecrit.ecritLe).toBe("2026-10-15T07:31:00.000Z");
    expect(ecrit.terminee).toBe(true);
    expect(lireResume(JSON.stringify(ecrit))).toEqual({
      etat: "ok",
      resume: { ...ENTREE, ecritLe: "2026-10-15T07:31:00.000Z", terminee: true },
    });
  });

  it("garde les trois chiffres demandés, sous leurs noms", () => {
    const r = construireResume(ENTREE, ECRIT, true);
    expect(r.villesManquantes).toBe(41);
    expect(r.distancesEffacees).toBe(2);
    expect(r.centresCorriges).toBe(1);
  });

  it("un résumé écrit avant JobAI#92 (sans les deux comptes postaux) reste lisible", () => {
    const { distancesPostales: _a, lieuInconnuSansDistance: _b, ...ancien } = construireResume(ENTREE, ECRIT, true);
    expect(lireResume(JSON.stringify(ancien)).etat).toBe("ok");
  });

  it("un budget illimité (null) est conservé, pas remplacé par 0", () => {
    const r = construireResume({ ...ENTREE, budgetRestantMs: null }, ECRIT, true);
    expect(lireResume(JSON.stringify(r))).toMatchObject({ etat: "ok", resume: { budgetRestantMs: null } });
  });

  it("refuse d'écrire un compteur négatif ou fractionnaire — c'est un bug de la passe", () => {
    expect(() => construireResume({ ...ENTREE, centresCorriges: -1 }, ECRIT, true)).toThrow();
    expect(() => construireResume({ ...ENTREE, villesManquantes: 1.5 }, ECRIT, true)).toThrow();
    expect(() => construireResume({ ...ENTREE, mesurees: Number.NaN }, ECRIT, true)).toThrow();
  });

  it("aucune clé hors liste blanche ne survit à la lecture (pas de texte libre)", () => {
    const sale = { ...construireResume(ENTREE, ECRIT, true), employeur: "Acme inc.", ville: "Lavaltrie" };
    const relu = lireResume(JSON.stringify(sale));
    expect(relu.etat).toBe("ok");
    if (relu.etat === "ok") {
      expect(Object.keys(relu.resume).sort()).toEqual(Object.keys(ResumeDistancesSchema.shape).sort());
    }
  });
});

describe("une passe coupée laisse une trace honnête", () => {
  it("au départ rien n'est connu : tout est null, jamais 0", () => {
    const v = resumeVierge();
    for (const [cle, valeur] of Object.entries(v)) {
      if (cle === "etapes") expect(valeur).toEqual([]);
      else expect(valeur, cle).toBeNull();
    }
  });

  it("un résumé partiel est valide, marqué terminee:false, et garde l'étape atteinte", () => {
    const partiel = construireResume(
      { ...resumeVierge(), derniereEtape: "bornes", centresCorriges: 1, etapes: [{ nom: "villes", ms: 12 }] },
      ECRIT,
      false,
    );
    const relu = lireResume(JSON.stringify(partiel));
    expect(relu).toMatchObject({
      etat: "ok",
      resume: { terminee: false, derniereEtape: "bornes", centresCorriges: 1, villesManquantes: null, distancesEffacees: null },
    });
  });
});

describe("lireResume — trois états qui ne se confondent pas", () => {
  it("null → absent (aucune passe n'a encore écrit)", () => {
    expect(lireResume(null)).toEqual({ etat: "absent" });
  });

  it("du JSON cassé → illisible, jamais des zéros", () => {
    expect(lireResume("{pas du json")).toEqual({ etat: "illisible" });
  });

  it("du JSON valide mais d'une autre forme → illisible", () => {
    expect(lireResume(JSON.stringify({ villesManquantes: 3 }))).toEqual({ etat: "illisible" });
    expect(lireResume("null")).toEqual({ etat: "illisible" });
  });

  it("une date d'écriture invalide → illisible", () => {
    const r = { ...construireResume(ENTREE, ECRIT, true), ecritLe: "hier" };
    expect(lireResume(JSON.stringify(r))).toEqual({ etat: "illisible" });
  });
});

it("la clé est celle que la passe écrit et que l'outil lit", () => {
  expect(CLE_RESUME_DISTANCES).toBe("distances-resume");
});
