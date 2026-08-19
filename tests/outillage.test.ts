// tests/outillage.test.ts — les commandes de base de données ne mentent pas.
//
// Incident du 2026-07-28, le plus coûteux de la session. `npm run db:migrate` lançait
// `drizzle-kit migrate`, qui choisit le pilote `@neondatabase/serverless` dès qu'il est
// installé. Ce pilote exige un WEBSOCKET pour migrer ; sans configuration explicite, la
// connexion n'aboutit pas — et `drizzle-kit` sort avec le code 0, sans erreur, sans avoir
// créé la moindre table.
//
// Marc l'a lancé DEUX FOIS en croyant que c'était fait. Seuls les journaux de production
// ont révélé que la table manquait toujours. Un outil qui échoue en silence est pire qu'un
// outil qui plante : il fait avancer avec une hypothèse fausse.
//
// Ce test verrouille les deux propriétés qui ferment ce piège.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function lire(chemin: string): string {
  const contenu = readFileSync(resolve(process.cwd(), chemin), "utf8");
  // Volume prouvé : un mauvais chemin rendrait une chaîne vide, et toutes les assertions
  // « ne contient pas » passeraient à vide. Protection nulle et silencieuse.
  expect(contenu.length, `${chemin} est vide ou illisible`).toBeGreaterThan(200);
  return contenu;
}

const pkg = JSON.parse(lire("package.json")) as { scripts: Record<string, string> };

describe("la migration ne passe plus par le chemin silencieux", () => {
  it("`db:migrate` n'appelle PAS `drizzle-kit migrate`", () => {
    // C'est LA régression à empêcher. `drizzle-kit generate`, lui, reste légitime : il ne
    // touche pas à la base, il compare le schéma aux migrations committées.
    expect(pkg.scripts["db:migrate"]).toBeDefined();
    expect(pkg.scripts["db:migrate"]).not.toContain("drizzle-kit migrate");
    expect(pkg.scripts["db:migrate"]).toContain("scripts/migrer.ts");
  });

  it("`db:generate` reste sur drizzle-kit, qui n'a pas besoin de la base", () => {
    expect(pkg.scripts["db:generate"]).toContain("drizzle-kit generate");
  });
});

describe("le migrateur VÉRIFIE au lieu d'annoncer", () => {
  const source = lire("scripts/migrer.ts");

  it("interroge la base après avoir migré", () => {
    // Ne pas se fier au fait que `migrate` n'ait pas levé : demander à la base ce qu'elle
    // contient réellement. C'est le signal indépendant qui manquait.
    expect(source).toContain("information_schema.tables");
  });

  it("DÉRIVE la liste des tables du schéma au lieu de la recopier", () => {
    // ⚠️ ET LA LISTE RECOPIÉE AVAIT DÉJÀ DÉRIVÉ : elle nommait TROIS tables sur les onze du
    // schéma. Les huit autres étaient créées par la migration puis jamais vérifiées après
    // elle — donc une migration à moitié appliquée serait sortie en SUCCÈS, exactement la
    // panne que ce script existe pour empêcher. Découvert en faisant dériver la liste côté
    // test plutôt qu'en la relisant. On vérifie donc la MÉCANIQUE, pas des littéraux : une
    // liste écrite à la main ici retomberait dans le même piège.
    expect(source).toContain('from "../lib/db/schema"');
    expect(source).toContain("getTableName");
    expect(source).not.toMatch(/TABLES_ATTENDUES\s*=\s*\[\s*"/);
  });

  it("la dérivation couvre TOUTES les tables déclarées dans le schéma", async () => {
    // La mécanique ne suffit pas : il faut qu'elle PRODUISE la bonne liste. On compare ce
    // que la dérivation rend au nombre de `pgTable(` du fichier de schéma — un écart
    // voudrait dire qu'une table est déclarée autrement et échappe au filtre.
    const { getTableName, is } = await import("drizzle-orm");
    const { PgTable } = await import("drizzle-orm/pg-core");
    const schema = await import("../lib/db/schema");
    const derivees = Object.values(schema)
      .filter((v) => is(v, PgTable))
      .map((t) => getTableName(t as never));

    const brut = readFileSync(resolve(process.cwd(), "lib/db/schema.ts"), "utf8");
    const declarees = [...brut.matchAll(/pgTable\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]!);

    expect(declarees.length, "le scan du schéma est vide").toBeGreaterThanOrEqual(3);
    expect(derivees.sort()).toEqual([...declarees].sort());
  });

  it("SORT EN ÉCHEC quand une table manque", () => {
    // Un script de migration qui rend 0 sans avoir migré est exactement le piège qu'on
    // ferme. Il doit y avoir un chemin d'échec explicite.
    expect(source).toContain("process.exit(1)");
    expect(source).toMatch(/manquantes/i);
  });

  it("passe par le pilote HTTP, celui que l'app utilise déjà", () => {
    // `neon-http` est le chemin prouvé en production depuis le premier jour. Le pilote
    // websocket est précisément celui qui échouait sans le dire.
    expect(source).toContain("drizzle-orm/neon-http");
  });

  it("lit `.env.local` comme le reste de l'outillage", () => {
    expect(source).toContain("chargerEnvLocal");
  });
});
