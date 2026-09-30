// Verrou du branchement de la porte de commit (INC-22, 30/09) : le hook doit couvrir CHAQUE outil shell.
// Avec « Bash » seul, un `git commit` lancé par l'outil PowerShell passait sans contrôle (constaté le 29/09).
// Et la configuration du dépôt garde les 4 portes bloquantes de CLAUDE.md : typecheck, test, lint, build.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const racine = process.cwd();
const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(join(racine, chemin), "utf8"));

interface Hook { command?: string }
interface Branchement { matcher?: string; hooks?: Hook[] }
interface Reglage { hooks?: { PreToolUse?: Branchement[] } }
interface Etape { nom: string; commande: string[] }

/** Un matcher de hook Claude Code est une expression régulière appliquée au nom ENTIER de l'outil. */
const couvre = (matcher: string, outil: string): boolean => new RegExp(`^(?:${matcher})$`).test(outil);

describe("porte de commit : branchement et portes", () => {
  const reglage = lireJson(".claude/settings.json") as Reglage;
  const branchements = (reglage.hooks?.PreToolUse ?? []).filter((b) =>
    (b.hooks ?? []).some((h) => h.command === "node scripts/hooks/commit-gate.mjs"),
  );

  it("un seul branchement du hook, sur Bash ET PowerShell, et sur aucun autre outil", () => {
    expect(branchements).toHaveLength(1);
    const matcher = branchements[0]?.matcher ?? "";
    for (const outil of ["Bash", "PowerShell"]) expect(couvre(matcher, outil)).toBe(true);
    for (const outil of ["Read", "Edit", "Write", "Glob", "Grep", "PowerShellX", "XBash"]) {
      expect(couvre(matcher, outil)).toBe(false);
    }
  });

  it("la configuration garde les 4 portes bloquantes, dans l'ordre de la CI", () => {
    const config = lireJson("scripts/hooks/commit-gate.json") as { etapes: Etape[] };
    expect(config.etapes.map((e) => e.commande.join(" "))).toEqual([
      "npm run typecheck",
      "npm test",
      "npm run lint",
      "npm run build",
    ]);
  });
});
