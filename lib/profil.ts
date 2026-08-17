// lib/profil.ts — ce que Marc EST, en un seul objet.
//
// ⚠️ CE FICHIER N'INVENTE RIEN. Il rassemble ce qui existait déjà, éparpillé dans trois
// endroits qui ne savaient pas qu'ils décrivaient un profil (ADR-0009) :
//
//   · `lib/scoring.ts`        — mots de coordination et de technique, disqualifiants,
//                               seuil des 3 ans, paliers de salaire et de distance, rayon,
//                               pondération ;
//   · `lib/reference.ts`      — le SWOT établi à la main le 2026-07-27 ;
//   · `lib/ingest/sources.ts` — les termes que la veille interroge chaque matin.
//
// Tant que `PROFIL_DEFAUT` n'est pas modifié, l'app se comporte EXACTEMENT comme avant —
// c'est prouvé par `tests/profil.test.ts`, qui rejoue le jeu de référence et compare note
// par note. Sans cette preuve, sortir le barème du code serait indistinguable d'une
// régression silencieuse de la notation.
//
// DEUX NATURES DE DONNÉES, VOLONTAIREMENT SÉPARÉES :
//
//   · `faits`  — ce qu'un CV peut ÉTABLIR et qu'on peut aller vérifier (années, langues,
//                diplômes, outils). Un fait porte sa provenance.
//   · le reste — des ARBITRAGES : combien vaut la distance face au rôle, à partir de quand
//                un poste est trop loin. Aucun CV ne contient ça. Ça se décide.
//
// La frontière n'est pas cosmétique : elle dit ce qu'une extraction automatique a le droit
// de proposer comme constat, et ce qui reste un choix de Marc.
//
// PAS DE DONNÉES PERSONNELLES ICI (garde-fou n°1) : ni nom, ni adresse, ni téléphone, ni
// courriel. Un profil ne contient que des faits PROFESSIONNELS. C'est ce qui lui permet de
// circuler dans les écrans, les exports et les journaux sans précaution particulière.

import { z } from "zod";

/**
 * Un palier PLAFOND : « jusqu'à ce seuil inclus, ce nombre de points ». Se lit du plus
 * petit au plus grand, le premier atteint l'emporte. Sert à la distance et à la séniorité,
 * où PLUS PETIT vaut MIEUX.
 *
 * `.finite()` n'est pas décoratif : `z.number()` accepte `Infinity`, qui devient `null`
 * en JSON — un profil persisté puis relu perdrait silencieusement son barème.
 */
export const PalierPlafondSchema = z.object({
  max: z.number().finite(),
  points: z.number().int().min(0),
});
export type PalierPlafond = z.infer<typeof PalierPlafondSchema>;

/**
 * Un palier PLANCHER : « à partir de ce seuil, ce nombre de points ». Se lit du plus grand
 * au plus petit. Sert au salaire, où PLUS GRAND vaut mieux.
 *
 * Deux formes plutôt qu'une : écrire le salaire avec des plafonds obligerait à un
 * `Infinity` pour la tranche haute — donc à un `null` après un aller-retour JSON, donc à
 * une note de salaire muette au premier rechargement du profil.
 */
export const PalierPlancherSchema = z.object({
  min: z.number().finite(),
  points: z.number().int().min(0),
});
export type PalierPlancher = z.infer<typeof PalierPlancherSchema>;

/**
 * Les faits qu'un CV peut établir.
 *
 * Chacun est VÉRIFIABLE dans le document — c'est ce qui les distingue des arbitrages du
 * barème. `null` et tableau vide veulent dire « pas établi », jamais « zéro » : un profil
 * sans langue déclarée n'est pas un profil sans langue.
 */
export const FaitsSchema = z.object({
  /** Années d'expérience pertinente. `null` = non établi, ce qui n'est pas « débutant ». */
  anneesExperience: z.number().min(0).max(60).nullable(),
  langues: z.array(z.string().min(1)).max(12),
  diplomes: z.array(z.string().min(1)).max(12),
  /** Outils, technologies, méthodes — ce qui fait matcher une annonce technique. */
  outils: z.array(z.string().min(1)).max(60),
  /** Intitulés déjà occupés : la meilleure source de termes de recherche qui existe. */
  titresOccupes: z.array(z.string().min(1)).max(30),
});
export type Faits = z.infer<typeof FaitsSchema>;

