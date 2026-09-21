// tests/distancesCablage.test.ts — ADR-0021 câblé pour de vrai dans la passe.
//
// Les fonctions pures de `lib/distances.ts` sont éprouvées chez elles. Ce fichier vérifie
// l'autre moitié : qu'elles sont APPELÉES, et au bon endroit. Un test unitaire vert sur une
// garde que personne n'appelle est le mode de panne classique de ce dépôt — « promesse de
// verrou = verrou codé dans le même commit ».
//
// ⚠️ Un scan de source prouve la PRÉSENCE d'un appel, jamais l'acheminement d'une valeur.
// Ce que chaque garde FAIT est éprouvé dans `tests/distances.test.ts` ; ici on ne vérifie que
// le câblage, et on le dit.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sansCommentaires = (source: string) =>
  source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");

const code = sansCommentaires(readFileSync(resolve(process.cwd(), "lib/actions.ts"), "utf8"));

describe("la passe de distances applique la garde de plausibilité", () => {
  it("le décommentage laisse du vrai code — sinon tout ce qui suit est vacueux", () => {
    // Mesuré le 2026-09-21 : ~59 000 caractères une fois les commentaires retirés.
    expect(code.length).toBeGreaterThan(40_000);
    expect(code).toContain("export async function mesurerDistances");
  });

  it("`planifierDistances` reçoit le centre des villes, pas seulement le profil", () => {
    // L'argument est REQUIS côté type ; ce test dit en plus que c'est bien `centreDe` — le
    // compilateur accepterait n'importe quelle fonction de la bonne forme, y compris
    // `() => null`, qui rendrait la garde muette sans qu'une ligne ne rougisse.
    expect(code).toMatch(/planifierDistances\([\s\S]{0,200}?centreDe,/);
  });

  it("les km déjà écrits passent par l'invalidation AVANT d'être replanifiés", () => {
    // L'ordre compte : `planifierDistances` ne retouche jamais un `km` connu, donc une
    // invalidation qui tournerait après elle n'aurait plus rien à corriger cette passe-là.
    const posInvalidation = code.indexOf("invaliderDistancesImplausibles(offresPrecisees");
    const posPlanification = code.indexOf("planifierDistances(");
    expect(posInvalidation).toBeGreaterThan(-1);
    expect(posPlanification).toBeGreaterThan(posInvalidation);
  });

  it("l'effacement atteint la BASE, pas seulement la copie en mémoire", () => {
    // Sans cet `update`, les km faux seraient retirés du calcul de la passe puis réécrits
    // identiques au prochain démarrage : une correction qui ne survit pas au processus.
    expect(code).toMatch(/\.set\(\{ km: null, majLe: new Date\(\) \}\)/);
  });

  it("les villes à géocoder sont triées par ce qu'elles débloquent", () => {
    expect(code).toContain("villesParUrgence(aSituer)");
    // L'ancien ordre — celui de l'itération sur les employeurs — ne doit pas revenir.
    expect(code).not.toMatch(/new Set\(aSituer\.map\(\(e\) => e\.ville\)\)/);
  });

  it("la re-vérification des centres tourne APRÈS les villes manquantes", () => {
    const posSituer = code.indexOf("await situerLot(");
    const posRevue = code.indexOf("await reverifierCentres(");
    expect(posSituer).toBeGreaterThan(-1);
    expect(posRevue).toBeGreaterThan(posSituer);
  });

  it("la re-vérification ne SUPPRIME jamais une ligne de `villes`", () => {
    // Une ligne que le lecteur strict ne confirme pas n'est pas prouvée fausse : Nominatim
    // peut ne pas répondre ce jour-là. La supprimer ferait perdre un centre juste sur un
    // silence réseau.
    expect(code).not.toMatch(/delete\(villes\)/);
  });

  it("la taille RÉELLE de la file est publiée", () => {
    // `situées=0/2820` compte des employeurs ; ce qui borne la convergence, c'est le nombre
    // de VILLES distinctes restantes, à huit par passe.
    expect(code).toContain("villesManquantes=${villesManquantes}");
  });
});
