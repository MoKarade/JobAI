// tests/persistance.test.ts — aucun champ d'offre ne se perd à l'écriture.
//
// CE QUE CE TEST PROTÈGE
// Un champ ajouté au type `Offre` et à la table, mais oublié à l'insertion, ne casse RIEN :
// ça compile, les tests passent, la lecture le lit, et la colonne reste vide pour toujours.
// C'est arrivé avec `ville` — quatre copies de la liste de colonnes, l'oubli dans les
// quatre, 40 offres déposées sans ville, donc insituables sur la carte.
//
// La liste attendue est DÉRIVÉE de `OffreSchema` : écrite à la main, elle vieillirait
// exactement comme les quatre copies qu'elle remplace.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CHAMPS_HORS_TABLE_OFFERS, colonnesOffre, colonnesSeed } from "../lib/persistance";
import { OffreSchema } from "../lib/types";
import { SEED } from "../lib/seed";

const echantillon = SEED[0]!;

describe("colonnesOffre", () => {
  it("porte TOUS les champs du schéma, sauf l'exemption nommée", () => {
    const attendus = Object.keys(OffreSchema.shape).filter(
      (c) => !(CHAMPS_HORS_TABLE_OFFERS as readonly string[]).includes(c),
    );
    // Volume prouvé : si le schéma devenait illisible, la comparaison passerait à vide.
    expect(attendus.length).toBeGreaterThan(10);

    const ecrits = Object.keys(colonnesOffre(echantillon));
    expect(ecrits.sort()).toEqual(attendus.sort());
  });

  it("recopie les valeurs sans les transformer", () => {
    const o = { ...echantillon, ville: "Lévis", km: 12.5, score: 71 };
    const c = colonnesOffre(o);
    expect(c.ville).toBe("Lévis");
    expect(c.km).toBe(12.5);
    expect(c.score).toBe(71);
    expect(c.entreprise).toBe(o.entreprise);
  });

  it("traduit `perimeeLe` en Date — la colonne est un timestamp, pas du texte", () => {
    expect(colonnesOffre({ ...echantillon, perimeeLe: null }).perimeeLe).toBeNull();
    const c = colonnesOffre({ ...echantillon, perimeeLe: "2026-07-15T00:00:00.000Z" });
    expect(c.perimeeLe).toBeInstanceOf(Date);
    expect((c.perimeeLe as Date).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("laisse `majLe` à l'appelant : une veille et un ajout manuel ne la posent pas pareil", () => {
    expect(colonnesOffre(echantillon)).not.toHaveProperty("majLe");
  });
});

/**
 * Les fichiers du dépôt qui ÉCRIVENT une offre en base.
 *
 * Découverte, jamais listée : c'est la seule forme qui reste juste quand un chemin
 * disparaît (la route de dépôt, 2026-09-18) comme quand un nouveau apparaît (le connecteur
 * MCP, l'action de génération de CV). Le motif vise l'ÉCRITURE Drizzle sur la table
 * `offers` (`.insert(offers)`, `.update(offers)`), pas la mention du mot — et il lit la
 * source DÉCOMMENTÉE, sinon un commentaire qui explique la règle se compterait comme un
 * chemin. Même patron que `cheminsQuiEcriventLeLien` (`tests/ingest-pipeline.test.ts`).
 */
function cheminsQuiEcriventDesOffres(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(resolve(process.cwd(), dossier), { withFileTypes: true })) {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        parcourir(chemin);
      } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        const src = sansCommentaires(readFileSync(resolve(process.cwd(), chemin), "utf8"));
        if (/\.(insert|update)\(offers\)/.test(src)) trouves.push(chemin);
      }
    }
  };
  for (const racine of ["lib", "app", "scripts"]) parcourir(racine);
  return trouves.sort();
}

