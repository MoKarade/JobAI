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
  PALIERS_DISTANCE_KM,
  scoreFitRole,
  scoreImmigration,
  scoreSalaire,
  scoreSeniorite,
} from "../lib/scoring";
import { PROFIL_DEFAUT } from "../lib/profil";

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

  it("ne pénalise PLUS un poste de technicien sans encadrement (ADR-0015)", () => {
    // ⚠️ CE TEST ENCODAIT LA DÉCISION INVERSE jusqu'au 2026-08-20 : « un recul hiérarchique
    // par rapport au poste actuel ». La prémisse supposait un poste actuel de niveau
    // supérieur et lisible dans un titre ; le CV de Marc l'a réfutée, et il a répondu que
    // les deux niveaux l'intéressent également. Ce n'est donc pas un test qu'on affaiblit
    // pour faire passer du code — c'est la décision qui a changé, et l'ADR dit pourquoi.
    const technicien = scoreFitRole("Technicien en automatisation");
    const specialiste = scoreFitRole("Spécialiste automatisation");
    expect(technicien).toBe(specialiste);
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
    // ⚠️ PAS `.map(scoreDistance)` : `map` passe (valeur, INDEX, tableau), et depuis
    // ADR-0009 le 2ᵉ paramètre de ces fonctions est le PROFIL. L'index arriverait donc à
    // la place du barème. Ici ça lève ; le jour où un paramètre ajouté aura un défaut
    // numérique plausible, ça ne lèvera plus — ça notera faux, en silence.
    const paliers = [0, 5, 10, 15, 25, 35, 45].map((km) => scoreDistance(km));
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
    const montants = [50_000, 65_000, 75_000, 85_000, 95_000].map((s) => scoreSalaire(s));
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

  // ⚠️ AJOUTÉ LE 2026-08-12, APRÈS AVOIR LU 44 ANNONCES RÉELLES.
  // Le défaut n'était pas dans le barème mais dans le VOCABULAIRE : une offre demandait
  // d'être « apte aux enquêtes de sécurité » — la même exigence que « cote de sécurité »
  // sous un autre nom — et obtenait la note PLEINE, donc remontait en tête de liste.
  // Un seul synonyme non couvert suffit à faire passer une offre disqualifiante devant les
  // autres : cette liste se relit à chaque campagne de lecture.
  it("reconnaît les synonymes d'habilitation fédérale", () => {
    for (const t of [
      "Prérequis : apte aux enquêtes de sécurité.",
      "Le candidat doit obtenir une habilitation de sécurité.",
      "Cote de fiabilité approfondie exigée.",
      "Doit être citoyen canadien.",
      "Résidence permanente requise.",
    ]) {
      expect(scoreImmigration(t), `« ${t} » doit annuler les points`).toBe(0);
    }
  });

  // LE VOLET QUI EMPÊCHE LE MOTIF DE MORDRE TROP LARGE.
  // Marc HABITE la région de Québec : exiger d'y résider ne lui coûte rien, et pénaliser
  // ces offres les ferait descendre à tort. Et une annonce industrielle parle sans cesse de
  // « sécurité » au sens SST — confondre les deux viderait la liste de ses meilleurs postes.
  it("ne confond pas résidence au Québec, ni sécurité au travail, avec une barrière de statut", () => {
    for (const t of [
      "Êtes-vous domicilié au Québec?",
      "Requis : résidence au Québec.",
      "Veiller au respect des normes de santé et sécurité au travail.",
      "Participer aux enquêtes sur les incidents et à l'identification des dangers.",
      "Assurer la sécurité des installations et la conformité SST.",
    ]) {
      expect(scoreImmigration(t), `« ${t} » ne doit RIEN coûter`).toBe(PONDERATION.immigration);
    }
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

/**
 * Le verrou de la jauge de distance (ADR-0008).
 *
 * L'interface allume un segment par palier atteint en LISANT `PALIERS_DISTANCE_KM`. Ce
 * test prouve que cette table est bien celle que `scoreDistance` applique : sans lui,
 * quelqu'un pourrait régler un seuil dans la fonction sans toucher la table, et l'écran
 * décrirait un barème qui n'existe plus — sans qu'aucun test ne tombe.
 */
describe("paliers de distance — la table EST le barème", () => {
  it("chaque palier rend ses points, à la borne exacte", () => {
    for (const p of PALIERS_DISTANCE_KM) {
      expect(scoreDistance(p.max)).toBe(p.points);
    }
  });

  it("juste au-dessus d'une borne, on tombe dans le palier suivant", () => {
    // Discrimination : si la fonction ignorait la table, ces deux comptes coïncideraient.
    for (let i = 0; i < PALIERS_DISTANCE_KM.length - 1; i += 1) {
      const ici = PALIERS_DISTANCE_KM[i]!;
      const suivant = PALIERS_DISTANCE_KM[i + 1]!;
      expect(scoreDistance(ici.max + 0.1)).toBe(suivant.points);
      expect(suivant.points).toBeLessThan(ici.points);
    }
  });

  it("la table est ordonnée et couvre le rayon utile", () => {
    const bornes = PALIERS_DISTANCE_KM.map((p) => p.max);
    expect(bornes).toEqual([...bornes].sort((a, b) => a - b));
    // La jauge n'a de sens que si le dernier palier reste SOUS le rayon maximal : au-delà,
    // l'offre est écartée et il n'y a plus rien à jauger.
    expect(bornes[bornes.length - 1]!).toBeLessThan(RAYON_MAX_KM);
  });
});

describe("les paliers de distance couvrent tout le rayon (ADR-0014 D1)", () => {
  it("ne REMONTE jamais quand la distance augmente", () => {
    // ⚠️ L'INVARIANT QUI COMPTE. Un palier mal ordonné produirait un barème où s'éloigner
    // rapporte des points — sans erreur visible, sans test rouge ailleurs, et avec des
    // notes parfaitement plausibles.
    let precedent = Number.POSITIVE_INFINITY;
    for (let km = 0; km <= RAYON_MAX_KM + 20; km++) {
      const p = scoreDistance(km);
      expect(p, `${km} km`).toBeLessThanOrEqual(precedent);
      precedent = p;
    }
  });

  it("distingue encore les distances au-delà du dernier palier court", () => {
    // C'est le défaut corrigé : à 35 km de dernier palier, 40 km et 250 km valaient pareil.
    expect(scoreDistance(40)).toBeGreaterThan(scoreDistance(100));
    expect(scoreDistance(100)).toBeGreaterThan(scoreDistance(250));
  });

  it("chute nettement après ~50 km — la réponse de Marc, pas un réglage arbitraire", () => {
    expect(scoreDistance(50)).toBeGreaterThanOrEqual(2 * scoreDistance(80));
  });

  it("le dernier palier reste DANS le rayon, et au-delà du rayon vaut zéro", () => {
    const dernier = PALIERS_DISTANCE_KM[PALIERS_DISTANCE_KM.length - 1]!;
    expect(dernier.max).toBeLessThan(RAYON_MAX_KM);
    expect(scoreDistance(RAYON_MAX_KM)).toBeGreaterThan(0);
    expect(scoreDistance(RAYON_MAX_KM + 1)).toBe(0);
  });
});

describe("un titre de technicien n'est plus puni (ADR-0015)", () => {
  it("vaut autant qu'un contenu technique sans encadrement", () => {
    // ⚠️ DÉRIVÉ DES CONSTANTES, pas de leurs valeurs du jour : c'est le RAPPORT entre les
    // deux qui est la décision, pas le nombre 26.
    expect(PROFIL_DEFAUT.pointsRole.technicien).toBe(PROFIL_DEFAUT.pointsRole.technique);
    expect(scoreFitRole("Technicien en automatisation")).toBe(
      PROFIL_DEFAUT.pointsRole.technique,
    );
  });

  it("la branche EXISTE toujours — elle est ré-évaluée, pas supprimée", () => {
    // Un profil plus avancé voudra peut-être repénaliser. Le test échoue si quelqu'un
    // retire la branche en croyant simplifier : la valeur redeviendrait réglable, le
    // comportement non.
    const punitif = { ...PROFIL_DEFAUT, pointsRole: { ...PROFIL_DEFAUT.pointsRole, technicien: 3 } };
    expect(scoreFitRole("Technicien en automatisation", "", punitif)).toBe(3);
  });

  it("un titre de technicien AVEC coordination garde la valeur supérieure", () => {
    // « Superviseur technique » ne doit pas tomber sur la branche technicien.
    expect(scoreFitRole("Coordonnateur technicien automatisation")).toBeGreaterThan(
      PROFIL_DEFAUT.pointsRole.technique,
    );
  });
});

describe("une exigence d'expérience hors d'atteinte pénalise doucement (ADR-0015)", () => {
  it("le plancher reste au-dessus de la moitié du cas « non précisé »", () => {
    // « Ça diminue le score mais pas drastiquement » — la borne se dérive du neutre, jamais
    // d'un nombre écrit ici.
    expect(PROFIL_DEFAUT.senioritePlancher).toBeGreaterThan(
      PROFIL_DEFAUT.senioriteNonPrecisee / 2,
    );
  });

  it("une annonce très exigeante tombe sur le plancher, pas à zéro", () => {
    // ⚠️ CE TEST EXISTE PARCE QUE L'AUDIT NE POUVAIT PAS LE FAIRE : aucune offre du seed ne
    // déclenche le plancher de séniorité, donc le changement n'y bougeait rien. Un
    // changement qu'aucune mesure n'exerce doit au moins avoir son test.
    const note = scoreSeniorite("Nous demandons 15 ans d'expérience en gestion.");
    expect(note).toBe(PROFIL_DEFAUT.senioritePlancher);
    expect(note).toBeGreaterThan(0);
  });
});
