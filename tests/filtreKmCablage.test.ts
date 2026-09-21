// tests/filtreKmCablage.test.ts — `[UI-FILTRE-KM]` câblé de l'état jusqu'à l'écran.
//
// Ce dépôt n'a pas de harnais de rendu (ni testing-library ni jsdom) : la vérification de
// l'interface se fait par SCAN DE SOURCE, comme `liensOffreCables` et `carteHauteur`. Un
// scan prouve la PRÉSENCE d'un appel, jamais l'acheminement d'une valeur — ce que les
// fonctions FONT est éprouvé dans `tests/filtres.test.ts`, et on le dit ici.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lire = (chemin: string) => readFileSync(resolve(process.cwd(), chemin), "utf8");

const sansCommentaires = (source: string) =>
  source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*|\{\/\*)/.test(l))
    .join("\n");

const listeOffres = sansCommentaires(lire("components/ListeOffres.tsx"));
const filtresUI = sansCommentaires(lire("components/Filtres.tsx"));
const accueil = sansCommentaires(lire("app/page.tsx"));
const carte = sansCommentaires(lire("app/carte/page.tsx"));

describe("le rayon de Marc traverse jusqu'aux paliers", () => {
  it("le décommentage laisse du vrai code — sinon tout ce qui suit est vacueux", () => {
    // Mesuré le 2026-09-21 : 3 200, 7 500, 8 400 et 9 900 caractères environ.
    for (const [nom, src] of Object.entries({ listeOffres, filtresUI, accueil, carte })) {
      expect(src.length, nom).toBeGreaterThan(2_000);
    }
    expect(filtresUI).toContain("export function Filtres(");
  });

  it("la barre de filtres DÉRIVE ses paliers du rayon, elle ne les écrit pas", () => {
    expect(filtresUI).toContain("paliersDistance(rayonMaxKm)");
    // L'ancienne constante figée ne doit pas revenir : elle s'arrêtait à 50 km, donc
    // « qu'est-ce qui est dans mon rayon ? » n'était pas une question que l'écran posait.
    expect(filtresUI).not.toContain("PALIERS_DISTANCE_KM");
  });

  it("les DEUX écrans lisent le rayon dans l'état et le passent", () => {
    for (const [nom, src] of Object.entries({ accueil, carte })) {
      expect(src, nom).toContain("CLE_RAYON");
      expect(src, nom).toContain("rayonMaxKm");
    }
    expect(accueil).toMatch(/rayonMaxKm=\{rayonMaxKm\}/);
    expect(carte).toMatch(/rayonMaxKm=\{rayonMaxKm\}/);
  });

  it("une lecture de rayon qui échoue ne peut pas éteindre l'accueil", () => {
    // Le rayon NUANCE un affichage, il ne le produit pas : mis nu dans le `Promise.all`,
    // il transformerait un confort de filtre en panne de la page la plus consultée — le
    // raisonnement exact déjà écrit pour le journal de veille, juste au-dessus.
    expect(accueil).toMatch(/lireEtat<number>\(CLE_RAYON, RAYON_DEFAUT_KM\)\.catch\(/);
  });
});

describe("la liste MONTRE ce qu'elle met de côté", () => {
  it("elle sépare au lieu de filtrer, et rend les deux groupes", () => {
    expect(listeOffres).toContain("separerParDistance(offres, filtres, metiers)");
    expect(listeOffres).toContain("grouperParEntreprise(distanceInconnue)");
    // ⚠️ LA CONDITION DE RENDU, PAS SEULEMENT LA CLASSE CSS. Mon premier jet asserait la
    // présence de « liste-distance-inconnue » : remplacer la condition par `false` laissait
    // le test VERT, puisque le JSX restait écrit dans le fichier. Un scan qui cherche un
    // jeton prouve qu'on l'a TAPÉ, pas qu'il s'affiche.
    expect(listeOffres).toMatch(/\{groupesInconnus\.length > 0 \? \(/);
    expect(listeOffres).toMatch(/groupesInconnus\.map\(\(g\) => \(/);
    expect(listeOffres).toContain("liste-distance-inconnue");
  });

  it("le compte affiché vient du groupe, il n'est pas recalculé à côté", () => {
    // Deux nombres calculés séparément divergent : `sansDistanceMesuree` n'appliquait que
    // trois des huit filtres, et annonçait donc une population que l'écran ne montrait pas.
    expect(listeOffres).toContain("const sansDistance = distanceInconnue.length;");
    expect(listeOffres).not.toContain("sansDistanceMesuree(offres, filtres)");
  });

  it("le titre du groupe DIT le nombre et la raison", () => {
    // « Distance inconnue » seul se lirait comme une catégorie d'offre. Ce qui doit passer,
    // c'est que le seuil les écarte FAUTE DE MESURE, pas parce qu'elles sont loin.
    expect(listeOffres).toContain("Distance inconnue");
    expect(listeOffres).toContain("faute de mesure");
  });
});
