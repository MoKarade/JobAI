// tests/oauthStore.test.ts — l'usage unique et la rotation, prouvés sur une VRAIE Postgres.
//
// CE QUI EST EN JEU
// OAuth 2.1 exige qu'un code d'autorisation ne serve qu'UNE fois et qu'un jeton de
// rafraîchissement TOURNE. Les deux affirmations du code disent que c'est la BASE qui
// l'arbitre — `UPDATE … WHERE consomme_le IS NULL RETURNING` — et non un « lire puis
// écrire » côté application, qui laisserait une fenêtre où un rejeu passe. Une affirmation
// se vérifie : elle est éprouvée ici sur PGlite, avec le SQL de migration RÉELLEMENT
// committé.
//
// ⚠️ LA LIMITE DE CE FICHIER, DITE PLUTÔT QUE TUE. `lib/oauthStore.ts` importe la connexion
// Neon directement (convention du dépôt) : on ne peut donc pas lui brancher PGlite sans le
// refactorer. Ces tests prouvent que POSTGRES fait ce qu'on lui prête ; le second bloc
// vérifie que le store emploie bien CE motif-là. Les deux ensemble couvrent l'affirmation —
// aucun des deux seul ne suffirait, et prétendre le contraire serait le genre de promesse
// que ce dépôt a déjà payée.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  const dossier = resolve(process.cwd(), "drizzle");
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith(".sql")).sort();
  expect(fichiers.length, "aucune migration lue").toBeGreaterThan(0);
  for (const f of fichiers) {
    for (const instruction of readFileSync(resolve(dossier, f), "utf8").split("--> statement-breakpoint")) {
      const sql = instruction.trim();
      if (sql.length > 0) await pg.exec(sql);
    }
  }
});

afterAll(async () => {
  await pg.close();
});

const DEMAIN = new Date(Date.now() + 3_600_000).toISOString();
const HIER = new Date(Date.now() - 3_600_000).toISOString();

async function poserCode(empreinte: string, expire: string): Promise<void> {
  await pg.query(
    `INSERT INTO oauth_codes (empreinte, client_id, redirect_uri, defi, sujet, expire_le)
     VALUES ($1, 'c', 'https://x.test/cb', 'd', 'marc@exemple.test', $2)`,
    [empreinte, expire],
  );
}

/** Le MOTIF exact qu'emploie `consommerCode`. */
async function consommer(empreinte: string): Promise<number> {
  const r = await pg.query(
    `UPDATE oauth_codes SET consomme_le = now()
     WHERE empreinte = $1 AND consomme_le IS NULL AND expire_le > now()
     RETURNING empreinte`,
    [empreinte],
  );
  return r.rows.length;
}

describe("les tables du connecteur existent après migration", () => {
  it("les trois sont créées par le SQL committé", async () => {
    const r = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const noms = r.rows.map((x) => x.table_name);
    for (const t of ["oauth_clients", "oauth_codes", "oauth_jetons"]) {
      expect(noms, `« ${t} » manque`).toContain(t);
    }
  });
});

describe("un code d'autorisation ne sert QU'UNE fois", () => {
  it("le premier échange réussit, le rejeu ne trouve rien", async () => {
    await poserCode("e-unique", DEMAIN);
    expect(await consommer("e-unique")).toBe(1);
    // C'est ici que se joue tout : un rejeu ne met à jour AUCUNE ligne. Pas parce que le
    // code a vérifié avant d'écrire — parce que la condition est DANS l'écriture.
    expect(await consommer("e-unique")).toBe(0);
  });

  it("deux échanges SIMULTANÉS : un seul gagne", async () => {
    // Le cas que « lire puis écrire » rate. Sans la condition dans l'UPDATE, les deux
    // lectures verraient un code libre et les deux écritures réussiraient.
    await poserCode("e-course", DEMAIN);
    const [a, b] = await Promise.all([consommer("e-course"), consommer("e-course")]);
    expect(a + b).toBe(1);
  });

  it("un code EXPIRÉ ne se consomme pas, même s'il n'a jamais servi", async () => {
    await poserCode("e-perime", HIER);
    expect(await consommer("e-perime")).toBe(0);
  });

  it("un code inconnu ne se consomme pas", async () => {
    expect(await consommer("e-jamais-pose")).toBe(0);
  });
});

describe("un jeton de rafraîchissement TOURNE", () => {
  it("la révocation ne réussit qu'une fois — donc un jeton réutilisé échoue", async () => {
    await pg.query(
      `INSERT INTO oauth_jetons (empreinte, genre, client_id, sujet, expire_le)
       VALUES ('j-1', 'rafraichissement', 'c', 'marc@exemple.test', $1)`,
      [DEMAIN],
    );
    const revoquer = async (): Promise<number> => {
      const r = await pg.query(
        `UPDATE oauth_jetons SET revoque_le = now()
         WHERE empreinte = $1 AND revoque_le IS NULL RETURNING empreinte`,
        ["j-1"],
      );
      return r.rows.length;
    };
    expect(await revoquer()).toBe(1);
    // Sans rotation, un jeton volé vaudrait trente jours. Avec, sa réutilisation échoue —
    // et l'échec est le signal qu'il a fuité.
    expect(await revoquer()).toBe(0);
  });
});

describe("le store emploie bien CE motif — l'autre moitié de la preuve", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/oauthStore.ts"), "utf8");

  it("consomme le code DANS l'écriture, pas avant", () => {
    // Un `select` puis un `update` passeraient les tests de comportement d'un mock et
    // laisseraient la course ouverte en production.
    const bloc = source.slice(source.indexOf("export async function consommerCode"));
    expect(bloc).toContain(".update(oauthCodes)");
    expect(bloc).toContain("isNull(oauthCodes.consommeLe)");
    expect(bloc).toContain("gt(oauthCodes.expireLe, maintenant)");
    expect(bloc).toContain(".returning()");
  });

  it("révoque le jeton DANS l'écriture, et fait foi du résultat", () => {
    const bloc = source.slice(source.indexOf("export async function revoquerJeton"));
    expect(bloc).toContain("isNull(oauthJetons.revoqueLe)");
    expect(bloc).toContain(".returning(");
  });

  it("ne stocke jamais un secret en clair — seulement des empreintes", () => {
    // Les colonnes s'appellent `empreinte`, et le store ne connaît que ça : une base lue par
    // un tiers ne rend alors que des valeurs inutilisables.
    expect(source).toContain("empreinte: string");
    expect(source).not.toMatch(/\bsecretEnClair\b|\bjetonBrut\b/);
  });
});