/** Les lignes de commentaire retirées : un scan ne lit pas de la prose. */
function sansCommentaires(source: string): string {
  return source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

describe("une seule copie de la liste de colonnes", () => {
  // ⚠️ LA LISTE SE DÉCOUVRE, ELLE NE S'ÉCRIT PLUS À LA MAIN (`[PERSIST-02]`, 2026-09-21).
  // Elle en portait TROIS, écrites à la main : mesuré, deux chemins d'écriture RÉELS lui
  // échappaient (`app/api/mcp/route.ts`, `lib/cv/actions.ts` — des écritures CIBLÉES, deux
  // champs, jamais gardées) et un ancien membre (`app/api/ingest/depot/route.ts`, supprimé
  // le 2026-09-18) y serait resté à désigner un fichier absent. C'est « une liste écrite à
  // la main devient fausse au chantier suivant », déjà réglé pour `[LIEN-03]` le même jour
  // par le même patron (`tests/ingest-pipeline.test.ts`) — repris ici tel quel.
  const CHEMINS = cheminsQuiEcriventDesOffres();

  /**
   * Les ouvertures d'un objet passé à une écriture Drizzle : `.values({` et `.set({`.
   *
   * On regarde CE VOISINAGE et pas le fichier entier : `empreinteSeed` énumère elle aussi
   * des champs, mais pour une autre raison (exclure ceux de Marc du calcul d'empreinte).
   * Un scan pleine page l'attraperait et forcerait à la tordre pour faire taire un test —
   * exactement la façon dont un verrou perd son sens.
   */
  function objetsDEcriture(source: string): string[] {
    const morceaux: string[] = [];
    const motif = /\.(values|set)\(\{/g;
    for (let m = motif.exec(source); m !== null; m = motif.exec(source)) {
      morceaux.push(source.slice(m.index, m.index + 900));
    }
    return morceaux;
  }

  it("aucun chemin d'écriture ne réénumère les colonnes dans son coin", () => {
    // ⚠️ DEUX INVARIANTS, PAS UN (`[PERSIST-02]`, 2026-09-21). La découverte par scan a
    // trouvé deux chemins RÉELS qui n'appellent ni `colonnesOffre` ni `colonnesSeed` —
    // `app/api/mcp/route.ts` (ADR-0011 : n'écrit QUE les champs de Marc, jamais la ligne
    // entière) et `lib/cv/actions.ts` (ne pose QUE la note et sa version de profil). Les
    // deux sont des écritures CIBLÉES, documentées comme telles, et l'exiger d'eux serait
    // se tromper de garde. Ce que ce test protège reste vrai pour eux : ne JAMAIS
    // réénumérer une liste de colonnes à la main. Ce qu'il n'exige QUE des chemins qui
    // INSÈRENT une ligne (une écriture ciblée ne peut, par construction, pas être un
    // `.insert` complet — Postgres refuserait les colonnes `NOT NULL` manquantes).
    let objetsInspectes = 0;
    let inserteurs = 0;

    for (const chemin of CHEMINS) {
      const source = readFileSync(resolve(process.cwd(), chemin), "utf8");

      for (const objet of objetsDEcriture(source)) {
        objetsInspectes++;
        // `salaireAffiche` est une colonne et rien d'autre : la voir posée dans un objet
        // d'écriture, c'est voir une liste de colonnes recopiée.
        expect(
          objet.includes("salaireAffiche:"),
          `${chemin} réénumère les colonnes au lieu d'appeler colonnesOffre`,
        ).toBe(false);
      }

      if (/\.insert\(offers\)/.test(source)) {
        inserteurs++;
        expect(source, `${chemin} insère une ligne sans la source unique`).toMatch(
          /colonnes(Offre|Seed)\(/,
        );
      }
    }

    // Volume prouvé : sans ça, une expression qui ne trouve plus rien ferait passer le
    // test à vide, et le garde ne garderait plus rien.
    expect(objetsInspectes).toBeGreaterThanOrEqual(CHEMINS.length);
    // ⚠️ LE COMPTEUR, PAS UN SECOND SCAN INDÉPENDANT. Une assertion qui relit les fichiers
    // avec le MÊME motif à côté du `if` ne prouve pas que le `if` s'est exécuté — perturbé
    // (`if (/\.insert\(offers\)/.test(source))` remplacé par `if (false)`), un second scan
    // séparé reste vrai tel quel et laisse ce test vert malgré une garde débranchée.
    // `inserteurs` est incrémenté DANS la branche : lui seul prouve qu'elle a tourné.
    expect(inserteurs).toBeGreaterThan(0);
  });

  it("les deux chemins CIBLÉS restent découverts, et restent ciblés", () => {
    // Fige la population trouvée par le scan : si l'un des deux disparaît (fichier
    // supprimé) ou qu'un troisième apparaît, ce test le dit — plutôt que de laisser le
    // premier test au-dessus se contenter d'un sous-ensemble plus étroit sans le signaler.
    expect(CHEMINS).toEqual(
      expect.arrayContaining(["app/api/mcp/route.ts", "lib/cv/actions.ts"]),
    );
  });

  it("le jeu de départ n'écrit PAS `perimeeLe` : il ne ressuscite pas une offre fermée", () => {
    const seed = colonnesSeed(echantillon);
    expect(seed).not.toHaveProperty("perimeeLe");
    // Et rien d'autre ne manque : la seule différence avec `colonnesOffre` est celle-là.
    expect(Object.keys(seed).sort()).toEqual(
      Object.keys(colonnesOffre(echantillon))
        .filter((c) => c !== "perimeeLe")
        .sort(),
    );
  });
});
