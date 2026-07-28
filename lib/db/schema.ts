// lib/db/schema.ts — schéma Drizzle (Postgres/Neon).
//
// Une offre de la recherche d'emploi, son suivi, et la justification de sa note.
//
// PRINCIPE DE CONCEPTION — anticiper la FORME, pas créer des tables vides.
// L'ADR-0001 demande de modéliser en pensant à la V3 (documents générés par l'IA) pour ne
// pas migrer deux fois. Concrètement : les colonnes qui seront difficiles à ajouter plus
// tard sont là dès maintenant (`scoreSource`, `perimeeLe`), parce que les ajouter
// exigerait de recalculer ou de réinterpréter des lignes existantes. Les TABLES futures
// (documents générés, mesure du coût LLM), elles, ne sont PAS créées : un `CREATE TABLE`
// est purement additif et indolore. Créer des tables vides « au cas où » serait de la
// spéculation, pas de l'anticipation.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Une offre suivie.
 *
 * L'`id` est une chaîne stable et lisible (« iel-superviseur-tech ») et non un entier :
 * c'est la clé de fusion entre le jeu de départ et le suivi de l'utilisateur, elle doit
 * survivre à un réimport et rester diffable dans un commit.
 */
export const offers = pgTable(
  "offers",
  {
    id: text("id").primaryKey(),

    /** D'où vient l'offre : recherche manuelle, ingestion automatique, ajout à la main. */
    source: text("source", { enum: ["seed", "jobbank", "user"] })
      .notNull()
      .default("seed"),

    /** Date de repérage de l'offre (pas la date de publication). */
    dateReperage: text("date_reperage").notNull(),

    entreprise: text("entreprise").notNull(),
    poste: text("poste").notNull(),
    lien: text("lien").notNull().default(""),

    /** Distance à vol d'oiseau depuis le domicile, en km. null pour l'historique. */
    km: real("km"),

    /**
     * Salaire TEL QU'AFFICHÉ dans l'offre, en texte libre (« 40 $/h+ », « 52 260 – 120 727 $ »,
     * « non affiché »). Volontairement pas un nombre : convertir ici, c'est inventer une
     * précision que l'offre ne donne pas. La notation fait sa propre lecture.
     */
    salaireAffiche: text("salaire_affiche"),

    priorite: text("priorite", { enum: ["Haute", "Moyenne", "Basse"] })
      .notNull()
      .default("Moyenne"),

    statut: text("statut", {
      enum: ["Identifiee", "CVenvoye", "Relance", "Entrevue", "Refusee", "Offre"],
    })
      .notNull()
      .default("Identifiee"),

    /** Date d'envoi du CV. Vide tant que rien n'est envoyé. */
    dateEnvoi: text("date_envoi").notNull().default(""),

    /** Note de fit sur 100. null = pas encore évaluée (jamais 0 : 0 serait un jugement). */
    score: integer("score"),

    /**
     * Comment la note a été produite. Anticipé dès la V1 parce que la V3 introduira des
     * notes calculées par l'IA : sans cette colonne, on ne pourrait plus distinguer une
     * note lue et vérifiée à la main d'une note déduite — et le plafond à 85 des notes
     * calculées deviendrait invérifiable a posteriori.
     */
    scoreSource: text("score_source", { enum: ["manuel", "calcule"] }),

    /** Note issue de la recherche (contexte, localisation). Pas éditable par l'utilisateur. */
    notes: text("notes").notNull().default(""),

    /** Note personnelle. Appartient à l'utilisateur : jamais écrasée (garde-fou n°2). */
    userNote: text("user_note").notNull().default(""),

    /** true = campagne historique 2025, exclue des statistiques actives. */
    histo: boolean("histo").notNull().default(false),

    /**
     * Quand l'offre a été constatée périmée. null = réputée ouverte.
     * Anticipé dès la V1 : les offres du jeu de départ expireront avant la résidence
     * permanente, et afficher comme ouverte une offre qui ne l'est plus violerait le
     * garde-fou « no fake data ». C'est une DATE et non un booléen : « périmée depuis
     * quand » est l'information utile, et un booléen ne se rétro-remplit pas.
     */
    perimeeLe: timestamp("perimee_le", { withTimezone: true }),

    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Le tri par défaut de l'interface : les meilleures notes d'abord, actives avant historique.
    index("offers_score_idx").on(table.histo, table.score),
    // Le scan Gmail rapproche un courriel d'une offre par entreprise.
    index("offers_entreprise_idx").on(table.entreprise),

    // ── Contraintes RÉELLES ────────────────────────────────────────────────────
    // Les `enum` de Drizzle ne sont QUE du typage TypeScript : sans ces CHECK, la base
    // accepterait n'importe quelle chaîne dans `statut`. Un typage ne survit pas à un
    // `any`, à une migration de données ou à une écriture faite hors de l'app.
    check("offers_source_ck", sql`${table.source} IN ('seed', 'jobbank', 'user')`),
    check(
      "offers_priorite_ck",
      sql`${table.priorite} IN ('Haute', 'Moyenne', 'Basse')`,
    ),
    check(
      "offers_statut_ck",
      sql`${table.statut} IN ('Identifiee', 'CVenvoye', 'Relance', 'Entrevue', 'Refusee', 'Offre')`,
    ),
    check(
      "offers_score_source_ck",
      sql`${table.scoreSource} IS NULL OR ${table.scoreSource} IN ('manuel', 'calcule')`,
    ),
    // Une note est sur 100. Un score hors bornes est un bug de calcul, pas une donnée.
    check(
      "offers_score_bornes_ck",
      sql`${table.score} IS NULL OR (${table.score} >= 0 AND ${table.score} <= 100)`,
    ),
    // Une distance négative n'existe pas.
    check("offers_km_ck", sql`${table.km} IS NULL OR ${table.km} >= 0`),
  ],
);

/**
 * Les points qui justifient la note d'une offre — ce qui était le champ `why` de l'artifact.
 *
 * L'artifact stockait du HTML (`<b>` pour un atout, `<i>` pour une réserve) et l'injectait
 * sans échappement. C'était sans danger tant que ce texte venait d'une recherche manuelle ;
 * ça deviendrait une faille dès que la V3 le fera écrire par un LLM à partir d'une offre
 * publique. On stocke donc la STRUCTURE (un ton, un texte) et c'est l'interface qui décide
 * du rendu — jamais l'inverse.
 */
export const offerReasons = pgTable(
  "offer_reasons",
  {
    id: serial("id").primaryKey(),
    offerId: text("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    /** « atout » = ce qui joue en faveur ; « reserve » = ce qui coûte des points. */
    ton: text("ton", { enum: ["atout", "reserve"] }).notNull(),
    texte: text("texte").notNull(),
    /** Ordre d'affichage : la justification se lit dans l'ordre où elle a été écrite. */
    ordre: integer("ordre").notNull().default(0),
  },
  (table) => [
    index("offer_reasons_offer_idx").on(table.offerId, table.ordre),
    check("offer_reasons_ton_ck", sql`${table.ton} IN ('atout', 'reserve')`),
  ],
);

export type OfferRow = typeof offers.$inferSelect;
export type NewOfferRow = typeof offers.$inferInsert;
export type OfferReasonRow = typeof offerReasons.$inferSelect;
export type NewOfferReasonRow = typeof offerReasons.$inferInsert;
