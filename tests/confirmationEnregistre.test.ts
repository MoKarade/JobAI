// Verrou de source : « Enregistré ✓ » n'est affiché qu'après la réponse OK du serveur,
// jamais sur l'état optimiste (il mentirait en cas d'échec).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components", "ControlesOffre.tsx"), "utf8");

describe("ControlesOffre — confirmation d'enregistrement", () => {
  it("affiche « Enregistré ✓ »", () => {
    expect(source).toContain("Enregistré ✓");
  });

  it("ne confirme qu'après une réponse ok, et efface la confirmation en cas d'échec", () => {
    const echec = source.indexOf("if (!r.ok)");
    const confirmation = source.indexOf("setConfirme(true)");
    expect(echec).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(echec);
    expect(source).toMatch(/if \(!r\.ok\) \{[^}]*return;[^}]*\}\s*setConfirme\(true\)/s);
  });
});
