// tests/bornesBase.test.ts — les bornes de plausibilité vivent à TROIS endroits, et elles
// ne doivent jamais diverger.
//
// `BORNES` (lib/geocodage.ts) décide ce que le LECTEUR accepte ; les CHECK de `villes` et
// d'`entreprises_lieux` décident ce que la BASE accepte. Une divergence ne se voit pas :
// elle produit soit un `INSERT` refusé par la base sur une coordonnée que le code vient de
// juger bonne (une panne au moment où l'on croit écrire), soit l'inverse — une base plus
// permissive que le lecteur, c'est-à-dire une garde qui ne garde plus rien.
//
// ⚠️ POURQUOI UN TEST ET PAS UNE CONSTANTE PARTAGÉE. Le SQL de migration est un fichier
// figé : une fois écrit, il ne se relit plus depuis le code, et il ne peut donc pas importer
// `BORNES`. C'est exactement le cas où « deux documents qui doivent bouger ensemble se
// verrouillent par un tripwire, pas par la discipline ».

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BORNES } from "../lib/geocodage";

const lire = (chemin: string) => readFileSync(resolve(process.cwd(), chemin), "utf8");

/** Les lignes de commentaire retirées : une assertion de présence ne lit pas de la prose. */
const sansCommentaires = (source: string) =>
  source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");

const schema = sansCommentaires(lire("lib/db/schema.ts"));
const migration = lire("drizzle/0024_bornes_du_quebec.sql");

describe("les CHECK de la base répètent exactement BORNES", () => {
  it("le décommentage laisse du vrai code — sinon tout ce qui suit est vacueux", () => {
    // Seuil MESURÉ, pas deviné : 9 557 caractères de code une fois les commentaires retirés
    // au 2026-09-21. La marge laisse de la place à un retrait, pas à un fichier vidé.
    expect(schema.length).toBeGreaterThan(7_000);
    expect(schema).toContain("export const villes = pgTable(");
  });

  it("le schéma Drizzle porte les valeurs de BORNES, pour les deux tables", () => {
    // DÉRIVÉ de la constante : écrits en dur, ces cas mentiraient au premier ajustement.
    for (const table of ["villes", "entreprises_lieux"]) {
      expect(schema, table).toContain(
        `check("${table}_lat_ck", sql\`\${table.lat} >= ${BORNES.latMin} AND \${table.lat} <= ${BORNES.latMax}\`)`,
      );
      expect(schema, table).toContain(
        `check("${table}_lon_ck", sql\`\${table.lon} >= ${BORNES.lonMin} AND \${table.lon} <= ${BORNES.lonMax}\`)`,
      );
    }
  });

  it("la migration qui les a posées porte les mêmes valeurs", () => {
    for (const table of ["villes", "entreprises_lieux"]) {
      expect(migration, table).toContain(
        `CHECK ("${table}"."lat" >= ${BORNES.latMin} AND "${table}"."lat" <= ${BORNES.latMax})`,
      );
      expect(migration, table).toContain(
        `CHECK ("${table}"."lon" >= ${BORNES.lonMin} AND "${table}"."lon" <= ${BORNES.lonMax})`,
      );
    }
  });

  it("la boîte couvre les villes que l'ancienne refusait — c'est la raison du lot", () => {
    // ADR-0021 : ces quatre-là étaient REFUSÉES par les bornes régionales (45–49 / −75…−68),
    // donc leurs offres ne pouvaient JAMAIS recevoir de distance. Les cas sont des villes
    // réelles, pas des nombres choisis : si un resserrement futur les ré-exclut, ce test le
    // dit avec le nom de la ville plutôt qu'avec une borne.
    const dedans = (lat: number, lon: number) =>
      lat >= BORNES.latMin && lat <= BORNES.latMax && lon >= BORNES.lonMin && lon <= BORNES.lonMax;
    expect(dedans(45.48, -75.7), "Gatineau").toBe(true);
    expect(dedans(48.24, -79.02), "Rouyn-Noranda").toBe(true);
    expect(dedans(50.21, -66.38), "Sept-Îles").toBe(true);
    expect(dedans(48.83, -64.48), "Gaspé").toBe(true);
  });

  it("et elle refuse toujours l'autre pays et l'inversion de signe", () => {
    const dedans = (lat: number, lon: number) =>
      lat >= BORNES.latMin && lat <= BORNES.latMax && lon >= BORNES.lonMin && lon <= BORNES.lonMax;
    expect(dedans(49.26, -123.11), "Québec, Colombie-Britannique").toBe(false);
    expect(dedans(46.81, 71.21), "longitude inversée").toBe(false);
    expect(dedans(-46.81, -71.21), "latitude inversée").toBe(false);
  });
});
