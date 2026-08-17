// tests/profil.test.ts — le profil sort du code sans que le barème bouge.
//
// ⚠️ CE FICHIER EST UN TRIPWIRE : il verrouille des VALEURS, pas une forme.
//
// La règle habituelle du dépôt est qu'un test dérive ses cas de la constante qu'il éprouve,
// jamais de sa valeur du jour — sinon il ment au premier réglage. Ici c'est l'INVERSE, et
// c'est délibéré : ADR-0009 a déplacé tout le barème de `scoring.ts` vers `PROFIL_DEFAUT`,
// et la seule chose qui distingue ce déplacement d'une régression silencieuse de la
// notation, c'est une table écrite à la main qui dit ce que le barème rendait AVANT.
//
// Donc : ces nombres sont recopiés à dessein. Si tu changes `PROFIL_DEFAUT` et que ce
// fichier tombe, il fait son travail. Un ajustement mérité se livre dans un commit qui
// l'annonce, avec le tableau avant/après des notes réelles — pas dans un refactor.

import { describe, it, expect } from "vitest";
import {
  PROFIL_DEFAUT,
  ProfilSchema,
  paliersSenioriteDepuisAnnees,
  type Profil,
} from "@/lib/profil";
import { SEUIL_ABSENCES_PEREMPTION } from "@/lib/veille";
import {
  computeScore,
  scoreDistance,
  scoreFitRole,
  scoreImmigration,
  scoreSalaire,
  scoreSeniorite,
  dansLeRayon,
  PONDERATION,
  PALIERS_DISTANCE_KM,
  PLAFOND_NOTE_CALCULEE,
  RAYON_MAX_KM,
} from "@/lib/scoring";
import { SEED } from "@/lib/seed";

describe("le barème d'avant ADR-0009, valeur par valeur", () => {
  it("distance — bornes exactes, bascule au palier suivant, inconnue neutre", () => {
    expect(scoreDistance(0)).toBe(20);
    expect(scoreDistance(5)).toBe(20);
    expect(scoreDistance(5.1)).toBe(18);
    expect(scoreDistance(10)).toBe(18);
    expect(scoreDistance(10.1)).toBe(15);
    expect(scoreDistance(15)).toBe(15);
    expect(scoreDistance(25)).toBe(11);
    expect(scoreDistance(35)).toBe(8);
    // Dans le rayon, au-delà du dernier palier : le plancher, pas zéro.
    expect(scoreDistance(36)).toBe(5);
    expect(scoreDistance(50)).toBe(5);
    // Hors rayon : zéro.
    expect(scoreDistance(50.1)).toBe(0);
    // Inconnue : NEUTRE. Un zéro dirait « c'est loin » — or on ne sait pas.
    expect(scoreDistance(null)).toBe(10);
    expect(scoreDistance(undefined)).toBe(10);
  });

  it("séniorité — atteignable, étirée, hors de portée, non précisée", () => {
    expect(scoreSeniorite("2 ans d'expérience")).toBe(15);
    expect(scoreSeniorite("3 ans d'expérience")).toBe(13);
    expect(scoreSeniorite("5 ans d'expérience")).toBe(9);
    expect(scoreSeniorite("6 ans d'expérience")).toBe(5);
    expect(scoreSeniorite("10 ans d'expérience")).toBe(5);
    // Non précisée : neutre FAVORABLE — une absence d'exigence n'est pas un obstacle.
    expect(scoreSeniorite("")).toBe(11);
    expect(scoreSeniorite("on cherche quelqu'un de motivé")).toBe(11);
  });

  it("salaire — seuils exacts, non affiché neutre", () => {
    expect(scoreSalaire(90_000)).toBe(15);
    expect(scoreSalaire(120_000)).toBe(15);
    expect(scoreSalaire(89_999)).toBe(14);
    expect(scoreSalaire(80_000)).toBe(14);
    expect(scoreSalaire(70_000)).toBe(12);
    expect(scoreSalaire(60_000)).toBe(9);
    expect(scoreSalaire(59_999)).toBe(5);
    expect(scoreSalaire(0)).toBe(5);
    // Non affiché : neutre. Pénaliser reviendrait à noter la communication de l'employeur.
    expect(scoreSalaire(null)).toBe(9);
  });

  it("immigration — barrière ferme, ordre professionnel, rien", () => {
    expect(scoreImmigration("citoyenneté canadienne exigée")).toBe(0);
    // Le synonyme ajouté le 2026-08-12 après une annonce réelle qui passait au travers.
    expect(scoreImmigration("apte aux enquêtes de sécurité")).toBe(0);
    expect(scoreImmigration("membre de l'ordre des ingénieurs")).toBe(6);
    expect(scoreImmigration("aucune exigence particulière")).toBe(10);
  });

  it("rôle — la combinaison, puis chaque moitié, puis le recul", () => {
    expect(scoreFitRole("Coordonnateur automatisation")).toBe(40);
    expect(scoreFitRole("Chargé(e) de projets")).toBe(28); // écriture inclusive normalisée
    expect(scoreFitRole("Spécialiste en robotique")).toBe(26);
    expect(scoreFitRole("Technicien de maintenance")).toBe(14);
    expect(scoreFitRole("Commis aux ventes")).toBe(8);
  });

  it("la somme de la pondération fait 100", () => {
    const somme = Object.values(PROFIL_DEFAUT.ponderation).reduce((a, b) => a + b, 0);
    expect(somme).toBe(100);
  });
});

