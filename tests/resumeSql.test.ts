// tests/resumeSql.test.ts — le résumé calculé par la base doit RENDRE LE MÊME que `resumer`, règle pour règle.
//
// POURQUOI CE TEST EXISTE (quota de transfert Neon, 26/10/2026). `getTrackerState` relisait toutes les offres à chaque
// sondage du hub (toutes les 15 s). On a déplacé le comptage dans la base. Le risque de ce déplacement est SILENCIEUX :
// un compteur qui dérive d'une unité ne lève rien, le widget du hub affiche juste un chiffre faux. Donc :
//
// · une VRAIE Postgres (PGlite) avec le SQL de migration réellement committé, pas un mock ;
// · `resumer` (lib/suivi.ts) comme référence, sur exactement les mêmes lignes ;
// · des cas aux bornes : début et fin de la fenêtre des nouvelles, dates illisibles, notes nulles, 79/80, moyenne en .5 ;
// · un volume (3 000 lignes) pour que l'égalité ne tienne pas par chance sur trois exemples.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { fenetreNouvelles, lireAgregats, lireMeilleure, lireResume, resumeDepuisAgregats } from "../lib/resumeSql";
import { resumer, type OffrePourResume } from "../lib/suivi";
import { STATUTS_ENVOYES, type Statut } from "../lib/types";

let pg: PGlite;
let db: ReturnType<typeof drizzle>;

const AUJOURDHUI = "2026-10-28";

beforeAll(async () => {
  pg = new PGlite();
  const dossier = resolve(process.cwd(), "drizzle");
  const instructions = readdirSync(dossier)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => readFileSync(resolve(dossier, f), "utf8").split("--> statement-breakpoint"))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  expect(instructions.length).toBeGreaterThan(5);
  for (const sql of instructions) await pg.exec(sql);
  db = drizzle(pg);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec("DELETE FROM offers");
});

type Ligne = OffrePourResume & { id: string };

