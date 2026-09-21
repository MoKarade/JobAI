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
