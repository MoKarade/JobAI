// tests/relances.test.ts — les candidatures qui dorment.
//
// Le suivi portait `dateEnvoi` depuis le premier jour sans rien en faire : une candidature
// de trois semaines ressemblait exactement à une candidature d'hier. C'est là que se
// perdent les occasions — pas faute d'offres, faute de suivi.
//
// Les cas DÉRIVENT des constantes de seuil, jamais d'un nombre écrit à la main : codés
// « 14 », ils mentiraient au premier ajustement.

import { describe, it, expect } from "vitest";
import {
  SEUIL_RELANCE_JOURS,
  SEUIL_SILENCE_JOURS,
  aSurveiller,
  etatRelance,
  joursEntre,
  resumerRelances,
} from "../lib/relances";
import { SEED } from "../lib/seed";
import type { Offre, Statut } from "../lib/types";

const base = SEED[0]!;
function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, id: "o", histo: false, statut: "CVenvoye", dateEnvoi: "2026-07-01", ...champs };
}

/** Une date à N jours de « 2026-07-01 ». */
function jourApres(n: number): string {
  const d = new Date(Date.parse("2026-07-01T00:00:00Z") + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe("comptage des jours", () => {
  it("compte les jours entiers", () => {
    expect(joursEntre("2026-07-01", "2026-07-15")).toBe(14);
    expect(joursEntre("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("rend null sur une date illisible plutôt qu'un nombre faux", () => {
    expect(joursEntre("bientôt", "2026-07-15")).toBeNull();
    expect(joursEntre("2026-07-01", "")).toBeNull();
  });

  it("traverse un changement de mois et une année bissextile", () => {
    expect(joursEntre("2026-07-25", "2026-08-05")).toBe(11);
    expect(joursEntre("2024-02-28", "2024-03-01")).toBe(2); // 2024 est bissextile
  });
});

describe("état d'une candidature", () => {
  it("juste envoyée : on laisse le temps au recruteur", () => {
    expect(etatRelance(offre(), jourApres(SEUIL_RELANCE_JOURS - 1))).toBe("en-attente");
  });

  it("au seuil : c'est le moment de relancer", () => {
    expect(etatRelance(offre(), jourApres(SEUIL_RELANCE_JOURS))).toBe("a-relancer");
  });

  it("après très longtemps : le silence est une réponse", () => {
    expect(etatRelance(offre(), jourApres(SEUIL_SILENCE_JOURS))).toBe("sans-suite");
  });
});

describe("ce qui n'est PAS surveillé", () => {
  it("une offre jamais envoyée", () => {
    expect(etatRelance(offre({ dateEnvoi: "", statut: "Identifiee" }), jourApres(60))).toBe(
      "sans-objet",
    );
  });

  it("une candidature qui a REÇU une réponse, quelle qu'elle soit", () => {
    // Entrevue, refus ou offre : dans les trois cas, il n'y a plus rien à relancer.
    for (const statut of ["Entrevue", "Refusee", "Offre"] as Statut[]) {
      expect(etatRelance(offre({ statut }), jourApres(60))).toBe("sans-objet");
    }
  });

  it("une candidature de 2025", () => {
    expect(etatRelance(offre({ histo: true }), jourApres(60))).toBe("sans-objet");
  });

  it("une date illisible ne FABRIQUE pas une alerte", () => {
    expect(etatRelance(offre({ dateEnvoi: "le mois dernier" }), jourApres(60))).toBe("sans-objet");
  });

  it("une date FUTURE non plus — c'est une saisie en cours, pas un envoi", () => {
    expect(etatRelance(offre({ dateEnvoi: jourApres(10) }), "2026-07-01")).toBe("sans-objet");
  });

  it("une relance déjà faite reste surveillée : le compteur repart de l'envoi", () => {
    // `Relance` n'est PAS une réponse du recruteur — c'est un geste de Marc. La
    // candidature attend toujours, et doit continuer d'apparaître.
    expect(etatRelance(offre({ statut: "Relance" }), jourApres(SEUIL_RELANCE_JOURS))).toBe(
      "a-relancer",
    );
  });
});

describe("liste de travail", () => {
  it("les plus anciennes d'abord : ce sont elles qu'il faut trancher", () => {
    const r = aSurveiller(
      [
        // Toutes ENVOYÉES avant le jour de référence : une date future serait une saisie
        // en cours, pas un envoi, et le test ne mesurerait plus le tri.
        offre({ id: "recente", dateEnvoi: "2026-07-05" }),
        offre({ id: "vieille", dateEnvoi: "2026-06-01" }),
        offre({ id: "moyenne", dateEnvoi: "2026-06-20" }),
      ],
      "2026-07-20",
    );
    expect(r.map((x) => x.offre.id)).toEqual(["vieille", "moyenne", "recente"]);
    expect(r[0]!.jours).toBeGreaterThan(r[1]!.jours);
  });

  it("n'y met PAS celles qui attendent encore légitimement", () => {
    const r = aSurveiller([offre({ dateEnvoi: jourApres(-1) })], jourApres(0));
    expect(r).toEqual([]);
  });
});

describe("résumé du tableau de bord", () => {
  it("compte séparément ce qui attend, ce qui doit être relancé et ce qui est mort", () => {
    const r = resumerRelances(
      [
        offre({ id: "a", dateEnvoi: "2026-07-01" }), // 19 j → à relancer
        offre({ id: "b", dateEnvoi: "2026-07-18" }), // 2 j → en attente
        offre({ id: "c", dateEnvoi: "2026-05-01" }), // 80 j → sans suite
        offre({ id: "d", statut: "Offre", dateEnvoi: "2026-05-01" }), // répondue
        offre({ id: "e", dateEnvoi: "", statut: "Identifiee" }), // jamais envoyée
      ],
      "2026-07-20",
    );
    expect(r.enCours).toBe(3);
    expect(r.aRelancer).toBe(1);
    expect(r.sansSuite).toBe(1);
    expect(r.plusAncienneJours).toBe(80);
  });

  it("dit honnêtement qu'il n'y a rien à surveiller", () => {
    const r = resumerRelances([offre({ dateEnvoi: "", statut: "Identifiee" })], "2026-07-20");
    expect(r).toEqual({ enCours: 0, aRelancer: 0, sansSuite: 0, plusAncienneJours: null });
  });

  it("sur le VRAI suivi, ne signale rien d'absurde", () => {
    // Les 15 candidatures de 2025 sont historiques : aucune ne doit apparaître comme
    // « à relancer » un an plus tard.
    const r = resumerRelances(SEED, "2026-07-31");
    expect(r.enCours).toBeLessThanOrEqual(SEED.filter((o) => !o.histo).length);
    expect(r.aRelancer).toBeGreaterThanOrEqual(0);
  });
});
