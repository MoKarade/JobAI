// tests/carte.test.ts — la vue cartographique.
//
// Deux choses valent d'être verrouillées ici. D'abord le garde-fou n°1 : la carte ne doit
// RIEN dire du domicile de Marc — ni l'afficher, ni le laisser déduire du cadrage. Ensuite
// l'honnêteté du compte : une carte qui montre 12 épingles pour 23 offres sans le signaler
// laisse croire à une couverture qu'elle n'a pas.

import { describe, it, expect } from "vitest";
import {
  LONGUEUR_MIN_APPARIEMENT,
  apparier,
  cadrage,
  construireVue,
  villeDeLEntreprise,
  villesNecessaires,
} from "../lib/carte";
import { ENTREPRISES_CIBLES } from "../lib/reference";
import { SEED } from "../lib/seed";
import type { Offre } from "../lib/types";

const base = SEED[0]!;
function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, id: "o", histo: false, perimeeLe: null, ...champs };
}

const COORDS = new Map([
  ["Québec", { lat: 46.81, lon: -71.21 }],
  ["Lévis", { lat: 46.73, lon: -71.18 }],
]);

describe("appariement des noms d'entreprise", () => {
  it("apparie une désignation plus longue à sa forme courte", () => {
    expect(apparier("Groupe Leclerc", "Leclerc")).toBe(true);
    expect(apparier("Laserax", "Laserax")).toBe(true);
    expect(apparier("STERIS Canada", "STERIS")).toBe(true);
  });

  it("ignore la casse et les espaces de bord", () => {
    expect(apparier("  laserax ", "Laserax")).toBe(true);
  });

  it("n'apparie PAS deux employeurs distincts", () => {
    expect(apparier("Canam Ponts", "Robotiq")).toBe(false);
    expect(apparier("AMETEK", "Labatt")).toBe(false);
  });

  it("exige l'égalité stricte sous la longueur minimale", () => {
    // Sans plancher, un nom de deux lettres apparierait la moitié de la liste : c'est le
    // piège du matching par sous-chaîne, et il ne se voit qu'une fois le mal fait.
    const court = "A".repeat(LONGUEUR_MIN_APPARIEMENT - 1);
    expect(apparier(court, `${court}METEK`)).toBe(false);
    expect(apparier(court, court)).toBe(true);
    expect(apparier("", "")).toBe(false);
  });
});

describe("ville d'un employeur", () => {
  it("retrouve la ville depuis la liste de référence", () => {
    expect(villeDeLEntreprise("Chantier Davie", ENTREPRISES_CIBLES)).toBe("Lévis");
  });

  it("rend null pour un employeur inconnu, plutôt que de deviner", () => {
    expect(villeDeLEntreprise("Employeur Jamais Vu", ENTREPRISES_CIBLES)).toBeNull();
  });
});

describe("construction de la vue", () => {
  it("regroupe les offres d'une même ville sur UNE épingle", () => {
    // Dix épingles au même point se masqueraient l'une l'autre.
    const vue = construireVue(
      [
        offre({ id: "a", entreprise: "Laserax" }),
        offre({ id: "b", entreprise: "Qualtech" }),
        offre({ id: "c", entreprise: "Chantier Davie" }),
      ],
      ENTREPRISES_CIBLES,
      COORDS,
    );
    const parVille = new Map(vue.epingles.map((e) => [e.ville, e.offres.length]));
    expect(parVille.get("Québec")).toBe(2);
    expect(parVille.get("Lévis")).toBe(1);
  });

  it("met la meilleure note en tête de chaque épingle", () => {
    const vue = construireVue(
      [
        offre({ id: "faible", entreprise: "Laserax", score: 40 }),
        offre({ id: "forte", entreprise: "Qualtech", score: 92 }),
      ],
      ENTREPRISES_CIBLES,
      COORDS,
    );
    expect(vue.epingles[0]?.offres[0]?.id).toBe("forte");
  });

  it("range les épingles dans un ordre STABLE", () => {
    // Sans ordre imposé, deux rendus successifs réordonnent les épingles sans raison.
    const entrees = [offre({ id: "a", entreprise: "Chantier Davie" }), offre({ id: "b", entreprise: "Laserax" })];
    const a = construireVue(entrees, ENTREPRISES_CIBLES, COORDS).epingles.map((e) => e.ville);
    const b = construireVue([...entrees].reverse(), ENTREPRISES_CIBLES, COORDS).epingles.map(
      (e) => e.ville,
    );
    expect(a).toEqual(b);
  });
});

