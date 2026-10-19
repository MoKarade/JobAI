// tests/majExtraction.test.ts — une ré-analyse qui échoue ne détruit pas la proposition de profil déjà en base
// (JobAI#158). Données FICTIVES.

import { describe, it, expect, vi, beforeEach } from "vitest";

let ecrit: Record<string, unknown> = {};

vi.mock("../lib/db", () => ({
  db: {
    update: () => ({
      set: (valeurs: Record<string, unknown>) => {
        ecrit = valeurs;
        return { where: async () => {} };
      },
    }),
  },
}));
vi.mock("../lib/migrations", () => ({ assurerMigrations: async () => {} }));

const { majExtraction } = await import("../lib/cv/depot");

beforeEach(() => {
  ecrit = {};
});

describe("majExtraction", () => {
  it("une ré-analyse réussie remplace la proposition", async () => {
    const extraction = { parcours: [] } as unknown as Parameters<typeof majExtraction>[1]["extraction"];
    await majExtraction(1, { texte: "texte du CV", extraction, erreur: null });
    expect(ecrit.profilPropose).toBe(JSON.stringify(extraction));
    expect(ecrit.erreurExtraction).toBeNull();
  });

  it("une ré-analyse en échec écrit l'erreur et NE TOUCHE PAS à la proposition", async () => {
    await majExtraction(1, { texte: "texte du CV", extraction: null, erreur: "Appel à l'API refusé" });
    expect("profilPropose" in ecrit).toBe(false);
    expect(ecrit.erreurExtraction).toBe("Appel à l'API refusé");
  });
});
