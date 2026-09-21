// tests/cartePageParallele.test.ts — la page Carte lit la base en PARALLÈLE, pas en série.
//
// `[CARTE-PERF]` / ADR-0022, 2026-09-21. Cette page enchaînait cinq lectures Neon en série
// (`await domicile()`, `await rayon`, `await lireOffres()`, `await entreprisesLieux`,
// `await trajets`) alors qu'aucune des quatre premières ne dépend d'une autre — cinq
// allers-retours réseau payés l'un après l'autre pour rien.
//
// ⚠️ Pas de harnais de rendu dans ce dépôt (ni testing-library ni jsdom) : la vérification se
// fait par SCAN DE SOURCE, comme ailleurs. Un scan prouve la STRUCTURE de l'appel (un seul
// `Promise.all`, les cinq lectures dedans), pas le comportement runtime.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sansCommentaires = (source: string) =>
  source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");

const code = sansCommentaires(readFileSync(resolve(process.cwd(), "app/carte/page.tsx"), "utf8"));

describe("les cinq lectures de la page Carte partagent UN SEUL Promise.all", () => {
  it("le décommentage laisse du vrai code — sinon tout ce qui suit est vacueux", () => {
    expect(code.length).toBeGreaterThan(3_000);
    expect(code).toContain("export default async function PageCarte");
  });

  it("les cinq lectures sont TOUTES dans le même Promise.all", () => {
    // Ancré sur le bloc entre `Promise.all([` et son `])` fermant, pour ne pas être
    // satisfait par cinq `Promise.all` séparés portant chacun un seul appel — ce qui
    // recréerait exactement le problème sous une autre forme.
    const bloc = code.match(/const \[[^\]]*\] = await Promise\.all\(\[([\s\S]*?)\]\);/);
    expect(bloc, "aucun Promise.all destructuré trouvé").not.toBeNull();
    const dedans = bloc![1]!;
    for (const appel of [
      "domicile()",
      "lireEtat<number>(CLE_RAYON, RAYON_DEFAUT_KM)",
      "lireOffres()",
      "db.select().from(entreprisesLieux)",
      "db.select().from(trajets)",
    ]) {
      expect(dedans, appel).toContain(appel);
    }
  });

  it("aucune des cinq ne reste seule derrière un `await` hors du Promise.all", () => {
    // Si une seule régresse en séquentiel, ce motif la retrouve : un `await` DIRECT sur
    // l'un des cinq appels, hors du bloc `Promise.all`.
    const horsBloc = code.replace(/const \[[^\]]*\] = await Promise\.all\(\[[\s\S]*?\]\);/, "");
    for (const appel of [
      "await domicile()",
      "await lireEtat<number>(CLE_RAYON",
      "await lireOffres()",
      "await db.select().from(entreprisesLieux)",
      "await db.select().from(trajets)",
    ]) {
      expect(horsBloc, appel).not.toContain(appel);
    }
  });
});
