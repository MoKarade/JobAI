// lib/resumeSql.ts — le résumé du suivi calculé PAR LA BASE, pour que le hub ne fasse plus relire toutes les offres.
//
// POURQUOI (JobAI, quota de transfert Neon, 26/10/2026). Le hub se rafraîchit toutes les 15 s tant qu'un onglet est
// visible, et chaque passage appelait `getTrackerState`, qui rapatriait 7 colonnes de TOUTES les offres (6 500 à 8 800
// lignes, de l'ordre de 1,5 Mo [Supposition, pas mesuré]) pour en tirer neuf compteurs en mémoire. Le transfert sortant du
// plan gratuit a fini plein. Ici, la base compte et ne rend que ces neuf nombres plus la meilleure offre : quelques
// centaines d'octets.
//
// `resumer` (lib/suivi.ts) reste la RÉFÉRENCE : mêmes règles, écrites en mémoire. `tests/resumeSql.test.ts` fait tourner les
// deux sur les mêmes lignes dans une vraie Postgres (PGlite) et exige le même résultat. Toute règle changée d'un côté
// doit l'être de l'autre, sinon ce test rougit.
//
// Écart assumé : la meilleure offre à note égale est départagée (entreprise, puis poste) ; `resumer` prend la première
// lue, et la base ne promet aucun ordre. Un tirage qui dépendait de l'ordre des lignes n'était pas une règle.

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offers } from "./db/schema";
import { FENETRE_NOUVELLES_JOURS } from "./suivi";
import { STATUTS_ENVOYES, STATUTS_REPONDUS, type ResumeSuivi } from "./types";

/** Tout client Drizzle Postgres : Neon en production, PGlite dans les tests. */
type Base = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** Ce que la base rend : les neuf nombres, sans une seule offre. */
export interface Agregats {
  total: number;
  actives: number;
  nouvelles: number;
  /** Somme et nombre des notes des nouvelles : la moyenne se fait ici, comme `resumer`, pour arrondir pareil. */
  sommeNotesNouvelles: number;
  nombreNotesNouvelles: number;
  notees80Plus: number;
  cvEnvoyes: number;
  reponses: number;
  entrevues: number;
}

export type MeilleureOffre = { entreprise: string; poste: string; score: number };

/**
 * Bornes (jour inclus à droite, exclu à gauche) de la fenêtre des nouvelles, en `AAAA-MM-JJ`, ou `null` si `aujourdhui`
 * est illisible (aucune nouvelle, comme `resumer`). Des dates ISO en texte se comparent comme des dates : pas de
 * conversion en base, donc rien qui puisse lever sur une valeur mal formée.
 */
export function fenetreNouvelles(aujourdhui: string): { plancher: string; limite: string } | null {
  const t = Date.parse(`${aujourdhui}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const plancher = new Date(t - FENETRE_NOUVELLES_JOURS * 86_400_000).toISOString().slice(0, 10);
  const limite = new Date(t).toISOString().slice(0, 10);
  return { plancher, limite };
}

/** Une date de repérage bien formée (`AAAA-MM-JJ`) ; toute autre est « pas une nouveauté », comme dans `resumer`. */
const DATE_BIEN_FORMEE = "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$";

/** Les agrégats du suivi, en UNE requête. */
export async function lireAgregats(db: Base, aujourdhui: string): Promise<Agregats> {
  const active = and(eq(offers.histo, false), isNull(offers.perimeeLe)) as SQL;
  const fenetre = fenetreNouvelles(aujourdhui);
  const nouvelle: SQL = fenetre
    ? sql`${active} and ${offers.dateReperage} ~ ${DATE_BIEN_FORMEE} and ${offers.dateReperage} > ${fenetre.plancher} and ${offers.dateReperage} <= ${fenetre.limite}`
    : sql`false`;

  const [ligne] = await db
    .select({
      total: sql<number>`count(*)::int`,
      actives: sql<number>`(count(*) filter (where ${active}))::int`,
      nouvelles: sql<number>`(count(*) filter (where ${nouvelle}))::int`,
      sommeNotesNouvelles: sql<number>`coalesce(sum(${offers.score}) filter (where ${nouvelle}), 0)::int`,
      nombreNotesNouvelles: sql<number>`(count(${offers.score}) filter (where ${nouvelle}))::int`,
      notees80Plus: sql<number>`(count(*) filter (where ${active} and ${offers.score} >= 80))::int`,
      cvEnvoyes: sql<number>`(count(*) filter (where ${inArray(offers.statut, [...STATUTS_ENVOYES])}))::int`,
      reponses: sql<number>`(count(*) filter (where ${inArray(offers.statut, [...STATUTS_REPONDUS])}))::int`,
      entrevues: sql<number>`(count(*) filter (where ${inArray(offers.statut, ["Entrevue", "Offre"])}))::int`,
    })
    .from(offers);

  // Un agrégat sans GROUP BY rend toujours une ligne ; le garde sert le compilateur, pas un cas réel.
  if (!ligne) throw new Error("agrégats du suivi : la base n'a rendu aucune ligne");
  return ligne;
}

/** La meilleure offre ACTIVE notée, ou `null` : une offre périmée ou historique n'est pas une cible. */
export async function lireMeilleure(db: Base): Promise<MeilleureOffre | null> {
  const [ligne] = await db
    .select({ entreprise: offers.entreprise, poste: offers.poste, score: offers.score })
    .from(offers)
    .where(and(eq(offers.histo, false), isNull(offers.perimeeLe), isNotNull(offers.score)))
    .orderBy(desc(offers.score), asc(offers.entreprise), asc(offers.poste))
    .limit(1);
  if (!ligne || ligne.score === null) return null;
  return { entreprise: ligne.entreprise, poste: ligne.poste, score: ligne.score };
}

/** Assemble le résumé. Pur : c'est ici que la moyenne est arrondie, avec le même `Math.round` que `resumer`. */
export function resumeDepuisAgregats(a: Agregats, meilleure: MeilleureOffre | null): ResumeSuivi {
  return {
    total: a.total,
    actives: a.actives,
    nouvelles: a.nouvelles,
    noteMoyenneNouvelles:
      a.nombreNotesNouvelles === 0 ? null : Math.round(a.sommeNotesNouvelles / a.nombreNotesNouvelles),
    notees80Plus: a.notees80Plus,
    cvEnvoyes: a.cvEnvoyes,
    reponses: a.reponses,
    entrevues: a.entrevues,
    meilleure,
  };
}

/** Le résumé du suivi lu dans la base, ou `null` quand elle est vide (« pas encore importé », jamais un résumé à zéro). */
export async function lireResume(db: Base, aujourdhui: string): Promise<ResumeSuivi | null> {
  const [agregats, meilleure] = await Promise.all([lireAgregats(db, aujourdhui), lireMeilleure(db)]);
  if (agregats.total === 0) return null;
  return resumeDepuisAgregats(agregats, meilleure);
}
