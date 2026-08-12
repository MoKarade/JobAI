// tests/distances.test.ts — la distance est le critère n°1, et elle était absente.
//
// Les 40 offres entrées le 2026-07-31 portent `km: null`. Le barème donne 10 points sur 20
// à une distance INCONNUE — autant qu'à 25 km. Une offre hors rayon pouvait donc figurer
// haut dans la liste, sur le critère que Marc place en premier.
//
// Ces tests portent sur la DÉCISION (quoi calculer, quoi ne pas toucher), pas sur la
// trigonométrie : `distanceKm` est déjà testée dans `geocodage.test.ts`.

import { describe, it, expect } from "vitest";
import {
  arrondirKm,
  employeursASituer,
  invaliderDistancesPrecisees,
  planifierDistances,
  scoreAvecDistance,
  type Position,
} from "../lib/distances";
import { SEED } from "../lib/seed";
import type { Offre } from "../lib/types";

const base = SEED[0]!;
function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, id: "o", histo: false, km: null, scoreSource: "calcule", ...champs };
}

const POS_PROCHE: Position = { lat: 46.81, lon: -71.21, precision: "exacte" };
const POS_VILLE: Position = { lat: 46.75, lon: -71.3, precision: "ville" };

/** Distance simulée : la vraie vient de `distanceKm`, testée ailleurs. */
const dist = (km: number) => () => km;

describe("ce qui reçoit une distance", () => {
  it("une offre sans distance dont l'employeur est situé", () => {
    const o = offre({ id: "a", entreprise: "Exemple inc." });
    const majs = planifierDistances([o], new Map([["Exemple inc.", POS_PROCHE]]), dist(12.34));
    expect(majs).toHaveLength(1);
    expect(majs[0]!.km).toBe(12.3); // arrondi au dixième
    expect(majs[0]!.precision).toBe("exacte");
  });

  it("la précision de la position est reportée : une adresse exacte n'est pas un centre-ville", () => {
    const o = offre({ id: "a", entreprise: "X" });
    const majs = planifierDistances([o], new Map([["X", POS_VILLE]]), dist(20));
    expect(majs[0]!.precision).toBe("ville");
  });
});

describe("ce qu'on ne touche JAMAIS", () => {
  it("une distance déjà connue reste — elle vient d'un relevé de Marc", () => {
    const o = offre({ id: "a", entreprise: "X", km: 33 });
    expect(planifierDistances([o], new Map([["X", POS_PROCHE]]), dist(12))).toEqual([]);
  });

  it("les candidatures de 2025 n'ont pas de distance à porter", () => {
    const o = offre({ id: "h", entreprise: "X", histo: true });
    expect(planifierDistances([o], new Map([["X", POS_PROCHE]]), dist(12))).toEqual([]);
  });

  it("un employeur non situé est laissé tel quel, sans distance inventée", () => {
    const o = offre({ id: "a", entreprise: "Inconnue" });
    expect(planifierDistances([o], new Map(), dist(12))).toEqual([]);
  });

  it("une distance ABERRANTE n'est pas écrite", () => {
    // Un homonyme d'un autre continent, ou un signe inversé : un seul chiffre absurde
    // ferait douter de tous les autres.
    const o = offre({ id: "a", entreprise: "X" });
    expect(planifierDistances([o], new Map([["X", POS_PROCHE]]), dist(4000))).toEqual([]);
    expect(planifierDistances([o], new Map([["X", POS_PROCHE]]), dist(NaN))).toEqual([]);
    expect(planifierDistances([o], new Map([["X", POS_PROCHE]]), dist(-3))).toEqual([]);
  });
});

describe("la note qui suit la distance", () => {
  it("une note CALCULÉE est recalculée avec la vraie distance", () => {
    const o = offre({ poste: "Coordonnateur de projets en automatisation", score: 70 });
    const proche = scoreAvecDistance(o, 5);
    const loin = scoreAvecDistance(o, 48);
    expect(proche).not.toBeNull();
    expect(loin).not.toBeNull();
    // Le barème doit préférer le proche : c'est tout l'intérêt de mesurer.
    expect(proche!).toBeGreaterThan(loin!);
  });

  it("une note MANUELLE n'est jamais écrasée", () => {
    // Elle vient de la lecture de Marc et fait autorité sur toute note calculée — le
    // barème plafonne d'ailleurs les calculées à 85 pour cette raison même.
    const o = offre({ scoreSource: "manuel", score: 92 });
    expect(scoreAvecDistance(o, 5)).toBeNull();
  });

  it("la note recalculée reste sous le plafond des notes calculées", () => {
    const o = offre({ poste: "Coordonnateur de projets en automatisation robotique" });
    expect(scoreAvecDistance(o, 1)!).toBeLessThanOrEqual(85);
  });
});

