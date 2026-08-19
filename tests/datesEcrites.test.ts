// tests/datesEcrites.test.ts — aucune date que l'app ÉCRIT ne se calcule en UTC.
//
// POURQUOI CE VERROU
// Vercel tourne en UTC, Marc vit à UTC−4. `new Date().toISOString().slice(0, 10)` date donc
// du LENDEMAIN toute écriture faite après 20 h locale. La règle est écrite dans le CLAUDE.md
// depuis longtemps, et deux chemins d'écriture y échappaient encore le 2026-08-19 : la date
// d'envoi posée par `modifierOffre`, et la date de modification du profil de CV. Les deux
// ont été trouvés en corrigeant le premier — pas avant, parce que rien ne les signalait.
//
// Une règle qui ne vit que dans un document se reperd. Celle-ci a maintenant un test.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** Le motif exact : une horloge FRAÎCHE ramenée à un jour en UTC. */
const HORLOGE_UTC = /new Date\(\)\s*\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/;

/**
 * ⚠️ CE MOTIF NE VISE QUE `new Date()`, PAS `d.toISOString()`.
 *
 * Convertir en jour une date que la SOURCE a donnée (le `date` d'une offre du Guichet, le
 * `pubDate` d'un flux) est légitime : on n'invente pas un « maintenant », on lit une valeur
 * déjà datée. Élargir le motif à tout `toISOString().slice(0, 10)` ferait tomber ces
 * conversions et on prendrait l'habitude de contourner le garde — c'est ainsi qu'un garde
 * meurt.
 */
function fichiersTs(racine: string): string[] {
  const sortie: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (/\.tsx?$/.test(e.name)) sortie.push(chemin);
    }
  };
  parcourir(racine);
  return sortie;
}

const FICHIERS = [
  ...fichiersTs(resolve(process.cwd(), "lib")),
  ...fichiersTs(resolve(process.cwd(), "app")),
];

describe("dates écrites par l'app", () => {
  it("scanne un volume RÉEL, au lieu de passer à vide", () => {
    // Un scan qui ne trouve aucun fichier passe, et sa protection est nulle en silence.
    expect(FICHIERS.length).toBeGreaterThanOrEqual(40);
  });

  it("DISCRIMINE l'horloge fraîche d'une date déjà donnée par une source", () => {
    expect(HORLOGE_UTC.test("new Date().toISOString().slice(0, 10)")).toBe(true);
    // Légitime : on convertit une date reçue, on n'invente pas un « maintenant ».
    expect(HORLOGE_UTC.test("new Date(t).toISOString().slice(0, 10)")).toBe(false);
    expect(HORLOGE_UTC.test("d.toISOString().slice(0, 10)")).toBe(false);
  });

  it("aucun fichier ne date un « maintenant » en UTC", () => {
    const fautifs = FICHIERS.filter((f) => {
      const source = readFileSync(f, "utf8");
      // Les lignes de commentaire qui EXPLIQUENT le motif ne sont pas le motif — sans cette
      // coupe, le garde échoue sur la documentation qui le justifie, et on le retire.
      const sansCommentaires = source
        .split("\n")
        .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
        .join("\n");
      return HORLOGE_UTC.test(sansCommentaires);
    });
    expect(fautifs.map((f) => f.replace(process.cwd(), ""))).toEqual([]);
  });
});
