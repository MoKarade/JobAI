// lib/lectureAnnonceStore.ts — la moitié IMPURE des lectures d'annonce : les garder, les relire (JobAI#109, ADR-0039).
//
// La forme et la vérification vivent dans `lib/lectureAnnonce.ts`, qui est pur. Ici, seulement deux gestes.
//
// ⚠️ UNE LECTURE ILLISIBLE EN BASE EST UNE LECTURE ABSENTE, ET ON LE DIT : elle est comptée, jamais devinée. Une version
// future du cadre (`VERSION_LECTURE`) peut changer la forme ; relire une ancienne ligne avec le schéma d'aujourd'hui doit
// échouer proprement, pas fabriquer un rôle.

import { db } from "./db";
import { lecturesAnnonce } from "./db/schema";
import { assurerMigrations } from "./migrations";
import { LectureModeleSchema, type LectureAnnonce } from "./lectureAnnonce";
import { z } from "zod";

const LectureGardeeSchema = LectureModeleSchema.extend({
  version: z.number().int(),
  modele: z.string(),
  luLe: z.string(),
  caracteresLus: z.number().int().min(0),
});

/** Garde (ou remplace) la lecture d'une offre. Lève si la base refuse : l'appelant la dit, il ne l'avale pas. */
export async function garderLecture(offerId: string, lecture: LectureAnnonce): Promise<void> {
  await assurerMigrations();
  const ligne = { offerId, lecture: JSON.stringify(lecture), luLe: new Date(lecture.luLe) };
  await db
    .insert(lecturesAnnonce)
    .values(ligne)
    .onConflictDoUpdate({ target: lecturesAnnonce.offerId, set: { lecture: ligne.lecture, luLe: ligne.luLe } });
}

/** Toutes les lectures gardées, par offre, et le nombre de lignes illisibles. `null` si la base n'a pas répondu. */
export async function lireLectures(): Promise<{ lectures: Map<string, LectureAnnonce>; illisibles: number } | null> {
  try {
    await assurerMigrations();
    const lignes = await db.select().from(lecturesAnnonce);
    const lectures = new Map<string, LectureAnnonce>();
    let illisibles = 0;
    for (const l of lignes) {
      try {
        lectures.set(l.offerId, LectureGardeeSchema.parse(JSON.parse(l.lecture)));
      } catch {
        illisibles += 1;
      }
    }
    return { lectures, illisibles };
  } catch (err) {
    console.error("[lecture-annonce] lecture des lectures gardées impossible", err);
    return null;
  }
}
