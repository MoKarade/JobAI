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
  centreDuCadrage,
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
  entrees: [string, "exacte" | "ville", number, number, (string | null)?][],
): Map<string, PositionEntreprise> {
  return new Map(
    entrees.map(([nom, precision, lat, lon, adresse]) => [
      nom,
      {
        lat,
        lon,
        precision,
        adresse: adresse ?? null,
        // La source suit l'adresse, ici comme en base : la contrainte l'exige, et une
        // fixture qui s'en affranchirait testerait un état que la base refuse.
        adresseSource: adresse ? ("osm" as const) : null,
        bornes: null,
      },
    ]),
  );
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

  it("un employeur hors cibles AVEC ville attend une passe, sans doublon", () => {
    const vue = construireVue(
      [
        offre({ id: "1", entreprise: "Employeur Jamais Vu", ville: "Lévis" }),
        offre({ id: "2", entreprise: "Employeur Jamais Vu", ville: "Lévis" }),
      ],
      ENTREPRISES_CIBLES,
      new Map(),
    );
    expect(vue.aSituer).toContain("Employeur Jamais Vu");
    expect(vue.sansLieu).toEqual([]);
    // Une seule entrée pour deux offres : c'est un compte de NOMS.
    expect(vue.aSituer.filter((n) => n === "Employeur Jamais Vu")).toHaveLength(1);
  });

  it("un employeur SANS ville est insituable, et c'est un manque DIFFÉRENT", () => {
    // La distinction n'est pas cosmétique : `aSituer` se règle à la prochaine passe,
    // `sansLieu` jamais tant que la source n'annonce pas de ville. Les confondre ferait
    // attendre un remède qui ne viendra pas.
    const vue = construireVue(
      [offre({ id: "1", entreprise: "Employeur Jamais Vu", ville: null })],
      ENTREPRISES_CIBLES,
      new Map(),
    );
    expect(vue.sansLieu).toEqual(["Employeur Jamais Vu"]);
    expect(vue.aSituer).not.toContain("Employeur Jamais Vu");
  });

  it("aucune offre vivante ne disparaît : épinglée, à situer, ou insituable", () => {
    // L'invariant qui compte, sur le VRAI jeu — PLUS deux offres d'un MÊME employeur hors
    // cibles. La revue a montré (sonde) qu'une première version additionnait un compte
    // d'OFFRES à un compte de NOMS dédupliqués : invariant vacant dès qu'un employeur hors
    // cibles porte deux offres. On compte donc PAR OFFRE des deux côtés, et l'égalité est
    // EXACTE — chaque offre vivante est dans un état, jamais un quatrième.
    const vivantes = [
      ...SEED.filter((o) => !o.histo && o.perimeeLe === null),
      offre({ id: "hc-1", entreprise: "Employeur Jamais Vu", ville: "Lévis" }),
      offre({ id: "hc-2", entreprise: "Employeur Jamais Vu", ville: "Lévis" }),
    ];
    const pos = positions(ENTREPRISES_CIBLES.map((c) => [c.nom, "exacte", 46.8, -71.2]));
    const vue = construireVue(vivantes, ENTREPRISES_CIBLES, pos);

    const epinglees = vue.epingles.reduce(
      (n, e) => n + e.entreprises.reduce((m, x) => m + x.offres.length, 0),
      0,
    );
    const enAttente = new Set([...vue.aSituer, ...vue.sansLieu]);
    const enAttenteParOffre = vivantes.filter((o) => {
      const cible = ENTREPRISES_CIBLES.find((c) => apparier(o.entreprise, c.nom));
      return enAttente.has(cible?.nom ?? o.entreprise);
    }).length;

    // L'entrée piège est bien dans le jeu : sans elle, ce test ne mesurerait plus rien.
    expect(enAttenteParOffre).toBeGreaterThanOrEqual(2);
    expect(epinglees + enAttenteParOffre).toBe(vivantes.length);
  });
});

