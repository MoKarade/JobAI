// tests/oauthJeton.test.ts — la règle de validité d'un jeton, sans base. Valeurs structurelles
// neutres : seules comptent les dates relatives.

import { describe, it, expect } from "vitest";
import { jetonUtilisable } from "@/lib/oauthJeton";

const maintenant = new Date(1000);
const base = { clientId: "client", sujet: "sujet", expireLe: new Date(2000), revoqueLe: null };

describe("jetonUtilisable", () => {
  it("refuse un jeton absent", () => {
    expect(jetonUtilisable(undefined, maintenant)).toBeNull();
  });

  it("accepte un jeton ni révoqué ni expiré et rend client et sujet seulement", () => {
    expect(jetonUtilisable(base, maintenant)).toEqual({ clientId: "client", sujet: "sujet" });
  });

  it("refuse un jeton révoqué, même encore dans sa durée", () => {
    expect(jetonUtilisable({ ...base, revoqueLe: new Date(500) }, maintenant)).toBeNull();
  });

  it("refuse un jeton expiré", () => {
    expect(jetonUtilisable({ ...base, expireLe: new Date(999) }, maintenant)).toBeNull();
  });

  it("refuse un jeton qui expire à l'instant exact (échéance exclusive)", () => {
    expect(jetonUtilisable({ ...base, expireLe: new Date(1000) }, maintenant)).toBeNull();
  });

  it("accepte un jeton à une milliseconde de son échéance", () => {
    expect(jetonUtilisable({ ...base, expireLe: new Date(1001) }, maintenant)).not.toBeNull();
  });
});