describe("les constantes historiques DÉRIVENT du profil", () => {
  // Elles restent exportées pour les écrans qui les affichent. Le point n'est pas
  // qu'elles existent, c'est qu'elles ne puissent plus DIVERGER de ce que le barème
  // applique — une valeur affichée à côté d'un calcul qui en utilise une autre est
  // exactement le bug que ce dépôt a déjà payé sur les paliers de distance.
  it("PONDERATION, RAYON_MAX_KM, PALIERS_DISTANCE_KM, PLAFOND sont ceux du profil", () => {
    expect(PONDERATION).toBe(PROFIL_DEFAUT.ponderation);
    expect(RAYON_MAX_KM).toBe(PROFIL_DEFAUT.rayonMaxKm);
    expect(PALIERS_DISTANCE_KM).toBe(PROFIL_DEFAUT.paliersDistanceKm);
    expect(PLAFOND_NOTE_CALCULEE).toBe(PROFIL_DEFAUT.plafondNoteCalculee);
  });
});

/**
 * Le profil est-il VRAIMENT branché ?
 *
 * ⚠️ C'EST LE TEST QUI COMPTE LE PLUS. Tout le reste de ce fichier passerait encore si le
 * refactor était un trompe-l'œil — un `Profil` accepté en paramètre puis ignoré, les vraies
 * valeurs restées en dur dans les fonctions. Les notes seraient identiques (elles le sont
 * par construction), et le chantier entier reposerait sur du vide.
 *
 * On modifie donc le profil et on exige que la note SUIVE.
 */
