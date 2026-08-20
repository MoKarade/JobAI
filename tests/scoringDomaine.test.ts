// tests/scoringDomaine.test.ts — le domaine dans la note (ADR-0013).
//
// Les cas sont dérivés des CONSTANTES du profil, jamais de leurs valeurs du jour : un test
// qui coderait « 0,5 » en dur mentirait au premier réglage de `facteurHorsDomaine`.

import { describe, it, expect } from "vitest";
import { computeScore, facteurDomaine, plancherRoleNoc, scoreFitRole } from "@/lib/scoring";
import { PROFIL_DEFAUT } from "@/lib/profil";
import { SEED } from "@/lib/seed";

/** Ce que Marc a de plus proche d'un domaine, d'après la mesure du flux du 2026-08-20. */
const METIERS = ["70", "92", "22", "21"] as const;
const F = PROFIL_DEFAUT.facteurHorsDomaine;

describe("facteurDomaine — les quatre cas de la table D1", () => {
  it("rend 1 sur un code RETENU", () => {
    expect(facteurDomaine("70010", METIERS)).toBe(1);
    expect(facteurDomaine("22220", METIERS)).toBe(1);
  });

  it("rend le facteur de pénalité sur un code LU mais HORS liste", () => {
    expect(facteurDomaine("65311", METIERS)).toBe(F); // car washer
    expect(facteurDomaine("63210", METIERS)).toBe(F); // hairstylist
  });

  it("rend 1 quand le code est ABSENT — une ignorance n'est pas un refus", () => {
    // C'est la ligne qui protège tout le suivi actuel : aucune de ses offres n'a de code.
    expect(facteurDomaine(undefined, METIERS)).toBe(1);
    expect(facteurDomaine(null, METIERS)).toBe(1);
    expect(facteurDomaine("", METIERS)).toBe(1);
  });

  it("rend 1 quand le code est ILLISIBLE — même raison", () => {
    // Quatre chiffres = le format NOC 2016. Le lire de travers serait pire que l'ignorer.
    expect(facteurDomaine("7001", METIERS)).toBe(1);
    expect(facteurDomaine("abcde", METIERS)).toBe(1);
  });

  it("rend 1 partout quand la liste est VIDE — le mécanisme est inerte", () => {
    expect(facteurDomaine("65311", [])).toBe(1);
    expect(facteurDomaine("70010", [])).toBe(1);
  });

  it("ne rend jamais plus de 1 — le facteur abaisse, il ne prime pas", () => {
    for (const noc of ["70010", "65311", "22220", "99999", null, undefined]) {
      expect(facteurDomaine(noc, METIERS)).toBeLessThanOrEqual(1);
      expect(facteurDomaine(noc, METIERS)).toBeGreaterThan(0);
    }
  });
});

describe("plancherRoleNoc — il RELÈVE, il n'abaisse jamais", () => {
  const COORD = PROFIL_DEFAUT.pointsRole.coordination;
  const HORS = PROFIL_DEFAUT.pointsRole.horsSujet;

  it("relève un rôle hors sujet quand le NOC est retenu", () => {
    expect(plancherRoleNoc(HORS, "70010", METIERS)).toBe(COORD);
  });

  it("laisse intact un rôle DÉJÀ supérieur au plancher", () => {
    const combi = PROFIL_DEFAUT.pointsRole.combinaison;
    expect(plancherRoleNoc(combi, "70010", METIERS)).toBe(combi);
  });

  it("ne relève rien sur un code hors liste, absent, ou liste vide", () => {
    expect(plancherRoleNoc(HORS, "65311", METIERS)).toBe(HORS);
    expect(plancherRoleNoc(HORS, undefined, METIERS)).toBe(HORS);
    expect(plancherRoleNoc(HORS, "70010", [])).toBe(HORS);
  });
});

describe("computeScore — le domaine dans la note complète", () => {
  const offre = { titre: "car washer", description: "", km: 5 };

  it("abaisse une offre hors domaine et le DIT dans le détail", () => {
    const sans = computeScore(offre);
    const avec = computeScore({ ...offre, noc: "65311" }, PROFIL_DEFAUT, METIERS);
    expect(avec.facteurDomaine).toBe(F);
    expect(avec.total).toBeLessThan(sans.total);
    // `brut` reste la somme des parts : c'est ce qui rend l'écrêtage explicable.
    expect(avec.brut).toBe(sans.brut);
  });

  it("classe une offre DU domaine au-dessus d'une offre hors domaine PLUS PROCHE", () => {
    // L'inversion mesurée en tête d'ADR : le laveur de voitures à 5 km battait le
    // coordonnateur de projet à 12 km. C'est ce test qui interdit son retour.
    const laveur = computeScore({ titre: "car washer", description: "", km: 5, noc: "65311" }, PROFIL_DEFAUT, METIERS);
    const coord = computeScore({ titre: "construction project coordinator", description: "", km: 12, noc: "70010" }, PROFIL_DEFAUT, METIERS);
    expect(coord.total).toBeGreaterThan(laveur.total);
  });

  it("ne dépasse jamais le plafond des notes calculées", () => {
    const forte = computeScore(
      { titre: "Superviseur de production, automatisation", description: "", km: 1, noc: "92010" },
      PROFIL_DEFAUT,
      METIERS,
    );
    expect(forte.total).toBeLessThanOrEqual(PROFIL_DEFAUT.plafondNoteCalculee);
  });

  it("laisse le facteur à 1 par défaut — aucun appelant existant ne passe de métiers", () => {
    expect(computeScore(offre).facteurDomaine).toBe(1);
  });
});

describe("non-régression — l'audit §8, rejoué en test", () => {
  it("aucune offre du seed ne bouge, MÊME avec une liste de métiers non vide", () => {
    // La configuration RISQUÉE : liste remplie, offres sans code. Si le facteur fuyait sur
    // l'absence de code, les 53 notes seraient divisées par deux.
    for (const o of SEED) {
      const e = { titre: o.poste, description: o.raisons.map((r) => r.texte).join(" "), km: o.km };
      const avant = computeScore(e).total;
      const apres = computeScore({ ...e, noc: undefined }, PROFIL_DEFAUT, METIERS).total;
      expect(apres, `${o.entreprise} — ${o.poste}`).toBe(avant);
    }
  });

  it("le seed n'est pas vide — sans quoi le test ci-dessus passerait à vide", () => {
    expect(SEED.length).toBeGreaterThan(40);
  });
});

describe("vocabulaire bilingue (D4) — ce qu'il attrape et ce qu'il ne doit PAS attraper", () => {
  const HORS = PROFIL_DEFAUT.pointsRole.horsSujet;

  it("lit désormais les titres de projet en anglais", () => {
    for (const t of ["Project Manager", "Project Engineering Manager", "Project Planner and Controller"]) {
      expect(scoreFitRole(t), t).toBeGreaterThan(HORS);
    }
  });

  it("ne remonte PAS les titres hors domaine — les termes sont qualifiés, pas nus", () => {
    // « supervisor » nu faisait remonter celui-ci de 56 à 76 (mesuré avant correction).
    for (const t of ["supervisor - retail", "assistant manager, restaurant", "car washer",
                     "hairstylist", "cook's helper", "shop clerk"]) {
      expect(scoreFitRole(t), t).toBe(HORS);
    }
  });
});
