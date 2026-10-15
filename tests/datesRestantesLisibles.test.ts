// tests/datesRestantesLisibles.test.ts — carte 10 (fin) : les trois dernières dates brutes
// (AAAA-MM-JJ) passent par `dateLisible`. Verrou de source : vitest ne collecte pas les `.tsx`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("dates à la française (carte 10, fin)", () => {
  it("le profil écrit la date de dépôt du CV avec dateLisible", () => {
    const src = lire("app/profil/page.tsx");
    expect(src).toContain("return dateLisible(iso.slice(0, 10));");
  });

  it("les archives écrivent la date de fermeture avec dateLisible", () => {
    const src = lire("components/ListeArchives.tsx");
    expect(src).toMatch(/dateLisible\(o\.perimeeLe\.slice\(0, 10\)\)/);
    expect(src).not.toMatch(/fermée le \{o\.perimeeLe\.slice/);
  });

  it("la carte d'offre écrit sa date avec dateLisible", () => {
    const src = lire("components/CarteOffre.tsx");
    expect(src).toMatch(/dateLisible\(offre\.dateEnvoi \|\| offre\.dateReperage\)/);
  });
});
