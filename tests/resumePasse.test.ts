// tests/resumePasse.test.ts — `[OBS-02]` / tâche #95 : le résumé de la dernière passe de
// distances est écrit sous une forme que la lecture sait relire, et ne ment pas quand il ne
// le peut pas.

import { describe, it, expect } from "vitest";
import {
  CLE_RESUME_DISTANCES,
  ResumeDistancesSchema,
  construireResume,
  lireResume,
  type EntreeResume,
} from "../lib/resumePasse";

const ENTREE: EntreeResume = {
  mesurees: 12,
  situees: 3,
  candidatesSituees: 9,
  placees: 4,
  villesManquantes: 41,
  distancesEffacees: 2,
  centresCorriges: 1,
  bornesMesurees: 5,
  bornesCandidates: 8,
  budgetRestantMs: 6400,
  etapes: [
    { nom: "villes", ms: 20 },
    { nom: "centres", ms: 1800 },
  ],
};
const FINI = new Date("2026-10-15T07:31:00.000Z");

describe("construireResume / lireResume", () => {
  it("aller-retour : ce qui est écrit se relit à l'identique", () => {
    const ecrit = construireResume(ENTREE, FINI);
    expect(ecrit.finiLe).toBe("2026-10-15T07:31:00.000Z");
    const relu = lireResume(JSON.stringify(ecrit));
    expect(relu).toEqual({ etat: "ok", resume: { ...ENTREE, finiLe: "2026-10-15T07:31:00.000Z" } });
  });

  it("garde les trois chiffres demandés, sous leurs noms", () => {
    const r = construireResume(ENTREE, FINI);
    expect(r.villesManquantes).toBe(41);
    expect(r.distancesEffacees).toBe(2);
    expect(r.centresCorriges).toBe(1);
  });

  it("un budget illimité (null) est conservé, pas remplacé par 0", () => {
    const r = construireResume({ ...ENTREE, budgetRestantMs: null }, FINI);
    expect(lireResume(JSON.stringify(r))).toMatchObject({ etat: "ok", resume: { budgetRestantMs: null } });
  });

  it("refuse d'écrire un compteur négatif ou fractionnaire — c'est un bug de la passe", () => {
    expect(() => construireResume({ ...ENTREE, centresCorriges: -1 }, FINI)).toThrow();
    expect(() => construireResume({ ...ENTREE, villesManquantes: 1.5 }, FINI)).toThrow();
    expect(() => construireResume({ ...ENTREE, mesurees: Number.NaN }, FINI)).toThrow();
  });

  it("aucune clé hors liste blanche ne survit à la lecture (pas de texte libre)", () => {
    const sale = { ...construireResume(ENTREE, FINI), employeur: "Acme inc.", ville: "Lavaltrie" };
    const relu = lireResume(JSON.stringify(sale));
    expect(relu.etat).toBe("ok");
    if (relu.etat === "ok") {
      expect(Object.keys(relu.resume).sort()).toEqual(Object.keys(ResumeDistancesSchema.shape).sort());
    }
  });
});

describe("lireResume — trois états qui ne se confondent pas", () => {
  it("null → absent (aucune passe terminée encore)", () => {
    expect(lireResume(null)).toEqual({ etat: "absent" });
  });

  it("du JSON cassé → illisible, jamais des zéros", () => {
    expect(lireResume("{pas du json")).toEqual({ etat: "illisible" });
  });

  it("du JSON valide mais d'une autre forme → illisible", () => {
    expect(lireResume(JSON.stringify({ villesManquantes: 3 }))).toEqual({ etat: "illisible" });
    expect(lireResume("null")).toEqual({ etat: "illisible" });
  });

  it("une date de fin invalide → illisible", () => {
    const r = { ...construireResume(ENTREE, FINI), finiLe: "hier" };
    expect(lireResume(JSON.stringify(r))).toEqual({ etat: "illisible" });
  });
});

it("la clé est celle que la passe écrit et que l'outil lit", () => {
  expect(CLE_RESUME_DISTANCES).toBe("distances-resume");
});
