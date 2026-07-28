// tests/scoring.test.ts — le barème, composante par composante.
//
// Les cas sont dérivés des CONSTANTES du module, pas de leurs valeurs du jour : un test
// qui code « 85 » en dur mentirait au premier réglage du plafond.

import { describe, it, expect } from "vitest";
import {
  PONDERATION,
  PLAFOND_NOTE_CALCULEE,
  RAYON_MAX_KM,
  computeScore,
  dansLeRayon,
  palier,
  scoreDistance,
  scoreFitRole,
  scoreImmigration,
  scoreSalaire,
  scoreSeniorite,
} from "../lib/scoring";

describe("pondération", () => {
  it("les composantes totalisent exactement 100", () => {
    const somme = Object.values(PONDERATION).reduce((a, b) => a + b, 0);
    expect(somme).toBe(100);
  });

  it("chaque composante rend au plus son maximum", () => {
    expect(scoreFitRole("Coordonnateur automatisation")).toBeLessThanOrEqual(PONDERATION.fitRole);
    expect(scoreDistance(0)).toBeLessThanOrEqual(PONDERATION.distance);
    expect(scoreSeniorite("2 ans d'expérience")).toBeLessThanOrEqual(PONDERATION.seniorite);
    expect(scoreSalaire(200_000)).toBeLessThanOrEqual(PONDERATION.salaire);
    expect(scoreImmigration("")).toBeLessThanOrEqual(PONDERATION.immigration);
  });
});

describe("fit du rôle", () => {
  it("récompense la combinaison coordination + technique", () => {
    expect(scoreFitRole("Chargé de projets ingénierie — volet automatisation")).toBe(
      PONDERATION.fitRole,
    );
  });

  it("classe l'encadrement seul au-dessus de la technique seule", () => {
    const coordSeule = scoreFitRole("Coordonnateur de projet");
    const techSeule = scoreFitRole("Spécialiste automatisation");
    expect(coordSeule).toBeGreaterThan(techSeule);
  });

  it("pénalise un poste de technicien sans encadrement", () => {
    const technicien = scoreFitRole("Technicien en automatisation");
    const specialiste = scoreFitRole("Spécialiste automatisation");
    // Même domaine technique, mais un recul hiérarchique par rapport au poste actuel.
    expect(technicien).toBeLessThan(specialiste);
  });

  it("ne pénalise pas un technicien QUI encadre", () => {
    expect(scoreFitRole("Superviseur technicien automatisation")).toBe(PONDERATION.fitRole);
  });

  it("lit aussi la description, pas seulement le titre", () => {
    const sansContexte = scoreFitRole("Chargé de projets");
    const avecContexte = scoreFitRole("Chargé de projets", "cellules robotiques et vision");
    expect(avecContexte).toBeGreaterThan(sansContexte);
  });
});

describe("distance", () => {
  it("décroît de façon monotone avec l'éloignement", () => {
    const paliers = [0, 5, 10, 15, 25, 35, 45].map(scoreDistance);
    for (let i = 1; i < paliers.length; i++) {
      expect(paliers[i]!).toBeLessThanOrEqual(paliers[i - 1]!);
    }
  });

  it("annule les points au-delà du rayon", () => {
    expect(scoreDistance(RAYON_MAX_KM + 0.1)).toBe(0);
    expect(scoreDistance(RAYON_MAX_KM)).toBeGreaterThan(0);
  });

  it("rend une note neutre — et non zéro — quand la distance est inconnue", () => {
    // Zéro dirait « c'est loin ». On ne sait pas : ce n'est pas la même chose.
    expect(scoreDistance(null)).toBeGreaterThan(0);
    expect(scoreDistance(null)).toBeLessThan(PONDERATION.distance);
    expect(scoreDistance(undefined)).toBe(scoreDistance(null));
  });
});

