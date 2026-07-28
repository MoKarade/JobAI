// tests/panne.test.ts — nommer correctement une panne de base.
//
// Ce test existe à cause d'un vrai incident, le 2026-07-28. La page Carte annonçait « la
// base n'a pas répondu » alors que la base avait répondu parfaitement, pour dire que la
// table `villes` n'existait pas — la migration n'était pas appliquée. Marc a donc lu
// « problème de connexion » là où le remède était une commande à lancer.
//
// La cause n'était pas la logique, mais sa DUPLICATION : l'accueil classait correctement,
// la page Carte avait été écrite sans reprendre cette classification. Une règle écrite deux
// fois finit toujours par ne l'être qu'une.

import { describe, it, expect } from "vitest";
import { CODE_TABLE_ABSENTE, classerPanne } from "../lib/panne";

/**
 * La forme RÉELLE de l'erreur, relevée dans les journaux Vercel du 2026-07-28 (et non
 * supposée) : le pilote Neon enveloppe l'erreur Postgres, le code utile est dans `cause`.
 */
function erreurNeonReelle() {
  const cause = Object.assign(new Error('relation "villes" does not exist'), {
    severity: "ERROR",
    code: CODE_TABLE_ABSENTE,
    file: "parse_relation.c",
    routine: "parserOpenTable",
  });
  return Object.assign(
    new Error('Failed query: select "nom", "lat", "lon", "geocode_le" from "villes"'),
    { query: 'select "nom" from "villes"', params: [], cause },
  );
}

describe("table absente", () => {
  it("reconnaît l'erreur RÉELLE observée en production", () => {
    expect(classerPanne(erreurNeonReelle())).toBe("schema-absent");
  });

  it("lit aussi le code posé directement sur l'erreur", () => {
    // Le jour où le pilote cessera d'envelopper, la classification doit tenir quand même.
    expect(classerPanne(Object.assign(new Error("x"), { code: CODE_TABLE_ABSENTE }))).toBe(
      "schema-absent",
    );
  });
});

describe("tout le reste est une base injoignable", () => {
  it("classe ainsi une erreur sans code", () => {
    expect(classerPanne(new Error("ECONNREFUSED"))).toBe("base-injoignable");
  });

  it("classe ainsi un autre code Postgres", () => {
    // 28P01 = mot de passe refusé. Le remède n'a RIEN à voir avec une migration : dire
    // « lance db:migrate » enverrait chercher au mauvais endroit.
    expect(classerPanne(Object.assign(new Error("auth"), { code: "28P01" }))).toBe(
      "base-injoignable",
    );
  });

  it("ne casse pas sur une valeur qui n'est pas une erreur", () => {
    // Un `throw` peut porter n'importe quoi. Une classification qui plante ici
    // remplacerait un message imprécis par un écran blanc.
    for (const bizarre of [null, undefined, "texte", 42, {}, []]) {
      expect(classerPanne(bizarre), String(bizarre)).toBe("base-injoignable");
    }
  });
});

describe("les deux pages consomment la MÊME règle", () => {
  it("aucune page ne re-classe une panne dans son coin", async () => {
    // C'est LE test qui compte : le bug d'origine n'était pas une logique fausse, c'était
    // une seconde logique écrite à côté. Si une page réintroduit sa propre comparaison au
    // code Postgres, ce test la trouve.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");

    const pages = ["app/page.tsx", "app/carte/page.tsx"];
    for (const p of pages) {
      const source = readFileSync(resolve(process.cwd(), p), "utf8");
      // Volume prouvé : un mauvais chemin rendrait une chaîne vide et le test passerait
      // à vide, ce qui est exactement la protection nulle qu'on veut éviter.
      expect(source.length, `${p} illisible`).toBeGreaterThan(500);
      expect(source, `${p} ne passe pas par lib/panne.ts`).toContain("classerPanne");
      expect(source, `${p} compare le code Postgres dans son coin`).not.toContain("42P01");
    }
  });
});
