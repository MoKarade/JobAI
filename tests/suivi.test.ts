// tests/suivi.test.ts — le garde-fou n°2 : le suivi appartient à Marc.
//
// C'est la règle la plus facile à casser sans s'en apercevoir, et sa violation est
// SILENCIEUSE : un statut retombé à « Identifiée » ne lève aucune erreur, on le découvre
// en cherchant où en était une candidature.

import { describe, it, expect } from "vitest";
import { fusionner, appliquerModification, marquerEnvoi, resumer } from "../lib/suivi";
import { CHAMPS_UTILISATEUR, type Offre } from "../lib/types";
import { SEED } from "../lib/seed";

function offre(champs: Partial<Offre> = {}): Offre {
  return {
    id: "test-offre",
    source: "seed",
    dateReperage: "2026-07-01",
    entreprise: "Entreprise",
    poste: "Poste",
    lien: "",
    km: 10,
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 70,
    scoreSource: "manuel",
    raisons: [],
    notes: "",
    userNote: "",
    histo: false,
    perimeeLe: null,
    ...champs,
  };
}

describe("fusion — le suivi survit au rafraîchissement", () => {
  it("préserve TOUS les champs de l'utilisateur, un par un", () => {
    const suivie = offre({
      statut: "Entrevue",
      priorite: "Haute",
      dateEnvoi: "2026-07-10",
      userNote: "Relancer après le 15.",
    });
    // Le jeu de départ, lui, est resté à son état d'origine.
    const neuve = offre({ statut: "Identifiee", priorite: "Basse", dateEnvoi: "", userNote: "" });

    const [resultat] = fusionner([neuve], [suivie]);

    // On vérifie CHAQUE champ déclaré, pas un échantillon : si un champ est ajouté à
    // CHAMPS_UTILISATEUR sans être préservé, ce test doit tomber.
    for (const champ of CHAMPS_UTILISATEUR) {
      expect(resultat![champ], `champ ${champ}`).toEqual(suivie[champ]);
    }
  });

  it("rafraîchit en revanche ce qui appartient à la recherche", () => {
    const suivie = offre({ score: 60, notes: "ancienne note", lien: "" });
    const neuve = offre({
      score: 88,
      notes: "note à jour",
      lien: "https://exemple.test/offre",
      raisons: [{ ton: "atout", texte: "Proche" }],
    });

    const [resultat] = fusionner([neuve], [suivie]);

    expect(resultat!.score).toBe(88);
    expect(resultat!.notes).toBe("note à jour");
    expect(resultat!.lien).toBe("https://exemple.test/offre");
    expect(resultat!.raisons).toHaveLength(1);
  });

  it("ajoute une offre du jeu de départ encore inconnue", () => {
    const resultat = fusionner([offre({ id: "nouvelle" })], []);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]!.id).toBe("nouvelle");
  });

  it("conserve intacte une offre ajoutée à la main, absente du jeu de départ", () => {
    const perso = offre({ id: "ajout-perso", source: "user", statut: "CVenvoye", score: null });
    const resultat = fusionner([offre({ id: "du-seed" })], [perso]);

    expect(resultat.map((o) => o.id)).toEqual(["du-seed", "ajout-perso"]);
    expect(resultat[1]).toEqual(perso);
  });

  it("garde un ordre stable : le jeu de départ d'abord, dans son ordre", () => {
    const seed = [offre({ id: "a" }), offre({ id: "b" }), offre({ id: "c" })];
    const existantes = [offre({ id: "z", source: "user" }), offre({ id: "b" })];
    expect(fusionner(seed, existantes).map((o) => o.id)).toEqual(["a", "b", "c", "z"]);
  });

  it("est idempotente : refusionner ne change plus rien", () => {
    const suivie = offre({ statut: "Refusee", userNote: "Refus le 12." });
    const un = fusionner(SEED.slice(0, 3), [suivie, ...SEED.slice(0, 3)]);
    const deux = fusionner(SEED.slice(0, 3), un);
    expect(deux).toEqual(un);
  });

  it("ne modifie NI le jeu de départ NI l'état existant", () => {
    // Une mutation en place contaminerait le module importé pour tout le reste du run.
    const seed = [offre({ id: "x", statut: "Identifiee" })];
    const existantes = [offre({ id: "x", statut: "Offre" })];
    const copieSeed = structuredClone(seed);
    const copieExistantes = structuredClone(existantes);

    fusionner(seed, existantes);

    expect(seed).toEqual(copieSeed);
    expect(existantes).toEqual(copieExistantes);
  });
});

