// tests/distancePostale.test.ts — une distance approchée par le début du code postal (ADR-0040, JobAI#92).
//
// Ce qui se prouve ici : le début de code se lit sans rien inventer, la table couvre ce que le diagnostic de passe du 2026-10-21
// compte, le repli ne passe QU'APRÈS la mesure de l'employeur, une mesure remplace l'approximation, et l'approximation ne devient
// jamais la distance d'un employeur. Pur, sans base ni réseau.

import { describe, it, expect } from "vitest";
import { PROFIL_DEFAUT } from "../lib/profil";
import { centreDeCodePostal, debutCodePostal } from "../lib/codePostal";
import { CENTRES_FSA_QUEBEC } from "../lib/data/fsaQuebec";
import {
  employeursASituer,
  invaliderDistancesImplausibles,
  invaliderDistancesPrecisees,
  planifierDistances,
  type Position,
} from "../lib/distances";
import { codesPostauxARattraper, trier } from "../lib/ingest/pipeline";
import { kmVirgule } from "../lib/kmVirgule";
import { vueOffre } from "../lib/mcp/vue";
import { SEED } from "../lib/seed";
import { OffreSchema, type Offre } from "../lib/types";
import type { OffreBrute } from "../lib/ingest/types";

const base = SEED[0]!;
function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, id: "o", histo: false, km: null, kmSource: null, scoreSource: "calcule", ...champs };
}

const POS_EXACTE: Position = { lat: 46.81, lon: -71.21, precision: "exacte" };
const BAREME = { profil: PROFIL_DEFAUT, metiers: [] as string[] };
const CENTRE_INCONNU = () => null;
/** Distance simulée : la vraie vient de `distanceKm`, testée ailleurs. */
const dist = (km: number) => () => km;

describe("le début d'un code postal", () => {
  it("se lit sans tenir compte des espaces ni de la casse, et ne garde que trois caractères", () => {
    expect(debutCodePostal("J0T1L0")).toBe("J0T");
    expect(debutCodePostal("g1v 4g6")).toBe("G1V");
    expect(debutCodePostal(" G1V ")).toBe("G1V");
  });

  it("rend null devant tout ce qui n'a pas la forme lettre-chiffre-lettre (échec fermé)", () => {
    for (const mauvais of ["", "   ", "12345", "G1", "1GV", "GGG", "G1", null, undefined]) {
      expect(debutCodePostal(mauvais)).toBeNull();
    }
  });

  it("n'invente pas un centre pour un code hors du Québec ou absent de la table", () => {
    expect(centreDeCodePostal("K1A0B1")).toBeNull(); // Ottawa : forme valide, hors table
    expect(centreDeCodePostal("G9Z9Z9")).toBeNull(); // forme valide, pas dans la source
    expect(centreDeCodePostal("")).toBeNull();
    expect(centreDeCodePostal(null)).toBeNull();
  });
});

describe("la table des centres", () => {
  const lignes = Object.entries(CENTRES_FSA_QUEBEC);

  it("porte au moins 400 débuts du Québec, aux bandes G, H et J seulement", () => {
    expect(lignes.length).toBeGreaterThanOrEqual(400);
    for (const [debut] of lignes) expect(debut).toMatch(/^[GHJ]\d[A-Z]$/);
  });

  it("garde chaque centre dans le Québec (un signe inversé ou une colonne décalée se verrait ici)", () => {
    for (const [debut, [lat, lon]] of lignes) {
      expect(lat, debut).toBeGreaterThan(44.9);
      expect(lat, debut).toBeLessThan(62.7);
      expect(lon, debut).toBeGreaterThan(-79.8);
      expect(lon, debut).toBeLessThan(-57);
    }
  });

  it("couvre les 25 débuts les plus fréquents des offres « lieu inconnu » (diagnostic_flux du 2026-10-21)", () => {
    const frequents = [
      "J0K", "J0L", "G0L", "H3X", "H4W", "J0B", "G5Y", "G0M", "J0C", "G5R", "J0E", "H3Y", "J0H",
      "J1X", "J7V", "J8E", "G0X", "G0C", "G0R", "G6P", "J0J", "J0S", "J0Y", "G0T", "G6G",
    ];
    for (const debut of frequents) expect(centreDeCodePostal(debut), debut).not.toBeNull();
  });
});