/** Un quadrant d'analyse de position. Déplacé depuis `lib/reference.ts` (ADR-0009). */
export const QuadrantSwotSchema = z.object({
  titre: z.string().min(1),
  cle: z.enum(["forces", "faiblesses", "opportunites", "menaces"]),
  points: z.array(z.string().min(1)).max(12),
});
export type QuadrantSwot = z.infer<typeof QuadrantSwotSchema>;

export const ProfilSchema = z.object({
  /**
   * Incrémentée à CHAQUE validation. Une offre retient la version qui l'a notée : sans ça,
   * une note devient inexplicable dès le premier changement de barème (« pourquoi 71 ? » —
   * « avec quel profil ? »).
   */
  version: z.number().int().min(1),
  /** Date du constat. Pour le SWOT surtout : un SWOT sans date ne vaut rien. */
  etabliLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** D'où vient ce profil — le défaut du code, une extraction validée, une saisie. */
  origine: z.enum(["defaut", "cv", "manuel"]),

  faits: FaitsSchema,

  // ── Le barème ────────────────────────────────────────────────────────────
  /** Répartition des points. La somme fait 100 — vérifié par test, pas par confiance. */
  ponderation: z.object({
    fitRole: z.number().int().min(0),
    distance: z.number().int().min(0),
    seniorite: z.number().int().min(0),
    salaire: z.number().int().min(0),
    immigration: z.number().int().min(0),
  }),

  /** Encadrement d'équipe. Un poste qui en porte vise le haut du barème de rôle. */
  motsCoordination: z.array(z.string().min(1)).max(60),
  /** Contenu technique recherché. */
  motsTechnique: z.array(z.string().min(1)).max(60),
  /**
   * Exigences qui rendent un poste inaccessible tant que la résidence permanente n'est pas
   * obtenue. Distinct d'une préférence d'employeur : ce sont des barrières fermes.
   */
  motsDisqualifiants: z.array(z.string().min(1)).max(60),

  /** Points du barème de rôle, selon ce que le titre et la description combinent. */
  pointsRole: z.object({
    /** Coordination ET technique : la combinaison recherchée. */
    combinaison: z.number().int(),
    /** Encadrement sans contenu technique. */
    coordination: z.number().int(),
    /** Technique sans encadrement. */
    technique: z.number().int(),
    /** « Technicien » sans encadrement : recul hiérarchique par rapport au poste actuel. */
    technicien: z.number().int(),
    /** Ni l'un ni l'autre. */
    horsSujet: z.number().int(),
  }),

  /** Rayon au-delà duquel une offre n'est pas retenue. Critère n°1 déclaré. */
  rayonMaxKm: z.number().min(1),
  paliersDistanceKm: z.array(PalierPlafondSchema).min(1),
  /** Distance INCONNUE : note neutre, jamais 0 — un 0 dirait « c'est loin », or on ne sait pas. */
  distanceInconnue: z.number().int(),
  /** Dans le rayon mais au-delà du dernier palier : le plancher. */
  distancePlancher: z.number().int(),

  /** Séniorité exigée par l'annonce, en années. */
  paliersSeniorite: z.array(PalierPlafondSchema).min(1),
  /** Exigence non précisée : neutre favorable — une absence d'exigence n'est pas un obstacle. */
  senioriteNonPrecisee: z.number().int(),
  senioritePlancher: z.number().int(),

  paliersSalaire: z.array(PalierPlancherSchema).min(1),
  /** Salaire non affiché : neutre. La majorité des annonces n'affichent rien ; les
      pénaliser reviendrait à noter la politique de communication de l'employeur. */
  salaireNonAffiche: z.number().int(),
  salairePlancher: z.number().int(),

  /** Aucune barrière repérée. */
  immigrationLibre: z.number().int(),
  /** Ordre professionnel : pas une barrière absolue, mais un délai et une démarche. */
  immigrationOrdre: z.number().int(),

  /**
   * Plafond des notes CALCULÉES. Une note calculée ne lit que des champs structurés ; une
   * note manuelle vient de la lecture réelle de l'offre. Les plafonner sous le seuil A (80)
   * serait excessif — une offre calculée doit pouvoir être signalée comme excellente. Mais
   * elles ne doivent jamais passer DEVANT une offre vérifiée à la main de note maximale.
   */
  plafondNoteCalculee: z.number().int().min(1).max(100),

  // ── Ce que la veille cherche ─────────────────────────────────────────────
  recherches: z.array(z.string().min(1)).max(40),
  /**
   * Termes tirés du bassin `recherches` à chaque passe, en rotation.
   *
   * ⚠️ DÉCLARÉ DANS LE SCHÉMA, SINON ZOD LE SUPPRIME EN SILENCE. `ProfilSchema.parse` strippe
   * les clés inconnues (comportement Zod par défaut) : un champ posé dans `PROFIL_DEFAUT`
   * mais absent d'ici n'existerait tout simplement pas à l'exécution, sans la moindre
   * erreur — et le test qui s'appuie dessus lirait `undefined`.
   */
  termesParJour: z.number().int().min(1).max(40),

  // ── Positionnement ───────────────────────────────────────────────────────
  swot: z.array(QuadrantSwotSchema).max(4),
});

