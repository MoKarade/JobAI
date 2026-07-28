// lib/types.ts — la forme des données, validée à la frontière.
//
// Le schéma de base (lib/db/schema.ts) protège ce qui ENTRE en base ; ces schémas Zod
// protègent ce qui entre dans l'APPLICATION — une réponse de LLM, un formulaire, un
// import. Les deux sont nécessaires : la base ne peut pas valider ce qui ne l'atteint
// jamais, et Zod ne protège pas une écriture faite hors de l'app.

import { z } from "zod";

export const StatutSchema = z.enum([
  "Identifiee",
  "CVenvoye",
  "Relance",
  "Entrevue",
  "Refusee",
  "Offre",
]);
export type Statut = z.infer<typeof StatutSchema>;

export const PrioriteSchema = z.enum(["Haute", "Moyenne", "Basse"]);
export type Priorite = z.infer<typeof PrioriteSchema>;

export const SourceSchema = z.enum(["seed", "jobbank", "user"]);
export type Source = z.infer<typeof SourceSchema>;

/**
 * Un point de justification de la note.
 *
 * Remplace le champ `why` de l'artifact, qui était du HTML (`<b>` / `<i>`) injecté sans
 * échappement. Ici, le TON est une donnée et le rendu appartient à l'interface : le jour
 * où ce texte sera écrit par un LLM à partir d'une offre publique, il n'y aura aucun
 * balisage à interpréter.
 */
export const RaisonSchema = z.object({
  ton: z.enum(["atout", "reserve"]),
  texte: z.string().min(1).max(400),
});
export type Raison = z.infer<typeof RaisonSchema>;

/** Les statuts qui impliquent qu'un CV est parti. */
export const STATUTS_ENVOYES: readonly Statut[] = [
  "CVenvoye",
  "Relance",
  "Entrevue",
  "Refusee",
  "Offre",
];

/** Les statuts qui impliquent une réponse reçue de l'employeur. */
export const STATUTS_REPONDUS: readonly Statut[] = ["Entrevue", "Refusee", "Offre"];

/**
 * Les champs qui appartiennent à l'utilisateur (garde-fou n°2 du CLAUDE.md).
 * Ils survivent à tout rafraîchissement du jeu de départ, à toute ingestion et à tout
 * scan. Le reste est rafraîchissable — ces quatre-là, jamais.
 */
export const CHAMPS_UTILISATEUR = [
  "statut",
  "priorite",
  "dateEnvoi",
  "userNote",
] as const;
export type ChampUtilisateur = (typeof CHAMPS_UTILISATEUR)[number];

/** Une date au format AAAA-MM-JJ. Pas un `Date` : on ne veut ni fuseau ni heure ici. */
const DateJourSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ");

export const OffreSchema = z.object({
  /** Identifiant stable et lisible, en kebab-case. */
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "identifiant en minuscules, chiffres et tirets"),
  source: SourceSchema,
  dateReperage: DateJourSchema,
  entreprise: z.string().min(1).max(120),
  poste: z.string().min(1).max(200),
  /** Vide si l'offre n'a pas de lien public. Jamais un lien inventé. */
  lien: z.string().url().or(z.literal("")),
  /** Distance à vol d'oiseau, en km. null = inconnue (pas zéro). */
  km: z.number().finite().min(0).nullable(),
  /** Salaire TEL QU'AFFICHÉ, en texte. null si l'offre n'en donne aucun. */
  salaireAffiche: z.string().max(80).nullable(),
  priorite: PrioriteSchema,
  statut: StatutSchema,
  /** Vide tant qu'aucun CV n'est parti. */
  dateEnvoi: DateJourSchema.or(z.literal("")),
  /** null = pas encore évaluée. Jamais 0 : 0 serait un jugement, pas une absence. */
  score: z.number().int().min(0).max(100).nullable(),
  scoreSource: z.enum(["manuel", "calcule"]).nullable(),
  raisons: z.array(RaisonSchema).max(8),
  notes: z.string().max(600),
  userNote: z.string().max(2000),
  histo: z.boolean(),
});
export type Offre = z.infer<typeof OffreSchema>;

/** Ce que l'interface envoie pour modifier une offre : uniquement les champs de Marc. */
export const MiseAJourOffreSchema = z.object({
  statut: StatutSchema.optional(),
  priorite: PrioriteSchema.optional(),
  dateEnvoi: DateJourSchema.or(z.literal("")).optional(),
  userNote: z.string().max(2000).optional(),
});
export type MiseAJourOffre = z.infer<typeof MiseAJourOffreSchema>;

/** Le résumé interne, traduit ensuite en `HubSummary` pour le hub. */
export interface ResumeSuivi {
  total: number;
  actives: number;
  notees80Plus: number;
  cvEnvoyes: number;
  reponses: number;
  entrevues: number;
  meilleure: { entreprise: string; poste: string; score: number } | null;
}