describe("les employeurs à situer", () => {
  it("liste ceux qui manquent, avec leur ville", () => {
    // Les offres ingérées amènent des employeurs hors des cibles de Marc : sans leur
    // position, leur distance reste inconnue à vie.
    const offres = [
      offre({ id: "a", entreprise: "ISS" }),
      offre({ id: "b", entreprise: "LSM" }),
      offre({ id: "c", entreprise: "Déjà située" }),
    ];
    const positions = new Map([["Déjà située", POS_PROCHE]]);
    const villes: Record<string, string> = { ISS: "Québec", LSM: "Québec" };

    const a = employeursASituer(offres, positions, (e) => villes[e] ?? null);
    expect(a.map((x) => x.nom)).toEqual(["ISS", "LSM"]);
  });

  it("n'en demande pas deux fois le même", () => {
    const offres = [
      offre({ id: "a", entreprise: "ISS" }),
      offre({ id: "b", entreprise: "ISS" }),
    ];
    const a = employeursASituer(offres, new Map(), () => "Québec");
    expect(a).toHaveLength(1);
  });

  it("SAUTE un employeur sans ville — sinon la recherche est ingouvernable", () => {
    // « ISS » sans ville, c'est une recherche mondiale : Nominatim rendrait n'importe quoi,
    // et la garde de plausibilité le rejetterait après coup. Autant ne pas demander.
    const a = employeursASituer([offre({ entreprise: "ISS" })], new Map(), () => null);
    expect(a).toEqual([]);
  });
});

describe("invaliderDistancesPrecisees — la distance qui suit la précision", () => {
  // Chantier #07 / [CARTE-03], 2026-08-12, mesuré en production : deux entreprises passées
  // de « ville » (centre-ville) à « exacte » dans la même passe, `mesurees=0` — rien ne
  // redemandait leur distance. Discriminant : SANS cette fonction, la ligne ci-dessous
  // (`km: 12`) resterait à 12 pour toujours, quelle que soit la précision de la position.

  it("efface la distance d'une offre dont l'employeur vient d'être précisé", () => {
    const o = offre({ id: "a", entreprise: "X", km: 12 });
    const r = invaliderDistancesPrecisees([o], ["X"]);
    expect(r[0]!.km).toBeNull();
  });

  it("reconnaît l'employeur sous une variante — même règle que positionDe (memeEmployeur)", () => {
    const o = offre({ id: "a", entreprise: "Laserax inc.", km: 12 });
    const r = invaliderDistancesPrecisees([o], ["Laserax"]);
    expect(r[0]!.km).toBeNull();
  });

  it("ne touche PAS une offre dont l'employeur n'a pas été précisé cette passe", () => {
    const o = offre({ id: "a", entreprise: "Y", km: 12 });
    const r = invaliderDistancesPrecisees([o], ["X"]);
    expect(r[0]!.km).toBe(12);
  });

  it("ne touche pas une offre déjà sans distance — rien à invalider", () => {
    const o = offre({ id: "a", entreprise: "X", km: null });
    const r = invaliderDistancesPrecisees([o], ["X"]);
    expect(r[0]!.km).toBeNull();
  });

  it("liste vide de précisées : rend le tableau tel quel, sans travail inutile", () => {
    const o = offre({ id: "a", entreprise: "X", km: 12 });
    const r = invaliderDistancesPrecisees([o], []);
    expect(r).toEqual([o]);
  });

  it("plusieurs offres, une seule entreprise précisée : seule la sienne est effacée", () => {
    const a = offre({ id: "a", entreprise: "X", km: 12 });
    const b = offre({ id: "b", entreprise: "Y", km: 8 });
    const r = invaliderDistancesPrecisees([a, b], ["X"]);
    expect(r.find((o) => o.id === "a")!.km).toBeNull();
    expect(r.find((o) => o.id === "b")!.km).toBe(8);
  });
});

describe("arrondi", () => {
  it("au dixième : « 12,3 km » est honnête, « 12,3184 km » ne l'est pas", () => {
    expect(arrondirKm(12.3184)).toBe(12.3);
    expect(arrondirKm(0.04)).toBe(0);
  });
});

describe("un employeur situé sous un AUTRE nom est quand même reconnu", () => {
  // Deux chemins géocodent sans employer le même nom : la passe de la carte inscrit le nom
  // de la liste de chasse (« Laserax »), la mesure inscrit celui de l'annonce (« Laserax
  // inc. »). La comparaison littérale d'avant faisait deux dégâts silencieux, tous deux
  // mesurés par la revue : l'offre restait sans distance, et l'entreprise était renvoyée
  // au géocodage alors que sa position existait déjà.

  it("mesure la distance à partir de la position inscrite sous l'autre nom", () => {
    const majs = planifierDistances(
      [offre({ id: "a", entreprise: "Laserax inc." })],
      new Map([["Laserax", POS_PROCHE]]),
      dist(9.4),
    );
    expect(majs.map((m) => m.id)).toEqual(["a"]);
    expect(majs[0]!.km).toBe(9.4);
  });

  it("ne le renvoie PAS au géocodage : sa position est connue", () => {
    const r = employeursASituer(
      [offre({ id: "a", entreprise: "Laserax inc." })],
      new Map([["Laserax", POS_PROCHE]]),
      () => "Québec",
    );
    expect(r).toEqual([]);
  });

  it("mais un employeur réellement inconnu reste à situer", () => {
    // Sans ce cas, le test précédent passerait aussi si la fonction ne rendait plus jamais
    // rien — l'assertion serait vraie et vide de sens.
    const r = employeursASituer(
      [offre({ id: "a", entreprise: "Employeur Jamais Vu" })],
      new Map([["Laserax", POS_PROCHE]]),
      () => "Québec",
    );
    expect(r).toEqual([{ nom: "Employeur Jamais Vu", ville: "Québec" }]);
  });
});