describe("séniorité", () => {
  it("favorise les exigences basses", () => {
    expect(scoreSeniorite("2 ans d'expérience")).toBeGreaterThan(
      scoreSeniorite("5 ans d'expérience"),
    );
    expect(scoreSeniorite("5 ans d'expérience")).toBeGreaterThan(
      scoreSeniorite("10 ans d'expérience"),
    );
  });

  it("lit une fourchette en retenant la borne basse", () => {
    expect(scoreSeniorite("5-10 ans d'expérience")).toBe(scoreSeniorite("5 ans d'expérience"));
  });

  it("accepte l'apostrophe typographique et les années", () => {
    expect(scoreSeniorite("3 années d’expérience")).toBe(scoreSeniorite("3 ans d'expérience"));
  });

  it("reste neutre quand rien n'est précisé", () => {
    const neutre = scoreSeniorite("");
    expect(neutre).toBeGreaterThan(scoreSeniorite("10 ans d'expérience"));
    expect(neutre).toBeLessThan(scoreSeniorite("2 ans d'expérience"));
  });
});

describe("salaire", () => {
  it("croît avec le montant", () => {
    const montants = [50_000, 65_000, 75_000, 85_000, 95_000].map(scoreSalaire);
    for (let i = 1; i < montants.length; i++) {
      expect(montants[i]!).toBeGreaterThanOrEqual(montants[i - 1]!);
    }
  });

  it("reste neutre si rien n'est affiché", () => {
    // Pénaliser reviendrait à noter la politique de communication de l'employeur.
    const neutre = scoreSalaire(null);
    expect(neutre).toBeGreaterThan(scoreSalaire(50_000));
    expect(neutre).toBeLessThan(scoreSalaire(95_000));
  });

  it("traite une valeur non finie comme une absence, jamais comme un montant", () => {
    expect(scoreSalaire(Number.POSITIVE_INFINITY)).toBe(scoreSalaire(null));
    expect(scoreSalaire(Number.NaN)).toBe(scoreSalaire(null));
  });
});

describe("statut migratoire", () => {
  it("annule les points sur une exigence de citoyenneté ou de résidence", () => {
    expect(scoreImmigration("Citoyenneté canadienne requise")).toBe(0);
    expect(scoreImmigration("Cote de sécurité exigée")).toBe(0);
  });

  it("pénalise sans éliminer quand un ordre professionnel est en jeu", () => {
    const avecOrdre = scoreImmigration("Membre de l'Ordre des ingénieurs du Québec");
    expect(avecOrdre).toBeGreaterThan(0);
    expect(avecOrdre).toBeLessThan(PONDERATION.immigration);
  });

  it("ne pénalise pas une offre sans exigence particulière", () => {
    expect(scoreImmigration("Poste de coordination")).toBe(PONDERATION.immigration);
  });
});

describe("note calculée", () => {
  it("plafonne pour ne jamais dépasser une note vérifiée à la main", () => {
    const parfaite = computeScore({
      titre: "Coordonnateur automatisation robotique",
      description: "2 ans d'expérience",
      km: 1,
      salaireAnnuel: 120_000,
    });
    expect(parfaite.brut).toBeGreaterThan(PLAFOND_NOTE_CALCULEE);
    expect(parfaite.total).toBe(PLAFOND_NOTE_CALCULEE);
  });

  it("expose le brut pour qu'un écrêtage soit explicable", () => {
    const r = computeScore({ titre: "Technicien", km: 45 });
    expect(r.total).toBe(r.brut);
    expect(Object.values(r.parts).reduce((a, b) => a + b, 0)).toBe(r.brut);
  });

  it("reste dans les bornes 0-100 même sur une offre minimale", () => {
    const r = computeScore({ titre: "" });
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });
});

describe("paliers et rayon", () => {
  it("classe A, B et C aux bons seuils", () => {
    expect(palier(80)).toBe("A");
    expect(palier(79)).toBe("B");
    expect(palier(65)).toBe("B");
    expect(palier(64)).toBe("C");
  });

  it("ne présume rien d'une offre non notée", () => {
    expect(palier(null)).toBe("C");
    expect(palier(undefined)).toBe("C");
  });

  it("garde une offre dont la distance est inconnue", () => {
    // Écarter sur une donnée absente reviendrait à décider à la place de Marc sur du vide.
    expect(dansLeRayon(null)).toBe(true);
    expect(dansLeRayon(RAYON_MAX_KM)).toBe(true);
    expect(dansLeRayon(RAYON_MAX_KM + 1)).toBe(false);
  });
});
