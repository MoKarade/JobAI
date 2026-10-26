// tests/liaMontee.test.ts — verrou de la LIA présente partout (mode invité) et démarrée hors du rendu.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lire = (...chemin: string[]) => readFileSync(join(__dirname, "..", ...chemin), "utf8");
const source = lire("components", "LiaMontee.tsx");
const layout = lire("app", "layout.tsx");
const globalError = lire("app", "global-error.tsx");

describe("LiaMontee : LIA présente tout le temps", () => {
  it("appelle demarrerLia une seule fois, au chargement du module, pas dans un effet", () => {
    expect(source.match(/demarrerLia\(/g)).toHaveLength(1);
    expect(source).toMatch(/^demarrerLia\(\{/m);
    expect(/useEffect\(\(\) => \{[^}]*demarrerLia/.test(source)).toBe(false);
  });

  it("le layout racine rend LiaMontee TOUJOURS, session admise ou non (LIA aussi sur /connexion)", () => {
    expect(layout).toContain("<LiaMontee session={lia} />");
    expect(layout).not.toMatch(/\?\s*<LiaMontee/);
  });

  it("global-error.tsx rend LiaMontee : LIA reste là quand toute la page plante", () => {
    expect(globalError).toContain("<LiaMontee />");
  });

  it("mode invité : ask passe par creerAskInvite, le drapeau de session ne se lève que si la session est admise", () => {
    expect(source).toContain("creerAskInvite(session,");
    expect(source).toMatch(/if \(admise\) session\.activer\(\)/);
  });

  it("l'état partagé passe par etatHttp, enveloppé pour l'invité, sans jeton ni en-tête écrit à la main", () => {
    expect(source).toContain('import { etatHttp } from "@mokarade/lia-ui/etat-http"');
    expect(source).toContain('creerEtatInvite(session, etatHttp("/api/lia/etat"))');
    expect(source).not.toMatch(/HUB_TOKEN|x-hub-token|x-lia-proprietaire/i);
  });

  it("garde les options du hub et aucune pastille maison", () => {
    expect(source).toContain('quandMouvementReduit: "complet"');
    expect(source).toContain("humeurVisible: true");
  });
});
