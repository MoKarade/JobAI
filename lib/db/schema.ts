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
  uniqueIndex,
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
     * Ville de l'employeur, telle que la source l'a annoncée.
     *
     * Ajoutée le 2026-07-31 : sans elle, un employeur qui n'est pas dans les entreprises
     * cibles (ISS, LSM… apportés par l'ingestion) ne peut pas être géocodé — « ISS » seul
     * est une recherche mondiale — et sa distance reste inconnue à vie. C'est le critère
     * numéro un de Marc : il ne peut pas dépendre d'une liste tenue à la main.
     */
    ville: text("ville"),

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

    /**
     * La version de profil qui a produit cette note.
     *
     * ⚠️ SANS ELLE, UNE NOTE DEVIENT INEXPLICABLE dès la première re-notation : « pourquoi
     * 71 ? » n'a de réponse que si on sait AVEC QUEL BARÈME. Marc a choisi la re-notation
     * immédiate à chaque validation de profil (ADR-0009) — l'app connaîtra donc plusieurs
     * barèmes dans sa vie.
     *
     * Elle sert aussi de DÉTECTEUR : la re-notation écrit offre par offre (le driver
     * `neon-http` n'a pas de transaction), donc une panne réseau en cours de route peut
     * laisser un lot mi-ancien mi-nouveau. Sans cette colonne, cet état est indétectable
     * après coup ; avec elle, il se voit et se répare.
     *
     * `null` pour une note manuelle ou pour les notes d'avant ADR-0009 — dans les deux cas
     * la question ne se pose pas.
     */
    scoreProfilVersion: integer("score_profil_version"),

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

/**
 * Coordonnées des municipalités, géocodées une fois puis conservées.
 *
 * POURQUOI UNE TABLE, ET PAS DES COLONNES SUR `offers` : les villes se répètent (une
 * douzaine de municipalités pour des dizaines d'offres). Géocoder par offre ferait dix
 * fois le même appel pour « Québec », alors que Nominatim demande une requête par seconde
 * au maximum et un usage parcimonieux.
 *
 * POURQUOI EN BASE, ET PAS EN DUR DANS LE CODE : le garde-fou n°1 interdit tout couple de
 * coordonnées dans un fichier versionné, et `tests/piiGuard.test.ts` le fait respecter. Ces
 * coordonnées-ci sont publiques et inoffensives, mais un garde qui distingue « les bonnes »
 * des « mauvaises » coordonnées par la forme n'existe pas — l'assouplir pour laisser passer
 * des centres-villes ouvrirait la porte à celles qu'il protège. La donnée va donc en base.
 */
export const villes = pgTable(
  "villes",
  {
    /** Nom géocodable, normalisé (« Beauport », pas « Québec (Beauport) »). */
    nom: text("nom").primaryKey(),

    /**
     * Position du CENTRE de la municipalité — jamais celle d'un employeur, encore moins
     * celle du domicile. C'est une approximation assumée, et l'interface le dit : la
     * distance exacte de chaque offre vit dans `offers.km`, mesurée, elle.
     */
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),

    /** Quand le géocodage a eu lieu. Permet de re-sonder une entrée douteuse sans tout refaire. */
    geocodeLe: timestamp("geocode_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Bornes de la grande région de Québec, larges. Un géocodeur qui rend « Québec,
    // Colombie-Britannique » ou une erreur de signe placerait une épingle à des milliers
    // de kilomètres, et la carte aurait l'air cassée sans qu'on sache pourquoi.
    check("villes_lat_ck", sql`${table.lat} >= 45 AND ${table.lat} <= 49`),
    check("villes_lon_ck", sql`${table.lon} >= -75 AND ${table.lon} <= -68`),
  ],
);

/**
 * Position de chaque ENTREPRISE CIBLE, géocodée une fois puis conservée.
 *
 * `precision` dit la vérité sur ce que la position EST :
 *   - `exacte` : Nominatim a trouvé l'entreprise elle-même (elle existe dans OpenStreetMap).
 *   - `ville`  : introuvable — la position est le CENTRE DE SA MUNICIPALITÉ, et l'interface
 *     le dit. Présenter un centre-ville comme l'adresse d'un employeur serait du fake data.
 * Re-tenter une entreprise en `ville` = retirer sa ligne (la passe la reprendra) ; sans ça,
 * la passe converge et ne re-paie jamais une recherche déjà tranchée.
 */
export const entreprisesLieux = pgTable(
  "entreprises_lieux",
  {
    /** Nom EXACT de l'entreprise cible (`lib/reference.ts`) — la clé de rapprochement. */
    nom: text("nom").primaryKey(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    precision: text("precision", { enum: ["exacte", "ville"] }).notNull(),
    /**
     * L'adresse telle qu'OpenStreetMap la donne, ou `null`.
     *
     * ⚠️ RENSEIGNÉE UNIQUEMENT QUAND `precision = 'exacte'`. Sur un repli au centre-ville,
     * l'adresse retournée serait celle de la MUNICIPALITÉ, pas de l'employeur : l'écrire
     * ici reviendrait à publier une adresse inventée pour une entreprise (garde-fou n°3).
     * Mieux vaut ne rien dire que dire « 2 rue de l'Hôtel-de-Ville » pour une usine.
     *
     * Ce n'est pas une donnée personnelle : c'est l'adresse publique d'un employeur, en
     * base et jamais dans un fichier versionné — le garde-fou n°1 vise le domicile de Marc
     * et le code, pas les coordonnées publiques d'une entreprise.
     */
    adresse: text("adresse"),

    /**
     * D'OÙ VIENT CETTE ADRESSE. Demande de Marc (2026-08-05) : « et l'indiquer ».
     *
     * ⚠️ CE N'EST PAS UNE MÉTADONNÉE DE CONFORT — deux sources ne disent pas la même chose,
     * et l'écran doit pouvoir les distinguer :
     *
     *   · `osm`      → un objet cartographié dans OpenStreetMap, à l'endroit où il est.
     *                  C'est le LIEU. Quand elle existe, c'est la meilleure réponse.
     *   · `google`   → Google Maps Geocoding, repli quand Nominatim (gratuit, communautaire,
     *                  souvent muet sur une PME) ne rend rien d'exploitable. Une réponse
     *                  STRUCTURÉE d'un géocodeur, pas une page web à interpréter — même
     *                  validation de plausibilité (distance au centre de la ville) que
     *                  `osm`. [CARTE-03], 2026-08-12.
     *   · `registre` → le Registre des entreprises du Québec. C'est le DOMICILE LÉGAL, qui
     *                  peut parfaitement être le bureau du comptable et non l'usine. Une
     *                  adresse de registre affichée sans le dire serait une donnée
     *                  plausible et fausse — exactement ce qu'interdit le garde-fou n°3.
     *
     * `null` quand `adresse` est nulle. Une adresse sans source déclarée ne devrait pas
     * exister : c'est ce que vérifie la contrainte plus bas.
     */
    adresseSource: text("adresse_source", {
      enum: ["osm", "google", "registre", "offre", "recherche"],
    }),

    /**
     * BORNES DE RECHARGE — trois états, et il faut les trois.
     *
     * Demande de Marc (2026-08-05) : savoir, pour chaque employeur, où est la borne de
     * recharge. Pour qui roule à l'électrique, ça pèse dans le choix d'un emploi autant
     * qu'un détail du salaire, et aucune offre ne le mentionne.
     *
     *   · `bornesLe` NULL                 → jamais interrogé. On ne sait pas.
     *   · `bornesLe` posé, `bornesM` NULL → interrogé, rien trouvé dans la portée.
     *   · `bornesLe` posé, `bornesM` = N  → la plus proche est à N mètres.
     *
     * Les deux premiers états ne se disent PAS pareil à l'écran. Les confondre ferait
     * passer un lieu non mesuré pour un lieu sans borne — un renseignement faux présenté
     * avec l'aplomb d'un fait (garde-fou n°3). D'où la date SÉPARÉE de la distance :
     * un seul champ ne peut pas porter la différence.
     *
     * ⚠️ `bornesM` N'EST PLUS PLAFONNÉ À 350 m depuis le 2026-08-06 (« je veux plus à 5 min
     * à pied, je veux la plus proche ») : c'est la distance de la plus proche, point. Le
     * plafond faisait écrire NULL — donc « aucune » — sur la quasi-totalité des employeurs.
     * La migration 0012 a effacé les dates pour que tout soit remesuré au nouveau sens ;
     * garder les anciennes valeurs aurait mélangé deux définitions dans une même colonne.
     *
     * `bornesRapide` est un booléen NULLABLE, et les trois états comptent là aussi :
     * OpenStreetMap ne déclare pas toujours la puissance, et « on ne sait pas » ne doit pas
     * s'afficher « standard ». `bornesTarif` porte ce qu'OSM PUBLIE (« gratuite », un tarif
     * relevé sur la borne), jamais un prix moyen calculé — la base n'en contient pas.
     */
    bornesM: integer("bornes_m"),
    bornesNom: text("bornes_nom"),
    bornesRapide: boolean("bornes_rapide"),
    bornesTarif: text("bornes_tarif"),
    bornesLe: timestamp("bornes_le", { withTimezone: true }),

    /**
     * FICHE ENRICHIE PAR GOOGLE PLACES — même patron à trois états que les bornes.
     *
     * [CARTE-03-PLACES], 2026-08-12. Demande de Marc : « enrichir les fiches entreprise ».
     * Scopé aux entreprises résolues par Google Maps Geocoding (`adresseSource: "google"`) :
     * c'est cette résolution qui rend `place_id` gratuitement dans la même réponse. Une
     * entreprise résolue par Nominatim ou le registre n'a pas de `placeGoogleId`, et n'est
     * donc pas enrichie — une recherche Places séparée juste pour l'enrichissement serait un
     * coût et un risque d'homonyme supplémentaires, hors scope ici.
     *
     *   · `detailsLe` NULL               → jamais interrogé.
     *   · `detailsLe` posé, champs NULL  → interrogé, Google ne publie rien pour ce lieu.
     *   · `detailsLe` posé, champs remplis → ce que Google publie.
     *
     * Confondre « jamais interrogé » et « rien à publier » ferait passer un lieu non
     * mesuré pour un lieu sans site web — un renseignement faux avec l'aplomb d'un fait
     * (garde-fou n°3).
     */
    placeGoogleId: text("place_google_id"),
    siteWeb: text("site_web"),
    telephone: text("telephone"),
    horairesGoogle: text("horaires_google").array(),
    detailsLe: timestamp("details_le", { withTimezone: true }),

    geocodeLe: timestamp("geocode_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Mêmes bornes régionales que `villes` : une résolution aberrante (homonyme d'un autre
    // continent, signe inversé) est refusée par la base, pas affichée comme une épingle.
    check("entreprises_lieux_lat_ck", sql`${table.lat} >= 45 AND ${table.lat} <= 49`),
    check("entreprises_lieux_lon_ck", sql`${table.lon} >= -75 AND ${table.lon} <= -68`),
    check(
      "entreprises_lieux_precision_ck",
      sql`${table.precision} IN ('exacte', 'ville')`,
    ),
    check(
      "entreprises_lieux_adresse_source_ck",
      sql`${table.adresseSource} IN ('osm', 'google', 'registre', 'offre', 'recherche')`,
    ),
    // ⚠️ UNE ADRESSE SANS SOURCE N'A PAS LE DROIT D'EXISTER, et réciproquement.
    //
    // C'est la contrainte qui donne son sens à la colonne : sans elle, un chemin d'écriture
    // pourrait inscrire une adresse en oubliant sa provenance, et l'écran afficherait une
    // rue sans pouvoir dire si c'est le lieu ou un domicile légal. La base refuse — le
    // typage ne survivrait pas à une écriture faite hors de l'app, et c'est déjà arrivé
    // qu'un chemin d'insertion oublie une colonne (`ville`, quatre fois).
    check(
      "entreprises_lieux_adresse_avec_source_ck",
      sql`(${table.adresse} IS NULL) = (${table.adresseSource} IS NULL)`,
    ),
  ],
);

/**
 * Ce que la base sait avoir déjà appliqué. Une seule ligne aujourd'hui : `seed`.
 *
 * POURQUOI UNE EMPREINTE ET PAS UN COMPTE D'OFFRES
 * Sans marqueur, la seule façon de savoir si le jeu de départ a changé serait de comparer
 * les 53 offres à chaque affichage — une centaine de requêtes SQL pour, presque toujours,
 * ne rien avoir à faire. Un simple compte, lui, ne verrait PAS une note corrigée ou une
 * justification réécrite : la base afficherait l'ancienne version sans que rien ne cloche.
 * L'empreinte du contenu voit tout changement et ne coûte qu'une lecture.
 *
 * La valeur porte aussi le VERROU : pendant l'application, elle vaut `en-cours:<empreinte>`.
 * Deux instances qui démarrent ensemble ne peuvent donc pas écrire en même temps — la
 * seconde voit le verrou et passe son tour. Et si une application échoue en plein milieu,
 * la valeur reste différente de la cible : le passage suivant reprend au lieu de croire
 * l'affaire réglée.
 */
export const syncState = pgTable("sync_state", {
  cle: text("cle").primaryKey(),
  valeur: text("valeur").notNull(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});

export type OfferRow = typeof offers.$inferSelect;
export type NewOfferRow = typeof offers.$inferInsert;
export type OfferReasonRow = typeof offerReasons.$inferSelect;
export type SyncStateRow = typeof syncState.$inferSelect;
export type VilleRow = typeof villes.$inferSelect;
export type EntrepriseLieuRow = typeof entreprisesLieux.$inferSelect;
export type NewOfferReasonRow = typeof offerReasons.$inferInsert;

/**
 * Établissements du Registre des entreprises du Québec, filtrés sur la région.
 *
 * ⚠️ POURQUOI UNE TABLE, ET PAS UN APPEL AU MOMENT VOULU. Le registre n'est joignable
 * NULLE PART automatiquement : le fichier complet est refusé par Cloudflare aux runners
 * GitHub (mesuré 3×, Ray ID), et le datastore de Données Québec ne contient qu'une page
 * d'erreur — leur propre moissonneur s'est heurté au même mur. Marc l'apporte donc depuis
 * chez lui, une fois ; à partir de là tout est local et automatique.
 *
 * CE QU'ELLE CONTIENT, ET CE QU'ELLE NE CONTIENT PAS. Uniquement des ÉTABLISSEMENTS —
 * les lieux où une entreprise opère réellement, pas le `ADR_DOMCL_*` du fichier
 * `Entreprise.csv` qui est le domicile légal (souvent le bureau du comptable). Et jamais
 * une ligne des fichiers d'administrateurs ou d'actionnaires : ce sont des données de
 * personnes tierces, garde-fou n°1.
 *
 * C'est une table de RÉFÉRENCE : elle se remplace en bloc à chaque import, elle ne porte
 * aucune donnée de Marc, et la perdre ne coûte qu'un ré-import.
 */
export const registreEtablissements = pgTable(
  "registre_etablissements",
  {
    id: serial("id").primaryKey(),
    /** Numéro d'entreprise du Québec — l'identifiant officiel, 10 chiffres. */
    neq: text("neq").notNull(),
    nom: text("nom").notNull(),
    /**
     * Le nom réduit à sa forme comparable (`cleNom`) — accents, casse, ponctuation et
     * forme juridique retirés. C'est SUR CETTE COLONNE qu'on cherche : comparer « Laserax »
     * à « LASERAX INC. » littéralement ne trouverait jamais rien.
     */
    nomCle: text("nom_cle").notNull(),
    adresse: text("adresse").notNull(),
    ville: text("ville").notNull(),
    codePostal: text("code_postal"),
    /** L'établissement PRINCIPAL, quand le registre le déclare. */
    principal: boolean("principal").notNull().default(false),
  },
  (table) => [
    // La recherche se fait toujours par clé de nom : sans index, chaque adresse manquante
    // provoquerait un balayage complet de la table.
    index("registre_nom_cle_idx").on(table.nomCle),
  ],
);

/**
 * Les DÉNOMINATIONS déclarées de chaque entreprise du registre (fichier `Nom.csv`).
 *
 * ⚠️ POURQUOI CETTE SECONDE TABLE — MESURÉ EN PRODUCTION, PAS SUPPOSÉ.
 * La première version ne cherchait que dans `NOM_ETAB`, le nom de l'ÉTABLISSEMENT. Résultat
 * réel du 2026-08-05 : « registre=11/73 · 61 absentes ». Le nom d'un établissement n'est
 * souvent pas celui sous lequel on connaît l'entreprise — une usine peut être déclarée sous
 * la raison sociale complète quand tout le monde l'appelle par sa marque.
 *
 * `Nom.csv` porte TOUTES les dénominations d'une entreprise, y compris ses noms commerciaux.
 * Chercher là, puis remonter au NEQ, puis aux établissements de ce NEQ, retrouve les
 * entreprises que la comparaison sur le seul nom d'établissement manquait.
 *
 * Table de RÉFÉRENCE comme sa voisine : aucune donnée de Marc, remplacée en bloc à chaque
 * import, et sa perte ne coûte qu'un ré-import.
 */
export const registreNoms = pgTable(
  "registre_noms",
  {
    id: serial("id").primaryKey(),
    neq: text("neq").notNull(),
    nom: text("nom").notNull(),
    /** Le nom réduit à sa forme comparable (`cleNom`) — c'est la colonne cherchée. */
    nomCle: text("nom_cle").notNull(),
  },
  (table) => [
    index("registre_noms_cle_idx").on(table.nomCle),
    index("registre_noms_neq_idx").on(table.neq),
  ],
);

/**
 * Le CV téléversé, et le profil qu'on en a tiré.
 *
 * ⚠️ C'EST LA TABLE LA PLUS SENSIBLE DU PROJET. Un CV porte le nom, l'adresse municipale,
 * le téléphone, le courriel, l'historique d'employeurs et les dates — soit exactement ce
 * que le garde-fou n°1 bannit des fichiers versionnés. Marc a choisi de CONSERVER le
 * fichier (ADR-0009) pour pouvoir le ré-analyser sans le re-téléverser ; le risque est donc
 * assumé, mais il se borne :
 *
 *   · `contenu` n'est JAMAIS sélectionné par une requête de liste. `colonnesCv` (plus bas)
 *     est la projection à utiliser partout ailleurs — un `select()` nu ramènerait le PDF
 *     entier de la base à chaque affichage d'écran, et finirait un jour dans un journal.
 *   · aucune route ne sert le fichier, et `lib/export.ts` ne connaît pas cette table.
 *   · `texte` est le texte extrait, gardé pour ré-analyser sans re-décoder le PDF ; il est
 *     aussi sensible que le fichier et suit les mêmes règles.
 *   · `profilPropose` est ce que le modèle a lu. Il est EXPURGÉ des coordonnées avant
 *     d'être écrit (`lib/cv/extraction.ts`) : lui seul circule dans les écrans.
 *
 * Le blob VIT EN BASE et pas sur un disque : Vercel n'a pas de disque persistant, et un
 * stockage d'objets ajouterait un service et une clé de plus pour un fichier de 200 ko.
 */
export const cvs = pgTable(
  "cvs",
  {
    id: serial("id").primaryKey(),
    /** Nom d'origine, affiché à l'écran. Contient souvent le nom de Marc : jamais journalisé. */
    nomFichier: text("nom_fichier").notNull(),
    /** `application/pdf` ou `text/plain`. Vérifié au téléversement, pas déduit du nom. */
    typeMime: text("type_mime").notNull(),
    tailleOctets: integer("taille_octets").notNull(),
    /** Le fichier, en base64. Voir l'avertissement ci-dessus avant tout `select`. */
    contenu: text("contenu").notNull(),
    /** Le texte extrait du fichier. Aussi sensible que le fichier lui-même. */
    texte: text("texte"),
    /**
     * Le profil PROPOSÉ par l'extraction, en JSON, expurgé des coordonnées.
     *
     * `null` tant que l'extraction n'a pas tourné ou qu'elle a échoué — et un échec reste
     * `null`, jamais un profil vide qui se ferait passer pour un résultat (garde-fou n°3).
     */
    profilPropose: text("profil_propose"),
    /** Ce qui a empêché l'extraction, le cas échéant. Dit à l'écran, pas avalé. */
    erreurExtraction: text("erreur_extraction"),
    /**
     * `true` quand Marc a validé ce profil et qu'il pilote l'app.
     *
     * Un seul CV actif à la fois — l'unicité est posée en index partiel plutôt qu'en
     * confiance : deux profils actifs voudrait dire deux barèmes, donc des notes
     * incomparables sans que rien ne le signale.
     */
    actif: boolean("actif").notNull().default(false),
    /** Le profil TEL QUE VALIDÉ, en JSON. C'est lui qui note, jamais `profilPropose`. */
    profilValide: text("profil_valide"),
    televerseLe: timestamp("televerse_le", { withTimezone: true }).notNull().defaultNow(),
    valideLe: timestamp("valide_le", { withTimezone: true }),
  },
  (table) => [
    index("cvs_televerse_idx").on(table.televerseLe),
    // Un seul CV actif, garanti par la base et non par la discipline d'appel.
    uniqueIndex("cvs_un_seul_actif_idx")
      .on(table.actif)
      .where(sql`${table.actif} = true`),
    // Un CV actif SANS profil validé serait un barème fantôme : actif, mais vide.
    check(
      "cvs_actif_a_un_profil_ck",
      sql`${table.actif} = false OR ${table.profilValide} IS NOT NULL`,
    ),
    check("cvs_taille_ck", sql`${table.tailleOctets} > 0`),
  ],
);

/**
 * Les colonnes d'un CV qu'on a le droit de lire SANS ramener le fichier.
 *
 * ⚠️ À UTILISER PARTOUT SAUF POUR LA RÉ-ANALYSE. `db.select().from(cvs)` ramène `contenu`
 * et `texte` — soit le CV entier, à chaque affichage de liste. Ce n'est pas qu'une question
 * de poids : plus une donnée personnelle circule, plus elle a d'occasions de finir dans un
 * journal, une trace d'erreur ou une réponse d'API.
 */
export const colonnesCv = {
  id: cvs.id,
  nomFichier: cvs.nomFichier,
  typeMime: cvs.typeMime,
  tailleOctets: cvs.tailleOctets,
  profilPropose: cvs.profilPropose,
  erreurExtraction: cvs.erreurExtraction,
  actif: cvs.actif,
  profilValide: cvs.profilValide,
  televerseLe: cvs.televerseLe,
  valideLe: cvs.valideLe,
} as const;
