// tests/anneesExperience.test.ts — le calcul des années d'expérience se refait à la main
// (JobAI#154, ADR-0027).
//
// ⚠️ AUCUN EMPLOYEUR NI TITRE RÉEL : les postes sont fictifs (dépôt public, `piiGuard`).
// Les cas sont choisis pour que chaque total se vérifie de tête.

import { describe, it, expect } from "vitest";
import { calculerAnnees, lireDateCv, type PosteCv } from "@/lib/cv/anneesExperience";

/** « Présent » = juin 2026 partout dans ce fichier. */
const AUJOURDHUI = new Date(Date.UTC(2026, 5, 15));
const idx = (annee: number, mois: number) => annee * 12 + (mois - 1);

const poste = (titre: string, debut: string, fin: string, estStage = false): PosteCv => ({
  titre,
  debut,
  fin,
  estStage,
});

describe("lireDateCv — ce qui se lit, et ce qui ne se devine pas", () => {
  it.each([
    ["Avril 2023", idx(2023, 4)],
    ["avr. 2023", idx(2023, 4)],
    ["April 2023", idx(2023, 4)],
    ["Août 2022", idx(2022, 8)],
    ["déc. 2020", idx(2020, 12)],
    ["2023-04", idx(2023, 4)],
    ["04/2023", idx(2023, 4)],
    ["1er avril 2023", idx(2023, 4)],
  ])("« %s » est un mois précis", (texte, attendu) => {
    expect(lireDateCv(texte)).toEqual({ index: attendu, anneeSeule: false });
  });

  it("une année seule est lue en juillet et marquée comme telle", () => {
    expect(lireDateCv("2023")).toEqual({ index: idx(2023, 7), anneeSeule: true });
  });

  it.each(["", "   ", "été 2023", "2023-2024", "bientôt", "13/2023", "mois 2023"])(
    "« %s » est illisible : null, jamais une supposition",
    (texte) => {
      expect(lireDateCv(texte)).toBeNull();
    },
  );
});

