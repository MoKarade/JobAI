// tests/travaux.test.ts — le gate qui décide si un travail de fond a encore à faire.
//
// Ce qui est verrouillé ici est le défaut EXACT que Marc a décrit : « j'ai toujours pas
// toutes les adresses, POURTANT les trajets Maps marchent ». Les deux moitiés de la phrase
// avaient la même cause — le gate ne regardait que la distance, donc il se refermait au
// moment précis où les trajets se mettaient à marcher, et affamait les deux autres travaux
// qui vivent dans la même passe.
//
// Le premier test ci-dessous échoue sur l'ancien gate. C'est sa raison d'être.

import { describe, it, expect } from "vitest";
import {
  DELAI_RETENTE_ADRESSE_MS,
  DELAI_RETENTE_POSITION_MS,
  adresseARattraper,
  bornesAMesurer,
  choisirARaffiner,
  detailsAEnrichir,
  distanceAMesurer,
  positionARaffiner,
  resteDuTravail,
  type LieuTravail,
  type OffreTravail,
} from "../lib/travaux";

const MAINTENANT = new Date("2026-08-05T12:00:00Z");
const ilYA = (ms: number) => new Date(MAINTENANT.getTime() - ms);

function lieu(p: Partial<LieuTravail> = {}): LieuTravail {
  return {
    precision: "exacte",
    adresse: "1 rue Exemple, Québec",
    bornesLe: ilYA(1000),
    geocodeLe: ilYA(DELAI_RETENTE_ADRESSE_MS * 2),
    // Sans `placeGoogleId`, rien à enrichir : le défaut ne doit PAS faire apparaître du
    // travail que les tests existants ne s'attendent pas à voir.
    placeGoogleId: null,
    detailsLe: null,
    ...p,
  };
}

function offre(p: Partial<OffreTravail> = {}): OffreTravail {
  return { histo: false, perimeeLe: null, km: 12, ...p };
}

describe("le défaut de Marc : « les trajets marchent, mais pas les adresses »", () => {
  it("reste du travail quand TOUTES les distances sont mesurées mais qu'une adresse manque", () => {
    // ⚠️ LE TEST DISCRIMINANT. L'ancien gate — `offres.some(o => o.km === null)` — rend
    // FAUX ici : toutes les distances sont là. C'est exactement l'état dans lequel l'app
    // s'installait après quelques jours, et à partir duquel plus aucune page ne relançait
    // le rattrapage. Seul le cron nocturne travaillait encore, six entreprises par nuit.
    const offres = [offre({ km: 12 }), offre({ km: 30 })];
    const lieux = [lieu({ adresse: null })];

    expect(offres.some(distanceAMesurer)).toBe(false); // les trajets marchent…
    expect(resteDuTravail(offres, lieux, MAINTENANT)).toBe(true); // …et il reste à faire.
  });

  it("reste du travail quand une entreprise n'a jamais été interrogée pour les bornes", () => {
    const offres = [offre({ km: 12 })];
    expect(resteDuTravail(offres, [lieu({ bornesLe: null })], MAINTENANT)).toBe(true);
  });

  it("ne reste RIEN quand les trois travaux sont faits — le gate doit CONVERGER", () => {
    // Sans cette assertion, on aurait remplacé un gate qui s'éteint trop tôt par un gate
    // qui ne s'éteint jamais : chaque affichage relancerait une passe pour rien, et
    // Nominatim bannit les appelants insistants.
    expect(resteDuTravail([offre()], [lieu()], MAINTENANT)).toBe(false);
  });
});

describe("adresse à rattraper", () => {
  it("oui : position exacte, pas d'adresse, dernière tentative ancienne", () => {
    expect(adresseARattraper(lieu({ adresse: null }), MAINTENANT)).toBe(true);
  });

  it("non quand l'adresse est déjà là", () => {
    expect(adresseARattraper(lieu(), MAINTENANT)).toBe(false);
  });

  it("JAMAIS sur un repli au centre de la ville", () => {
    // L'adresse rendue serait celle de la municipalité, posée sur l'épingle d'une usine.
    // Une donnée plausible et fausse est pire qu'une donnée absente (garde-fou n°3).
    expect(adresseARattraper(lieu({ precision: "ville", adresse: null }), MAINTENANT)).toBe(false);
  });

  it("attend le délai avant de reposer une question restée sans réponse", () => {
    // Le cas qui empêche le gate de boucler : une entreprise qu'OpenStreetMap ne connaît
    // pas sous ce nom n'aura jamais d'adresse. Sans ce délai, elle resterait « à faire » à
    // vie et chaque affichage de la carte redemanderait la même chose au même service.
    const juste = lieu({ adresse: null, geocodeLe: ilYA(DELAI_RETENTE_ADRESSE_MS - 1000) });
    expect(adresseARattraper(juste, MAINTENANT)).toBe(false);

    const assezVieux = lieu({ adresse: null, geocodeLe: ilYA(DELAI_RETENTE_ADRESSE_MS + 1000) });
    expect(adresseARattraper(assezVieux, MAINTENANT)).toBe(true);
  });

  it("les cas de bordure se dérivent de la CONSTANTE, jamais d'une durée du jour", () => {
    // Un test qui coderait « 24 h » en dur mentirait au premier ajustement du délai.
    const pile = lieu({ adresse: null, geocodeLe: ilYA(DELAI_RETENTE_ADRESSE_MS) });
    expect(adresseARattraper(pile, MAINTENANT)).toBe(true);
  });
});

