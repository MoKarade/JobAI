import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LectureAnnonce } from "../lib/lectureAnnonce";
import { MODELE_LECTURE, VERSION_LECTURE } from "../lib/lectureAnnonce";
import { lecturesAnnonce } from "../lib/db/schema";

type Ligne = { offerId: string; lecture: string; luLe: Date };
type Conflit = { target: unknown; set: { lecture: string; luLe: Date } };

let lignes: Ligne[] = [];
let ligneInseree: Ligne | undefined;
let conflit: Conflit | undefined;
let erreurEcriture: Error | null = null;
let erreurLecture: Error | null = null;

const assurerMigrations = vi.fn(async () => {});

vi.mock("../lib/db", () => ({
  db: {
    insert: () => ({
      values: (ligne: Ligne) => {
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
      from: async () => {
        if (erreurLecture) throw erreurLecture;
        return lignes;
      },
    }),
  },
}));
vi.mock("../lib/migrations", () => ({ assurerMigrations }));

const { garderLecture, lireLectures } = await import("../lib/lectureAnnonceStore");

const LECTURE: LectureAnnonce = {
  role: "technique",
  adequation: 70,
  raisons: ["Compétences techniques pertinentes."],
  version: VERSION_LECTURE,
  modele: MODELE_LECTURE,
  luLe: "2026-10-21T17:00:00.000Z",
  caracteresLus: 100,
};

beforeEach(() => {
  lignes = [];
  ligneInseree = undefined;
  conflit = undefined;
  erreurEcriture = null;
  erreurLecture = null;
  assurerMigrations.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("le stockage des lectures d'annonce", () => {
  it("assure les migrations et remplace la lecture de l'offre en conflit", async () => {
    await garderLecture("offre-fictive-1", LECTURE);

    expect(assurerMigrations).toHaveBeenCalledOnce();
    expect(ligneInseree).toEqual({
      offerId: "offre-fictive-1",
      lecture: JSON.stringify(LECTURE),
      luLe: new Date(LECTURE.luLe),
    });
    expect(ligneInseree?.luLe).toBeInstanceOf(Date);
    expect(conflit).toEqual({
      target: lecturesAnnonce.offerId,
      set: { lecture: JSON.stringify(LECTURE), luLe: new Date(LECTURE.luLe) },
    });
  });

  it("laisse remonter un refus de la base", async () => {
    erreurEcriture = new Error("écriture refusée");

    await expect(garderLecture("offre-fictive-1", LECTURE)).rejects.toBe(erreurEcriture);
  });

  it("rend les lectures valides dans une Map par offre", async () => {
    lignes = [
      { offerId: "offre-fictive-1", lecture: JSON.stringify(LECTURE), luLe: new Date(LECTURE.luLe) },
      {
        offerId: "offre-fictive-2",
        lecture: JSON.stringify({ ...LECTURE, role: "coordination" }),
        luLe: new Date(LECTURE.luLe),
      },
    ];

    const resultat = await lireLectures();

    expect(resultat).toEqual({
      lectures: new Map([
        ["offre-fictive-1", LECTURE],
        ["offre-fictive-2", { ...LECTURE, role: "coordination" }],
      ]),
      illisibles: 0,
    });
  });

  it("compte les lectures dont le JSON est cassé ou qui ne passent pas le schéma", async () => {
    lignes = [
      { offerId: "offre-fictive-1", lecture: JSON.stringify(LECTURE), luLe: new Date(LECTURE.luLe) },
      { offerId: "offre-fictive-2", lecture: "{json cassé", luLe: new Date(LECTURE.luLe) },
      {
        offerId: "offre-fictive-3",
        lecture: JSON.stringify({ ...LECTURE, role: "role-inconnu" }),
        luLe: new Date(LECTURE.luLe),
      },
    ];

    const resultat = await lireLectures();

    expect(resultat).toEqual({ lectures: new Map([["offre-fictive-1", LECTURE]]), illisibles: 2 });
  });

  it("rend null sans lever quand la base ne répond pas", async () => {
    erreurLecture = new Error("base indisponible");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(lireLectures()).resolves.toBeNull();
  });
});