describe("la carte part des OFFRES, pas d'une liste tenue à la main", () => {
  // Demande de Marc du 2026-07-31 : « je veux que pour toutes les offres elles soient
  // visibles sur la carte ». La version précédente bouclait sur les seules entreprises
  // cibles — un employeur apporté par l'ingestion restait invisible même une fois situé.
  it("un employeur hors cibles APPARAÎT dès qu'il a une position", () => {
    const vue = construireVue(
      [offre({ id: "1", entreprise: "ISS", poste: "Technicien", ville: "Québec", km: 9.4 })],
      ENTREPRISES_CIBLES,
      positions([["ISS", "exacte", 46.81, -71.22]]),
    );

    const epingle = vue.epingles.find((e) => e.entreprises.some((x) => x.nom === "ISS"));
    expect(epingle, "un employeur hors cibles doit être sur la carte").toBeDefined();
    const iss = epingle!.entreprises.find((x) => x.nom === "ISS")!;
    expect(iss.offres.map((o) => o.poste)).toEqual(["Technicien"]);
    expect(vue.aSituer).not.toContain("ISS");
    expect(vue.sansLieu).toEqual([]);
  });

  it("reprend la distance MESURÉE de ses offres, faute de distance de référence", () => {
    // Sans ça, la fiche dirait « distance non mesurée » à côté d'offres qui affichent leur
    // km — et un employeur hors liste paraîtrait moins renseigné qu'il ne l'est.
    const vue = construireVue(
      [offre({ id: "1", entreprise: "ISS", ville: "Québec", km: 9.4 })],
      ENTREPRISES_CIBLES,
      positions([["ISS", "exacte", 46.81, -71.22]]),
    );
    const iss = vue.epingles.flatMap((e) => e.entreprises).find((x) => x.nom === "ISS")!;
    expect(iss.km).toBe(9.4);
  });

  it("n'INVENTE pas de distance quand aucune offre n'en porte", () => {
    const vue = construireVue(
      [offre({ id: "1", entreprise: "ISS", ville: "Québec", km: null })],
      ENTREPRISES_CIBLES,
      positions([["ISS", "exacte", 46.81, -71.22]]),
    );
    const iss = vue.epingles.flatMap((e) => e.entreprises).find((x) => x.nom === "ISS")!;
    expect(iss.km).toBeNull();
  });

  it("retrouve la position inscrite sous le nom que porte l'OFFRE", () => {
    // Deux chemins géocodent : la passe de la carte inscrit `cible.nom`, la mesure des
    // distances inscrit `offre.entreprise`. Une entreprise cible dont seule la seconde a
    // tourné serait dite « à situer » alors que sa position existe déjà.
    const vue = construireVue(
      [offre({ id: "1", entreprise: "Laserax inc.", ville: "Québec" })],
      ENTREPRISES_CIBLES,
      positions([["Laserax inc.", "exacte", 46.75, -71.29]]),
    );
    expect(vue.aSituer).not.toContain("Laserax");
    expect(vue.epingles.flatMap((e) => e.entreprises).some((x) => x.nom === "Laserax")).toBe(
      true,
    );
  });

  it("deux NOMS du même employeur hors cibles ne font qu'UNE épingle", () => {
    // Deux sources nomment le même employeur différemment. Sans appariement entre
    // employeurs hors cibles, la carte porterait deux épingles pour un seul lieu — et
    // chacune aurait coûté un géocodage. Vérifié par sonde avant correction : 2 épingles.
    const vue = construireVue(
      [
        offre({ id: "1", entreprise: "Groupe Test", ville: "Québec" }),
        offre({ id: "2", entreprise: "Groupe Test Canada", ville: "Québec" }),
      ],
      ENTREPRISES_CIBLES,
      positions([["Groupe Test", "exacte", 46.81, -71.22]]),
    );
    const avecTest = vue.epingles.filter((e) =>
      e.entreprises.some((x) => x.nom.startsWith("Groupe Test")),
    );
    expect(avecTest).toHaveLength(1);
    expect(avecTest[0]!.entreprises[0]!.offres).toHaveLength(2);
  });

  it("mais un SIGLE court ne fusionne pas : sous quatre lettres, tout apparierait", () => {
    // Le plancher de longueur est un garde-fou, pas une lacune : « ISS » apparierait la
    // moitié de la liste par sous-chaîne. Le comportement est donc assumé et testé.
    expect(apparier("ISS", "ISS Facility Services")).toBe(false);
  });

  it("une cible SANS offre reste affichée : c'est la liste de chasse", () => {
    const vue = construireVue(
      [],
      ENTREPRISES_CIBLES,
      positions([["Laserax", "exacte", 46.75, -71.29]]),
    );
    const laserax = vue.epingles.flatMap((e) => e.entreprises).find((x) => x.nom === "Laserax");
    expect(laserax).toBeDefined();
    expect(laserax!.offres).toEqual([]);
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

/**
 * Une adresse d'EXEMPLE, marquée comme telle.
 *
 * Le garde-fou n°1 (`tests/piiGuard.test.ts`) scanne les fichiers versionnés et ne
 * distingue pas une adresse inventée d'une vraie — c'est exactement ce qui le rend utile.
 * La convention du dépôt est donc « tout exemple porte un marqueur » ; le mot « exemple »
 * en est un.
 */
const ADRESSE_EXEMPLE = "adresse d'exemple, telle qu'OpenStreetMap la rendrait";

describe("l'adresse, quand on la connaît", () => {
  // Demande de Marc (2026-07-31) : « je n'ai pas toutes les adresses, ça me les prend ».
  // OpenStreetMap la donne au moment du géocodage ; on la jetait.

  it("porte l'adresse d'une position EXACTE", () => {
    const vue = construireVue(
      [offre({ id: "1", entreprise: "Laserax" })],
      ENTREPRISES_CIBLES,
      positions([["Laserax", "exacte", 46.75, -71.29, ADRESSE_EXEMPLE]]),
    );
    const x = vue.epingles.flatMap((e) => e.entreprises).find((e) => e.nom === "Laserax")!;
    expect(x.adresse).toBe(ADRESSE_EXEMPLE);
  });

  it("ne porte AUCUNE adresse sur un repli au centre-ville", () => {
    // Le point qui compte : afficher l'adresse de la mairie comme celle d'une usine serait
    // une donnée plausible et fausse. `deciderPrecision` la met déjà à null en amont ; ici
    // on vérifie que rien ne la réintroduit par un autre chemin.
    const vue = construireVue(
      [offre({ id: "1", entreprise: "Laserax" })],
      ENTREPRISES_CIBLES,
      positions([["Laserax", "ville", 46.81, -71.22, null]]),
    );
    const x = vue.epingles.flatMap((e) => e.entreprises).find((e) => e.nom === "Laserax")!;
    expect(x.adresse).toBeNull();
  });

  it("une entreprise pas encore située n'a évidemment pas d'adresse", () => {
    const vue = construireVue([], ENTREPRISES_CIBLES, new Map());
    expect(vue.aSituer.length).toBeGreaterThan(0);
    expect(vue.epingles).toEqual([]);
  });
});

describe("centre du cadrage — garde-fou n°1", () => {
  // Il sert à ouvrir une carte EXTERNE (le trafic, qu'OpenStreetMap ne fournit pas). Une
  // URL se partage, se met en favori et finit dans un historique : elle ne doit donc rien
  // porter du domicile.

  it("est le milieu des épingles, jamais un point de référence", () => {
    const c = centreDuCadrage({ latMin: 46.7, latMax: 46.9, lonMin: -71.4, lonMax: -71.2 })!;
    // `toBeCloseTo` et non `toEqual` : (-71.4 + -71.2) / 2 vaut -71.30000000000001 en
    // virgule flottante. Comparer à l'exact ferait échouer un calcul pourtant juste.
    expect(c.lat).toBeCloseTo(46.8, 6);
    expect(c.lon).toBeCloseTo(-71.3, 6);
  });

  it("tient sur une seule épingle", () => {
    const c = centreDuCadrage({ latMin: 46.8, latMax: 46.8, lonMin: -71.2, lonMax: -71.2 })!;
    expect(c.lat).toBeCloseTo(46.8, 6);
    expect(c.lon).toBeCloseTo(-71.2, 6);
  });

  it("rend null sans cadrage plutôt qu'un point arbitraire", () => {
    expect(centreDuCadrage(null)).toBeNull();
  });

  it("suit VRAIMENT les épingles : deux jeux distincts donnent deux centres distincts", () => {
    // Discrimination : sans ce cas, une implémentation qui rendrait toujours le centre de
    // Québec passerait les trois précédents.
    const quebec = centreDuCadrage(
      cadrage([...positions([["A", "exacte", 46.7, -71.4], ["B", "exacte", 46.9, -71.2]]).values()]
        .map((p) => ({ ...p, ville: "Québec", entreprises: [] }))),
    )!;
    const montreal = centreDuCadrage({ latMin: 45.4, latMax: 45.6, lonMin: -73.7, lonMax: -73.5 })!;
    expect(quebec.lat).toBeCloseTo(46.8, 6);
    expect(quebec.lat).not.toBeCloseTo(montreal.lat, 1);
  });
});
