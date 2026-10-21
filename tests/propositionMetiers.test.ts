// tests/propositionMetiers.test.ts — proposer des métiers précis à Marc (ADR-0038, JobAI#151). Données FICTIVES.
import { describe, it, expect } from "vitest";
import {
  MAX_PROPOSES,
  MIN_OFFRES_PAR_CODE,
  PART_MINIMALE,
  TITRES_PAR_CODE,
  proposerMetiers,
} from "../lib/propositionMetiers";
import { PROFIL_DEFAUT } from "../lib/profil";

const lu = (noc: string, n = 1) =>
  Array.from({ length: n }, (_, i) => ({ noc, poste: `Chargé de projet en automatisation robotique ${i}` }));
const horsSujet = (noc: string, n = 1) =>
  Array.from({ length: n }, (_, i) => ({ noc, poste: `Cuisinier ${i}` }));

describe("proposerMetiers", () => {
  it("propose un code dont assez d'offres se lisent comme le domaine", () => {
    const r = proposerMetiers([...lu("22302", 3)], PROFIL_DEFAUT);
    expect(r.proposes).toEqual(["22302"]);
    expect(r.lignes[0]).toMatchObject({ code: "22302", offres: 3, lues: 3, part: 1, propose: true });
  });

  it("ne propose pas un code sous le minimum d'offres, même à 100 %", () => {
    const r = proposerMetiers([...lu("22302", MIN_OFFRES_PAR_CODE - 1)], PROFIL_DEFAUT);
    expect(r.lignes).toEqual([]);
    expect(r.proposes).toEqual([]);
  });

  it("montre sans pré-cocher un code lu en dessous de la part minimale", () => {
    // 1 offre sur 4 se lit comme le domaine : 25 % < 50 %.
    const r = proposerMetiers([...lu("22114", 1), ...horsSujet("22114", 3)], PROFIL_DEFAUT);
    expect(PART_MINIMALE).toBe(0.5);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]?.propose).toBe(false);
    expect(r.proposes).toEqual([]);
  });

  it("n'invente rien : un code dont aucun titre ne se lit comme le domaine n'apparaît pas", () => {
    const r = proposerMetiers([...horsSujet("63200", 5)], PROFIL_DEFAUT);
    expect(r.lignes).toEqual([]);
  });

  it("ignore les offres sans code lisible et dit combien portent un code", () => {
    const r = proposerMetiers(
      [...lu("22302", 3), { noc: null, poste: "Chargé de projet" }, { noc: "2230", poste: "x" }, { poste: "y" }],
      PROFIL_DEFAUT,
    );
    expect(r.avecCode).toBe(3);
  });

  it("plafonne les codes proposés", () => {
    const offres = Array.from({ length: MAX_PROPOSES + 5 }, (_, i) =>
      lu(String(22000 + i), MIN_OFFRES_PAR_CODE),
    ).flat();
    const r = proposerMetiers(offres, PROFIL_DEFAUT);
    expect(r.proposes).toHaveLength(MAX_PROPOSES);
  });

  it("montre jusqu'à trois titres différents, ceux du domaine d'abord", () => {
    const r = proposerMetiers(
      [
        ...horsSujet("22302", 1),
        ...lu("22302", 3),
        { noc: "22302", poste: "chargé de projet en automatisation robotique 0" }, // doublon replié
      ],
      PROFIL_DEFAUT,
    );
    const titres = r.lignes[0]?.titres ?? [];
    expect(titres.length).toBeLessThanOrEqual(TITRES_PAR_CODE);
    expect(titres[0]).toMatch(/automatisation/i);
    expect(new Set(titres.map((t) => t.toLowerCase())).size).toBe(titres.length);
  });

  it("est déterministe : mêmes offres, même ordre, même proposition", () => {
    const offres = [...lu("22302", 3), ...lu("21301", 3), ...lu("70010", 4)];
    expect(proposerMetiers(offres, PROFIL_DEFAUT)).toEqual(proposerMetiers([...offres].reverse(), PROFIL_DEFAUT));
  });
});
