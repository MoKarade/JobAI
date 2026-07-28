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

  it("connaît les tables attendues, y compris la dernière ajoutée", () => {
    for (const table of ["offers", "offer_reasons", "villes"]) {
      expect(source, `« ${table} » n'est pas vérifiée`).toContain(`"${table}"`);
    }
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
