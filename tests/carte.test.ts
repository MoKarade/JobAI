// tests/carte.test.ts — la vue cartographique, par ENTREPRISE.
//
// Trois choses à verrouiller. Le garde-fou n°1 : la carte ne dit RIEN du domicile — pas de
// point de référence dans le cadrage, pas de contenu personnel dans les épingles.
// L'honnêteté des positions : « exacte » et « centre-ville » sont deux choses différentes,
// jamais confondues. Et le compte : aucune offre vivante ne disparaît en silence — elle est
// épinglée, hors cibles, ou en attente de localisation.

import { describe, it, expect } from "vitest";
import {
  LONGUEUR_MIN_APPARIEMENT,
  apparier,
  cadrage,
  construireVue,
  villeDeLEntreprise,
  type PositionEntreprise,
} from "../lib/carte";
import { ENTREPRISES_CIBLES } from "../lib/reference";
import { SEED } from "../lib/seed";
import type { Offre } from "../lib/types";

const base = SEED[0]!;
function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, id: "o", histo: false, perimeeLe: null, ...champs };
}

function positions(
  entrees: [string, "exacte" | "ville", number, number][],
): Map<string, PositionEntreprise> {
  return new Map(entrees.map(([nom, precision, lat, lon]) => [nom, { lat, lon, precision }]));
}

describe("appariement des noms d'entreprise", () => {
  it("apparie une désignation plus longue à sa forme courte", () => {
    expect(apparier("Groupe Leclerc", "Leclerc")).toBe(true);
    expect(apparier("STERIS Canada", "STERIS")).toBe(true);
  });

  it("n'apparie PAS deux employeurs distincts", () => {
    expect(apparier("Canam Ponts", "Robotiq")).toBe(false);
  });

  it("exige l'égalité stricte sous la longueur minimale", () => {
    // Sans plancher, un nom de deux lettres apparierait la moitié de la liste.
    const court = "A".repeat(LONGUEUR_MIN_APPARIEMENT - 1);
    expect(apparier(court, `${court}METEK`)).toBe(false);
    expect(apparier(court, court)).toBe(true);
    expect(apparier("", "")).toBe(false);
  });

  it("retrouve la ville d'un employeur cible, null sinon", () => {
    expect(villeDeLEntreprise("Chantier Davie", ENTREPRISES_CIBLES)).toBe("Lévis");
    expect(villeDeLEntreprise("Employeur Jamais Vu", ENTREPRISES_CIBLES)).toBeNull();
  });
});

describe("construction de la vue par entreprise", () => {
  it("une entreprise EXACTE a sa propre épingle, avec ses offres", () => {
    const vue = construireVue(
      [offre({ id: "a", entreprise: "Laserax" })],
      ENTREPRISES_CIBLES,
      positions([["Laserax", "exacte", 46.75, -71.29]]),
    );
    const epingle = vue.epingles.find((e) => e.entreprises.some((x) => x.nom === "Laserax"))!;
    expect(epingle.precision).toBe("exacte");
    expect(epingle.entreprises).toHaveLength(1);
    expect(epingle.entreprises[0]!.offres.map((o) => o.id)).toEqual(["a"]);
  });

  it("REGROUPE les positions approximatives d'une même ville sur UNE épingle", () => {
    // Les replis d'une ville partagent la même position (son centre) : des cercles empilés
    // se masqueraient l'un l'autre.
    const vue = construireVue(
      [],
      ENTREPRISES_CIBLES,
      positions([
        ["Laserax", "ville", 46.81, -71.21],
        ["Qualtech", "ville", 46.81, -71.21],
      ]),
    );
    const groupes = vue.epingles.filter((e) => e.precision === "ville");
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.entreprises.map((x) => x.nom).sort()).toEqual(["Laserax", "Qualtech"]);
  });

  it("ne mélange JAMAIS une position exacte dans un groupe approximatif", () => {
    const vue = construireVue(
      [],
      ENTREPRISES_CIBLES,
      positions([
        ["Laserax", "exacte", 46.75, -71.29],
        ["Qualtech", "ville", 46.81, -71.21],
      ]),
    );
    for (const e of vue.epingles) {
      if (e.precision === "exacte") expect(e.entreprises).toHaveLength(1);
    }
    expect(vue.epingles).toHaveLength(2);
  });

  it("affiche une cible SANS offre active — c'est la liste de chasse, pas un vide", () => {
    const vue = construireVue([], ENTREPRISES_CIBLES, positions([["Robotiq", "exacte", 46.7, -71.28]]));
    const robotiq = vue.epingles.flatMap((e) => e.entreprises).find((x) => x.nom === "Robotiq")!;
    expect(robotiq.offres).toEqual([]);
    expect(robotiq.lecture.length).toBeGreaterThan(0);
  });

  it("met la meilleure note en tête des offres d'une entreprise", () => {
    const vue = construireVue(
      [
        offre({ id: "faible", entreprise: "Laserax", score: 40 }),
        offre({ id: "forte", entreprise: "Laserax", score: 92 }),
      ],
      ENTREPRISES_CIBLES,
      positions([["Laserax", "exacte", 46.75, -71.29]]),
    );
    expect(vue.epingles[0]!.entreprises[0]!.offres[0]!.id).toBe("forte");
  });

  it("ignore l'historique et les offres périmées", () => {
    const vue = construireVue(
      [
        offre({ id: "h", entreprise: "Laserax", histo: true }),
        offre({ id: "p", entreprise: "Laserax", perimeeLe: "2026-07-01T00:00:00.000Z" }),
      ],
      ENTREPRISES_CIBLES,
      positions([["Laserax", "exacte", 46.75, -71.29]]),
    );
    expect(vue.epingles[0]!.entreprises[0]!.offres).toEqual([]);
  });

  it("range les épingles dans un ordre STABLE", () => {
    const pos = positions([
      ["Laserax", "exacte", 46.75, -71.29],
      ["Chantier Davie", "exacte", 46.73, -71.18],
    ]);
    const entrees = [offre({ id: "a", entreprise: "Laserax" }), offre({ id: "b", entreprise: "Chantier Davie" })];
    const a = construireVue(entrees, ENTREPRISES_CIBLES, pos).epingles.map((e) => e.entreprises[0]!.nom);
    const b = construireVue([...entrees].reverse(), ENTREPRISES_CIBLES, pos).epingles.map(
      (e) => e.entreprises[0]!.nom,
    );
    expect(a).toEqual(b);
  });
});

