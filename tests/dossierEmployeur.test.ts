// tests/dossierEmployeur.test.ts — la lettre A, B ou C d'un employeur, et la preuve de chaque ligne (JobAI#161).
//
// Données FICTIVES : aucun vrai employeur. Chaque cas se refait à la main avec les seuils de `lib/dossierEmployeur.ts`.

import { describe, it, expect } from "vitest";
import {
  dossierEmployeur,
  MINIMUM_OBSERVEES,
  OBSERVEES_POUR_A,
  SEUIL_INTITULES_REPRIS,
  SEUIL_MEDIANE_LONGUE_JOURS,
  SEUIL_OUVERTE_LONGUE_JOURS,
  SOURCE_SUIVI,
} from "../lib/dossierEmployeur";
import { signauxDe, type SignauxEmployeur } from "../lib/signauxEmployeur";
import type { Offre } from "../lib/types";
import type { JournalVeille } from "../lib/veille";

/** Des signaux calmes et bien observés : un A, que chaque test dégrade d'un seul champ. */
function signaux(reste: Partial<SignauxEmployeur> = {}): SignauxEmployeur {
  return {
    offres: 8,
    ouvertes: 2,
    fermees: 6,
    plusAncienneOuverte: { jours: 20, repereeLe: "2026-09-26" },
    dureeFermeeMedianeJours: 12,
    fermeesObservees: 6,
    offresObservees: 8,
    observeLe: "2026-10-16",
    intitulesReprisTotal: 0,
    intitulesRepris: [],
    ...reste,
  };
}

describe("dossier d'un employeur — la lettre", () => {
  it("A : aucun signal défavorable et une assise suffisante", () => {
    const d = dossierEmployeur(signaux());
    expect(d.lettre).toBe("A");
    expect(d.resume).toContain("aucun signal défavorable");
  });

  it("B : un seul signal défavorable (une offre ouverte depuis longtemps)", () => {
    const d = dossierEmployeur(
      signaux({ plusAncienneOuverte: { jours: SEUIL_OUVERTE_LONGUE_JOURS, repereeLe: "2026-08-17" } }),
    );
    expect(d.lettre).toBe("B");
    expect(d.lignes.filter((l) => l.ton === "defavorable")).toHaveLength(1);
  });

  it("C : deux signaux défavorables", () => {
    const d = dossierEmployeur(
      signaux({
        plusAncienneOuverte: { jours: 90, repereeLe: "2026-07-18" },
        intitulesReprisTotal: SEUIL_INTITULES_REPRIS,
        intitulesRepris: [{ intitule: "aide de cuisine", fois: 3 }],
      }),
    );
    expect(d.lettre).toBe("C");
  });

  it("une médiane de fermeture longue est un signal défavorable", () => {
    const d = dossierEmployeur(signaux({ dureeFermeeMedianeJours: SEUIL_MEDIANE_LONGUE_JOURS }));
    expect(d.lettre).toBe("B");
  });

  it("⚠️ un A n'est jamais donné sans assise : peu d'offres observées donnent B, pas A", () => {
    const peu = dossierEmployeur(signaux({ offresObservees: OBSERVEES_POUR_A - 1 }));
    expect(peu.lettre).toBe("B");
    expect(peu.resume).toContain("trop peu d'offres observées");
    const sansMediane = dossierEmployeur(signaux({ fermeesObservees: 2, dureeFermeeMedianeJours: null }));
    expect(sansMediane.lettre).toBe("B");
  });

  it("⚠️ « inconnu » sous le minimum d'offres observées, et sans aucune ligne", () => {
    const d = dossierEmployeur(signaux({ offresObservees: MINIMUM_OBSERVEES - 1 }));
    expect(d.lettre).toBe("inconnu");
    expect(d.lignes).toEqual([]);
    expect(d.resume).toContain("Inconnu");
  });

  it("⚠️ « inconnu » quand la veille n'a jamais rien observé, ou qu'il n'y a pas de signaux", () => {
    expect(dossierEmployeur(signaux({ observeLe: null, offresObservees: 0 })).lettre).toBe("inconnu");
    expect(dossierEmployeur(null).lettre).toBe("inconnu");
    expect(dossierEmployeur(undefined).lettre).toBe("inconnu");
  });
});

describe("dossier d'un employeur — chaque ligne cite sa source et sa date", () => {
  it("toutes les lignes portent la source du suivi et le dernier jour observé", () => {
    const d = dossierEmployeur(signaux());
    expect(d.lignes.length).toBeGreaterThanOrEqual(4);
    for (const l of d.lignes) {
      expect(l.source).toBe(SOURCE_SUIVI);
      expect(l.date).toBe("2026-10-16");
      expect(l.texte.length).toBeGreaterThan(10);
    }
  });

  it("une ligne sans durée dit qu'elle est inconnue au lieu d'inventer un chiffre", () => {
    const d = dossierEmployeur(signaux({ plusAncienneOuverte: null, dureeFermeeMedianeJours: null, fermeesObservees: 1 }));
    const texte = d.lignes.map((l) => l.texte).join(" ");
    expect(texte).toContain("Durée d'ouverture inconnue");
    expect(texte).toContain("trop peu pour une durée médiane");
  });
});

describe("signaux — l'assise et la date d'observation", () => {
  const offre = (id: string, reste: Partial<Offre> = {}): Offre =>
    ({
      id,
      source: "jobbank",
      dateReperage: "2026-09-01",
      entreprise: "Employeur Fictif",
      poste: `poste ${id}`,
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
    }) as Offre;

  it("compte les offres observées et rend le dernier jour vu", () => {
    const journal: JournalVeille = {
      a: { premiereVue: "2026-09-01", derniereVue: "2026-10-01", absences: 0 },
      b: { premiereVue: "2026-09-10", derniereVue: "2026-10-14", absences: 0 },
    };
    const s = signauxDe([offre("a"), offre("b"), offre("c")], journal);
    expect(s.offres).toBe(3);
    expect(s.offresObservees).toBe(2);
    expect(s.observeLe).toBe("2026-10-14");
    // Trois offres dont deux seulement observées : le dossier dit « inconnu » (minimum 3).
    expect(dossierEmployeur(s).lettre).toBe("inconnu");
  });

  it("sans journal, aucune date : jamais une date inventée", () => {
    const s = signauxDe([offre("a")], {});
    expect(s.offresObservees).toBe(0);
    expect(s.observeLe).toBeNull();
  });
});
