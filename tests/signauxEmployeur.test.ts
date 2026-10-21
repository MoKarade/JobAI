// tests/signauxEmployeur.test.ts — les signaux d'un employeur, vérifiables à la main.
//
// Chaque chiffre attendu ci-dessous se refait sur les dates du jeu d'essai : c'est la preuve
// que demande la tâche (JobAI#159 — « vérifiés à la main sur 3 employeurs »). Les noms sont
// fictifs : le dépôt est public.

import { describe, it, expect } from "vitest";
import {
  cleIntitule,
  debutDeLaVeille,
  signauxDe,
  signauxParEmployeur,
  MINIMUM_FERMEES_MEDIANE,
} from "@/lib/signauxEmployeur";
import type { Offre } from "@/lib/types";
import type { JournalVeille } from "@/lib/veille";

function offre(id: string, reste: Partial<Offre> = {}): Offre {
  return {
    id,
    source: "jobbank",
    dateReperage: "2026-09-01",
    entreprise: "Employeur Alpha inc.",
    poste: "Coordonnateur de projets",
    lien: "",
    km: null,
    noc: null,
    ville: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: null,
    scoreSource: null,
    raisons: [],
    notes: "",
    userNote: "",
    histo: false,
    perimeeLe: null,
    ...reste,
  };
}

const vue = (premiereVue: string, derniereVue: string) => ({
  premiereVue,
  derniereVue,
  absences: 0,
});
const FERMEE = "2026-10-10T12:00:00.000Z";

describe("durée d'ouverture", () => {
  // Alpha : trois ouvertes (01-09→16-10 = 45 j ; 01-10→16-10 = 15 j ; sans journal) et
  // quatre fermées de 10, 20, 30 et 40 jours.
  const offres = [
    offre("a1", { poste: "Technicien A" }),
    offre("a2", { poste: "Technicien B" }),
    offre("a3", { poste: "Technicien C" }),
    offre("f1", { poste: "Agent 1", perimeeLe: FERMEE }),
    offre("f2", { poste: "Agent 2", perimeeLe: FERMEE }),
    offre("f3", { poste: "Agent 3", perimeeLe: FERMEE }),
    offre("f4", { poste: "Agent 4", perimeeLe: FERMEE }),
  ];
  const journal: JournalVeille = {
    a1: vue("2026-09-01", "2026-10-16"),
    a2: vue("2026-10-01", "2026-10-16"),
    f1: vue("2026-08-01", "2026-08-11"),
    f2: vue("2026-08-01", "2026-08-21"),
    f3: vue("2026-08-01", "2026-08-31"),
    f4: vue("2026-08-01", "2026-09-10"),
  };
  const s = signauxDe(offres, journal);

  it("compte les ouvertes et les fermées", () => {
    expect([s.offres, s.ouvertes, s.fermees]).toEqual([7, 3, 4]);
  });

  it("la plus ancienne ouverte : jours entre première et dernière vue, et son jour", () => {
    expect(s.plusAncienneOuverte).toEqual({ jours: 45, repereeLe: "2026-09-01" });
  });

  it("une ouverte SANS ligne de journal n'a pas de durée et n'est pas inventée", () => {
    const seule = signauxDe([offre("x")], {});
    expect(seule.ouvertes).toBe(1);
    expect(seule.plusAncienneOuverte).toBeNull();
  });

  it("médiane des fermées : (20 + 30) / 2 = 25, sur 4", () => {
    expect(s.dureeFermeeMedianeJours).toBe(25);
    expect(s.fermeesObservees).toBe(4);
  });

  it("sous l'effectif minimal, pas de médiane — et on dit combien de fermées", () => {
    const deux = signauxDe(
      [offre("f1", { perimeeLe: FERMEE }), offre("f2", { perimeeLe: FERMEE })],
      { f1: vue("2026-08-01", "2026-08-11"), f2: vue("2026-08-01", "2026-08-21") },
    );
    expect(MINIMUM_FERMEES_MEDIANE).toBe(3);
    expect(deux.dureeFermeeMedianeJours).toBeNull();
    expect(deux.fermeesObservees).toBe(2);
  });

  it("une fermée sans journal ne compte pas dans l'assise de la médiane", () => {
    const t = signauxDe(
      [1, 2, 3, 4].map((n) => offre(`f${n}`, { perimeeLe: FERMEE, poste: `Poste ${n}` })),
      { f1: vue("2026-08-01", "2026-08-11"), f2: vue("2026-08-01", "2026-08-21"), f3: vue("2026-08-01", "2026-08-31") },
    );
    expect(t.fermees).toBe(4);
    expect(t.fermeesObservees).toBe(3);
    expect(t.dureeFermeeMedianeJours).toBe(20);
  });

  it("une offre vue un seul jour dure zéro jour : c'est une vraie valeur", () => {
    const t = signauxDe([offre("z")], { z: vue("2026-10-16", "2026-10-16") });
    expect(t.plusAncienneOuverte).toEqual({ jours: 0, repereeLe: "2026-10-16" });
  });

  it("l'historique 2025 est hors veille : il ne compte nulle part", () => {
    const t = signauxDe([offre("h", { histo: true })], { h: vue("2025-01-01", "2025-02-01") });
    expect(t.offres).toBe(0);
    expect(t.plusAncienneOuverte).toBeNull();
  });
});