describe("un profil modifié change la note", () => {
  /** Le profil par défaut, avec un seul réglage déplacé. */
  function variante(patch: Partial<Profil>): Profil {
    return ProfilSchema.parse({ ...PROFIL_DEFAUT, ...patch, version: PROFIL_DEFAUT.version + 1 });
  }

  it("un rayon élargi fait entrer une offre qui était hors rayon", () => {
    expect(dansLeRayon(60)).toBe(false);
    expect(dansLeRayon(60, variante({ rayonMaxKm: 80 }))).toBe(true);
    expect(scoreDistance(60)).toBe(0);
    expect(scoreDistance(60, variante({ rayonMaxKm: 80 }))).toBe(5);
  });

  it("des paliers de distance resserrés baissent la note d'une offre lointaine", () => {
    const strict = variante({ paliersDistanceKm: [{ max: 5, points: 20 }] });
    expect(scoreDistance(12)).toBe(15);
    expect(scoreDistance(12, strict)).toBe(5); // au-delà du seul palier : plancher
  });

  it("plus d'expérience rend une annonce exigeante atteignable", () => {
    // Le cas concret : le CV établit 5 ans, une annonce en demande 5.
    const cinqAns = variante({ paliersSeniorite: paliersSenioriteDepuisAnnees(5) });
    expect(scoreSeniorite("5 ans d'expérience")).toBe(9); // avec le profil d'aujourd'hui
    expect(scoreSeniorite("5 ans d'expérience", cinqAns)).toBe(13); // « à mon niveau »
    expect(scoreSeniorite("3 ans d'expérience", cinqAns)).toBe(15); // en dessous : plein pot
  });

  it("un vocabulaire technique élargi fait matcher un métier qui ne matchait pas", () => {
    expect(scoreFitRole("Superviseur soudage")).toBe(28); // coordination seule
    const soudage = variante({ motsTechnique: [...PROFIL_DEFAUT.motsTechnique, "soudage"] });
    // ⚠️ Le profil est le TROISIÈME paramètre, après la description. Le passer en deuxième
    // ne lève rien : il est lu comme une description, la note ne bouge pas, et le test
    // « prouve » alors que le profil n'est pas branché. (Erreur commise en écrivant ce
    // fichier — gardée en commentaire parce que le prochain la referait.)
    expect(scoreFitRole("Superviseur soudage", "", soudage)).toBe(40); // la combinaison
  });

  it("un disqualifiant ajouté écarte une offre qui passait", () => {
    expect(scoreImmigration("poste réservé aux détenteurs d'un permis fermé")).toBe(10);
    const strict = variante({
      motsDisqualifiants: [...PROFIL_DEFAUT.motsDisqualifiants, "permis fermé"],
    });
    expect(scoreImmigration("poste réservé aux détenteurs d'un permis fermé", strict)).toBe(0);
  });

  it("le plafond des notes calculées est celui du profil", () => {
    const parfaite = { titre: "Coordonnateur automatisation", km: 1, salaireAnnuel: 120_000 };
    expect(computeScore(parfaite).brut).toBeGreaterThan(PLAFOND_NOTE_CALCULEE);
    expect(computeScore(parfaite).total).toBe(85);
    expect(computeScore(parfaite, variante({ plafondNoteCalculee: 70 })).total).toBe(70);
  });

  it("la note porte la version du profil qui l'a produite", () => {
    // Sans ce champ, une note devient inexplicable dès la première re-notation :
    // « pourquoi 71 ? » n'a de réponse que si on sait avec quel barème.
    expect(computeScore({ titre: "Coordonnateur" }).profilVersion).toBe(PROFIL_DEFAUT.version);
    expect(computeScore({ titre: "Coordonnateur" }, variante({})).profilVersion).toBe(
      PROFIL_DEFAUT.version + 1,
    );
  });
});

describe("les paliers sont dans un ordre exploitable", () => {
  // `find` rend le PREMIER palier satisfait : un tableau mal ordonné ne lève aucune erreur,
  // il rend simplement la mauvaise tranche pour toujours. L'ordre EST une donnée.
  it("les plafonds montent, les planchers descendent", () => {
    const monte = (xs: readonly { max: number }[]) =>
      xs.every((p, i) => i === 0 || p.max > (xs[i - 1] as { max: number }).max);
    const descend = (xs: readonly { min: number }[]) =>
      xs.every((p, i) => i === 0 || p.min < (xs[i - 1] as { min: number }).min);

    expect(monte(PROFIL_DEFAUT.paliersDistanceKm)).toBe(true);
    expect(monte(PROFIL_DEFAUT.paliersSeniorite)).toBe(true);
    expect(descend(PROFIL_DEFAUT.paliersSalaire)).toBe(true);
    expect(monte(paliersSenioriteDepuisAnnees(5))).toBe(true);
  });
});

