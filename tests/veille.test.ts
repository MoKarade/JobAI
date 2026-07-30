// tests/veille.test.ts — ce qu'un balayage quotidien a le droit de changer.
//
// Deux dangers opposés, et le test doit tenir les deux bouts :
//   - périmer trop vite : le suivi se remplit d'offres ouvertes marquées mortes, et Marc
//     ne peut le détecter qu'en rouvrant chaque lien ;
//   - ne jamais périmer : la liste enfle de postes pourvus, et « 38 offres actives »
//     devient un chiffre faux.
// Le seuil d'absences et la résurrection sont ce qui arbitre. Ils se testent tous les deux.

import { describe, it, expect } from "vitest";
import {
  SEUIL_ABSENCES_PEREMPTION,
  appliquerBalayage,
  resumerBalayage,
  type JournalVeille,
} from "../lib/veille";
import { SEED } from "../lib/seed";
import type { Offre } from "../lib/types";

const base = SEED[0]!;
function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, id: "o", histo: false, perimeeLe: null, ...champs };
}

/** Un journal où `id` a été vu au dernier passage, avec `absences` absences depuis. */
function journal(id: string, absences: number): JournalVeille {
  return { [id]: { premiereVue: "2026-07-01", derniereVue: "2026-07-20", absences } };
}

describe("une offre vue par le balayage", () => {
  it("entre dans le suivi si elle est inconnue", () => {
    const r = appliquerBalayage([], [offre({ id: "neuve" })], {}, "2026-07-30");
    expect(r.nouvelles).toEqual(["neuve"]);
    expect(r.offres.map((o) => o.id)).toEqual(["neuve"]);
    expect(r.journal["neuve"]).toEqual({
      premiereVue: "2026-07-30",
      derniereVue: "2026-07-30",
      absences: 0,
    });
  });

  it("n'est pas re-comptée comme nouvelle au passage suivant", () => {
    const connue = offre({ id: "a" });
    const r = appliquerBalayage([connue], [connue], journal("a", 0), "2026-07-30");
    expect(r.nouvelles).toEqual([]);
    expect(r.offres).toHaveLength(1);
    expect(r.journal["a"]!.premiereVue).toBe("2026-07-01"); // la première vue est conservée
  });

  it("remet le compteur d'absences à zéro", () => {
    const a = offre({ id: "a" });
    const r = appliquerBalayage([a], [a], journal("a", 2), "2026-07-30");
    expect(r.journal["a"]!.absences).toBe(0);
  });
});

describe("une offre absente du balayage", () => {
  it("n'est PAS périmée à la première absence — ce serait du bruit de source", () => {
    const a = offre({ id: "a" });
    const r = appliquerBalayage([a], [], journal("a", 0), "2026-07-30");
    expect(r.perimees).toEqual([]);
    expect(r.offres[0]!.perimeeLe).toBeNull();
    expect(r.enSursis).toEqual([{ id: "a", absences: 1 }]);
  });

  it("est périmée au seuil d'absences consécutives, et le constat est daté", () => {
    // Le cas est DÉRIVÉ de la constante : codé « 3 », il mentirait au premier ajustement.
    const a = offre({ id: "a" });
    const r = appliquerBalayage([a], [], journal("a", SEUIL_ABSENCES_PEREMPTION - 1), "2026-07-30");
    expect(r.perimees).toEqual(["a"]);
    expect(r.offres[0]!.perimeeLe).toBe("2026-07-30T00:00:00.000Z");
  });

  it("juste sous le seuil, reste active et signalée en sursis", () => {
    const a = offre({ id: "a" });
    const r = appliquerBalayage([a], [], journal("a", SEUIL_ABSENCES_PEREMPTION - 2), "2026-07-30");
    expect(r.perimees).toEqual([]);
    expect(r.offres[0]!.perimeeLe).toBeNull();
    expect(r.enSursis[0]!.absences).toBe(SEUIL_ABSENCES_PEREMPTION - 1);
  });

  it("déjà périmée, ne l'est pas une seconde fois", () => {
    const a = offre({ id: "a", perimeeLe: "2026-07-01T00:00:00.000Z" });
    const r = appliquerBalayage([a], [], journal("a", SEUIL_ABSENCES_PEREMPTION + 5), "2026-07-30");
    expect(r.perimees).toEqual([]);
    expect(r.offres[0]!.perimeeLe).toBe("2026-07-01T00:00:00.000Z"); // date du constat d'origine
  });
});

