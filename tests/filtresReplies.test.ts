// tests/filtresReplies.test.ts — la barre de filtres repliée sur la carte, et son indice.
//
// POURQUOI CE FICHIER EXISTE
// Demande de Marc (2026-09-15) : « rends la carte plus grande », en gardant la liste à
// côté. La hauteur se prend au-dessus du plan, et le plus gros poste est la barre de
// filtres. Repliée, elle tient sur une ligne — mais un filtre qui agit sans se montrer
// fait chercher un bug dans les données. L'indice EST la contrepartie du pli, et c'est lui
// que ce fichier verrouille.
//
// ⚠️ LE TEST QUI COMPTE EST CELUI D'EXHAUSTIVITÉ, ET IL EST DÉRIVÉ. Un résumé écrit à la
// main se périme au prochain filtre ajouté — le dépôt a déjà payé cette classe cinq fois
// (quatre listes de colonnes, l'empreinte du seed, la liste des tables). Les cas sont donc
// dérivés de `FILTRES_VIDES` : ajouter un champ sans le déclarer ici fait rougir la suite.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FILTRES_VIDES, unFiltreEstActif, type EtatFiltres } from "@/lib/filtres";
import { CATEGORIES } from "@/lib/categorie";
import { resumerFiltres } from "@/components/Filtres";

/**
 * Une valeur NON par défaut par champ de filtre.
 *
 * ⚠️ ÉCRITE À LA MAIN, ET C'EST VOULU — mais la LISTE des champs, elle, est dérivée
 * (premier test ci-dessous). On ne peut pas deviner génériquement qu'un `null` doit
 * devenir `70` ici et `"industrie"` là ; en revanche on peut EXIGER qu'aucun champ ne
 * manque. C'est le patron « la liste seule pourrit, le test seul est circulaire : il faut
 * les deux ».
 */
const ACTIFS: Record<keyof EtatFiltres, Partial<EtatFiltres>> = {
  texte: { texte: "laserax" },
  activesSeules: { activesSeules: true },
  historique: { historique: true },
  avecPerimees: { avecPerimees: true },
  noteMinimale: { noteMinimale: 70 },
  distanceMaxKm: { distanceMaxKm: 25 },
  jours: { jours: 7 },
  // ⚠️ DÉRIVÉE, pas écrite : `CATEGORIES[0]` suit la liste du code. Une catégorie codée en
  // dur ici serait refusée par le typage au premier renommage — ce qui est arrivé au
  // premier jet (« production » n'existe pas), et que seul `tsc` a vu : vitest ne
  // typecheck pas, donc la suite était VERTE sur un cas impossible.
  categorie: { categorie: CATEGORIES[0] ?? null },
};

describe("resumerFiltres — ce qui est replié se DIT, sans exception", () => {
  it("⚠️ couvre CHAQUE champ de filtre — la liste est dérivée de FILTRES_VIDES", () => {
    // Si quelqu'un ajoute un filtre sans l'ajouter à `ACTIFS`, ce test tombe ICI, avant
    // même de juger le résumé. C'est le seul moment où l'oubli est encore rattrapable.
    const champs = Object.keys(FILTRES_VIDES).sort();
    expect(Object.keys(ACTIFS).sort()).toEqual(champs);
  });

  it("rend « aucun » quand rien ne filtre — jamais une chaîne vide", () => {
    expect(resumerFiltres(FILTRES_VIDES)).toBe("aucun");
    // Trois espaces ne sont pas une recherche : même règle que `unFiltreEstActif`.
    expect(resumerFiltres({ ...FILTRES_VIDES, texte: "   " })).toBe("aucun");
  });

  for (const [champ, patch] of Object.entries(ACTIFS)) {
    it(`dit quelque chose dès que « ${champ} » filtre`, () => {
      const etat = { ...FILTRES_VIDES, ...patch };
      // Contrôle de la PRÉMISSE : si ce patch ne filtrait rien, le test serait vacueux et
      // passerait quoi qu'on fasse du résumé.
      expect(unFiltreEstActif(etat)).toBe(true);
      expect(resumerFiltres(etat)).not.toBe("aucun");
    });
  }

  it("nomme ce qui filtre, pas seulement « des filtres »", () => {
    const r = resumerFiltres({
      ...FILTRES_VIDES,
      texte: "laserax",
      activesSeules: true,
      noteMinimale: 70,
      distanceMaxKm: 25,
    });
    expect(r).toContain("laserax");
    expect(r).toContain("Actives");
    expect(r).toContain("70");
    expect(r).toContain("25");
  });

  it("⚠️ couvre les DEUX moitiés de la barre — les seuils NE suffisent pas", () => {
    // `resumerSeuils` existait déjà et ne connaît que les quatre seuils. S'en contenter
    // laisserait la recherche et les bascules agir derrière un pli fermé : c'est
    // exactement le défaut que ce pli pourrait introduire.
    expect(resumerFiltres({ ...FILTRES_VIDES, texte: "soudeur" })).not.toBe("aucun");
    expect(resumerFiltres({ ...FILTRES_VIDES, avecPerimees: true })).not.toBe("aucun");
  });
});

/** Même découpage que `tests/liensOffreCables.test.ts` : par ligne, suffisant ici. */
function sansCommentaires(source: string): string {
  return source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

describe("le pli vit sur la CARTE, et nulle part ailleurs", () => {
  const carte = sansCommentaires(
    readFileSync(resolve(process.cwd(), "components/CarteFiltrable.tsx"), "utf8"),
  );
  const liste = sansCommentaires(
    readFileSync(resolve(process.cwd(), "components/ListeOffres.tsx"), "utf8"),
  );

  it("la carte replie la barre ET affiche son indice", () => {
    expect(carte).toMatch(/<Depliant[^>]*titre="Filtres"/);
    expect(carte).toContain("resumerFiltres(filtres)");
  });

  it("⚠️ « Situer » reste HORS du pli — c'est une action, pas un filtre", () => {
    // Rangée sous un bouton nommé « Filtres », elle deviendrait introuvable, et son compte
    // rendu avec elle. Le test vise l'ORDRE : le bouton vient APRÈS la fermeture du pli.
    const finDuPli = carte.indexOf("</Depliant>");
    const situer = carte.indexOf("<BoutonSituer");
    expect(finDuPli).toBeGreaterThan(0);
    expect(situer).toBeGreaterThan(finDuPli);
  });

  it("⚠️ la LISTE (ListeOffres) garde sa barre à l’air libre — le pli est un arbitrage de la carte", () => {
    // Sur la liste, la hauteur n'est pas la ressource rare : y replier la barre serait une
    // régression d'usage sans contrepartie (c'est écrit dans `Depliant`, et c'est vrai
    // là-bas). Si ce test tombe, c'est que le pli a débordé sur l'autre surface.
    expect(liste).not.toMatch(/<Depliant[^>]*titre="Filtres"/);
  });
});