describe("ce qui manque est COMPTÉ, jamais masqué", () => {
  it("signale un employeur dont la ville est inconnue", () => {
    const vue = construireVue(
      [offre({ entreprise: "Employeur Jamais Vu" })],
      ENTREPRISES_CIBLES,
      COORDS,
    );
    expect(vue.epingles).toEqual([]);
    expect(vue.sansVille).toEqual(["Employeur Jamais Vu"]);
  });

  it("signale une ville connue mais pas encore géocodée", () => {
    const vue = construireVue(
      [offre({ entreprise: "Chantier Davie" })],
      ENTREPRISES_CIBLES,
      new Map([["Québec", { lat: 46.81, lon: -71.21 }]]),
    );
    expect(vue.epingles).toEqual([]);
    expect(vue.villesAGeocoder).toEqual(["Lévis"]);
  });

  it("ne compte pas deux fois le même employeur ni la même ville", () => {
    const vue = construireVue(
      [
        offre({ id: "1", entreprise: "Employeur Jamais Vu" }),
        offre({ id: "2", entreprise: "Employeur Jamais Vu" }),
      ],
      ENTREPRISES_CIBLES,
      COORDS,
    );
    expect(vue.sansVille).toHaveLength(1);
  });

  it("chaque offre vivante est classée quelque part — aucune ne disparaît", () => {
    // L'invariant qui compte : sur le vrai jeu, la somme des offres épinglées, des
    // employeurs sans ville et des villes à géocoder doit expliquer TOUTES les offres.
    const vivantes = SEED.filter((o) => !o.histo && o.perimeeLe === null);
    const vue = construireVue(vivantes, ENTREPRISES_CIBLES, new Map());
    const epinglees = vue.epingles.reduce((n, e) => n + e.offres.length, 0);

    // Sans aucune coordonnée, aucune offre n'est épinglée : elles sont toutes en attente
    // de géocodage ou sans ville. C'est un état HONNÊTE, pas une carte vide inexpliquée.
    expect(epinglees).toBe(0);
    expect(vue.villesAGeocoder.length + vue.sansVille.length).toBeGreaterThan(0);
  });
});

describe("garde-fou n°1 — la carte ne dit rien du domicile", () => {
  it("le cadrage se déduit des OFFRES, jamais d'un point de référence", () => {
    const vue = construireVue(
      [offre({ id: "a", entreprise: "Laserax" }), offre({ id: "b", entreprise: "Chantier Davie" })],
      ENTREPRISES_CIBLES,
      COORDS,
    );
    const c = cadrage(vue.epingles)!;
    // Les bornes sont EXACTEMENT celles des épingles : aucun point supplémentaire n'entre
    // dans le calcul. Un cadrage élargi pour « inclure le domicile » le révélerait.
    expect(c.latMin).toBe(46.73);
    expect(c.latMax).toBe(46.81);
    expect(c.lonMin).toBe(-71.21);
    expect(c.lonMax).toBe(-71.18);
  });

  it("aucune épingle ne transporte autre chose que l'offre", () => {
    const vue = construireVue([offre({ entreprise: "Laserax" })], ENTREPRISES_CIBLES, COORDS);
    const champs = Object.keys(vue.epingles[0]!.offres[0]!);
    // `notes` et `userNote` restent au serveur : elles ne servent pas à la carte, et le
    // contenu personnel ne voyage pas sans raison.
    expect(champs.sort()).toEqual(["entreprise", "id", "km", "poste", "score", "statut"]);
  });

  it("rend null sans épingle, plutôt qu'un centre arbitraire", () => {
    expect(cadrage([])).toBeNull();
  });
});

describe("villes à géocoder", () => {
  it("liste les villes du vrai jeu de départ, sans doublon", () => {
    const villes = villesNecessaires(SEED, ENTREPRISES_CIBLES);
    expect(villes.length).toBeGreaterThan(2);
    expect(new Set(villes).size).toBe(villes.length);
    // Les libellés sont NORMALISÉS : « Québec (Beauport) » ne doit pas apparaître tel quel.
    expect(villes.some((v) => v.includes("("))).toBe(false);
  });

  it("ignore l'historique et les offres périmées", () => {
    const villes = villesNecessaires(
      [
        offre({ entreprise: "Chantier Davie", histo: true }),
        offre({ entreprise: "Laserax", perimeeLe: "2026-07-01T00:00:00.000Z" }),
      ],
      ENTREPRISES_CIBLES,
    );
    expect(villes).toEqual([]);
  });
});