describe("le premier jour de la veille", () => {
  it("est la plus ancienne première vue du journal, et null sans journal", () => {
    expect(debutDeLaVeille({})).toBeNull();
    expect(
      debutDeLaVeille({ a: vue("2026-09-01", "2026-10-16"), b: vue("2026-08-20", "2026-08-30"), c: vue("2026-10-01", "2026-10-16") }),
    ).toBe("2026-08-20");
  });

  it("une offre ouverte vue dès ce jour-là n'est jamais « mesurable » ; une plus tardive l'est", () => {
    const journal: JournalVeille = { a: vue("2026-08-20", "2026-10-16"), b: vue("2026-09-20", "2026-10-16") };
    const s = signauxDe([offre("a", { poste: "A" }), offre("b", { poste: "B" })], journal);
    expect(s.plusAncienneOuverte).toEqual({ jours: 57, repereeLe: "2026-08-20" });
    expect(s.plusAncienneOuverteMesurable).toEqual({ jours: 26, repereeLe: "2026-09-20" });
    expect(signauxDe([offre("a")], { a: vue("2026-08-20", "2026-10-16") }).plusAncienneOuverteMesurable).toBeNull();
  });
});

describe("intitulés repris", () => {
  it("compare sans accent, casse ni ponctuation", () => {
    expect(cleIntitule("Technicien(ne)  ÉLECTRIQUE")).toBe(cleIntitule("technicien ne electrique"));
  });

  it("Bêta publie trois fois le même intitulé et une fois un autre : 2 offres « en plus »", () => {
    const offres = [
      offre("b1", { entreprise: "Bêta ltée", poste: "Analyste de données" }),
      offre("b2", { entreprise: "Bêta ltée", poste: "analyste de donnees", perimeeLe: FERMEE }),
      offre("b3", { entreprise: "Bêta ltée", poste: "Analyste de données !", perimeeLe: FERMEE }),
      offre("b4", { entreprise: "Bêta ltée", poste: "Gestionnaire" }),
    ];
    const s = signauxDe(offres, {});
    expect(s.intitulesRepris).toEqual([{ intitule: "Analyste de données", fois: 3 }]);
    expect(s.intitulesReprisTotal).toBe(2);
  });

  it("deux intitulés différents ne sont pas repris", () => {
    const s = signauxDe([offre("c1", { poste: "Agent" }), offre("c2", { poste: "Agent senior" })], {});
    expect(s.intitulesRepris).toEqual([]);
    expect(s.intitulesReprisTotal).toBe(0);
  });

  it("n'en montre que trois, le total les compte tous", () => {
    const offres = ["A", "B", "C", "D"].flatMap((p) => [
      offre(`${p}1`, { poste: `Poste ${p}` }),
      offre(`${p}2`, { poste: `Poste ${p}` }),
    ]);
    const s = signauxDe(offres, {});
    expect(s.intitulesRepris).toHaveLength(3);
    expect(s.intitulesReprisTotal).toBe(4);
  });
});

describe("par employeur", () => {
  it("regroupe sous la MÊME clé que la liste : « Alpha inc. » et « Alpha »", () => {
    const r = signauxParEmployeur(
      [
        offre("1", { entreprise: "Alpha inc." }),
        offre("2", { entreprise: "ALPHA" }),
        offre("3", { entreprise: "Gamma" }),
      ],
      {},
    );
    expect(Object.keys(r).sort()).toEqual(["alpha", "gamma"]);
    expect(r["alpha"]?.offres).toBe(2);
  });

  it("deux offres sans nom d'employeur restent chacune leur groupe", () => {
    const r = signauxParEmployeur([offre("1", { entreprise: " " }), offre("2", { entreprise: " " })], {});
    expect(Object.keys(r)).toHaveLength(2);
  });

  it("un employeur qui n'a que de l'historique n'a pas de signaux", () => {
    expect(signauxParEmployeur([offre("1", { histo: true })], {})).toEqual({});
  });
});
