// tests/groupesEntreprise.test.ts — le regroupement par employeur et son classement.
//
// ⚠️ AUCUN EMPLOYEUR RÉEL : le dépôt est public et `piiGuard` ne distingue pas une
// illustration d'une vraie donnée.

import { describe, it, expect } from "vitest";
import { grouperParEntreprise } from "@/lib/groupesEntreprise";
import type { Offre } from "@/lib/types";

const offre = (entreprise: string, score: number | null, km: number | null = null): Offre =>
  ({
    id: `${entreprise}-${score}-${km}`,
    entreprise,
    poste: "Poste",
    lien: "https://exemple.invalid/o",
    ville: null,
    km,
    salaireAffiche: "",
    priorite: "Moyenne",
    score,
    scoreSource: "calcule",
    statut: "Identifiee",
    dateEnvoi: "",
    dateReperage: "2026-08-20",
    histo: false,
    perimeeLe: null,
    source: "test",
    raisons: [],
  }) as unknown as Offre;

describe("grouperParEntreprise — la meilleure moyenne d'abord", () => {
  it("classe les entreprises par note moyenne décroissante", () => {
    const g = grouperParEntreprise([
      offre("Alpha Industries", 50),
      offre("Beta Fabrication", 80),
      offre("Beta Fabrication", 70),
    ]);
    expect(g.map((x) => x.nom)).toEqual(["Beta Fabrication", "Alpha Industries"]);
    expect(g[0]!.noteMoyenne).toBe(75);
  });

  it("regroupe les graphies qui désignent le même employeur", () => {
    // La règle de la carte : « Gamma Robotique » et « Gamma Robotique Canada » sont un seul
    // employeur. Sans ça, la liste montrerait deux entreprises là où la carte pose une
    // épingle — et rien ne dirait laquelle a raison.
    const g = grouperParEntreprise([
      offre("Gamma Robotique", 70),
      offre("Gamma Robotique Canada", 60),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.offres).toHaveLength(2);
  });

  it("⚠️ une entreprise SANS aucune note passe en dernier, pas en premier", () => {
    // Trier `null` comme zéro l'enverrait au fond avec l'apparence d'un jugement ; comme
    // l'infini, en tête. Elle est écartée de la comparaison et ajoutée à la fin.
    const g = grouperParEntreprise([offre("Zeta Mécanique", null), offre("Alpha Industries", 30)]);
    expect(g.map((x) => x.nom)).toEqual(["Alpha Industries", "Zeta Mécanique"]);
    expect(g[1]!.noteMoyenne).toBeNull();
  });

  it("une offre non notée ne tire PAS la moyenne vers le bas", () => {
    // Elle n'est pas mauvaise : elle n'a pas été jugée. La compter zéro serait inventer.
    const g = grouperParEntreprise([offre("Alpha Industries", 80), offre("Alpha Industries", null)]);
    expect(g[0]!.noteMoyenne).toBe(80);
    expect(g[0]!.notees).toBe(1);
    expect(g[0]!.offres).toHaveLength(2);
  });

  it("départage une égalité de moyenne par la meilleure note", () => {
    const g = grouperParEntreprise([
      offre("Alpha Industries", 60),
      offre("Alpha Industries", 60),
      offre("Beta Fabrication", 80),
      offre("Beta Fabrication", 40),
    ]);
    expect(g[0]!.nom).toBe("Beta Fabrication");
    expect(g[0]!.noteMoyenne).toBe(g[1]!.noteMoyenne);
  });

  it("l'ordre est STABLE — deux affichages ne s'échangent pas de place", () => {
    const entree = [offre("Alpha Industries", 60), offre("Beta Fabrication", 60)];
    const a = grouperParEntreprise(entree).map((x) => x.nom);
    const b = grouperParEntreprise([...entree].reverse()).map((x) => x.nom);
    expect(a).toEqual(b);
  });

  it("retient la distance la plus courte du groupe, sans inventer", () => {
    const g = grouperParEntreprise([
      offre("Alpha Industries", 60, 40),
      offre("Alpha Industries", 60, 12),
      offre("Alpha Industries", 60, null),
    ]);
    expect(g[0]!.kmMin).toBe(12);
    expect(grouperParEntreprise([offre("Beta Fabrication", 60, null)])[0]!.kmMin).toBeNull();
  });

  it("rend une liste vide sur une entrée vide", () => {
    expect(grouperParEntreprise([])).toEqual([]);
  });
});