describe("position à raffiner — le rattrapage de la règle de résolution", () => {
  it("oui : posée au centre-ville, et pas retentée depuis longtemps", () => {
    const vieille = lieu({
      precision: "ville",
      adresse: null,
      geocodeLe: ilYA(DELAI_RETENTE_POSITION_MS + 1000),
    });
    expect(positionARaffiner(vieille, MAINTENANT)).toBe(true);
  });

  it("JAMAIS sur une position déjà exacte — on ne dégrade pas ce qui est juste", () => {
    const exacte = lieu({
      precision: "exacte",
      geocodeLe: ilYA(DELAI_RETENTE_POSITION_MS * 2),
    });
    expect(positionARaffiner(exacte, MAINTENANT)).toBe(false);
  });

  it("attend le délai — une entreprise absente d'OSM n'y sera pas demain", () => {
    const recente = lieu({
      precision: "ville",
      adresse: null,
      geocodeLe: ilYA(DELAI_RETENTE_POSITION_MS - 1000),
    });
    expect(positionARaffiner(recente, MAINTENANT)).toBe(false);
  });

  it("le délai des positions est plus long que celui des adresses", () => {
    // Dérivé des constantes, jamais de leurs valeurs du jour : les retenter aussi souvent
    // que les adresses ferait un filet d'appels permanent pour une réponse qui ne change
    // presque jamais.
    expect(DELAI_RETENTE_POSITION_MS).toBeGreaterThan(DELAI_RETENTE_ADRESSE_MS);
  });

  it("reste du travail tant qu'une entreprise est au centre-ville", () => {
    // ⚠️ LE POINT QUI COMPTE. Sans ce terme, la règle de résolution élargie ne profiterait
    // qu'aux entreprises À VENIR : les deux passes de géocodage écartent ce qui est déjà
    // situé, et un repli au centre-ville EST situé. Les dizaines déjà posées au centre y
    // resteraient à vie, et le ratio signalé par Marc ne bougerait pas d'un point.
    const auCentre = lieu({
      precision: "ville",
      adresse: null,
      geocodeLe: ilYA(DELAI_RETENTE_POSITION_MS + 1000),
    });
    expect(resteDuTravail([offre()], [auCentre], MAINTENANT)).toBe(true);
  });
});

describe("bornes à mesurer", () => {
  it("oui tant que le lieu n'a jamais été interrogé", () => {
    expect(bornesAMesurer(lieu({ bornesLe: null }))).toBe(true);
  });

  it("non une fois interrogé — même si la réponse était « aucune borne »", () => {
    // « Interrogé, zéro borne » est une RÉPONSE, et elle se garde. Reposer la question
    // chaque jour à un service bénévole pour une réponse qui ne changera pas serait du
    // martèlement ; les bornes ne poussent pas du jour au lendemain.
    expect(bornesAMesurer(lieu({ bornesLe: ilYA(1) }))).toBe(false);
  });
});

describe("détails Places à enrichir — [CARTE-03-PLACES]", () => {
  it("oui : un `placeGoogleId` connu, jamais interrogé", () => {
    expect(
      detailsAEnrichir(lieu({ placeGoogleId: "ChIJ-exemple", detailsLe: null })),
    ).toBe(true);
  });

  it("non sans `placeGoogleId` — rien à interroger (entreprise résolue par Nominatim)", () => {
    expect(detailsAEnrichir(lieu({ placeGoogleId: null, detailsLe: null }))).toBe(false);
  });

  it("non une fois interrogé — même si Google ne publie rien", () => {
    expect(
      detailsAEnrichir(lieu({ placeGoogleId: "ChIJ-exemple", detailsLe: ilYA(1) })),
    ).toBe(false);
  });

  it("reste du travail tant qu'une entreprise Google n'a pas été enrichie", () => {
    const offres = [offre()];
    const lieux = [lieu({ placeGoogleId: "ChIJ-exemple", detailsLe: null })];
    expect(resteDuTravail(offres, lieux, MAINTENANT)).toBe(true);
  });
});

describe("distance à mesurer", () => {
  it("oui sur une offre active sans distance", () => {
    expect(distanceAMesurer(offre({ km: null }))).toBe(true);
  });

  it("non sur une candidature historique", () => {
    expect(distanceAMesurer(offre({ km: null, histo: true }))).toBe(false);
  });

  it("non sur une offre périmée — mesurer un poste fermé ne sert personne", () => {
    expect(distanceAMesurer(offre({ km: null, perimeeLe: "2026-08-01" }))).toBe(false);
  });
});

