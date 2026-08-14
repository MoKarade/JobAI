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
import { readFileSync } from "node:fs";
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

describe("une seule copie de la liste de colonnes", () => {
  // Le vrai risque n'est pas le code d'aujourd'hui : c'est la CINQUIÈME copie, écrite dans
  // six mois par quelqu'un qui recopiera le bloc d'à côté sans savoir pourquoi il existe.
  const CHEMINS = [
    // ⚠️ LA VEILLE A DÉMÉNAGÉ le 2026-08-14 : elle écrivait depuis sa route, elle écrit
    // maintenant depuis `lib/veilleComplete.ts` — parce que DEUX crons peuvent désormais la
    // déclencher (celui de veille s'était tu trois jours sans que rien ne le dise). Ce garde
    // a bien fait son travail au moment du déplacement : il a refusé de laisser un chemin
    // d'écriture sortir de sa surveillance. C'est la LISTE qu'on met à jour, jamais
    // l'assertion — un chemin retiré d'ici est un chemin qui n'est plus gardé.
    "lib/veilleComplete.ts",
    "app/api/ingest/depot/route.ts",
    "lib/actions.ts",
    "lib/synchro.ts",
  ];

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
    let objetsInspectes = 0;

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

      expect(source, `${chemin} n'utilise pas la source unique`).toMatch(
        /colonnes(Offre|Seed)\(/,
      );
    }

    // Volume prouvé : sans ça, une expression qui ne trouve plus rien ferait passer le
    // test à vide, et le garde ne garderait plus rien.
    expect(objetsInspectes).toBeGreaterThanOrEqual(CHEMINS.length);
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