describe("modification par l'utilisateur", () => {
  it("applique les champs fournis", () => {
    const r = appliquerModification(offre(), { statut: "CVenvoye", userNote: "Envoyé." });
    expect(r.statut).toBe("CVenvoye");
    expect(r.userNote).toBe("Envoyé.");
  });

  it("laisse intacts les champs non fournis", () => {
    const depart = offre({ priorite: "Haute", userNote: "à garder" });
    const r = appliquerModification(depart, { statut: "Relance" });
    expect(r.priorite).toBe("Haute");
    expect(r.userNote).toBe("à garder");
  });

  it("ignore toute tentative de modifier un champ de la recherche", () => {
    const depart = offre({ score: 70, notes: "note de recherche" });
    // Un appelant mal intentionné ou négligent — le typage l'interdit déjà, on vérifie
    // que le comportement d'exécution suit.
    const r = appliquerModification(depart, {
      statut: "Entrevue",
      score: 100,
      notes: "détourné",
    } as never);
    expect(r.statut).toBe("Entrevue");
    expect(r.score).toBe(70);
    expect(r.notes).toBe("note de recherche");
  });
});

describe("date d'envoi automatique", () => {
  it("se pose au passage à « CV envoyé »", () => {
    const r = marquerEnvoi(offre({ statut: "CVenvoye" }), "2026-08-01");
    expect(r.dateEnvoi).toBe("2026-08-01");
  });

  it("n'écrase jamais une date déjà posée", () => {
    const r = marquerEnvoi(offre({ statut: "CVenvoye", dateEnvoi: "2026-07-01" }), "2026-08-01");
    expect(r.dateEnvoi).toBe("2026-07-01");
  });

  it("ne pose rien sur un autre statut", () => {
    expect(marquerEnvoi(offre({ statut: "Identifiee" }), "2026-08-01").dateEnvoi).toBe("");
  });
});

describe("résumé", () => {
  it("compte séparément le suivi total et les offres actives", () => {
    const r = resumer(SEED);
    expect(r.total).toBe(53);
    expect(r.actives).toBe(38);
  });

  it("cherche la meilleure offre parmi les ACTIVES seulement", () => {
    // Une candidature de 2025 n'est pas une cible : la remonter en tête du widget
    // donnerait une information fausse sur ce qu'il y a à faire aujourd'hui.
    const r = resumer([
      offre({ id: "active", score: 70, histo: false }),
      offre({ id: "vieille", score: 99, histo: true }),
    ]);
    expect(r.meilleure?.score).toBe(70);
  });

  it("rend null — et non un zéro — quand aucune offre n'est notée", () => {
    const r = resumer([offre({ score: null })]);
    expect(r.meilleure).toBeNull();
    expect(r.notees80Plus).toBe(0);
  });

  it("compte les candidatures sur TOUT le suivi, historique inclus", () => {
    // Ce sont des faits accomplis : la campagne 2025 compte dans « CV envoyés ».
    const r = resumer(SEED);
    expect(r.cvEnvoyes).toBe(15);
    expect(r.reponses).toBe(7);
    expect(r.entrevues).toBe(1);
  });

  it("les compteurs sont cohérents entre eux", () => {
    const r = resumer(SEED);
    expect(r.reponses).toBeLessThanOrEqual(r.cvEnvoyes);
    expect(r.entrevues).toBeLessThanOrEqual(r.reponses);
    expect(r.actives).toBeLessThanOrEqual(r.total);
    expect(r.notees80Plus).toBeLessThanOrEqual(r.actives);
  });

  it("supporte un suivi vide sans rien inventer", () => {
    const r = resumer([]);
    expect(r).toEqual({
      total: 0,
      actives: 0,
      notees80Plus: 0,
      cvEnvoyes: 0,
      reponses: 0,
      entrevues: 0,
      meilleure: null,
    });
  });
});

describe("offres périmées", () => {
  // Le cas qui compte : une offre fermée ne doit plus être présentée comme une opportunité.
  // Le widget du hub afficherait sinon « 92 chez IEL » alors que le poste est pourvu.
  const jeu = [
    offre({ id: "a", entreprise: "Ouverte", score: 70, perimeeLe: null }),
    offre({ id: "b", entreprise: "Fermée", score: 95, perimeeLe: "2026-07-20T00:00:00.000Z" }),
  ];

  it("exclut les périmées du compte d'offres actives", () => {
    expect(resumer(jeu).actives).toBe(1);
  });

  it("ne choisit JAMAIS une offre périmée comme meilleure", () => {
    const r = resumer(jeu);
    // 95 > 70, mais l'offre à 95 est fermée : la meilleure disponible est celle à 70.
    expect(r.meilleure?.entreprise).toBe("Ouverte");
    expect(r.meilleure?.score).toBe(70);
  });

  it("ne compte pas une périmée dans les offres notées 80+", () => {
    expect(resumer(jeu).notees80Plus).toBe(0);
  });

  it("les garde dans le total — le suivi n'efface rien", () => {
    // Une piste qui s'est fermée fait partie de l'histoire de la recherche.
    expect(resumer(jeu).total).toBe(2);
  });

  it("les compteurs de candidature restent des faits accomplis", () => {
    // Un CV envoyé reste envoyé, même si l'offre a fermé depuis.
    const envoye = [
      offre({ id: "c", statut: "CVenvoye", perimeeLe: "2026-07-20T00:00:00.000Z" }),
    ];
    expect(resumer(envoye).cvEnvoyes).toBe(1);
    expect(resumer(envoye).actives).toBe(0);
  });
});