describe("ce que la veille NE TOUCHE PAS", () => {
  it("une offre JAMAIS vue par un balayage n'est jamais périmée", () => {
    // C'est la protection du travail manuel : les 23 offres relevées à la main ne
    // viennent pas d'une requête Indeed. Leur absence d'un balayage ne prouve RIEN — et
    // les périmer sur ce silence détruirait la partie la plus fiable du jeu.
    const manuelle = offre({ id: "lue-a-la-main" });
    const r = appliquerBalayage([manuelle], [], {}, "2026-07-30");
    expect(r.perimees).toEqual([]);
    expect(r.enSursis).toEqual([]);
    expect(r.offres[0]!.perimeeLe).toBeNull();
    expect(r.journal["lue-a-la-main"]).toBeUndefined();
  });

  it("sur le VRAI jeu de départ : un balayage vide ne périme aucune des 38 actives", () => {
    const avant = SEED.filter((o) => !o.histo && o.perimeeLe === null).length;
    const r = appliquerBalayage(SEED, [], {}, "2026-07-30");
    const apres = r.offres.filter((o) => !o.histo && o.perimeeLe === null).length;
    expect(apres).toBe(avant);
    expect(r.perimees).toEqual([]);
  });

  it("les candidatures de 2025 sont hors veille", () => {
    const histo = offre({ id: "h25", histo: true });
    const r = appliquerBalayage([histo], [], journal("h25", SEUIL_ABSENCES_PEREMPTION), "2026-07-30");
    expect(r.perimees).toEqual([]);
    expect(r.offres[0]!.perimeeLe).toBeNull();
  });

  it("les champs de Marc survivent au balayage (garde-fou n°2)", () => {
    const suivie = offre({
      id: "a",
      statut: "CVenvoye",
      priorite: "Haute",
      dateEnvoi: "2026-07-15",
      userNote: "relancé le 20",
    });
    const r = appliquerBalayage([suivie], [], journal("a", SEUIL_ABSENCES_PEREMPTION - 1), "2026-07-30");
    const apres = r.offres[0]!;
    expect(apres.perimeeLe).not.toBeNull(); // la veille a bien agi
    expect(apres.statut).toBe("CVenvoye");
    expect(apres.priorite).toBe("Haute");
    expect(apres.dateEnvoi).toBe("2026-07-15");
    expect(apres.userNote).toBe("relancé le 20");
  });
});

describe("résurrection — un faux positif ne doit jamais être définitif", () => {
  it("une offre périmée que le balayage revoit redevient active", () => {
    const a = offre({ id: "a", perimeeLe: "2026-07-25T00:00:00.000Z" });
    const r = appliquerBalayage([a], [offre({ id: "a" })], journal("a", 4), "2026-07-30");
    expect(r.revenues).toEqual(["a"]);
    expect(r.offres[0]!.perimeeLe).toBeNull();
    expect(r.journal["a"]!.absences).toBe(0);
  });

  it("la résurrection ne réécrit pas le suivi de Marc", () => {
    const a = offre({
      id: "a",
      perimeeLe: "2026-07-25T00:00:00.000Z",
      statut: "Entrevue",
      userNote: "entrevue le 3",
    });
    const r = appliquerBalayage([a], [offre({ id: "a", statut: "Identifiee" })], journal("a", 4), "2026-07-30");
    expect(r.offres[0]!.statut).toBe("Entrevue");
    expect(r.offres[0]!.userNote).toBe("entrevue le 3");
  });
});

describe("compte rendu", () => {
  it("dit ce qui a changé, y compris quand rien n'a bougé", () => {
    const r = appliquerBalayage([], [], {}, "2026-07-30");
    expect(resumerBalayage(r)).toBe("0 nouvelle");
  });

  it("énumère nouvelles, périmées, revenues et sursis", () => {
    const perimable = offre({ id: "vieille" });
    const revenante = offre({ id: "revenante", perimeeLe: "2026-07-01T00:00:00.000Z" });
    const sursitaire = offre({ id: "sursis" });
    const j: JournalVeille = {
      ...journal("vieille", SEUIL_ABSENCES_PEREMPTION - 1),
      revenante: { premiereVue: "2026-07-01", derniereVue: "2026-07-02", absences: 9 },
      sursis: { premiereVue: "2026-07-01", derniereVue: "2026-07-20", absences: 0 },
    };
    const r = appliquerBalayage(
      [perimable, revenante, sursitaire],
      [offre({ id: "revenante" }), offre({ id: "neuve" })],
      j,
      "2026-07-30",
    );
    expect(resumerBalayage(r)).toBe("1 nouvelle, 1 périmée, 1 revenue, 1 en sursis");
  });
});
