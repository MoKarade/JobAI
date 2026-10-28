// tests/gmailStore.test.ts — le stockage du jeton Gmail chiffré (gmail/store, ADR-0041, JobAI#107)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncState } from "../lib/db/schema";

type LigneInsertion = { cle: string; valeur: string; majLe: Date };
type Conflit = { target: unknown; set: { valeur: string; majLe: Date } };
type LigneSelection = { valeur: string };

let ligneInseree: LigneInsertion | undefined;
let conflit: Conflit | undefined;
let lignesSelectionnees: LigneSelection[] = [];
let erreurEcriture: Error | null = null;
let erreurLecture: Error | null = null;

const assurerMigrations = vi.fn(async () => {});

vi.mock("../lib/db", () => ({
  db: {
    insert: () => ({
      values: (ligne: LigneInsertion) => {
        ligneInseree = ligne;
        return {
          onConflictDoUpdate: async (configuration: Conflit) => {
            conflit = configuration;
            if (erreurEcriture) throw erreurEcriture;
          },
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: async () => {
          if (erreurLecture) throw erreurLecture;
          return lignesSelectionnees;
        },
      }),
    }),
  },
}));

vi.mock("../lib/migrations", () => ({
  assurerMigrations,
}));

const { enregistrerJetonChiffre, lireJetonChiffre } = await import("../lib/gmail/store");

const BLOB_FICTIF = "blob-chiffre-fictif";

beforeEach(() => {
  ligneInseree = undefined;
  conflit = undefined;
  lignesSelectionnees = [];
  erreurEcriture = null;
  erreurLecture = null;
  assurerMigrations.mockClear();
});

describe("le stockage du jeton Gmail chiffré (gmail/store)", () => {
  it("enregistrerJetonChiffre appelle assurerMigrations, insère la ligne et demande le remplacement sur conflit", async () => {
    await enregistrerJetonChiffre(BLOB_FICTIF);

    expect(assurerMigrations).toHaveBeenCalledOnce();
    expect(ligneInseree).toEqual({
      cle: "gmail-jeton",
      valeur: BLOB_FICTIF,
      majLe: expect.any(Date),
    });
    expect(conflit).toEqual({
      target: syncState.cle,
      set: {
        valeur: BLOB_FICTIF,
        majLe: expect.any(Date),
      },
    });
  });

  it("enregistrerJetonChiffre laisse remonter l'erreur si la base refuse", async () => {
    erreurEcriture = new Error("Erreur écriture base");

    await expect(enregistrerJetonChiffre(BLOB_FICTIF)).rejects.toThrow("Erreur écriture base");
  });

  it("lireJetonChiffre appelle assurerMigrations et rend la valeur de la ligne quand elle existe", async () => {
    lignesSelectionnees = [{ valeur: BLOB_FICTIF }];

    const resultat = await lireJetonChiffre();

    expect(assurerMigrations).toHaveBeenCalledOnce();
    expect(resultat).toBe(BLOB_FICTIF);
  });

  it("lireJetonChiffre rend null quand la base ne rend aucune ligne", async () => {
    lignesSelectionnees = [];

    const resultat = await lireJetonChiffre();

    expect(assurerMigrations).toHaveBeenCalledOnce();
    expect(resultat).toBeNull();
  });

  it("lireJetonChiffre laisse remonter l'erreur si la base refuse", async () => {
    erreurLecture = new Error("Erreur lecture base");

    await expect(lireJetonChiffre()).rejects.toThrow("Erreur lecture base");
  });
});
