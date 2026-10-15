// tests/diagnosticSynchro.test.ts — `[OBS-01]` : la fraîcheur des passes de fond, sans leur contenu.

import { describe, it, expect } from "vitest";
import { resumerEtatSynchro } from "../lib/diagnosticSynchro";

const MAINTENANT = new Date("2026-09-21T12:00:00.000Z");

describe("resumerEtatSynchro", () => {
  it("rend un tableau vide sur une table vide", () => {
    expect(resumerEtatSynchro([], MAINTENANT)).toEqual([]);
  });

  it("calcule l'âge en millisecondes depuis `maintenant`", () => {
    const r = resumerEtatSynchro(
      [{ cle: "distances-auto", majLe: new Date("2026-09-21T11:55:00.000Z") }],
      MAINTENANT,
    );
    expect(r).toEqual([
      { cle: "distances-auto", majLe: "2026-09-21T11:55:00.000Z", ageMs: 5 * 60 * 1000 },
    ]);
  });

  it("trie par clé — l'ordre doit être stable, pas celui de la base", () => {
    const r = resumerEtatSynchro(
      [
        { cle: "veille-auto", majLe: MAINTENANT },
        { cle: "distances-auto", majLe: MAINTENANT },
        { cle: "geocodage-auto", majLe: MAINTENANT },
      ],
      MAINTENANT,
    );
    expect(r.map((l) => l.cle)).toEqual(["distances-auto", "geocodage-auto", "veille-auto"]);
  });

  it("ne rend JAMAIS de champ `valeur` — le type d'entrée ne le porte même pas", () => {
    // Le type `LigneSynchroBrute` n'a pas de champ `valeur` : un appelant qui en passerait
    // un ne le ferait pas fuiter, TypeScript le refuserait. Ce test verrouille la SORTIE :
    // même en passant un objet plus riche que le type déclaré, seuls `cle`/`majLe`/`ageMs`
    // doivent apparaître.
    const riche = [{ cle: "seed", majLe: MAINTENANT, valeur: "secret-qui-ne-doit-pas-sortir" }];
    const r = resumerEtatSynchro(riche, MAINTENANT);
    expect(Object.keys(r[0]!).sort()).toEqual(["ageMs", "cle", "majLe"]);
  });

  it("une passe future (horloge qui dérive) rend un âge négatif plutôt qu'un mensonge", () => {
    const r = resumerEtatSynchro(
      [{ cle: "seed", majLe: new Date("2026-09-21T12:00:05.000Z") }],
      MAINTENANT,
    );
    expect(r[0]?.ageMs).toBe(-5000);
  });
});

describe("resumerEtatSynchro — le résumé de passe (`[OBS-02]`)", () => {
  const RESUME = {
    finiLe: "2026-10-15T07:31:00.000Z",
    mesurees: 1,
    situees: 1,
    candidatesSituees: 1,
    placees: 0,
    villesManquantes: 7,
    distancesEffacees: 0,
    centresCorriges: 0,
    bornesMesurees: 0,
    bornesCandidates: 0,
    budgetRestantMs: null,
    etapes: [],
  };
  const lignes = [
    { cle: "distances-auto", majLe: MAINTENANT },
    { cle: "distances-resume", majLe: MAINTENANT },
  ];

  it("n'attache le résumé qu'à la ligne `distances-resume`", () => {
    const r = resumerEtatSynchro(lignes, MAINTENANT, { etat: "ok", resume: RESUME });
    expect(r.find((l) => l.cle === "distances-resume")?.resume).toEqual(RESUME);
    expect(Object.keys(r.find((l) => l.cle === "distances-auto")!).sort()).toEqual([
      "ageMs",
      "cle",
      "majLe",
    ]);
  });

  it("sans résumé lu, la ligne reste une simple date", () => {
    const r = resumerEtatSynchro(lignes, MAINTENANT);
    expect(Object.keys(r.find((l) => l.cle === "distances-resume")!).sort()).toEqual([
      "ageMs",
      "cle",
      "majLe",
    ]);
  });

  it("un résumé illisible est marqué, pas remplacé par des zéros", () => {
    const l = resumerEtatSynchro(lignes, MAINTENANT, { etat: "illisible" }).find(
      (x) => x.cle === "distances-resume",
    );
    expect(l?.resume).toBeNull();
    expect(l?.resumeIllisible).toBe(true);
  });

  it("une autre clé ne reçoit jamais de résumé, même si on en passe un", () => {
    const r = resumerEtatSynchro([{ cle: "seed", majLe: MAINTENANT }], MAINTENANT, {
      etat: "ok",
      resume: RESUME,
    });
    expect(Object.keys(r[0]!).sort()).toEqual(["ageMs", "cle", "majLe"]);
  });
});
