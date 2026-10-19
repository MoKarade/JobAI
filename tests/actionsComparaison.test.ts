// tests/actionsComparaison.test.ts — la barrière côté serveur avant un appel payant (JobAI#157, ADR-0034).
//
// Le client peut envoyer n'importe quel identifiant : c'est `comparerExigences` qui recalcule l'éligibilité. Chaque refus
// doit se faire AVANT l'appel au modèle ; on éprouve donc que `comparerOffreALaFiche` n'est jamais appelé. Données FICTIVES.

import { describe, it, expect, vi, beforeEach } from "vitest";

const ANNONCE = "Nous cherchons une personne qui maîtrise la programmation d'automates programmables pour nos lignes. ".repeat(3);

const FICHE = [{ id: "scada", niveau: "pratique", phrase: "supervision SCADA", poste: "Technicien" }];

let offre: Record<string, unknown> | null;
let rang: number | null;
let fiche: unknown[];
let sessionOk: boolean;
let lectureLeve: boolean;
let profilLeve: boolean;
const appelsModele = vi.fn(async () => ({ ok: true as const, lignes: [], ecartees: [], caracteresLus: 10 }));

vi.mock("../lib/session", () => ({
  exigerSession: async () => {
    if (!sessionOk) throw new Error("non autorisé");
  },
}));
vi.mock("../lib/donnees", () => ({
  lireOffre: async () => {
    if (lectureLeve) throw new Error("base muette");
    return offre;
  },
  rangParNote: async () => rang,
}));
vi.mock("../lib/cv/depot", () => ({
  profilActif: async () => {
    if (profilLeve) throw new Error("profil illisible");
    return { faits: { competences: fiche } };
  },
}));
vi.mock("../lib/comparaisonOffreLlm", () => ({ comparerOffreALaFiche: appelsModele }));

const { comparerExigences } = await import("../lib/actionsComparaison");

beforeEach(() => {
  appelsModele.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionOk = true;
  lectureLeve = false;
  profilLeve = false;
  fiche = FICHE;
  rang = 5;
  offre = { id: "o1", score: 70, histo: false, perimeeLe: null, texteNote: ANNONCE };
});

describe("comparerExigences", () => {
  it("une offre éligible appelle le modèle une fois", async () => {
    const r = await comparerExigences("o1");
    expect(r.ok).toBe(true);
    expect(appelsModele).toHaveBeenCalledTimes(1);
  });

  it("sans session, refus avant toute lecture et tout appel", async () => {
    sessionOk = false;
    expect(await comparerExigences("o1")).toEqual({ ok: false, erreur: "Authentification requise." });
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it.each([["vide", ""], ["trop long", "x".repeat(81)]])("un identifiant %s est refusé", async (_nom, id) => {
    const r = await comparerExigences(id);
    expect(r).toEqual({ ok: false, erreur: "Offre introuvable." });
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it("une offre inconnue est refusée", async () => {
    offre = null;
    expect(await comparerExigences("o1")).toEqual({ ok: false, erreur: "Offre introuvable." });
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it("hors des 100 meilleures : refus sans appel", async () => {
    rang = 101;
    expect((await comparerExigences("o1")).ok).toBe(false);
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it("sans fiche : refus sans appel", async () => {
    fiche = [];
    expect((await comparerExigences("o1")).ok).toBe(false);
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it("annonce trop courte : refus sans appel", async () => {
    offre = { ...offre, texteNote: "trop court" };
    expect((await comparerExigences("o1")).ok).toBe(false);
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it("offre périmée : refus sans appel", async () => {
    offre = { ...offre, perimeeLe: "2026-10-01" };
    expect((await comparerExigences("o1")).ok).toBe(false);
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it("une base muette se dit, sans appel", async () => {
    lectureLeve = true;
    const r = await comparerExigences("o1");
    expect(r).toEqual({ ok: false, erreur: "La base n'a pas répondu. Voir les journaux." });
    expect(appelsModele).not.toHaveBeenCalled();
  });

  it("un profil illisible se dit et ne retombe pas sur une autre fiche", async () => {
    profilLeve = true;
    const r = await comparerExigences("o1");
    expect(r).toEqual({ ok: false, erreur: "Le profil n'a pas pu être lu. Voir les journaux." });
    expect(appelsModele).not.toHaveBeenCalled();
  });
});
