// tests/export.test.ts — l'export CSV.
//
// Un export qui s'ouvre mal ou qui exécute une formule ne se remarque qu'au moment où on
// s'en sert, c'est-à-dire au plus mauvais moment.

import { describe, it, expect } from "vitest";
import { versCsv, nomFichierExport } from "../lib/export";
import { SEED } from "../lib/seed";
import type { Offre } from "../lib/types";

const base = SEED[0]!;
function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, ...champs };
}

describe("structure", () => {
  it("commence par un BOM UTF-8 — sinon Excel massacre les accents", () => {
    // Sans lui, « Chargé de projets » s'affiche « ChargÃ© de projets ».
    expect(versCsv([])).toMatch(/^﻿/);
  });

  it("écrit un en-tête même sans offre", () => {
    const lignes = versCsv([]).replace(/^﻿/, "").trim().split("\r\n");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('"Entreprise"');
  });

  it("produit une ligne par offre, dans l'ordre reçu", () => {
    const csv = versCsv([offre({ id: "a", entreprise: "Alpha" }), offre({ id: "b", entreprise: "Beta" })]);
    const lignes = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lignes).toHaveLength(3); // en-tête + 2
    expect(lignes[1]).toContain('"Alpha"');
    expect(lignes[2]).toContain('"Beta"');
  });

  it("sépare les lignes par CRLF, ce qu'attend Excel", () => {
    expect(versCsv([offre()])).toContain("\r\n");
  });

  it("exporte les 38 offres du jeu de départ sans broncher", () => {
    const lignes = versCsv(SEED).replace(/^﻿/, "").trim().split("\r\n");
    expect(lignes).toHaveLength(SEED.length + 1);
  });
});

describe("échappement", () => {
  it("double les guillemets internes", () => {
    const csv = versCsv([offre({ userNote: 'Il a dit "peut-être"' })]);
    expect(csv).toContain('"Il a dit ""peut-être"""');
  });

  it("garde une virgule dans une cellule sans casser les colonnes", () => {
    const csv = versCsv([offre({ entreprise: "Alpha, Beta et Cie" })]);
    const ligne = csv.replace(/^﻿/, "").trim().split("\r\n")[1]!;
    // Toutes les cellules sont entre guillemets : le nombre de guillemets reste pair.
    expect((ligne.match(/"/g) ?? []).length % 2).toBe(0);
    expect(ligne).toContain('"Alpha, Beta et Cie"');
  });

  it("survit à un saut de ligne dans une note", () => {
    const csv = versCsv([offre({ userNote: "ligne 1\nligne 2" })]);
    expect(csv).toContain('"ligne 1\nligne 2"');
  });
});

describe("injection de formule", () => {
  // Une cellule commençant par =, +, - ou @ est ÉVALUÉE par Excel, LibreOffice et Google
  // Sheets. Le contenu vient de Marc aujourd'hui ; il viendra d'un LLM lisant des offres
  // publiques en V3. On neutralise avant que ce soit un problème.
  it("neutralise les cellules qui commenceraient par un signe de formule", () => {
    for (const dangereux of ["=1+1", "+SOMME(A1)", "-2", "@CITER", "=HYPERLINK(\"http://x\")"]) {
      const csv = versCsv([offre({ userNote: dangereux })]);
      expect(csv, `note « ${dangereux} »`).toContain(`"'${dangereux.replace(/"/g, '""')}"`);
    }
  });

  it("ne touche PAS une cellule ordinaire", () => {
    const csv = versCsv([offre({ userNote: "Relancer lundi" })]);
    expect(csv).toContain('"Relancer lundi"');
    expect(csv).not.toContain("\"'Relancer lundi\"");
  });

  it("n'abîme pas un salaire négocié écrit avec un tiret en tête", () => {
    // Cas réel plausible : « -5 % vs marché ». Il est neutralisé, donc lisible tel quel
    // dans le tableur, pas évalué comme une soustraction.
    const csv = versCsv([offre({ userNote: "-5 % vs marché" })]);
    expect(csv).toContain("\"'-5 % vs marché\"");
  });
});

describe("mise en forme des valeurs", () => {
  it("écrit les distances à la française", () => {
    expect(versCsv([offre({ km: 3.5 })])).toContain('"3,5"');
  });

  it("laisse vide ce qui est absent, jamais un zéro", () => {
    // Un 0 dans « Note » se lirait comme une évaluation catastrophique.
    const csv = versCsv([offre({ score: null, km: null, salaireAffiche: null, perimeeLe: null })]);
    const ligne = csv.replace(/^﻿/, "").trim().split("\r\n")[1]!;
    expect(ligne.startsWith('"",')).toBe(true);
    expect(ligne).not.toContain('"0"');
  });

  it("traduit le statut en libellé lisible", () => {
    expect(versCsv([offre({ statut: "CVenvoye" })])).toContain('"CV envoyé"');
  });

  it("réduit la date de péremption au jour", () => {
    const csv = versCsv([offre({ perimeeLe: "2026-07-20T13:45:00.000Z" })]);
    expect(csv).toContain('"2026-07-20"');
  });

  it("dit d'où vient la note", () => {
    expect(versCsv([offre({ scoreSource: "manuel" })])).toContain('"vérifiée à la main"');
    expect(versCsv([offre({ scoreSource: "calcule" })])).toContain('"calculée"');
  });
});

describe("nom de fichier", () => {
  it("porte la date du jour", () => {
    expect(nomFichierExport("2026-07-28T19:00:00.000Z")).toBe("suivi-emploi-2026-07-28.csv");
  });
});