describe("ce qui manque est COMPTÉ, jamais masqué", () => {
  it("liste les entreprises cibles encore à situer", () => {
    const vue = construireVue([], ENTREPRISES_CIBLES, new Map());
    expect(vue.epingles).toEqual([]);
    expect(vue.aSituer.length).toBe(ENTREPRISES_CIBLES.length);
  });

  it("signale un employeur d'offre vivante hors des cibles, sans doublon", () => {
    const vue = construireVue(
      [
        offre({ id: "1", entreprise: "Employeur Jamais Vu" }),
        offre({ id: "2", entreprise: "Employeur Jamais Vu" }),
      ],
      ENTREPRISES_CIBLES,
      new Map(),
    );
    expect(vue.horsCibles).toEqual(["Employeur Jamais Vu"]);
  });

  it("aucune offre vivante ne disparaît : épinglée, hors cibles, ou en attente", () => {
    // L'invariant qui compte, sur le VRAI jeu — PLUS deux offres d'un MÊME employeur hors
    // cibles. La revue a montré (sonde) que la première version additionnait un compte
    // d'OFFRES à `horsCibles.length`, un compte de NOMS dédupliqués : invariant vacant dès
    // qu'un employeur hors cibles porte deux offres. On compte donc PAR OFFRE, des deux
    // côtés, et l'égalité est EXACTE — toutes les cibles étant situées, chaque offre
    // vivante est soit épinglée, soit hors cibles, jamais un troisième état.
    const vivantes = [
      ...SEED.filter((o) => !o.histo && o.perimeeLe === null),
      offre({ id: "hc-1", entreprise: "Employeur Jamais Vu" }),
      offre({ id: "hc-2", entreprise: "Employeur Jamais Vu" }),
    ];
    const pos = positions(ENTREPRISES_CIBLES.map((c) => [c.nom, "exacte", 46.8, -71.2]));
    const vue = construireVue(vivantes, ENTREPRISES_CIBLES, pos);
    const epinglees = vue.epingles.reduce(
      (n, e) => n + e.entreprises.reduce((m, x) => m + x.offres.length, 0),
      0,
    );
    const horsCiblesParOffre = vivantes.filter(
      (o) => !ENTREPRISES_CIBLES.some((c) => apparier(o.entreprise, c.nom)),
    ).length;
    // L'entrée piège est bien dans le jeu : sans elle, ce test redeviendrait le précédent.
    expect(horsCiblesParOffre).toBeGreaterThanOrEqual(2);
    expect(epinglees + horsCiblesParOffre).toBe(vivantes.length);
    expect(vue.aSituer).toEqual([]);
  });
});

describe("garde-fou n°1 — la carte ne dit rien du domicile", () => {
  it("le cadrage se déduit des ENTREPRISES, jamais d'un point de référence", () => {
    const vue = construireVue(
      [],
      ENTREPRISES_CIBLES,
      positions([
        ["Laserax", "exacte", 46.75, -71.29],
        ["Chantier Davie", "exacte", 46.73, -71.18],
      ]),
    );
    const c = cadrage(vue.epingles)!;
    // Les bornes sont EXACTEMENT celles des épingles : aucun point supplémentaire n'entre
    // dans le calcul. Un cadrage élargi pour « inclure le domicile » le révélerait.
    expect(c.latMin).toBe(46.73);
    expect(c.latMax).toBe(46.75);
    expect(c.lonMin).toBe(-71.29);
    expect(c.lonMax).toBe(-71.18);
  });

  it("une offre épinglée ne transporte que ses faits — ni notes, ni note personnelle", () => {
    const vue = construireVue(
      [offre({ entreprise: "Laserax", userNote: "personnel", notes: "recherche" })],
      ENTREPRISES_CIBLES,
      positions([["Laserax", "exacte", 46.75, -71.29]]),
    );
    const champs = Object.keys(vue.epingles[0]!.entreprises[0]!.offres[0]!);
    expect(champs.sort()).toEqual(["entreprise", "id", "km", "poste", "score", "statut"]);
  });

  it("rend null sans épingle, plutôt qu'un centre arbitraire", () => {
    expect(cadrage([])).toBeNull();
  });
});
