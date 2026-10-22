// tests/lia.monter.test.ts — LIA n'est montée que pour une session admise.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { exigerSession, NonAutorise } = vi.hoisted(() => ({
  exigerSession: vi.fn(),
  NonAutorise: class NonAutorise extends Error {},
}));
vi.mock("@/lib/session", () => ({ exigerSession, NonAutorise }));

import { liaAutorisee } from "../lib/lia/monter";

beforeEach(() => {
  exigerSession.mockReset();
});

describe("liaAutorisee", () => {
  it("session admise : vrai", async () => {
    exigerSession.mockResolvedValue({ user: { email: "marc@exemple.test" } });
    expect(await liaAutorisee()).toBe(true);
  });

  it("pas de session (page de connexion) : faux", async () => {
    exigerSession.mockRejectedValue(new NonAutorise());
    expect(await liaAutorisee()).toBe(false);
  });

  it("toute autre erreur remonte", async () => {
    exigerSession.mockRejectedValue(new Error("panne"));
    await expect(liaAutorisee()).rejects.toThrow("panne");
  });
});
