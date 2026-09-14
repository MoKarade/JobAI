// tests/profilStocke.test.ts — relire un profil écrit avant que le barème ne grandisse.
//
// ⚠️ LE CAS CENTRAL EST CELUI DE LA PRODUCTION, PAS UN CAS INVENTÉ. Les quatre champs
// manquants sont ceux que les journaux Vercel ont nommés le 2026-09-14 :
// `ponderation.conditions`, `pointsConditions`, `facteurHorsDomaine`, `termesParJour`.
// Ils ont tous été ajoutés au même commit — le document n'est pas corrompu, il est ANCIEN.
//
// ⚠️ ET LE TEST QUI SÉPARE UNE MIGRATION D'UN ÉCRASEMENT est celui des valeurs PRÉSENTES :
// un réglage que Marc a choisi doit survivre, même s'il diffère du défaut. Sans lui, une
// migration qui recopierait bêtement tout le défaut passerait tous les autres cas.

import { describe, it, expect } from "vitest";
import { migrerProfil, parserProfilStocke } from "@/lib/profilStocke";
import { PROFIL_DEFAUT } from "@/lib/profil";

/** Le document tel qu'il est en base : le profil courant, moins les champs de l'ADR-0014. */
function profilDAvant(): Record<string, unknown> {
  const doc = structuredClone(PROFIL_DEFAUT) as unknown as Record<string, unknown>;
  const pond = doc["ponderation"] as Record<string, unknown>;
  delete pond["conditions"];
  delete doc["pointsConditions"];
  delete doc["facteurHorsDomaine"];
  delete doc["termesParJour"];
  return doc;
}

describe("migrerProfil — le cas mesuré en production", () => {
  it("comble EXACTEMENT les quatre champs manquants, et les nomme", () => {
    const { combles } = migrerProfil(profilDAvant());
    expect(combles.sort()).toEqual(
      ["facteurHorsDomaine", "pointsConditions", "ponderation.conditions", "termesParJour"].sort(),
    );
  });

  it("rend un document que le schéma STRICT accepte", () => {
    const { profil, combles } = parserProfilStocke(JSON.stringify(profilDAvant()));
    expect(combles).toHaveLength(4);
    expect(profil.ponderation.conditions).toBe(PROFIL_DEFAUT.ponderation.conditions);
    expect(profil.termesParJour).toBe(PROFIL_DEFAUT.termesParJour);
  });

  it("descend DANS un objet déjà présent — c'est le cas de `ponderation.conditions`", () => {
    // Une migration qui ne regarderait que le premier niveau verrait `ponderation` présente
    // et passerait son chemin : c'est exactement le champ qui manquait en production.
    const doc = profilDAvant();
    const { combles } = migrerProfil(doc);
    expect(combles).toContain("ponderation.conditions");
  });
});

describe("migrerProfil — ce qu'elle ne touche JAMAIS", () => {
  it("n'écrase aucune valeur présente, même différente du défaut", () => {
    // LE test qui sépare une migration d'un écrasement.
    const doc = structuredClone(PROFIL_DEFAUT) as unknown as Record<string, unknown>;
    (doc["ponderation"] as Record<string, unknown>)["distance"] = 99;
    doc["facteurHorsDomaine"] = 0.25;
    const { document, combles } = migrerProfil(doc);
    const sortie = document as Record<string, unknown>;
    expect((sortie["ponderation"] as Record<string, unknown>)["distance"]).toBe(99);
    expect(sortie["facteurHorsDomaine"]).toBe(0.25);
    expect(combles).toEqual([]);
  });

  it("ne fusionne pas les tableaux élément par élément", () => {
    // Les paliers de Marc sont les siens : y injecter les échelons du défaut fabriquerait
    // un barème que personne n'a écrit.
    const doc = structuredClone(PROFIL_DEFAUT) as unknown as Record<string, unknown>;
    doc["paliersDistanceKm"] = [{ max: 5, points: 20 }];
    const sortie = migrerProfil(doc).document as Record<string, unknown>;
    expect(sortie["paliersDistanceKm"]).toEqual([{ max: 5, points: 20 }]);
  });

  it("ne partage aucune référence avec le défaut", () => {
    // Un objet comblé par référence ferait muter `PROFIL_DEFAUT` à la première écriture —
    // une constante de module partagée par tout le processus.
    const doc = profilDAvant();
    const sortie = migrerProfil(doc).document as Record<string, unknown>;
    expect(sortie["pointsConditions"]).not.toBe(PROFIL_DEFAUT.pointsConditions);
    expect(sortie["pointsConditions"]).toEqual(PROFIL_DEFAUT.pointsConditions);
  });

  it("laisse une valeur présente mais FAUSSE, pour que le schéma la refuse", () => {
    // « Ce champ n'existait pas encore » et « ce champ est cassé » sont deux situations
    // opposées. Maquiller la seconde ferait passer une corruption pour une migration.
    const doc = structuredClone(PROFIL_DEFAUT) as unknown as Record<string, unknown>;
    doc["termesParJour"] = "quarante-huit";
    const { combles } = migrerProfil(doc);
    expect(combles).toEqual([]);
    expect(() => parserProfilStocke(JSON.stringify(doc))).toThrow(/illisible/);
  });
});

describe("parserProfilStocke — la ceinture reste", () => {
  it("lève sur un document qui n'est pas un objet, sans fabriquer un profil", () => {
    // Fabriquer un profil complet à partir de rien reviendrait à servir le défaut sous
    // l'apparence d'un profil validé.
    for (const brut of ["null", '"texte"', "[]", "42"]) {
      expect(() => parserProfilStocke(brut)).toThrow(/illisible/);
    }
  });

  it("lève sur un JSON illisible", () => {
    expect(() => parserProfilStocke("{ pas du json")).toThrow();
  });

  it("dit COMBIEN de champs ont été comblés avant le refus", () => {
    // Un message qui ne dit que « illisible » envoie chercher une corruption là où il y a
    // peut-être seulement un champ de plus à combler — et l'inverse.
    const doc = profilDAvant();
    doc["version"] = -1;
    expect(() => parserProfilStocke(JSON.stringify(doc))).toThrow(/4 champs comblés/);
  });

  it("ne comble RIEN sur un profil à jour", () => {
    const { combles } = parserProfilStocke(JSON.stringify(PROFIL_DEFAUT));
    expect(combles).toEqual([]);
  });
});
