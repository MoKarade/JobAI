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
