// tests/previsionsVercel.test.ts — seule la branche principale déploie (JobAI#115).
//
// POURQUOI CE VERROU. Le quota de déploiement Vercel est partagé entre les six apps. Seules les
// branches `claude/*` étaient coupées : les branches `agence/…` et `dependabot/…` créaient chacune
// une préversion à chaque poussée (constaté dans la liste des déploiements du 15/10/2026).
//
// ⚠️ LE DANGER EST DANS L'AUTRE SENS. Une règle trop large (`*`, `**`, une négation `!(main)`)
// peut aussi viser `main` : la production cesserait alors de se déployer, sans rien de rouge
// nulle part. La documentation Vercel ne dit pas comment une règle négative est évaluée, et la
// négation extglob ne donne pas la même réponse selon la version de minimatch. Une règle qui
// contient une barre oblique ne peut JAMAIS viser `main` : c'est la seule forme admise ici.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const vercel = JSON.parse(readFileSync(resolve(__dirname, "..", "vercel.json"), "utf8")) as {
  git?: { deploymentEnabled?: Record<string, boolean> };
};
const regles = vercel.git?.deploymentEnabled ?? {};

describe("préversions Vercel", () => {
  it("coupe toute branche à préfixe (claude/, agence/, dependabot/, feature/…)", () => {
    expect(regles["claude/*"]).toBe(false);
    expect(regles["*/**"]).toBe(false);
  });

  it("ne peut jamais viser la branche principale", () => {
    // Non-vacuité : il y a bel et bien des règles à examiner.
    expect(Object.keys(regles).length).toBeGreaterThanOrEqual(2);
    for (const [motif, actif] of Object.entries(regles)) {
      expect(actif, motif).toBe(false);
      expect(motif, `« ${motif} » pourrait viser main`).toContain("/");
      expect(motif, motif).not.toMatch(/^(main|master)$/);
    }
  });
});
