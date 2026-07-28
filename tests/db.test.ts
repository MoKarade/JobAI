// tests/db.test.ts — le schéma, testé sur une VRAIE Postgres (PGlite, en mémoire).
//
// Ce test applique le fichier de migration RÉELLEMENT COMMITTÉ, puis vérifie que les
// contraintes tiennent. C'est volontairement une intégration et non un mock : un mock
// aurait validé mes suppositions sur Postgres, pas Postgres lui-même. Et il lit le SQL
// depuis `drizzle/` plutôt que de recréer les tables, pour que le test échoue si la
// migration committée diverge du schéma TypeScript.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

let pg: PGlite;

/** Le SQL de migration réellement committé, découpé en instructions exécutables. */
function lireMigrations(): string[] {
  const dossier = resolve(process.cwd(), "drizzle");
  const fichiers = readdirSync(dossier)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Un scan qui ne lit rien passerait à vide : on prouve le volume avant d'en dépendre.
  expect(fichiers.length).toBeGreaterThan(0);

  return fichiers
    .flatMap((f) => readFileSync(resolve(dossier, f), "utf8").split("--> statement-breakpoint"))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

beforeAll(async () => {
  pg = new PGlite();
  const instructions = lireMigrations();
  expect(instructions.length).toBeGreaterThan(5);
  for (const sql of instructions) await pg.exec(sql);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

/** Insère une offre minimale valide, en surchargeant les colonnes voulues. */
async function insererOffre(champs: Record<string, string | number | null> = {}) {
  const base: Record<string, string | number | null> = {
    id: `o-${Math.abs(hash(JSON.stringify(champs)))}`,
    date_reperage: "2026-07-28",
    entreprise: "Entreprise test",
    poste: "Poste test",
    ...champs,
  };
  const colonnes = Object.keys(base);
  const valeurs = Object.values(base);
  const params = colonnes.map((_, i) => `$${i + 1}`).join(", ");
  await pg.query(
    `INSERT INTO offers (${colonnes.join(", ")}) VALUES (${params})`,
    valeurs,
  );
  return base.id as string;
}

/** Identifiant déterministe : un test ne doit pas dépendre du hasard ni de l'horloge. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

describe("migration", () => {
  it("crée les trois tables attendues", async () => {
    const r = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(r.rows.map((x) => x.table_name)).toEqual(["offer_reasons", "offers", "villes"]);
  });

  it("pose bien les 9 contraintes CHECK du schéma", async () => {
    const r = await pg.query<{ constraint_name: string }>(
      `SELECT con.conname AS constraint_name
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       WHERE con.contype = 'c' AND rel.relname IN ('offers', 'offer_reasons', 'villes')
       ORDER BY con.conname`,
    );
    expect(r.rows.map((x) => x.constraint_name)).toEqual([
      "offer_reasons_ton_ck",
      "offers_km_ck",
      "offers_priorite_ck",
      "offers_score_bornes_ck",
      "offers_score_source_ck",
      "offers_source_ck",
      "offers_statut_ck",
      "villes_lat_ck",
      "villes_lon_ck",
    ]);
  });
});

describe("table villes — les bornes géographiques", () => {
  // Ces CHECK ne sont pas décoratifs : un géocodeur qui rend « Québec,
  // Colombie-Britannique », ou une inversion de signe, poserait une épingle à des milliers
  // de kilomètres. La carte aurait l'air cassée sans qu'on sache pourquoi. La base refuse.
  it("accepte une position de la région", async () => {
    await expect(
      pg.query("INSERT INTO villes (nom, lat, lon) VALUES ('Ville-Test', 46.8, -71.2)"),
    ).resolves.toBeDefined();
  });

  it("refuse une latitude hors région", async () => {
    await expect(
      pg.query("INSERT INTO villes (nom, lat, lon) VALUES ('Trop-Au-Sud', 40.7, -71.2)"),
    ).rejects.toThrow(/villes_lat_ck/);
  });

  it("refuse une longitude de signe inversé", async () => {
    // Le cas réel : `Number('-71.2')` mal lu, ou un géocodeur qui rend l'hémisphère est.
    await expect(
      pg.query("INSERT INTO villes (nom, lat, lon) VALUES ('Signe-Inverse', 46.8, 71.2)"),
    ).rejects.toThrow(/villes_lon_ck/);
  });

  it("refuse deux fois la même ville", async () => {
    await pg.query("INSERT INTO villes (nom, lat, lon) VALUES ('Unique', 46.8, -71.2)");
    await expect(
      pg.query("INSERT INTO villes (nom, lat, lon) VALUES ('Unique', 46.9, -71.3)"),
    ).rejects.toThrow();
  });
});

describe("contraintes de domaine", () => {
  it("accepte une offre valide", async () => {
    const id = await insererOffre({ score: 92, score_source: "manuel", km: 33 });
    const r = await pg.query<{ id: string; score: number }>(
      "SELECT id, score FROM offers WHERE id = $1",
      [id],
    );
    expect(r.rows[0]?.score).toBe(92);
  });

  // Les valeurs ci-dessous sont exactement celles que le typage TypeScript interdit déjà.
  // Le test prouve que la BASE les refuse aussi — c'est-à-dire que la protection survit à
  // un `any`, à une écriture hors de l'app, ou à une migration de données faite à la main.
  it("refuse un statut hors du domaine", async () => {
    await expect(insererOffre({ statut: "Embauché" })).rejects.toThrow();
  });

  it("refuse une priorité hors du domaine", async () => {
    await expect(insererOffre({ priorite: "Urgente" })).rejects.toThrow();
  });

  it("refuse une source hors du domaine", async () => {
    await expect(insererOffre({ source: "linkedin" })).rejects.toThrow();
  });

  it("refuse un score hors des bornes 0-100", async () => {
    await expect(insererOffre({ score: 101 })).rejects.toThrow();
    await expect(insererOffre({ score: -1 })).rejects.toThrow();
  });

  it("refuse une distance négative", async () => {
    await expect(insererOffre({ km: -5 })).rejects.toThrow();
  });

  it("accepte un score et une distance absents (non évalué n'est pas zéro)", async () => {
    const id = await insererOffre({ score: null, km: null, score_source: null });
    const r = await pg.query<{ score: number | null }>(
      "SELECT score FROM offers WHERE id = $1",
      [id],
    );
    expect(r.rows[0]?.score).toBeNull();
  });
});

describe("justification de la note", () => {
  it("refuse un ton hors du domaine", async () => {
    const id = await insererOffre({ id: "o-ton-invalide" });
    await expect(
      pg.query("INSERT INTO offer_reasons (offer_id, ton, texte) VALUES ($1, $2, $3)", [
        id,
        "neutre",
        "…",
      ]),
    ).rejects.toThrow();
  });

  it("supprime les justifications en cascade avec l'offre", async () => {
    const id = await insererOffre({ id: "o-cascade" });
    await pg.query(
      "INSERT INTO offer_reasons (offer_id, ton, texte, ordre) VALUES ($1, 'atout', 'Proche', 0)",
      [id],
    );
    await pg.query("DELETE FROM offers WHERE id = $1", [id]);
    const r = await pg.query("SELECT id FROM offer_reasons WHERE offer_id = $1", [id]);
    expect(r.rows).toHaveLength(0);
  });

  it("refuse une justification orpheline", async () => {
    await expect(
      pg.query(
        "INSERT INTO offer_reasons (offer_id, ton, texte) VALUES ('offre-inexistante', 'atout', '…')",
      ),
    ).rejects.toThrow();
  });
});

describe("valeurs par défaut", () => {
  it("une offre neuve est identifiée, active, de source seed, sans note perso", async () => {
    const id = await insererOffre({ id: "o-defauts" });
    const r = await pg.query<{
      source: string;
      statut: string;
      priorite: string;
      histo: boolean;
      user_note: string;
      perimee_le: string | null;
    }>(
      `SELECT source, statut, priorite, histo, user_note, perimee_le
       FROM offers WHERE id = $1`,
      [id],
    );
    const o = r.rows[0];
    expect(o?.source).toBe("seed");
    expect(o?.statut).toBe("Identifiee");
    expect(o?.priorite).toBe("Moyenne");
    expect(o?.histo).toBe(false);
    expect(o?.user_note).toBe("");
    // Une offre neuve est réputée ouverte : « périmée » est une constatation, pas un défaut.
    expect(o?.perimee_le).toBeNull();
  });
});
