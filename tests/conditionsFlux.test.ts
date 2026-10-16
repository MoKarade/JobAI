// tests/conditionsFlux.test.ts — lire le salaire et l'expérience du flux du Guichet (JobAI#150, ADR-0026).
//
// Les chaînes ci-dessous sont les formats réels de l'inventaire du flux du 2026-10-16, sans nom
// d'employeur ni d'offre : seulement la forme du texte publié.

import { describe, it, expect } from "vitest";
import {
  EXTREMITE_FOURCHETTE,
  HEURES_PAR_ANNEE,
  lireExperienceMois,
  lireSalaireAnnuel,
  salaireAffichable,
} from "../lib/ingest/conditionsFlux";
import { trier } from "../lib/ingest/pipeline";
import type { OffreBrute } from "../lib/ingest/types";
import { PROFIL_DEFAUT } from "../lib/profil";
import { scoreSeniorite } from "../lib/scoring";
import { noterOffre } from "../lib/noteOffre";
import { planifierRenotation } from "../lib/cv/renotation";
import { OffreSchema } from "../lib/types";

describe("lireSalaireAnnuel — formats réels du flux", () => {
  it("un taux horaire devient un annuel (× 2 080 h)", () => {
    expect(HEURES_PAR_ANNEE).toBe(2080);
    expect(lireSalaireAnnuel("$25.00 hourly")).toBe(52_000);
    expect(lireSalaireAnnuel("$16.60 hourly")).toBe(34_528);
  });

  it("une fourchette « à négocier » retient la borne basse", () => {
    expect(EXTREMITE_FOURCHETTE).toBe("basse");
    expect(lireSalaireAnnuel("$20.00 to $25.00 hourly (to be negotiated)")).toBe(41_600);
    expect(lireSalaireAnnuel("$16.86 to $21.15 hourly (to be negotiated)")).toBe(35_069);
  });

  it("un annuel avec séparateur de milliers se lit tel quel", () => {
    expect(lireSalaireAnnuel("$45,000.00 to $50,000.00 annually (to be negotiated)")).toBe(45_000);
    expect(lireSalaireAnnuel("$62,500.00 annually")).toBe(62_500);
  });

  it("les autres périodes se convertissent", () => {
    expect(lireSalaireAnnuel("$1,000.00 weekly")).toBe(52_000);
    expect(lireSalaireAnnuel("$4,000.00 monthly")).toBe(48_000);
    expect(lireSalaireAnnuel("$2,000.00 bi-weekly")).toBe(52_000);
  });

  it("une fourchette à l'envers retient quand même la plus basse", () => {
    expect(lireSalaireAnnuel("$30.00 to $20.00 hourly")).toBe(41_600);
  });

  it("refuse de deviner : vide, unité inconnue, texte libre, montant absurde", () => {
    expect(lireSalaireAnnuel("")).toBeNull();
    expect(lireSalaireAnnuel(null)).toBeNull();
    expect(lireSalaireAnnuel(undefined)).toBeNull();
    expect(lireSalaireAnnuel("To be negotiated")).toBeNull();
    expect(lireSalaireAnnuel("$25.00 per fortnight")).toBeNull();
    expect(lireSalaireAnnuel("$25.00")).toBeNull();
    expect(lireSalaireAnnuel("$1.00 hourly")).toBeNull(); // 2 080 $/an : faute de saisie
    expect(lireSalaireAnnuel("$900,000.00 hourly")).toBeNull();
  });
});

describe("salaireAffichable", () => {
  it("garde le texte publié, rogné et borné à 80", () => {
    expect(salaireAffichable("  $25.00 hourly ")).toBe("$25.00 hourly");
    expect(salaireAffichable("x".repeat(200))?.length).toBe(80);
    expect(salaireAffichable("   ")).toBeNull();
    expect(salaireAffichable(null)).toBeNull();
  });
});