describe("le jeu de référence, note par note", () => {
  it("lit un volume plausible d'offres", () => {
    // Un scan qui ne lit rien passerait à vide : protection nulle et silencieuse.
    expect(SEED.length).toBeGreaterThan(20);
  });

  it("aucune note du jeu de référence ne dépasse le plafond calculé", () => {
    for (const o of SEED) {
      const r = computeScore({ titre: o.poste, description: o.notes ?? "", km: o.km });
      expect(r.total).toBeLessThanOrEqual(PLAFOND_NOTE_CALCULEE);
      expect(r.total).toBeGreaterThanOrEqual(0);
    }
  });

  it("les faits du profil par défaut sont VIDES, pas inventés", () => {
    // Tant qu'aucun CV n'a été lu, on ne sait rien. Écrire « 3 ans » ici parce que « c'est
    // probablement ça » serait exactement la donnée fabriquée qu'interdit le garde-fou n°3.
    expect(PROFIL_DEFAUT.faits.anneesExperience).toBeNull();
    expect(PROFIL_DEFAUT.faits.langues).toEqual([]);
    expect(PROFIL_DEFAUT.faits.diplomes).toEqual([]);
    expect(PROFIL_DEFAUT.origine).toBe("defaut");
  });
});

// ⚠️ LE LIEN ENTRE LE BASSIN DE TERMES, LE TIRAGE ET LE SEUIL DE PÉREMPTION.
//
// Ces trois nombres ne sont pas indépendants, et c'est le genre de couplage qu'on oublie
// six semaines plus tard en ajoutant « juste quelques termes ».
//
// La passe tire `termesParJour` termes du bassin, en rotation. Un terme ne revient donc
// qu'après `bassin / termesParJour` jours. Pendant tout ce temps, une offre que ce terme est
// SEUL à trouver est absente des lots — elle accumule des absences alors qu'elle est
// OUVERTE. Si ce cycle atteint `SEUIL_ABSENCES_PEREMPTION`, la rotation périme des offres
// vivantes : un faux positif fabriqué par le mécanisme censé les protéger.
//
// Le test échoue donc si quelqu'un agrandit le bassin sans monter le tirage ou le seuil.
// Sans lui, l'effet serait invisible — des offres qui s'éteignent, et aucune erreur.
describe("bassin de termes, tirage et péremption se commandent l'un l'autre", () => {
  const bassin = PROFIL_DEFAUT.recherches.length;
  const parJour = PROFIL_DEFAUT.termesParJour;

  it("le tirage existe et tient dans le bassin", () => {
    expect(parJour).toBeGreaterThan(0);
    expect(parJour).toBeLessThanOrEqual(bassin);
  });

  it("un terme revient AVANT que ses offres puissent se périmer, avec de la marge", () => {
    const cycleJours = Math.ceil(bassin / parJour);
    // Deux jours de marge : le cycle garantit le retour du terme, la marge absorbe le bruit
    // de source (une source muette un matin ne doit pas suffire à éteindre une offre).
    expect(cycleJours + 2).toBeLessThanOrEqual(SEUIL_ABSENCES_PEREMPTION);
  });

  it("le bassin couvre les deux langues du marché visé", () => {
    // Honeywell, Alstom, AMETEK, STERIS et Domtar ont des établissements dans la région et
    // publient en anglais. Un bassin monolingue les rendait invisibles à la veille.
    const anglais = PROFIL_DEFAUT.recherches.filter((t) =>
      /\b(engineer|manager|supervisor|improvement|manufacturing)\b/i.test(t),
    );
    expect(anglais.length).toBeGreaterThanOrEqual(6);
  });

  it("aucun terme en double — un doublon consomme un tirage pour rien", () => {
    const vus = PROFIL_DEFAUT.recherches.map((t) => t.toLowerCase().trim());
    expect(new Set(vus).size).toBe(vus.length);
  });
});