describe("calculerAnnees — un calcul qui se refait à la main", () => {
  it("un poste : début et fin inclus (avril 2023 → mars 2024 = 12 mois)", () => {
    const c = calculerAnnees([poste("Poste A", "Avril 2023", "Mars 2024")], AUJOURDHUI);
    expect(c.mois).toBe(12);
    expect(c.annees).toBe(1);
    expect(c.chevauchementMois).toBe(0);
  });

  it("« Présent » court jusqu'au mois courant, inclus", () => {
    // janvier 2021 → juin 2026 : 5 ans + 6 mois = 66 mois.
    const c = calculerAnnees([poste("Poste A", "Janvier 2021", "Présent")], AUJOURDHUI);
    expect(c.mois).toBe(66);
    expect(c.annees).toBe(5.5);
  });

  it("deux postes qui se suivent s'additionnent", () => {
    const c = calculerAnnees(
      [poste("B", "Janvier 2022", "Présent"), poste("A", "Janvier 2020", "Décembre 2021")],
      AUJOURDHUI,
    );
    // 24 mois + (2022-01 → 2026-06 = 54 mois) = 78 mois = 6,5 ans.
    expect(c.mois).toBe(78);
    expect(c.annees).toBe(6.5);
    expect(c.chevauchementMois).toBe(0);
  });

  it("⚠️ deux postes qui se chevauchent ne comptent le mois commun qu'UNE fois", () => {
    const c = calculerAnnees(
      [poste("A", "Janvier 2020", "Décembre 2021"), poste("B", "Juillet 2021", "Juin 2022")],
      AUJOURDHUI,
    );
    // A = 24 mois, B = 12 mois, communs : juillet → décembre 2021 = 6 mois.
    expect(c.moisBruts).toBe(36);
    expect(c.chevauchementMois).toBe(6);
    expect(c.mois).toBe(30);
    expect(c.annees).toBe(2.5);
  });

  it("un poste entièrement contenu dans un autre n'ajoute rien", () => {
    const c = calculerAnnees(
      [poste("Long", "Janvier 2018", "Décembre 2022"), poste("Court", "Mars 2020", "Mai 2020")],
      AUJOURDHUI,
    );
    expect(c.mois).toBe(60);
    expect(c.chevauchementMois).toBe(3);
  });

  it("un stage ne compte pas, et le détail le dit", () => {
    const c = calculerAnnees(
      [poste("Poste", "Janvier 2024", "Décembre 2024"), poste("Stage été", "Mai 2023", "Août 2023", true)],
      AUJOURDHUI,
    );
    expect(c.mois).toBe(12);
    expect(c.detail).toContain("Stage été : exclu (stage)");
  });

  it("⚠️ une date illisible EXCLUT le poste, elle ne le fait pas deviner", () => {
    const c = calculerAnnees(
      [
        poste("Daté", "Janvier 2024", "Décembre 2024"),
        poste("Sans début", "", "Décembre 2020"),
        poste("Sans fin", "Janvier 2019", ""),
        poste("Saison", "Été 2018", "Août 2018"),
      ],
      AUJOURDHUI,
    );
    expect(c.mois).toBe(12);
    expect(c.lignes.filter((l) => l.statut === "exclu").map((l) => l.raison)).toEqual([
      "début absent",
      "fin absente",
      "début illisible",
    ]);
  });

  it("aucun poste comptable : null (« non établi »), jamais 0", () => {
    expect(calculerAnnees([], AUJOURDHUI).annees).toBeNull();
    const c = calculerAnnees([poste("Sans dates", "", "")], AUJOURDHUI);
    expect(c.annees).toBeNull();
    expect(c.mois).toBe(0);
  });

  it("une année seule est approximative, et la ligne l'avoue", () => {
    const c = calculerAnnees([poste("Poste", "2019", "2021")], AUJOURDHUI);
    // juillet 2019 → juillet 2021 : 25 mois.
    expect(c.mois).toBe(25);
    expect(c.lignes[0]!.approximatif).toBe(true);
    expect(c.lignes[0]!.texte).toContain("année seule");
  });

  it("une fin dans le futur n'est comptée que jusqu'à aujourd'hui", () => {
    const c = calculerAnnees([poste("Contrat", "Janvier 2026", "Décembre 2027")], AUJOURDHUI);
    expect(c.mois).toBe(6);
  });

  it("un début dans le futur est exclu ; une fin avant le début aussi", () => {
    const c = calculerAnnees(
      [poste("Futur", "Janvier 2028", "Présent"), poste("Inversé", "Mars 2022", "Mars 2021")],
      AUJOURDHUI,
    );
    expect(c.annees).toBeNull();
    expect(c.lignes.map((l) => l.raison)).toEqual(["début dans le futur", "fin avant le début"]);
  });

  it("le détail montre chaque ligne, les chevauchements et le total", () => {
    const c = calculerAnnees(
      [poste("A", "Janvier 2020", "Décembre 2021"), poste("B", "Juillet 2021", "Juin 2022")],
      AUJOURDHUI,
    );
    expect(c.detail).toContain("A : janv. 2020 → déc. 2021 = 24 mois");
    expect(c.detail).toContain("B : juil. 2021 → juin 2022 = 12 mois");
    expect(c.detail).toContain("chevauchements retirés : 6 mois");
    expect(c.detail).toContain("total : 30 mois = 2,5 ans");
  });

  it("l'ordre des postes ne change pas le total", () => {
    const a = poste("A", "Janvier 2020", "Décembre 2021");
    const b = poste("B", "Juillet 2021", "Juin 2022");
    const c = poste("C", "Mars 2024", "Présent");
    expect(calculerAnnees([a, b, c], AUJOURDHUI).mois).toBe(calculerAnnees([c, b, a], AUJOURDHUI).mois);
  });
});
