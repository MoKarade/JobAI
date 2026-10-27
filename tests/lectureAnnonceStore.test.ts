// tests/lectureAnnonceStore.test.ts — stockage et relecture des lectures d'annonce (JobAI#109, ADR-0039).
//
// Données FICTIVES (dépôt public).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { VERSION_LECTURE, MODELE_LECTURE, type LectureAnnonce } from "../lib/lectureAnnonce";
import { lecturesAnnonce } from "../lib/db/schema";

let migrationAppelees = 0;
let dbErreurInsert: Error | null = null;
let dbErreurSelect: Error | null = null;
let dernieresValeursInsert: unknown = null;
let derniereConfigConflict: unknown = null;
let lignesSelect: { offerId: string; lecture: string; luLe: Date }[] = [];

vi.mock("../lib/migrations", () => ({
  assurerMigrations: vi.fn(async () => {
    migrationAppelees += 1;
  }),
}));

vi.mock("../lib/db", () => ({
  db: {
    insert: (_table: unknown) => {
      if (dbErreurInsert) throw dbErreurInsert;
      return {
        values: (vals: unknown) => {
          dernieresValeursInsert = vals;
          return {
            onConflictDoUpdate: async (config: unknown) => {
              derniereConfigConflict = config;
            },
          };
        },
      };
    },
    select: () => ({
      from: async (_table: unknown) => {
        if (dbErreurSelect) throw dbErreurSelect;
        return lignesSelect;
      },
    }),
  },
}));

const { garderLecture, lireLectures } = await import("../lib/lectureAnnonceStore");

beforeEach(() => {
  migrationAppelees = 0;
  dbErreurInsert = null;
  dbErreurSelect = null;
  dernieresValeursInsert = null;
  derniereConfigConflict = null;
  lignesSelect = [];
  vi.clearAllMocks();
});

const MAINTENANT = "2026-10-21T17:00:00.000Z";

const LECTURE_VALIDE: LectureAnnonce = {
  role: "combinaison",
  adequation: 80,
  raisons: ["Pilote l'intégration de cellules robotiques.", "Contenu technique réel."],
  version: VERSION_LECTURE,
  modele: MODELE_LECTURE,
  luLe: MAINTENANT,
  caracteresLus: 500,
};

describe("garderLecture", () => {
  it("appelle assurerMigrations, insère l'offerId, la lecture en JSON et la date luLe (un objet Date), avec remplacement sur conflit", async () => {
    await garderLecture("o-123", LECTURE_VALIDE);

    expect(migrationAppelees).toBe(1);
    expect(dernieresValeursInsert).toEqual({
      offerId: "o-123",
      lecture: JSON.stringify(LECTURE_VALIDE),
      luLe: new Date(MAINTENANT),
    });
    expect((dernieresValeursInsert as { luLe: unknown }).luLe).toBeInstanceOf(Date);
    expect(derniereConfigConflict).toEqual({
      target: lecturesAnnonce.offerId,
      set: {
        lecture: JSON.stringify(LECTURE_VALIDE),
        luLe: new Date(MAINTENANT),
      },
    });
  });

  it("laisse remonter l'erreur si la base refuse (elle ne l'avale pas)", async () => {
    dbErreurInsert = new Error("Base de données inaccessible");

    await expect(garderLecture("o-123", LECTURE_VALIDE)).rejects.toThrow("Base de données inaccessible");
  });
});

describe("lireLectures", () => {
  it("rend une Map par offre pour les lignes valides et illisibles: 0", async () => {
    const l1: LectureAnnonce = {
      ...LECTURE_VALIDE,
      role: "combinaison",
      adequation: 90,
    };
    const l2: LectureAnnonce = {
      ...LECTURE_VALIDE,
      role: "technique",
      adequation: 50,
      luLe: "2026-10-21T18:00:00.000Z",
    };

    lignesSelect = [
      { offerId: "o-1", lecture: JSON.stringify(l1), luLe: new Date(l1.luLe) },
      { offerId: "o-2", lecture: JSON.stringify(l2), luLe: new Date(l2.luLe) },
    ];

    const res = await lireLectures();

    expect(migrationAppelees).toBe(1);
    expect(res).not.toBeNull();
    expect(res?.illisibles).toBe(0);
    expect(res?.lectures.size).toBe(2);
    expect(res?.lectures.get("o-1")).toEqual(l1);
    expect(res?.lectures.get("o-2")).toEqual(l2);
  });

  it("compte dans illisibles et omet de la Map une ligne au JSON cassé ou ne passant pas le schéma", async () => {
    const lValide: LectureAnnonce = {
      ...LECTURE_VALIDE,
      role: "technicien",
      adequation: 30,
    };

    lignesSelect = [
      { offerId: "o-valide", lecture: JSON.stringify(lValide), luLe: new Date(lValide.luLe) },
      { offerId: "o-json-casse", lecture: "{", luLe: new Date() },
      { offerId: "o-schema-invalide", lecture: JSON.stringify({ role: "directeur", adequation: 50 }), luLe: new Date() },
      { offerId: "o-champs-manquants", lecture: JSON.stringify({ role: "combinaison" }), luLe: new Date() },
    ];

    const res = await lireLectures();

    expect(res).not.toBeNull();
    expect(res?.illisibles).toBe(3);
    expect(res?.lectures.size).toBe(1);
    expect(res?.lectures.get("o-valide")).toEqual(lValide);
    expect(res?.lectures.has("o-json-casse")).toBe(false);
    expect(res?.lectures.has("o-schema-invalide")).toBe(false);
    expect(res?.lectures.has("o-champs-manquants")).toBe(false);
  });

  it("rend null quand la base ne répond pas, sans lever", async () => {
    dbErreurSelect = new Error("Erreur de connexion SQL");
    const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await lireLectures();

    expect(res).toBeNull();
    expect(spyConsole).toHaveBeenCalled();

    spyConsole.mockRestore();
  });
});