export type Profil = z.infer<typeof ProfilSchema>;

/**
 * LE PROFIL D'AUJOURD'HUI, À LA VALEUR PRÈS.
 *
 * ⚠️ NE PAS « AMÉLIORER » CES VALEURS EN PASSANT. Elles sont la référence contre laquelle
 * `tests/profil.test.ts` prouve que la refonte n'a rien changé au barème. Un ajustement
 * mérité se fait dans un commit qui le DIT, avec le tableau avant/après des notes réelles —
 * pas dans un refactor où personne ne le cherchera.
 */
export const PROFIL_DEFAUT: Profil = ProfilSchema.parse({
  version: 1,
  etabliLe: "2026-07-27",
  origine: "defaut",

  faits: {
    // Non établis tant qu'aucun CV n'a été lu. `null` dit « on ne sait pas » ; il ne faut
    // surtout pas y écrire 3 « parce que c'est probablement ça » (garde-fou n°3).
    anneesExperience: null,
    langues: [],
    diplomes: [],
    outils: [],
    titresOccupes: [],
  },

  ponderation: {
    fitRole: 40,
    distance: 20,
    seniorite: 15,
    salaire: 15,
    immigration: 10,
  },

  motsCoordination: [
    "coordonnateur", "coordinateur", "superviseur", "chef d'équipe", "chargé de projet",
    "chargée de projet", "responsable", "gestionnaire", "chef de projet", "directeur",
  ],

  motsTechnique: [
    "automatisation", "automation", "robotique", "robotic", "mécatronique",
    "électromécanique", "mise en service", "plc", "automate", "vision industrielle",
  ],

  motsDisqualifiants: [
    "citoyenneté canadienne", "citoyens canadiens", "résident permanent requis",
    "secret clearance", "cote de sécurité",
    // ⚠️ AJOUTS DU 2026-08-12, mesurés sur 44 annonces lues.
    // Une seule offre du lot (Randstad, direction ingénierie) posait une vraie barrière de
    // statut sans qu'aucun mot de la liste ne la voie : « apte aux ENQUÊTES DE SÉCURITÉ ».
    // C'est la même exigence que « cote de sécurité » sous un autre nom — l'employeur
    // demande une habilitation fédérale, qui suppose des années de résidence. Le manque
    // n'était pas dans le barème, il était dans le VOCABULAIRE : un seul synonyme non
    // couvert suffit à faire passer une offre disqualifiante en tête de liste.
    "enquête de sécurité", "enquêtes de sécurité",
    "habilitation de sécurité", "fiabilité approfondie",
    "citoyen canadien", "résidence permanente requise",
  ],

  pointsRole: {
    combinaison: 40,
    coordination: 28,
    technique: 26,
    technicien: 14,
    horsSujet: 8,
  },

  rayonMaxKm: 50,
  paliersDistanceKm: [
    { max: 5, points: 20 },
    { max: 10, points: 18 },
    { max: 15, points: 15 },
    { max: 25, points: 11 },
    { max: 35, points: 8 },
  ],
  distanceInconnue: 10,
  distancePlancher: 5,

  // Calibrés sur « environ 3 ans d'expérience » : une annonce qui en demande 2 est
  // pleinement atteignable, 3 l'est de justesse, 5 est un étirement.
  paliersSeniorite: [
    { max: 2, points: 15 },
    { max: 3, points: 13 },
    { max: 5, points: 9 },
  ],
  senioriteNonPrecisee: 11,
  senioritePlancher: 5,

  paliersSalaire: [
    // Du plus généreux au moins généreux : le premier seuil atteint l'emporte.
    { min: 90_000, points: 15 }, // au-dessus du repère « spécialiste automatisation »
    { min: 80_000, points: 14 },
    { min: 70_000, points: 12 },
    { min: 60_000, points: 9 }, // autour de la médiane « coordonnateur »
  ],
  salaireNonAffiche: 9,
  salairePlancher: 5,

  immigrationLibre: 10,
  immigrationOrdre: 6,

  plafondNoteCalculee: 85,

  // ⚠️ ÉLARGI LE 2026-08-17, ET C'EST UN AJUSTEMENT ASSUMÉ, PAS UN REFACTOR EN PASSANT
  // (demande de Marc : « je veux que ce soit beaucoup plus efficace à trouver des jobs »).
  //
  // Deux constats mesurés le même jour :
  //
  // 1. LA RECHERCHE SATURE, PAS LE PIPELINE. Sur 161 offres rendues, 141 étaient déjà
  //    connues et 3 seulement sont entrées. Ce n'est pas le tri qui est trop sévère : ce
  //    sont les MÊMES offres qui reviennent, parce que huit termes ne couvrent qu'une part
  //    du marché. Ajouter des sources était bloqué de partout ; ajouter des TERMES ne l'est
  //    pas, et c'est le seul levier qui restait entièrement de notre côté.
  //
  // 2. LA LISTE ÉTAIT 100 % FRANÇAISE, et c'est le trou le plus large. Honeywell, Alstom,
  //    AMETEK, STERIS et Domtar ont des établissements dans la région et publient EN
  //    ANGLAIS — ce sont précisément les gros employeurs que la veille ne voyait jamais.
  //    Marc est bilingue courant (c'est écrit dans ses forces) : ne chercher qu'en français
  //    lui retirait des offres pour lesquelles il est qualifié.
  //
  // ⚠️ CE N'EST PAS « TOUT INTERROGER CHAQUE JOUR ». Le quota Indeed se referme en
  // s'aggravant (mesuré : 14 s → 42 s → 51 s de refus successifs), donc tripler les appels
  // quotidiens le ferait sauter. La liste est un BASSIN dans lequel la passe tire une
  // douzaine de termes par jour, en tournant — voir `docs/veille-prompt.md`. La couverture
  // s'étend sur la semaine, le coût quotidien ne bouge pas.
  recherches: [
    // ── Gestion de projet technique — le cœur de cible ─────────────────────────────
    "coordonnateur de projets",
    "chargé de projet",
    "gestionnaire de projet",
    "ingénieur de projet",
    "chargé de projet mécanique",
    "project manager",
    "technical project manager",
    "project engineer",

    // ── Automatisation et robotique ────────────────────────────────────────────────
    "technicien automatisation",
    "automatisation industrielle",
    "robotique industrielle",
    "intégrateur robotique",
    "automate programmable",
    "mécatronique",
    "vision industrielle",
    "automation engineer",
    "robotics engineer",
    "controls engineer",

    // ── Production et maintenance ──────────────────────────────────────────────────
    "superviseur maintenance",
    "superviseur technique",
    "superviseur de production",
    "amélioration continue",
    "planification production",
    "mise en service",
    "électromécanique",
    "maintenance industrielle",
    "manufacturing engineer",
    "continuous improvement",

    // ── Titres voisins que le bassin ne couvrait pas ────────────────────────────────
    // Ajoutés le 2026-08-17 (« rajoute encore plus de termes »). Le bassin est au PLAFOND
    // après ceux-ci : voir `TERMES_PAR_JOUR` — au-delà, un terme mettrait plus longtemps à
    // revenir que le seuil de péremption, et des offres ouvertes s'éteindraient.
    "directeur de production",
    "chef d'équipe production",
    "ingénieur manufacturier",
    "conception mécanique",
    "gestion de projet industriel",
    "coordonnateur technique",
    "maintenance engineer",
    "production supervisor",
  ],

  /**
   * Termes tirés du bassin à chaque passe.
   *
   * ⚠️ CE NOMBRE ET LA TAILLE DU BASSIN SE COMMANDENT L'UN L'AUTRE. Le bassin est tiré en
   * rotation : un terme ne revient qu'après `bassin / TERMES_PAR_JOUR` jours, et une offre
   * qu'il est seul à trouver accumule des absences pendant tout ce temps. Si ce cycle
   * dépasse `SEUIL_ABSENCES_PEREMPTION`, la rotation PÉRIME des offres ouvertes — un faux
   * positif fabriqué par le mécanisme censé les protéger.
   *
   * D'où le plafond, vérifié par `tests/profil.test.ts` : agrandir le bassin sans monter le
   * seuil (ou le tirage) fait tomber le test. Douze est calé sur le quota Indeed, qui se
   * referme en s'aggravant — ce n'est pas ce nombre-là qu'on augmente à la légère.
   */
  termesParJour: 12,

  swot: [
    {
      titre: "Forces",
      cle: "forces",
      points: [
        "Gestion d'opérations technique éprouvée : équipe, planification, pièces.",
        "Bilingue courant — ouvre les multinationales.",
        "Formation robotique solide (MSIR, Erasmus, thèse).",
        "Double casquette rare : technique et gestion.",
        "Deux processus avancés en 2025 (Eaton jusqu'au test, entrevue Robotiq) avec un CV pourtant périmé.",
      ],
    },
    {
      titre: "Faiblesses",
      cle: "faiblesses",
      points: [
        "Mobilité limitée avant la résidence permanente (permis lié à l'employeur actuel).",
        "Environ 3 ans d'expérience contre les 5 souvent demandés.",
        "CV pas à jour (profil étudiant).",
        "Aucune expérience en milieu syndiqué.",
      ],
    },
    {
      titre: "Opportunités",
      cle: "opportunites",
      points: [
        "Marché dense : plus de 20 offres pertinentes dans un rayon de 50 km.",
        "Davie en croissance (244 postes, Stratégie navale nationale).",
        "Contact RH établi chez Robotiq — relance possible.",
        "Les postes titrés « automatisation » paient 15 à 30 k$ de plus que « coordonnateur ».",
      ],
    },
    {
      titre: "Menaces",
      cle: "menaces",
      points: [
        "Concurrence de candidats au statut déjà réglé.",
        "Offres exigeant la résidence permanente ou la citoyenneté (deux refus en 2025).",
        "Postes « ingénieur » potentiellement soumis au permis d'un ordre professionnel.",
        "Les offres actuelles expireront avant la résidence permanente : cette liste est un thermomètre du marché, pas une liste d'action immédiate.",
      ],
    },
  ],
});

/**
 * Décale les paliers de séniorité selon les années RÉELLEMENT établies par un CV.
 *
 * ⚠️ CETTE FONCTION NE S'APPLIQUE JAMAIS TOUTE SEULE. Elle sert à PROPOSER un barème à
 * l'écran de revue, pour que Marc voie ce que « j'ai maintenant 5 ans » ferait au
 * classement — et décide. Le lien entre un fait et un arbitrage doit rester visible : c'est
 * la différence entre un barème qu'on règle et un barème qui dérive.
 *
 * La forme est celle d'aujourd'hui, translatée : « en dessous de mon niveau » vaut plein
 * pot, « à mon niveau » presque, « deux ans au-dessus » est un étirement.
 */
export function paliersSenioriteDepuisAnnees(annees: number): PalierPlafond[] {
  const n = Math.max(0, Math.round(annees));
  return [
    { max: Math.max(0, n - 1), points: 15 },
    { max: n, points: 13 },
    { max: n + 2, points: 9 },
  ];
}
