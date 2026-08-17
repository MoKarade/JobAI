// tests/decouverte.test.ts — la barre de progression ne doit jamais mentir.
//
// C'est le seul calcul de l'écran Sources qui peut se tromper SANS que rien ne le signale.
// Une barre à 140 %, ou bloquée à 0 % sur un balayage terminé, ne lève aucune erreur : elle
// raconte simplement une histoire fausse, et Marc relancerait un balayage déjà fini — donc
// des requêtes vers des services tiers, pour rien.
//
// ⚠️ L'UNITÉ EST LA PAIRE CANDIDATE, PAS L'ENTREPRISE (changement du 2026-08-17). On ne
// tente plus toutes les combinaisons entreprise × famille : seulement celles qu'une
// observation désigne. Un dénominateur resté au produit afficherait « 15 / 180 » sur un
// travail pourtant terminé.

import { describe, it, expect } from "vitest";
import { progression } from "@/lib/decouverte";
import { CANDIDATS_ATS } from "@/lib/ingest/atsCandidats";
import { FAMILLES_ATS } from "@/lib/ingest/types";

type Paire = { entreprise: string; famille: string };
const p = (entreprise: string, famille = "greenhouse"): Paire => ({ entreprise, famille });

describe("la liste des candidats", () => {
  // ⚠️ CE TEST DIT UN RÉSULTAT, PAS UN TRAVAIL EN ATTENTE. La recherche du 2026-08-17 a
  // montré que les cibles publient sur leur propre site (canam.com/offres-demplois,
  // robotiq.com/about/careers, laserax.com/careers), pas sur ces cinq services. Tant que la
  // liste est vide, la découverte ne tente RIEN — mieux vaut un canal qui dit « rien à
  // essayer » qu'un canal qui brûle des requêtes pour rapporter des échecs.
  it("est vide tant qu'aucune page carrières n'a été OBSERVÉE", () => {
    expect(CANDIDATS_ATS).toEqual([]);
  });

  // Le jour où on la remplira : une entrée sans provenance n'est pas vérifiable, et c'est
  // précisément ce qui a manqué au premier jet (des identifiants devinés depuis le nom).
  it("exige une provenance sur chaque entrée", () => {
    for (const c of CANDIDATS_ATS) {
      expect(c.source.trim()).not.toBe("");
      expect(FAMILLES_ATS).toContain(c.famille);
    }
  });
});

describe("progression — le compte que la barre affiche", () => {
  it("part de zéro quand rien n'a été tenté", () => {
    expect(progression([p("A"), p("B")], [], [])).toEqual({ faites: 0, total: 2 });
  });

  it("rend 0 / 0 sur une liste vide — « rien à faire », pas « rien de fait »", () => {
    expect(progression([], [], [])).toEqual({ faites: 0, total: 0 });
  });

  it("compte une paire tentée", () => {
    expect(progression([p("A"), p("B")], [], [p("B")]).faites).toBe(1);
  });

  // ⚠️ UNE ENTREPRISE RÉSOLUE TRANCHE TOUTES SES PAIRES D'UN COUP. On ne cherche jamais ses
  // autres pages carrières : les compter une par une laisserait du travail « à faire » qui
  // ne se fera jamais, et la barre n'atteindrait pas 100 %.
  it("tranche toutes les paires d'une entreprise résolue, pas seulement celle qui a répondu", () => {
    const candidats = [p("A", "greenhouse"), p("A", "lever"), p("B")];
    expect(progression(candidats, ["A"], [])).toEqual({ faites: 2, total: 3 });
  });

  // ⚠️ LE PIÈGE DU DOUBLE COMPTAGE. Une entreprise résolue garde parfois un essai d'avant
  // sa résolution. L'additionner ferait dépasser son quota de paires — et le total avec.
  it("ne compte pas DEUX FOIS une paire résolue qui traîne un ancien essai", () => {
    const candidats = [p("A", "greenhouse"), p("A", "lever")];
    expect(progression(candidats, ["A"], [p("A", "greenhouse")])).toEqual({ faites: 2, total: 2 });
  });

  // ⚠️ UN ESSAI ORPHELIN NE GONFLE RIEN. Retirer une paire de la liste des candidats laisse
  // son essai en mémoire ; sans ce filtre, le numérateur monterait sans dénominateur en
  // face et la barre dépasserait 100 % sans qu'aucune erreur ne soit levée.
  it("ignore un essai dont la paire n'est plus candidate", () => {
    expect(progression([p("A")], [], [p("Disparue")])).toEqual({ faites: 0, total: 1 });
  });

  // La paire est (entreprise, FAMILLE) : un essai sur une autre famille ne tranche pas
  // celle-ci. Sans ça, une seule tentative ferait passer la barre pour cinq.
  it("ne confond pas deux familles de la même entreprise", () => {
    const candidats = [p("A", "greenhouse"), p("A", "lever")];
    expect(progression(candidats, [], [p("A", "lever")])).toEqual({ faites: 1, total: 2 });
  });

  it("reconnaît une paire à la casse près, comme le planificateur", () => {
    expect(progression([p("Laserax")], [], [p("LASERAX")]).faites).toBe(1);
  });

  // L'invariant qui résume tous les autres, éprouvé sur des combinaisons variées.
  it("ne dépasse JAMAIS son total, quelles que soient les entrées", () => {
    const cas: [Paire[], string[], Paire[]][] = [
      [[p("A"), p("B")], ["A"], [p("B"), p("Fantome")]],
      [[p("A")], ["A", "B"], [p("A")]],
      [[], ["A"], [p("A")]],
      [[p("A"), p("A", "lever")], [], [p("A"), p("A"), p("A", "lever")]],
    ];
    for (const [candidats, resolues, essais] of cas) {
      const r = progression(candidats, resolues, essais);
      expect(r.faites).toBeLessThanOrEqual(r.total);
      expect(r.faites).toBeGreaterThanOrEqual(0);
    }
  });
});
