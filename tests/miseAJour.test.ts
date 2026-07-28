// tests/miseAJour.test.ts — le verrou d'écriture du garde-fou n°2.
//
// `MiseAJourOffreSchema` est ce qui sépare « Marc modifie son suivi » de « n'importe quel
// champ peut bouger ». Une Server Action est un point d'entrée POST appelable directement :
// ce schéma est donc une frontière de sécurité, pas une commodité de typage.

import { describe, it, expect } from "vitest";
import { MiseAJourOffreSchema, CHAMPS_UTILISATEUR } from "../lib/types";

describe("champs modifiables", () => {
  it("accepte les quatre champs qui appartiennent à l'utilisateur", () => {
    const r = MiseAJourOffreSchema.safeParse({
      statut: "Entrevue",
      priorite: "Haute",
      dateEnvoi: "2026-07-28",
      userNote: "Relancer lundi",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data).sort()).toEqual([...CHAMPS_UTILISATEUR].sort());
  });

  it("accepte une modification partielle", () => {
    const r = MiseAJourOffreSchema.safeParse({ statut: "CVenvoye" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ statut: "CVenvoye" });
  });

  it("ÉCARTE tout champ qui n'appartient pas à l'utilisateur", () => {
    // C'est LE test du garde-fou n°2 : un appelant qui tenterait de se donner une note de
    // 100 ou de réécrire la justification n'a aucun effet, parce que ces clés ne survivent
    // pas au parse. Zod strippe les clés inconnues par défaut.
    const r = MiseAJourOffreSchema.safeParse({
      statut: "Entrevue",
      score: 100,
      scoreSource: "manuel",
      raisons: [{ ton: "atout", texte: "injecté" }],
      entreprise: "Autre",
      histo: true,
      id: "autre-offre",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ statut: "Entrevue" });
      expect(r.data).not.toHaveProperty("score");
      expect(r.data).not.toHaveProperty("raisons");
      expect(r.data).not.toHaveProperty("entreprise");
      expect(r.data).not.toHaveProperty("id");
    }
  });

  it("un patch composé UNIQUEMENT de champs interdits devient vide", () => {
    // L'action s'arrête alors sans rien écrire, plutôt que d'exécuter une mise à jour vide.
    const r = MiseAJourOffreSchema.safeParse({ score: 100, entreprise: "Autre" });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data)).toHaveLength(0);
  });
});

describe("valeurs refusées", () => {
  it("refuse un statut hors du domaine", () => {
    expect(MiseAJourOffreSchema.safeParse({ statut: "Embauché" }).success).toBe(false);
  });

  it("refuse une priorité hors du domaine", () => {
    expect(MiseAJourOffreSchema.safeParse({ priorite: "Urgente" }).success).toBe(false);
  });

  it("refuse une date mal formée, accepte la chaîne vide", () => {
    expect(MiseAJourOffreSchema.safeParse({ dateEnvoi: "28/07/2026" }).success).toBe(false);
    expect(MiseAJourOffreSchema.safeParse({ dateEnvoi: "2026-7-8" }).success).toBe(false);
    // Vide = « pas encore envoyé » : c'est une valeur légitime, pas une absence de valeur.
    expect(MiseAJourOffreSchema.safeParse({ dateEnvoi: "" }).success).toBe(true);
  });

  it("borne la note personnelle", () => {
    expect(MiseAJourOffreSchema.safeParse({ userNote: "x".repeat(2000) }).success).toBe(true);
    expect(MiseAJourOffreSchema.safeParse({ userNote: "x".repeat(2001) }).success).toBe(false);
  });

  it("refuse un type manifestement faux", () => {
    expect(MiseAJourOffreSchema.safeParse({ userNote: 42 }).success).toBe(false);
    expect(MiseAJourOffreSchema.safeParse({ statut: null }).success).toBe(false);
  });
});
