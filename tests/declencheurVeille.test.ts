// tests/declencheurVeille.test.ts — qui a lancé une passe, dit en mots simples.
import { describe, expect, it } from "vitest";
import { declencheurLisible } from "@/lib/declencheurVeille";

describe("declencheurLisible", () => {
  it("dit « à la main » pour le bouton de l'app", () => {
    expect(declencheurLisible("bouton-app")).toBe("à la main");
  });

  it("dit « automatique » pour les passes planifiées", () => {
    expect(declencheurLisible("cron-veille")).toBe("automatique");
    expect(declencheurLisible("cron-geocodage-rattrapage")).toBe("automatique");
  });
});
