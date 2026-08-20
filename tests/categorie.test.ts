// tests/categorie.test.ts — le TYPE de poste affiché, et sa cohérence avec la note.

import { describe, it, expect } from "vitest";
import { CATEGORIES, CATEGORIE_LIBELLES, categorieOffre } from "@/lib/categorie";
import { computeScore } from "@/lib/scoring";
import { PROFIL_DEFAUT } from "@/lib/profil";

const METIERS = ["21", "22", "70", "92"] as const;

describe("categorieOffre — dérivée du barème, jamais d'un calcul parallèle", () => {
  it("reconnaît la combinaison recherchée", () => {
    expect(categorieOffre("Superviseur de production, automatisation")).toBe("combinaison");
  });

  it("distingue coordination et technique", () => {
    expect(categorieOffre("Coordonnateur de projet")).toBe("coordination");
    expect(categorieOffre("Spécialiste automatisation")).toBe("technique");
  });

  it("range hors sujet ce que le barème ne reconnaît pas", () => {
    expect(categorieOffre("car washer")).toBe("autre");
    expect(categorieOffre("hairstylist")).toBe("autre");
  });

  it("⚠️ NE CONTREDIT PAS LA NOTE : un code du domaine relève AUSSI la catégorie", () => {
    // C'est la raison d'être du code stocké. Sans lui, ce titre anglais rendrait « autre »
    // pendant que la note affiche 73 — deux chiffres qui se contredisent à l'écran.
    // ⚠️ CE TITRE-CI, pas « construction project coordinator » : celui-là est DÉJÀ lu par le
    // vocabulaire bilingue (« project coordinator »), donc il ne discriminerait rien. Il faut
    // un titre que les mots-clés ne savent PAS lire mais que le code classe dans le domaine.
    const titre = "computer network technician";
    expect(categorieOffre(titre, "", null, METIERS)).toBe("autre");
    expect(categorieOffre(titre, "", "22220", METIERS)).not.toBe("autre");

    const note = computeScore({ titre, description: "", km: 12, noc: "22220" }, PROFIL_DEFAUT, METIERS);
    expect(note.facteurDomaine).toBe(1);
    expect(note.total).toBeGreaterThan(60);
  });

  it("un code HORS domaine ne relève rien", () => {
    expect(categorieOffre("car washer", "", "65311", METIERS)).toBe("autre");
  });

  it("chaque catégorie a un libellé — sinon un bouton s'afficherait vide", () => {
    for (const c of CATEGORIES) {
      expect(CATEGORIE_LIBELLES[c], c).toBeTruthy();
    }
    expect(CATEGORIES).toHaveLength(Object.keys(CATEGORIE_LIBELLES).length);
  });
});