describe("le repli postal de planifierDistances", () => {
  it("donne une distance approchée, arrondie au kilomètre, à une offre que rien d'autre ne situe", () => {
    const o = offre({ id: "a", entreprise: "Inconnue inc.", codePostal: "G1V" });
    const majs = planifierDistances([o], new Map(), dist(47.6), CENTRE_INCONNU, BAREME);
    expect(majs).toHaveLength(1);
    expect(majs[0]!.km).toBe(48);
    expect(majs[0]!.precision).toBe("postale");
  });

  it("note l'offre avec cette distance, comme avec n'importe quelle autre", () => {
    const o = offre({ id: "a", entreprise: "Inconnue inc.", codePostal: "G1V" });
    const proche = planifierDistances([o], new Map(), dist(5), CENTRE_INCONNU, BAREME)[0]!;
    const loin = planifierDistances([o], new Map(), dist(300), CENTRE_INCONNU, BAREME)[0]!;
    expect(proche.score).not.toBeNull();
    expect(proche.score!).toBeGreaterThan(loin.score!);
  });

  it("laisse intacte la note manuelle", () => {
    const o = offre({ id: "a", entreprise: "Inconnue inc.", codePostal: "G1V", scoreSource: "manuel" });
    expect(planifierDistances([o], new Map(), dist(40), CENTRE_INCONNU, BAREME)[0]!.score).toBeNull();
  });

  it("passe APRÈS la mesure : la position de l'employeur l'emporte", () => {
    const o = offre({ id: "a", entreprise: "Exemple inc.", codePostal: "H3X" });
    const majs = planifierDistances([o], new Map([["Exemple inc.", POS_EXACTE]]), dist(12.34), CENTRE_INCONNU, BAREME);
    expect(majs[0]!.km).toBe(12.3); // au dixième : c'est une mesure
    expect(majs[0]!.precision).toBe("exacte");
  });

  it("joue quand la mesure a été REFUSÉE (position de l'employeur invraisemblable pour la ville de l'offre)", () => {
    // ADR-0021 : l'employeur a son siège loin de la ville de l'offre, la garde refuse sa position. Le code postal de l'annonce,
    // lui, vient de l'offre : c'est la seule information qui reste, et elle est dite approchée.
    const o = offre({ id: "a", entreprise: "Exemple inc.", ville: "Montréal", codePostal: "H3X" });
    const centreMontreal = () => ({ lat: 45.5, lon: -73.57 });
    const loinDeMontreal: Position = { lat: 46.81, lon: -71.21, precision: "exacte" };
    const majs = planifierDistances([o], new Map([["Exemple inc.", loinDeMontreal]]), dist(250), centreMontreal, BAREME);
    expect(majs).toHaveLength(1);
    expect(majs[0]!.precision).toBe("postale");
  });

  it("n'écrit rien sans code postal, avec un code mal formé, ou absent de la table", () => {
    for (const codePostal of [null, undefined, "", "K1A", "G9Z"]) {
      const o = offre({ id: "a", entreprise: "Inconnue inc.", codePostal });
      expect(planifierDistances([o], new Map(), dist(40), CENTRE_INCONNU, BAREME), String(codePostal)).toEqual([]);
    }
  });

  it("n'écrit pas une distance aberrante", () => {
    const o = offre({ id: "a", entreprise: "Inconnue inc.", codePostal: "G1V" });
    expect(planifierDistances([o], new Map(), dist(800), CENTRE_INCONNU, BAREME)).toEqual([]);
    expect(planifierDistances([o], new Map(), dist(Number.NaN), CENTRE_INCONNU, BAREME)).toEqual([]);
  });

  it("ne touche ni l'historique ni une distance mesurée ou relevée à la main", () => {
    const histo = offre({ id: "h", entreprise: "X", codePostal: "G1V", histo: true });
    const releve = offre({ id: "r", entreprise: "Y", codePostal: "G1V", km: 33 });
    expect(planifierDistances([histo, releve], new Map(), dist(40), CENTRE_INCONNU, BAREME)).toEqual([]);
  });

  it("remplace l'approximation dès que l'employeur est situé", () => {
    const o = offre({ id: "a", entreprise: "Exemple inc.", codePostal: "G1V", km: 48, kmSource: "postale" });
    const majs = planifierDistances([o], new Map([["Exemple inc.", POS_EXACTE]]), dist(9.87), CENTRE_INCONNU, BAREME);
    expect(majs).toHaveLength(1);
    expect(majs[0]!.km).toBe(9.9);
    expect(majs[0]!.precision).toBe("exacte");
  });

  it("ne réécrit pas une approximation quand rien de mieux n'existe (l'affichage ne bouge pas sans cause)", () => {
    const o = offre({ id: "a", entreprise: "Inconnue inc.", codePostal: "G1V", km: 48, kmSource: "postale" });
    expect(planifierDistances([o], new Map(), dist(47), CENTRE_INCONNU, BAREME)).toEqual([]);
  });
});

