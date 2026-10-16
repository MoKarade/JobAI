// Verrou de source : aucun message technique d'exception n'est affiché à l'écran du profil.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lire = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("messages d'erreur du profil", () => {
  it("la page profil n'affiche pas le message interne", () => {
    const s = lire("app", "profil", "page.tsx");
    expect(s).not.toContain("illisible : {erreurProfil}");
    expect(s).toContain("Le profil enregistré est illisible pour le moment.");
  });

  it("la revue de profil n'affiche pas e.message", () => {
    const s = lire("components", "RevueProfil.tsx");
    expect(s).not.toContain("e.message");
    expect(s).toContain("La validation n'a pas abouti.");
  });
});

describe("la revue de profil coche d'avance ce qui a une preuve (ADR-0028)", () => {
  it("l'état de départ vient de retenusParDefaut, pas d'un ensemble vide ni de « tout »", () => {
    const s = lire("components", "RevueProfil.tsx");
    expect(s).toContain("new Set(retenusParDefaut(ecarts))");
    expect(s).not.toMatch(/useState<ReadonlySet<string>>\(new Set\(\)\)/);
    expect(s).not.toMatch(/new Set\(ecarts\.map/);
  });

  it("un nouveau CV remonte un écran neuf : la page donne une clé au composant", () => {
    expect(lire("app", "profil", "page.tsx")).toContain("key={aRelire.id}");
  });
});
