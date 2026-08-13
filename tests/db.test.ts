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

describe("le journal des migrations", () => {
  it("décrit EXACTEMENT les fichiers SQL committés", () => {
    // ⚠️ CE TEST COMBLE UN ANGLE MORT DE CELUI QUI SUIT.
    //
    // `lireMigrations` lit le DOSSIER : un fichier SQL y est donc exécuté par les tests même
    // s'il n'est déclaré nulle part. En production, c'est le JOURNAL qui commande — Drizzle
    // n'applique que ce qu'il y trouve. Les deux peuvent donc diverger dans le pire sens
    // possible : la suite verte, et la migration jamais jouée en ligne. Aucune erreur,
    // aucune trace, une colonne ou un rattrapage qui n'existe simplement pas.
    //
    // Le risque n'est pas théorique : le journal se modifie à la main dès qu'on écrit une
    // migration de DONNÉES, que `drizzle-kit generate` ne produit pas (il ne voit que les
    // différences de schéma).
    const dossier = resolve(process.cwd(), "drizzle");
    const fichiers = readdirSync(dossier)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();

    const journal = JSON.parse(
      readFileSync(resolve(dossier, "meta/_journal.json"), "utf8"),
    ) as { entries: { tag: string; idx: number }[] };
    const declares = journal.entries.map((e) => e.tag).sort();

    // Volume prouvé avant d'en dépendre : deux listes vides seraient « égales ».
    expect(fichiers.length).toBeGreaterThan(5);
    expect(declares).toEqual(fichiers);

    // Les index doivent se suivre sans trou ni doublon : Drizzle applique dans cet ordre.
    const idx = journal.entries.map((e) => e.idx);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(new Set(idx).size).toBe(idx.length);
  });
});

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
  it("crée les huit tables attendues", async () => {
    const r = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(r.rows.map((x) => x.table_name)).toEqual([
      // Le CV téléversé et le profil qu'on en tire. La table la plus sensible du projet :
      // le fichier y dort en entier (choix de Marc, ADR-0009), et `colonnesCv` est la
      // projection sans blob à utiliser partout ailleurs.
      "cvs",
      "entreprises_lieux",
      "offer_reasons",
      "offers",
      // Les établissements du Registre des entreprises, filtrés sur la région. Table de
      // RÉFÉRENCE : aucune donnée de Marc, remplacée en bloc à chaque import.
      "registre_etablissements",
      // Les dénominations : le nom d'un établissement n'est souvent pas celui sous lequel
      // on connaît l'entreprise (mesuré : 11 trouvées sur 73 sans cette table).
      "registre_noms",
      // Ce que la base sait avoir déjà appliqué : empreinte du jeu de départ, et
      // temporisation des passes de fond. C'est ce qui permet à l'app de se synchroniser
      // seule sans réécrire les offres à chaque affichage.
      "sync_state",
      "villes",
    ]);
  });

  it("pose bien les 14 contraintes CHECK du schéma", async () => {
    const r = await pg.query<{ constraint_name: string }>(
      `SELECT con.conname AS constraint_name
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       WHERE con.contype = 'c' AND rel.relname IN ('offers', 'offer_reasons', 'villes', 'entreprises_lieux')
       ORDER BY con.conname`,
    );
    expect(r.rows.map((x) => x.constraint_name)).toEqual([
      // Une adresse et sa SOURCE vont ensemble ou pas du tout : sans cette paire de
      // contraintes, un chemin d'écriture pourrait inscrire une rue sans dire si c'est le
      // lieu de l'entreprise ou son domicile légal — et l'écran l'afficherait pareil.
      "entreprises_lieux_adresse_avec_source_ck",
      "entreprises_lieux_adresse_source_ck",
      "entreprises_lieux_lat_ck",
      "entreprises_lieux_lon_ck",
      "entreprises_lieux_precision_ck",
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

describe("table entreprises_lieux — précision et bornes", () => {
  it("accepte les deux précisions honnêtes, refuse le reste", async () => {
    await expect(
      pg.query(
        "INSERT INTO entreprises_lieux (nom, lat, lon, precision) VALUES ('E-Exacte', 46.8, -71.2, 'exacte')",
      ),
    ).resolves.toBeDefined();
    await expect(
      pg.query(
        "INSERT INTO entreprises_lieux (nom, lat, lon, precision) VALUES ('E-Ville', 46.8, -71.2, 'ville')",
      ),
    ).resolves.toBeDefined();
    // « approximative », « gps », une faute de frappe : la base refuse, le typage ne
    // survivrait pas à une écriture faite hors de l'app.
    await expect(
      pg.query(
        "INSERT INTO entreprises_lieux (nom, lat, lon, precision) VALUES ('E-Autre', 46.8, -71.2, 'gps')",
      ),
    ).rejects.toThrow(/entreprises_lieux_precision_ck/);
  });

  it("refuse une position hors de la région, comme pour les villes", async () => {
    await expect(
      pg.query(
        "INSERT INTO entreprises_lieux (nom, lat, lon, precision) VALUES ('E-Vancouver', 46.8, -123.11, 'exacte')",
      ),
    ).rejects.toThrow(/entreprises_lieux_lon_ck/);
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
