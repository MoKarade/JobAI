// Verrou de source : une lecture en échec ne se fait pas passer pour « aucune passe ».
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const s = readFileSync(join(process.cwd(), "app", "sources", "page.tsx"), "utf8");

describe("page Veille — compte rendu illisible", () => {
  it("dit « Compte rendu illisible pour le moment » quand la lecture échoue", () => {
    expect(s).toContain("Compte rendu illisible pour le moment.");
    expect(s).toMatch(/catch \(err\) \{[\s\S]*lectureEchouee = true;/);
  });
});