/** Insère les lignes telles quelles et rend ce que `resumer` doit recevoir. */
async function inserer(lignes: readonly Ligne[]): Promise<OffrePourResume[]> {
  for (const l of lignes) {
    await pg.query(
      `INSERT INTO offers (id, date_reperage, entreprise, poste, histo, score, statut, perimee_le)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [l.id, l.dateReperage, l.entreprise, l.poste, l.histo, l.score, l.statut, l.perimeeLe],
    );
  }
  return lignes.map(({ id: _id, ...reste }) => reste);
}

let compteur = 0;
function ligne(surcharge: Partial<Ligne> = {}): Ligne {
  compteur += 1;
  return {
    id: `o-${compteur}`,
    histo: false,
    score: 50,
    statut: "Identifiee",
    entreprise: `Entreprise ${compteur}`,
    poste: `Poste ${compteur}`,
    perimeeLe: null,
    dateReperage: "2026-01-01",
    ...surcharge,
  };
}

describe("fenêtre des nouvelles", () => {
  it("couvre les 7 jours qui finissent aujourd'hui : plancher exclu, aujourd'hui inclus", () => {
    expect(fenetreNouvelles("2026-10-28")).toEqual({ plancher: "2026-10-21", limite: "2026-10-28" });
    // Passage de mois et d'année : la soustraction se fait en jours, pas sur le texte.
    expect(fenetreNouvelles("2027-01-03")).toEqual({ plancher: "2026-12-27", limite: "2027-01-03" });
  });

  it("une date du jour illisible ne fabrique aucune fenêtre (comme resumer : aucune nouvelle)", () => {
    expect(fenetreNouvelles("pas une date")).toBeNull();
    expect(fenetreNouvelles("")).toBeNull();
  });
});

describe("le résumé de la base égale celui de resumer", () => {
  it("rend null sur une base vide, jamais un résumé à zéro", async () => {
    expect(await lireResume(db, AUJOURDHUI)).toBeNull();
  });

  it("aux bornes : fenêtre, notes nulles, périmées, historique, 79/80, moyenne en .5", async () => {
    const lignes = await inserer([
      // Nouvelles : dans la fenêtre (du 22 au 28 inclus), notées 80 et 81 → moyenne 80,5 → 81.
      ligne({ dateReperage: "2026-10-28", score: 80, entreprise: "Haut", poste: "Haut", statut: "CVenvoye" }),
      ligne({ dateReperage: "2026-10-22", score: 81, statut: "Entrevue" }),
      // Plancher (21) : exclu. Demain (29) : exclu.
      ligne({ dateReperage: "2026-10-21", score: 99, entreprise: "Trop vieille" }),
      ligne({ dateReperage: "2026-10-29", score: 98, entreprise: "Du futur" }),
      // Nouvelle sans note : compte dans `nouvelles`, pas dans la moyenne.
      ligne({ dateReperage: "2026-10-25", score: null }),
      // Périmée et historique : ni actives, ni nouvelles, ni meilleures ; elles restent dans le total et les statuts.
      ligne({ dateReperage: "2026-10-26", score: 95, perimeeLe: "2026-10-27T10:00:00.000Z", statut: "Refusee" }),
      ligne({ dateReperage: "2026-10-26", score: 96, histo: true, statut: "Offre" }),
      // Seuil de 80 : 79 n'en est pas, 80 en est.
      ligne({ score: 79 }),
      ligne({ score: 80 }),
      // Dates illisibles : jamais « nouvelle ».
      ligne({ dateReperage: "hier", score: 70 }),
      ligne({ dateReperage: "2026-13-45", score: 70 }),
      ligne({ dateReperage: "", score: 70 }),
    ]);

    const attendu = resumer(lignes, AUJOURDHUI);
    const obtenu = await lireResume(db, AUJOURDHUI);

    expect(obtenu).toEqual(attendu);
    // Garde-fou contre un test vide de sens : les cas ci-dessus produisent bien des valeurs non triviales.
    expect(obtenu?.nouvelles).toBe(3);
    expect(obtenu?.noteMoyenneNouvelles).toBe(81);
    expect(obtenu?.meilleure).toEqual({ entreprise: "Trop vieille", poste: expect.any(String), score: 99 });
  });

  it("noteMoyenneNouvelles vaut null (pas 0) quand aucune nouvelle n'est notée", async () => {
    const lignes = await inserer([ligne({ dateReperage: "2026-10-27", score: null }), ligne({ score: 60 })]);
    const obtenu = await lireResume(db, AUJOURDHUI);
    expect(obtenu).toEqual(resumer(lignes, AUJOURDHUI));
    expect(obtenu?.noteMoyenneNouvelles).toBeNull();
    expect(obtenu?.nouvelles).toBe(1);
  });

  it("la meilleure offre est absente (null) quand aucune offre active n'est notée", async () => {
    const lignes = await inserer([ligne({ score: null }), ligne({ score: 90, histo: true })]);
    const obtenu = await lireResume(db, AUJOURDHUI);
    expect(obtenu).toEqual(resumer(lignes, AUJOURDHUI));
    expect(obtenu?.meilleure).toBeNull();
  });

  it("compte chaque statut comme resumer : envoyés, réponses, entrevues", async () => {
    const statuts: Statut[] = ["Identifiee", "CVenvoye", "Relance", "Entrevue", "Refusee", "Offre"];
    const lignes = await inserer(statuts.flatMap((statut, i) => Array.from({ length: i + 1 }, () => ligne({ statut }))));
    const obtenu = await lireResume(db, AUJOURDHUI);
    expect(obtenu).toEqual(resumer(lignes, AUJOURDHUI));
    // Les trois compteurs sont distincts : un copier-coller d'une liste de statuts à l'autre se verrait.
    expect(obtenu?.cvEnvoyes).toBe(2 + 3 + 4 + 5 + 6);
    expect(obtenu?.reponses).toBe(4 + 5 + 6);
    expect(obtenu?.entrevues).toBe(4 + 6);
    expect(STATUTS_ENVOYES.length).toBe(5);
  });

  it("égale resumer sur 3 000 lignes variées", async () => {
    // Générateur déterministe : un test ne dépend ni du hasard ni de l'horloge.
    let graine = 12345;
    const alea = (n: number) => {
      graine = (Math.imul(graine, 1103515245) + 12345) & 0x7fffffff;
      return graine % n;
    };
    const statuts: Statut[] = ["Identifiee", "Identifiee", "Identifiee", "CVenvoye", "Relance", "Entrevue", "Refusee", "Offre"];
    const jours = [-12, -9, -8, -7, -6, -3, -1, 0, 1, 2];
    const lignes: Ligne[] = [];
    for (let i = 0; i < 3000; i++) {
      const decalage = jours[alea(jours.length)]!;
      const t = Date.parse(`${AUJOURDHUI}T00:00:00Z`) + decalage * 86_400_000;
      lignes.push(
        ligne({
          dateReperage: alea(40) === 0 ? "illisible" : new Date(t).toISOString().slice(0, 10),
          score: alea(5) === 0 ? null : alea(101),
          histo: alea(8) === 0,
          perimeeLe: alea(6) === 0 ? "2026-10-20T00:00:00.000Z" : null,
          statut: statuts[alea(statuts.length)]!,
        }),
      );
    }
    // Insertion en un seul ordre SQL : 3 000 allers-retours PGlite alourdiraient la suite sans rien prouver de plus.
    const valeurs = lignes
      .map(
        (l) =>
          `('${l.id}', '${l.dateReperage}', '${l.entreprise}', '${l.poste}', ${l.histo}, ${l.score ?? "NULL"}, '${l.statut}', ${
            l.perimeeLe ? `'${l.perimeeLe}'` : "NULL"
          })`,
      )
      .join(",");
    await pg.exec(`INSERT INTO offers (id, date_reperage, entreprise, poste, histo, score, statut, perimee_le) VALUES ${valeurs}`);

    const attendu = resumer(
      lignes.map(({ id: _id, ...reste }) => reste),
      AUJOURDHUI,
    );
    const obtenu = await lireResume(db, AUJOURDHUI);

    // La meilleure offre se départage à note égale (voir l'en-tête de lib/resumeSql.ts) : on compare tout le reste
    // à l'identique, et pour elle la NOTE, qui est la seule chose que la règle fixe.
    expect({ ...obtenu, meilleure: obtenu?.meilleure?.score }).toEqual({ ...attendu, meilleure: attendu.meilleure?.score });
    // Le volume a de quoi discriminer : tous les compteurs sont non nuls.
    expect(attendu.nouvelles).toBeGreaterThan(100);
    expect(attendu.notees80Plus).toBeGreaterThan(100);
    expect(attendu.reponses).toBeGreaterThan(100);
  });
});

describe("ce que la base rend", () => {
  it("neuf nombres et une offre — jamais la liste des offres", async () => {
    await inserer([ligne({ score: 90, dateReperage: "2026-10-27" }), ligne({ score: 40 })]);
    const agregats = await lireAgregats(db, AUJOURDHUI);
    // Les clés sont figées : ajouter ici une colonne d'offre ramènerait la fuite de transfert.
    expect(Object.keys(agregats).sort()).toEqual(
      [
        "actives",
        "cvEnvoyes",
        "entrevues",
        "nombreNotesNouvelles",
        "nouvelles",
        "notees80Plus",
        "reponses",
        "sommeNotesNouvelles",
        "total",
      ].sort(),
    );
    for (const v of Object.values(agregats)) expect(typeof v).toBe("number");
    expect(await lireMeilleure(db)).toEqual({ entreprise: expect.any(String), poste: expect.any(String), score: 90 });
  });

  it("à note égale, la meilleure offre est départagée de façon stable (entreprise, puis poste)", async () => {
    await inserer([
      ligne({ score: 90, entreprise: "Zeta", poste: "A" }),
      ligne({ score: 90, entreprise: "Alpha", poste: "Z" }),
      ligne({ score: 90, entreprise: "Alpha", poste: "B" }),
    ]);
    expect(await lireMeilleure(db)).toEqual({ entreprise: "Alpha", poste: "B", score: 90 });
  });

  it("resumeDepuisAgregats arrondit la moyenne comme resumer (0,5 vers le haut)", () => {
    const agregats = {
      total: 2,
      actives: 2,
      nouvelles: 2,
      sommeNotesNouvelles: 161,
      nombreNotesNouvelles: 2,
      notees80Plus: 2,
      cvEnvoyes: 0,
      reponses: 0,
      entrevues: 0,
    };
    expect(resumeDepuisAgregats(agregats, null).noteMoyenneNouvelles).toBe(81);
  });
});
