// tests/carteHauteur.test.ts — ce qui décide de la HAUTEUR du plan sur la page Carte.
//
// POURQUOI CE FICHIER EXISTE
// Marc, 2026-09-15 : « la carte est trop petite encore, elle a pas grandi ». Le lot
// précédent avait replié la barre de filtres — et la mesure au navigateur a montré qu'il
// n'avait RIEN donné au plan sur un portable : 337 px avant, 337 px après. La place
// libérée était allée au DÉFILEMENT, pas à la carte, parce que le plancher de
// `.plan-ecran` était la valeur qui s'applique là-bas.
//
// Deux mécanismes distincts sont donc verrouillés ici, et ils ne servent pas le même
// écran — c'est ce qui rend leur confusion coûteuse :
//   1. la BANDE D'ÉTAT, une enveloppe qui rend `display:inline` opérant (grand écran) ;
//   2. le PLANCHER de `.plan-ecran`, seul levier sur un portable.
//
// ⚠️ CE QUE CES TESTS NE PEUVENT PAS FAIRE : mesurer des pixels. Il n'y a pas de
// navigateur dans la suite de ce dépôt. Les chiffres vivent dans le commentaire de
// `app/globals.css`, mesurés au Chromium de la session sur une page reconstituée. Ici on
// verrouille les MÉCANISMES qui les produisent — pas les valeurs qu'ils rendent.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

/** La feuille sans ses commentaires : une règle interdite s'écrit aussi dans une explication. */
const REGLES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** Même découpage que `tests/liensOffreCables.test.ts` : par ligne, suffisant ici. */
function sansCommentaires(source: string): string {
  return source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

const CARTE = sansCommentaires(
  readFileSync(resolve(process.cwd(), "components/CarteFiltrable.tsx"), "utf8"),
);

describe("la bande d'état — une enveloppe, sinon `display:inline` est INERTE", () => {
  it("⚠️ les quatre éléments d'état vivent DANS `.carte-etat`", () => {
    // `main` est un conteneur flex (`.page--pleine main`). Un enfant direct de flex est
    // BLOCKIFIÉ par la spécification : `display:inline` y est ignoré, en silence. C'est
    // exactement ce qui s'est passé du 2026-09-13 au 2026-09-15 — la règle existait, son
    // commentaire affirmait qu'elle marchait, et la bande coûtait 102 px au lieu de 54.
    const ouvre = CARTE.indexOf('<div className="carte-etat">');
    expect(ouvre).toBeGreaterThan(0);
    const ferme = CARTE.indexOf('<div className="plan-ecran">');
    const bande = CARTE.slice(ouvre, ferme);
    expect(bande).toContain("<BoutonSituer");
    expect(bande).toContain("<CompteFiltre");
    // Les deux lignes de comptes propres à la carte.
    expect(bande.split('className="carte__compte"').length - 1).toBe(2);
  });

  it("⚠️ la feuille rend l'inline aux ENFANTS de la bande, jamais aux items de `main`", () => {
    expect(REGLES).toMatch(/\.page--pleine \.carte-etat > \*\s*\{[^}]*display:\s*inline/);
    // Et le motif INERTE ne doit pas revenir : viser les `<p>` directement, c'est viser des
    // items flex — la règle serait de nouveau ignorée sans que rien ne le dise.
    expect(REGLES).not.toMatch(
      /\.page--pleine \.controles__compte,\s*\n?\s*\.page--pleine \.carte__compte\s*\{[^}]*display:\s*inline/,
    );
  });
});

describe("le plancher du plan — le SEUL levier sur un portable", () => {
  /**
   * ⚠️ VERROU DE VALEUR, ET IL SE DIT. Ce n'est pas un test de comportement : c'est un
   * garde-fou contre un retour silencieux à un plancher trop bas. La mesure qui justifie
   * `36rem` est écrite à côté de la déclaration, dans `app/globals.css`, avec sa date et
   * ses trois tailles de fenêtre. Le relever demande une nouvelle mesure ; le BAISSER
   * demande d'abord d'expliquer où passent les 160 px que Marc a demandés.
   */
  const PLANCHER_MIN_REM = 34;

  it(`⚠️ \`.plan-ecran\` garde un plancher d'au moins ${PLANCHER_MIN_REM}rem`, () => {
    const bloc = REGLES.match(/\.plan-ecran\s*\{[^}]*\}/);
    expect(bloc).not.toBeNull();
    const m = bloc![0].match(/min-height:\s*([\d.]+)rem/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(PLANCHER_MIN_REM);
  });

  it("garde sa mesure ÉCRITE à côté — un seuil sans sa mesure se rebaisse tout seul", () => {
    // La règle du dépôt : « un seuil qu'on n'a pas mesuré se place là où il n'est qu'un
    // filet ». Celui-ci est une POLITIQUE (il décide de la hauteur vue), donc sa mesure
    // doit rester lisible par la prochaine session.
    const zone = CSS.slice(Math.max(0, CSS.indexOf("min-height: 36rem") - 1800));
    expect(zone).toContain("1366×648");
    expect(zone).toContain("1920×960");
  });

  it("⚠️ reste un PLANCHER, pas une hauteur imposée", () => {
    // `min-height` laisse le plan grandir au-delà quand la fenêtre le permet (mesuré :
    // 625 px sur 1920×960, bien au-dessus des 576 px du plancher). Le figer en `height`
    // rendrait les grands écrans PLUS PETITS — l'inverse de la demande.
    const bloc = REGLES.match(/\.plan-ecran\s*\{[^}]*\}/)![0];
    expect(bloc).not.toMatch(/(^|[^-])height:\s*\d/);
    expect(bloc).toContain("flex: 1 1 auto");
  });
});