describe("lireExperienceMois — les neuf classes du flux", () => {
  it.each([
    ["No experience (will train)", 0],
    ["Will train", 0],
    ["Experience an asset", 0],
    ["1 to less than 7 months", 1],
    ["7 months to less than 1 year", 7],
    ["1 year to less than 2 years", 12],
    ["2 years to less than 3 years", 24],
    ["3 years to less than 5 years", 36],
    ["5 years or more", 60],
  ])("%s → %i mois", (texte, mois) => {
    expect(lireExperienceMois(texte)).toBe(mois);
  });

  it("une forme de la même famille mais non vue se lit, une inconnue non", () => {
    expect(lireExperienceMois("10 years or more")).toBe(120);
    expect(lireExperienceMois("")).toBeNull();
    expect(lireExperienceMois(null)).toBeNull();
    expect(lireExperienceMois("beaucoup")).toBeNull();
  });
});

describe("l'expérience structurée prime sur le texte", () => {
  it("scoreSeniorite lit les années du champ avant celles de l'annonce", () => {
    const annonce = "Posséder 10 ans d'expérience.";
    const sansChamp = scoreSeniorite(annonce, PROFIL_DEFAUT);
    const avecChamp = scoreSeniorite(annonce, PROFIL_DEFAUT, 0);
    expect(avecChamp).toBeGreaterThan(sansChamp);
  });

  it("7 mois valent 0 an (années entières par le bas)", () => {
    expect(scoreSeniorite("", PROFIL_DEFAUT, 7)).toBe(scoreSeniorite("", PROFIL_DEFAUT, 0));
  });

  it("l'absence de champ garde la lecture du texte", () => {
    expect(scoreSeniorite("Posséder 10 ans d'expérience.", PROFIL_DEFAUT, null)).toBe(
      scoreSeniorite("Posséder 10 ans d'expérience.", PROFIL_DEFAUT),
    );
  });
});

describe("de l'annonce brute à l'offre gardée", () => {
  const brute = (champs: Partial<OffreBrute> = {}): OffreBrute => ({
    refSource: "1",
    titre: "Coordonnateur de projets en automatisation",
    entreprise: "Exemple inc.",
    ville: "Lévis, QC",
    lien: "https://exemple.test/1",
    description: "Coordination d'une équipe technique, robotique et mise en service.",
    publieeLe: "2026-07-29",
    noc: "22301",
    salaire: "$30.00 to $35.00 hourly (to be negotiated)",
    experience: "3 years to less than 5 years",
    ...champs,
  });

  it("l'offre porte le texte affiché, l'annuel et les mois exigés", () => {
    const o = trier([brute()], new Set(), "2026-10-16", new Map(), ["22"]).retenues[0]!;
    expect(o.salaireAffiche).toBe("$30.00 to $35.00 hourly (to be negotiated)");
    expect(o.salaireAnnuel).toBe(62_400);
    expect(o.experienceMois).toBe(36);
    expect(() => OffreSchema.parse(o)).not.toThrow();
  });

  it("une source muette laisse des null, neutres", () => {
    const o = trier([brute({ salaire: undefined, experience: undefined })], new Set(), "2026-10-16", new Map(), ["22"])
      .retenues[0]!;
    expect(o.salaireAffiche).toBeNull();
    expect(o.salaireAnnuel).toBeNull();
    expect(o.experienceMois).toBeNull();
  });

  it("la note d'ingestion tient compte de l'expérience exigée, et la re-notation la retrouve", () => {
    const bareme = { profil: PROFIL_DEFAUT, metiers: ["22"] };
    const exigeante = trier([brute({ experience: "5 years or more" })], new Set(), "2026-10-16", new Map(), ["22"])
      .retenues[0]!;
    const libre = trier([brute({ experience: "Experience an asset" })], new Set(), "2026-10-16", new Map(), ["22"])
      .retenues[0]!;
    expect(libre.score!).toBeGreaterThanOrEqual(exigeante.score!);
    for (const o of [exigeante, libre]) {
      expect(noterOffre(o, bareme.profil, bareme.metiers).total).toBe(o.score);
      expect(planifierRenotation([o], bareme).changements).toEqual([]);
    }
  });

  it("le salaire n'entre PAS encore dans la note (JobAI#152)", () => {
    const riche = trier([brute({ salaire: "$90.00 hourly" })], new Set(), "2026-10-16", new Map(), ["22"]).retenues[0]!;
    const pauvre = trier([brute({ salaire: "$14.00 hourly" })], new Set(), "2026-10-16", new Map(), ["22"]).retenues[0]!;
    expect(riche.score).toBe(pauvre.score);
  });
});