// ── `choisirARaffiner` — QUI obtient une tentative, et qui bloque la file ──────────────
//
// Le défaut que ces cas verrouillent est une LIGNE D'ORDRE, pas une arithmétique : la file
// était tranchée à `max` AVANT que les entrées sans ville soient écartées. Une éligible sans
// ville consommait donc une place, sans qu'aucune requête parte — donc sans que son
// `geocodeLe` soit marqué, donc en revenant en tête de file à la passe suivante, pour
// toujours. Mesuré en production le 2026-09-18 : huit places pour 1 087 attentes.

describe("choisir qui raffiner", () => {
  const ilYaDesJours = (n: number) => new Date(MAINTENANT.getTime() - n * 24 * 60 * 60 * 1000);

  function candidate(nom: string, jours: number): LieuTravail & { nom: string } {
    return { ...lieu({ precision: "ville", geocodeLe: ilYaDesJours(jours) }), nom };
  }

  /** Toutes ont une ville : le cas nominal, où seul l'ordre est en jeu. */
  const villePartout = () => "Québec";

  it("sert les plus anciennement tentées d'abord — l'invariant de rotation de la file", () => {
    const lieux = [candidate("recente", 8), candidate("ancienne", 40), candidate("moyenne", 20)];
    const choix = choisirARaffiner(lieux, villePartout, MAINTENANT, 2);
    expect(choix.servies.map((s) => s.lieu.nom)).toEqual(["ancienne", "moyenne"]);
    expect(choix.sansTentative).toBe(1);
  });

  it("n'examine que les éligibles — une position exacte ou trop fraîche reste dehors", () => {
    const lieux = [
      candidate("a-raffiner", 40),
      { ...lieu({ precision: "exacte" }), nom: "deja-exacte" },
      candidate("trop-fraiche", 1),
    ];
    const choix = choisirARaffiner(lieux, villePartout, MAINTENANT, 10);
    expect(choix.servies.map((s) => s.lieu.nom)).toEqual(["a-raffiner"]);
    expect(choix.sansTentative).toBe(0);
    expect(choix.sansVille).toBe(0);
  });

  it("une éligible SANS VILLE ne consomme aucune place du quota", () => {
    // Les deux bloqueuses sont les PLUS ANCIENNES : sous l'ancien ordre elles prenaient les
    // deux places et la passe ne partait avec rien.
    const lieux = [
      candidate("bloqueuse-1", 90),
      candidate("bloqueuse-2", 80),
      candidate("servable-1", 40),
      candidate("servable-2", 30),
    ];
    const villeDe = (nom: string) => (nom.startsWith("bloqueuse") ? null : "Québec");
    const choix = choisirARaffiner(lieux, villeDe, MAINTENANT, 2);
    expect(choix.servies.map((s) => s.lieu.nom)).toEqual(["servable-1", "servable-2"]);
  });

  it("compte les sans-ville À PART — elles n'attendent pas leur tour, elles attendent une donnée", () => {
    const lieux = [candidate("muette", 90), candidate("a", 40), candidate("b", 30)];
    const villeDe = (nom: string) => (nom === "muette" ? null : "Québec");
    const choix = choisirARaffiner(lieux, villeDe, MAINTENANT, 1);
    expect(choix.sansVille).toBe(1);
    // ⚠️ Le point du cas : `sansTentative` ne compte QUE `b`. Y ajouter `muette` dirait
    // « ça avance lentement » là où il faut retrouver une ville.
    expect(choix.sansTentative).toBe(1);
  });

  it("la ville retenue voyage avec la ligne — elle n'est résolue qu'une fois", () => {
    const lieux = [candidate("usine", 40)];
    const choix = choisirARaffiner(lieux, (nom) => `Ville de ${nom}`, MAINTENANT, 5);
    expect(choix.servies).toEqual([{ lieu: lieux[0], ville: "Ville de usine" }]);
  });

  it("ne demande la ville qu'une fois par éligible, et jamais pour une non-éligible", () => {
    const appels: string[] = [];
    const lieux = [
      candidate("eligible-1", 40),
      candidate("eligible-2", 30),
      { ...lieu({ precision: "exacte" }), nom: "hors-jeu" },
    ];
    choisirARaffiner(
      lieux,
      (nom) => {
        appels.push(nom);
        return "Québec";
      },
      MAINTENANT,
      1,
    );
    expect(appels).toEqual(["eligible-1", "eligible-2"]);
  });

  it("quota nul : rien n'est servi et tout attend — un arrêt, pas une erreur", () => {
    const lieux = [candidate("a", 40), candidate("b", 30)];
    const choix = choisirARaffiner(lieux, villePartout, MAINTENANT, 0);
    expect(choix.servies).toEqual([]);
    expect(choix.sansTentative).toBe(2);
  });
});
