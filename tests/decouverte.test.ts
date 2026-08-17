// tests/decouverte.test.ts — la barre de progression ne doit jamais mentir.
//
// C'est le seul calcul de l'écran Sources qui peut se tromper SANS que rien ne le signale.
// Une barre à 140 %, ou bloquée à 0 % sur un balayage à moitié fait, ne lève aucune erreur :
// elle raconte simplement une histoire fausse, et Marc relancerait un balayage déjà terminé
// (donc des requêtes vers cinq services tiers, pour rien).

import { describe, it, expect } from "vitest";
import { nomsACouvrir, progression } from "@/lib/decouverte";
import { ENTREPRISES_CIBLES } from "@/lib/reference";
import { FAMILLES_ATS } from "@/lib/ingest/types";

const F = FAMILLES_ATS.length;

describe("nomsACouvrir — l'ordre porte la priorité", () => {
  it("met les cibles de Marc AVANT les employeurs croisés en offre", () => {
    const noms = nomsACouvrir(["Un Employeur Vu En Offre"]);
    expect(noms.slice(0, ENTREPRISES_CIBLES.length)).toEqual(ENTREPRISES_CIBLES.map((e) => e.nom));
    expect(noms.at(-1)).toBe("Un Employeur Vu En Offre");
  });

  it("écarte les noms vides, qui ne désignent aucune entreprise", () => {
    const noms = nomsACouvrir(["", "   ", "Réel"]);
    expect(noms.filter((n) => n.trim() === "")).toEqual([]);
    expect(noms).toContain("Réel");
  });

  // Les doublons ne sont PAS écartés ici : c'est `planifierDecouverte` qui s'en charge, pour
  // tous ses appelants à la fois. Le vérifier évite qu'on « répare » un jour le mauvais bout.
  it("laisse passer les doublons — leur écart est le travail du planificateur", () => {
    const dejaCible = ENTREPRISES_CIBLES[0]!.nom;
    expect(nomsACouvrir([dejaCible]).filter((n) => n === dejaCible)).toHaveLength(2);
  });
});

describe("progression — le compte que la barre affiche", () => {
  it("part de zéro quand rien n'a été tenté", () => {
    expect(progression(["A", "B"], [], [])).toEqual({ faites: 0, total: 2 * F });
  });

  // ⚠️ UNE ENTREPRISE RÉSOLUE TRANCHE SES CINQ PAIRES D'UN COUP. On ne cherche jamais ses
  // autres pages carrières — les compter une par une laisserait 80 % du travail « à faire »
  // alors qu'il ne se fera jamais, et la barre n'atteindrait jamais 100 %.
  it("compte TOUTES les paires d'une entreprise résolue, pas seulement celle qui a répondu", () => {
    expect(progression(["A", "B"], ["A"], [])).toEqual({ faites: F, total: 2 * F });
  });

  it("compte un essai par paire tentée sur une entreprise encore ouverte", () => {
    const essais = [{ entreprise: "B" }, { entreprise: "B" }];
    expect(progression(["A", "B"], [], essais).faites).toBe(2);
  });

  // ⚠️ LE PIÈGE DU DOUBLE COMPTAGE. Une entreprise résolue garde parfois des essais d'avant
  // sa résolution (une famille qui avait dit non). Les additionner ferait dépasser son quota
  // de cinq paires — et le total avec.
  it("ne compte pas DEUX FOIS une entreprise résolue qui traîne un ancien essai", () => {
    const essais = [{ entreprise: "A" }, { entreprise: "a" }];
    expect(progression(["A"], ["A"], essais)).toEqual({ faites: F, total: F });
  });

  // ⚠️ UN ESSAI ORPHELIN NE GONFLE RIEN. Une offre périmée retire son employeur de la liste ;
  // son essai reste en mémoire. Sans ce filtre, le numérateur monterait sans dénominateur en
  // face, et la barre dépasserait 100 % sans qu'aucune erreur ne soit levée.
  it("ignore un essai dont l'entreprise a quitté la liste", () => {
    const essais = [{ entreprise: "Disparue" }];
    expect(progression(["A"], [], essais)).toEqual({ faites: 0, total: F });
  });

  // Le dénominateur compte les entreprises DISTINCTES, comme `planifierDecouverte`. Sinon un
  // nom présent dans les cibles ET dans les offres ajouterait cinq paires qui ne seront
  // jamais tentées, et la barre plafonnerait sous 100 % pour toujours.
  it("ne compte qu'une fois un nom présent en double, à la casse près", () => {
    expect(progression(["Laserax", "laserax", "LASERAX"], [], []).total).toBe(F);
  });

  // L'invariant qui résume tous les autres, éprouvé sur des combinaisons variées.
  it("ne dépasse JAMAIS son total, quelles que soient les entrées", () => {
    const cas: [string[], string[], { entreprise: string }[]][] = [
      [["A", "B", "a"], ["A"], [{ entreprise: "B" }, { entreprise: "Fantome" }]],
      [["A"], ["A", "B"], [{ entreprise: "A" }]],
      [[], ["A"], [{ entreprise: "A" }]],
      [["A", "B", "C"], [], [{ entreprise: "A" }, { entreprise: "A" }, { entreprise: "B" }]],
    ];
    for (const [noms, resolues, essais] of cas) {
      const p = progression(noms, resolues, essais);
      expect(p.faites).toBeLessThanOrEqual(p.total);
      expect(p.faites).toBeGreaterThanOrEqual(0);
    }
  });
});
