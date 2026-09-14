// tests/liensOffreCables.test.ts — le module est-il BRANCHÉ, ou juste écrit ?
//
// ⚠️ CE TEST EXISTE PARCE QUE LES DEUX MOITIÉS ÉTAIENT DÉJÀ GARDÉES SÉPARÉMENT et que le
// TROU entre elles n'appartenait à personne : `tests/lienOffre.test.ts` prouve que le
// classement est juste, `tests/styles.test.ts` prouve que les classes ont une règle — et
// rien, entre les deux, ne prouve que les écrans APPELLENT le classement. Un lot vert de
// bout en bout qui ne change rien à l'affichage est un mode de panne connu de ce dépôt.
//
// ⚠️ IL LIT LA SOURCE DÉCOMMENTÉE. Les commentaires de `CarteOffre.tsx` expliquent le
// second chemin en citant ses mots : un scan de source brut serait satisfait par sa propre
// explication. L'anti-vacuité vérifie que le décommentage n'a pas tout mangé — sinon
// « aucun `lienSur` ne subsiste » se prouverait à partir de « il ne subsiste rien ».

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ECRANS = [
  "components/CarteOffre.tsx",
  "app/offre/[id]/page.tsx",
] as const;

/** Même découpage que `tests/datesEcrites.test.ts` : par ligne, suffisant sur ce dépôt. */
function sansCommentaires(source: string): string {
  return source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

const SOURCES = Object.fromEntries(
  ECRANS.map((f) => [f, sansCommentaires(readFileSync(resolve(process.cwd(), f), "utf8"))]),
) as Record<(typeof ECRANS)[number], string>;

describe("le classement des liens est branché sur les écrans", () => {
  it("le décommentage laisse du vrai code — sinon tout ce qui suit est vacueux", () => {
    for (const f of ECRANS) {
      const code = SOURCES[f];
      expect(code.length, f).toBeGreaterThan(800);
      expect(code, f).toContain("export");
      expect(code, f).toContain("return");
    }
  });

  for (const f of ECRANS) {
    it(`${f} calcule son lien par la source unique`, () => {
      expect(SOURCES[f]).toContain("lienDeOffre(");
    });

    it(`${f} rend le libellé du genre, pas un « offre » écrit en dur`, () => {
      // Le défaut d'avant : un `<a>` qui promettait « offre ↗ » sur une page d'accueil.
      expect(SOURCES[f]).toContain("lien.libelle");
    });

    it(`${f} propose le second chemin`, () => {
      expect(SOURCES[f]).toContain("lien.recherche");
    });

    it(`${f} n'a plus sa copie locale de la règle http(s)`, () => {
      // Deux règles pour la même question ont déjà divergé ici (classification des pannes
      // de base) : celle-ci vit désormais dans `lib/lienOffre.ts`, et nulle part ailleurs.
      expect(SOURCES[f]).not.toContain("lienSur");
    });

    it(`${f} affiche ce que l'app sait de la fraîcheur de l'offre`, () => {
      expect(SOURCES[f]).toMatch(/fraicheur/);
    });
  }
});
