// tests/mcpSurface.test.ts — la frontière du connecteur est un FICHIER, pas une intention.
//
// POURQUOI CE VERROU EXISTE
// Le SDK MCP tire `express` et `cors`. Le tree-shaking n'est pas une garantie : un seul
// import dans un module partagé embarque toute cette chaîne là où elle n'a rien à faire.
// La séparation ne tient donc que si elle est VÉRIFIÉE — un commentaire « ce fichier
// n'importe pas le SDK » est une intention, pas une frontière.
//
// Le second interdit compte encore plus : un `*.spec.ts` qui atteindrait la base
// contournerait `lib/suivi.ts`, et avec lui la seule condition qui borne l'exception au
// garde-fou n°2 (ADR-0011). L'MCP ne doit avoir aucun pouvoir que l'interface n'a pas.
//
// ⚠️ ON MATCHE DES IMPORTS, PAS DES MENTIONS. Un garde qui chercherait la simple chaîne
// « modelcontextprotocol » se déclencherait sur le commentaire qui l'explique — vécu dans
// FinanceAI, où le premier jet du même garde se signalait lui-même.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const DOSSIER = resolve(process.cwd(), "lib/mcp");

/** Les fichiers de logique du connecteur. */
function fichiersSpec(): string[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(DOSSIER, f));
}

/** Les modules qu'un fichier importe RÉELLEMENT (`import … from "x"`, `require("x")`). */
function importsDe(source: string): string[] {
  const cibles: string[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*import[\s\S]{0,200}?from\s+["']([^"']+)["']/g)) {
    if (m[1] !== undefined) cibles.push(m[1]);
  }
  for (const m of source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
    if (m[1] !== undefined) cibles.push(m[1]);
  }
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    if (m[1] !== undefined) cibles.push(m[1]);
  }
  return cibles;
}

const FICHIERS = fichiersSpec();

/**
 * Le seul fichier de `lib/mcp/` autorisé à importer le SDK.
 *
 * Une constante nommée plutôt qu'une condition en ligne : le jour où la frontière déménage,
 * on change un nom ici et le test dit exactement ce qui a bougé.
 */
const PORTEUR_DU_SDK = "serveur.ts";

describe("frontière du connecteur MCP", () => {
  it("trouve bien des fichiers, au lieu de passer à vide", () => {
    // Un scan qui ne trouve rien PASSE, et sa protection est nulle en silence. C'est la
    // règle déjà écrite pour les autres gardes de ce dépôt : prouver le volume d'abord.
    expect(FICHIERS.length).toBeGreaterThanOrEqual(3);
  });

  it("matche des IMPORTS, pas des mentions — sinon le garde se signale lui-même", () => {
    // Discrimination prouvée sur des sources fabriquées : la mention passe, l'import tombe.
    expect(importsDe('// on ne veut pas de "@modelcontextprotocol/sdk" ici')).toEqual([]);
    expect(importsDe('import { S } from "@modelcontextprotocol/sdk/server/mcp.js";')).toEqual([
      "@modelcontextprotocol/sdk/server/mcp.js",
    ]);
    expect(importsDe('const x = require("drizzle-orm");')).toEqual(["drizzle-orm"]);
    expect(importsDe('await import("../db");')).toEqual(["../db"]);
  });

  for (const chemin of FICHIERS) {
    const nom = chemin.split(/[\\/]/).pop() ?? chemin;
    const source = readFileSync(chemin, "utf8");
    const cibles = importsDe(source);

    it(`« ${nom} » ${nom === PORTEUR_DU_SDK ? "est le SEUL à importer le SDK" : "n'importe PAS le SDK MCP"}`, () => {
      // L'exception est NOMMÉE, pas dissoute dans une exclusion de dossier : `serveur.ts`
      // est le porteur unique, et le test le vérifie DANS LES DEUX SENS — un second fichier
      // qui importerait le SDK tombe, et un `serveur.ts` qui cesserait de l'importer tombe
      // aussi (ce serait le signe que la frontière a déménagé sans qu'on le dise).
      const fautifs = cibles.filter((c) => c.includes("@modelcontextprotocol"));
      if (nom === PORTEUR_DU_SDK) expect(fautifs.length).toBeGreaterThan(0);
      else expect(fautifs).toEqual([]);
    });

    it(`« ${nom} » n'atteint PAS la base`, () => {
      // Toute écriture doit passer par `lib/suivi.ts` : c'est la condition n°2 de l'exception
      // au garde-fou n°2. Un accès direct au SQL la retirerait sans que rien ne le signale.
      const fautifs = cibles.filter(
        (c) => c.includes("drizzle") || /(^|\/)db($|\/)/.test(c) || c.includes("@neondatabase"),
      );
      expect(fautifs).toEqual([]);
    });
  }

  it("aucun outil ne publie de coordonnée — garde-fou n°1", () => {
    // Le domicile de Marc ne traverse jamais le connecteur. Le scan porte sur la SOURCE du
    // dossier : un champ `lat`/`lon` ajouté à une vue publiée tomberait ici, même si aucun
    // test de comportement ne le couvrait encore.
    const tout = FICHIERS.map((f) => readFileSync(f, "utf8")).join("\n");
    // On cherche des CLÉS publiées, pas les mots dans les commentaires qui les interdisent.
    expect(tout).not.toMatch(/^\s*(?:lat|lon|latitude|longitude)\s*:/m);
    expect(FICHIERS.some((f) => f.endsWith("vue.ts"))).toBe(true);
  });
});