describe("les employeurs à situer et les effacements", () => {
  it("une distance seulement approchée attend toujours son employeur", () => {
    const o = offre({ id: "a", entreprise: "Inconnue inc.", ville: "Lévis", km: 48, kmSource: "postale" });
    const mesuree = offre({ id: "b", entreprise: "Autre inc.", ville: "Lévis", km: 20 });
    const liste = employeursASituer([o, mesuree], new Map(), () => "Lévis");
    expect(liste.map((e) => e.nom)).toEqual(["Inconnue inc."]);
  });

  it("l'effacement des distances précisées remet aussi kmSource à null", () => {
    const o = offre({ id: "a", entreprise: "Exemple inc.", km: 48, kmSource: "postale" });
    const [apres] = invaliderDistancesPrecisees([o], ["Exemple inc."]);
    expect(apres).toMatchObject({ km: null, kmSource: null });
  });

  it("une distance postale n'est jamais jugée invraisemblable par la position d'un employeur", () => {
    const o = offre({ id: "a", entreprise: "Exemple inc.", ville: "Montréal", km: 48, kmSource: "postale" });
    const positions = new Map([["Exemple inc.", POS_EXACTE]]);
    const centreMontreal = () => ({ lat: 45.5, lon: -73.57 });
    expect(invaliderDistancesImplausibles([o], positions, centreMontreal)).toEqual([o]);
  });
});

describe("le rattrapage du code postal des offres déjà suivies", () => {
  const brute = (codePostal: string | undefined): OffreBrute => ({
    refSource: "1",
    titre: "Poste",
    entreprise: "Exemple inc.",
    ville: "Canada",
    lien: "https://exemple.test/1",
    description: "",
    publieeLe: null,
    ...(codePostal === undefined ? {} : { codePostal }),
  });

  it("n'écrit une ligne que si le code MANQUE en base et que la source en donne un valide", () => {
    const vues = new Map([["a", brute("J0T1L0")], ["b", brute("G1V4G6")], ["c", brute("")], ["d", brute(undefined)]]);
    const connues = [
      { id: "a", codePostal: null },
      { id: "b", codePostal: "H3X" }, // déjà gardé : jamais réécrit
      { id: "c", codePostal: null }, // la source n'en donne pas : rien à écrire
      { id: "d", codePostal: undefined },
      { id: "e", codePostal: null }, // pas revue cette passe
    ];
    expect(codesPostauxARattraper(connues, new Map(vues))).toEqual([{ id: "a", codePostal: "J0T" }]);
  });

  it("ne produit aucune ligne le jour où rien ne manque", () => {
    expect(codesPostauxARattraper([{ id: "a", codePostal: "J0T" }], new Map([["a", brute("J0T1L0")]]))).toEqual([]);
  });
});

describe("l'ingestion garde le début du code postal", () => {
  const brute = (codePostal?: string): OffreBrute => ({
    refSource: "1",
    titre: "Coordonnateur de projets en automatisation",
    entreprise: "Exemple inc.",
    ville: "Canada",
    lien: "https://exemple.test/1",
    description: "Coordination d'une équipe technique, robotique et mise en service.",
    publieeLe: "2026-07-29",
    ...(codePostal === undefined ? {} : { codePostal }),
  });

  it("trois caractères sur l'offre retenue, null sans code ou avec un code mal formé", () => {
    const avec = trier([brute("g1v 4g6")], new Set(), "2026-10-21").retenues[0];
    expect(avec?.codePostal).toBe("G1V");
    expect(avec?.km).toBeNull();
    expect(trier([brute()], new Set(), "2026-10-21").retenues[0]?.codePostal).toBeNull();
    expect(trier([brute("12345")], new Set(), "2026-10-21").retenues[0]?.codePostal).toBeNull();
  });

  it("l'offre retenue passe le schéma", () => {
    const o = trier([brute("J0K2A0")], new Set(), "2026-10-21").retenues[0]!;
    expect(OffreSchema.safeParse(o).success).toBe(true);
  });
});

describe("ce qu'on dit à l'écran et à Claude", () => {
  it("écrit « ≈ » devant une distance approchée, et seulement devant elle", () => {
    expect(kmVirgule(48, true)).toBe("≈ 48 km");
    expect(kmVirgule(12.3)).toBe("12,3 km");
    expect(kmVirgule(12.3, false)).toBe("12,3 km");
  });

  it("la vue MCP dit que la distance est approchée", () => {
    expect(vueOffre(offre({ km: 48, kmSource: "postale" })).kmApproche).toBe(true);
    expect(vueOffre(offre({ km: 48 })).kmApproche).toBe(false);
  });

  it("le schéma refuse un kmSource inconnu ou un début de code mal formé", () => {
    expect(OffreSchema.safeParse({ ...offre(), kmSource: "devine" }).success).toBe(false);
    expect(OffreSchema.safeParse({ ...offre(), codePostal: "G1V4G6" }).success).toBe(false);
    expect(OffreSchema.safeParse({ ...offre(), codePostal: "g1v" }).success).toBe(false);
  });
});
