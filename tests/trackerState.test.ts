// tests/trackerState.test.ts — le seul chemin de lecture qui ne garantissait pas son schéma.
//
// Ce qui est verrouillé ici n'est pas « les migrations sont appelées » mais « elles le sont
// AVANT la lecture ». L'ordre EST la propriété : migrer après avoir lu ne répare rien, et un
// test qui se contenterait de compter les appels passerait sur ce bug-là.
//
// Le défaut protégé est de ceux qui dépendent de QUI a réveillé l'instance : le sondage du
// hub crée une instance froide aussi bien qu'une visite de Marc, mais lui seul passait par
// une lecture qui n'appliquait aucune migration. Un défaut qui ne se reproduit qu'une fois
// sur deux ne se corrige pas — il se verrouille.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** L'ordre RÉEL des opérations, dans l'ordre où elles se produisent. */
const journal: string[] = [];

vi.mock("../lib/migrations", () => ({
  assurerMigrations: vi.fn(async () => {
    journal.push("migrations");
  }),
}));

const lignes: Record<string, unknown>[] = [];

vi.mock("../lib/db", () => ({
  db: {
    select: () => ({
      from: async () => {
        journal.push("select");
        return lignes;
      },
    }),
  },
}));

const { getTrackerState } = await import("../lib/trackerState");
const { assurerMigrations } = await import("../lib/migrations");

beforeEach(() => {
  journal.length = 0;
  lignes.length = 0;
  process.env.DATABASE_URL = "postgres://exemple/base-de-test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  vi.clearAllMocks();
});

describe("garantie de schéma avant lecture", () => {
  it("applique les migrations AVANT de lire les offres", async () => {
    lignes.push({
      histo: false,
      score: 80,
      statut: "Identifiee",
      entreprise: "Entreprise test",
      poste: "Poste test",
      perimeeLe: null,
    });

    await getTrackerState();

    // Discrimination : déplacer l'appel après le `select` fait tomber cette assertion,
    // alors qu'un simple `toHaveBeenCalled()` resterait vert.
    expect(journal).toEqual(["migrations", "select"]);
  });

  it("ne touche à rien sans base configurée — l'absence n'est pas une panne", async () => {
    delete process.env.DATABASE_URL;

    expect(await getTrackerState()).toBeNull();
    // Pas de base, pas de migration : on ne va pas réveiller un pilote pour découvrir
    // qu'il n'y a pas d'URL. Et surtout, on ne LIT pas — donc rien ne peut lever.
    expect(journal).toEqual([]);
    expect(assurerMigrations).not.toHaveBeenCalled();
  });

  it("rend null sur une base vide, pas un résumé à zéro", async () => {
    // Le point de bascule « no fake data » : « pas encore importé » n'est pas
    // « recherche à l'arrêt ». Les migrations ont bien tourné — c'est justement ce qui
    // permet à la lecture de réussir et de rendre zéro ligne au lieu de lever.
    expect(await getTrackerState()).toBeNull();
    expect(journal).toEqual(["migrations", "select"]);
  });
});
