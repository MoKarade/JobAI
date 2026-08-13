// lib/scoring.ts — le barème de fit, sur 100.
//
// La note mesure l'adéquation d'une offre AU PROFIL DE MARC, pas la qualité absolue de
// l'offre : une excellente offre de technicien à 40 km note bas ici, et c'est voulu.
// Le barème est affiché dans l'interface — une note qu'on ne peut pas expliquer ne sert
// à rien, et pire, elle inspire une confiance qu'elle n'a pas méritée.
//
// Ces fonctions sont PURES : aucune I/O, aucune dépendance à l'horloge. C'est ce qui
// permet de rejouer le barème sur les 38 offres de référence à chaque modification
// (protocole de précision, CLAUDE.md §8).

/** Répartition des points. La somme fait 100 — vérifié par test, pas par confiance. */
export const PONDERATION = {
  fitRole: 40,
  distance: 20,
  seniorite: 15,
  salaire: 15,
  immigration: 10,
} as const;

/**
 * Plafond des notes CALCULÉES.
 *
 * Une note calculée ne lit que des champs structurés ; une note manuelle vient de la
 * lecture réelle de l'offre. Les plafonner en dessous du seuil A (80) serait excessif —
 * une offre calculée doit pouvoir être signalée comme excellente. Mais elles ne doivent
 * jamais passer DEVANT une offre vérifiée à la main de note maximale.
 */
export const PLAFOND_NOTE_CALCULEE = 85;

/** Rayon au-delà duquel une offre n'est pas retenue. Critère n°1 déclaré. */
export const RAYON_MAX_KM = 50;

const MOTS_COORDINATION = [
  "coordonnateur", "coordinateur", "superviseur", "chef d'équipe", "chargé de projet",
  "chargée de projet", "responsable", "gestionnaire", "chef de projet", "directeur",
];

const MOTS_TECHNIQUE = [
  "automatisation", "automation", "robotique", "robotic", "mécatronique",
  "électromécanique", "mise en service", "plc", "automate", "vision industrielle",
];

/**
 * Exigences qui rendent le poste inaccessible tant que la résidence permanente n'est pas
 * obtenue. Distinct d'une simple préférence de l'employeur : ce sont des barrières fermes.
 */
const MOTS_DISQUALIFIANTS = [
  "citoyenneté canadienne", "citoyens canadiens", "résident permanent requis",
  "secret clearance", "cote de sécurité",
  // ⚠️ AJOUTS DU 2026-08-12, mesurés sur 44 annonces lues.
  // Une seule offre du lot (Randstad, direction ingénierie) posait une vraie barrière de
  // statut sans qu'aucun mot de la liste ne la voie : « apte aux ENQUÊTES DE SÉCURITÉ ».
  // C'est la même exigence que « cote de sécurité » sous un autre nom — l'employeur demande
  // une habilitation fédérale, qui suppose des années de résidence. Le manque n'était pas
  // dans le barème, il était dans le VOCABULAIRE : un seul synonyme non couvert suffit à
  // faire passer une offre disqualifiante en tête de liste.
  "enquête de sécurité", "enquêtes de sécurité",
  "habilitation de sécurité", "fiabilité approfondie",
  "citoyen canadien", "résidence permanente requise",
];

/** 40 pts — le poste combine-t-il coordination d'équipe ET contenu technique ? */
/**
 * Retire les marques d'écriture inclusive avant toute recherche de motif.
 *
 * Sans ça, « Chargé(e) de projets » ne correspond PAS à « chargé de projet » : le `(e)`
 * coupe l'expression en deux et le poste tombe à 8 sur 40 — le score d'un métier sans
 * aucun rapport. Les mots isolés (« coordonnateur(trice) ») s'en sortaient par hasard,
 * la marque tombant après le mot ; les EXPRESSIONS, elles, étaient toutes cassées.
 * L'écriture inclusive est la norme dans les annonces québécoises : c'est le cas
 * courant, pas l'exception.
 */
export function normaliserTitre(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((?:e|s|es|ne|nes|trice|trices|ice|ices|euse|euses|rice|rices)\)/g, "")
    .replace(/\s+/g, " ");
}

export function scoreFitRole(titre: string, description = ""): number {
  const t = normaliserTitre(`${titre} ${description}`);
  const coord = MOTS_COORDINATION.some((m) => t.includes(m));
  const tech = MOTS_TECHNIQUE.some((m) => t.includes(m));
  // « technicien » sans encadrement = recul hiérarchique par rapport au poste actuel.
  const technicien = /\btechnicien/.test(t) && !coord;

  if (coord && tech) return 40; // la combinaison recherchée
  if (coord) return 28; // encadrement sans contenu technique
  if (tech && !technicien) return 26; // technique sans encadrement
  if (technicien) return 14;
  return 8;
}

/**
 * Les paliers de distance du barème, du plus proche au plus lointain.
 *
 * ⚠️ EXPORTÉ POUR QUE L'INTERFACE LES LISE AU LIEU DE LES RECOPIER. La jauge affichée sous
 * chaque distance (`JaugeDistance`) allume un segment par palier atteint : si elle portait
 * sa propre liste de seuils, les deux dériveraient au premier ajustement du barème et
 * l'écran se mettrait à décrire un calcul qui n'existe plus. Une règle, un exemplaire.
 */
export const PALIERS_DISTANCE_KM: readonly { readonly max: number; readonly points: number }[] = [
  { max: 5, points: 20 },
  { max: 10, points: 18 },
  { max: 15, points: 15 },
  { max: 25, points: 11 },
  { max: 35, points: 8 },
] as const;

/** 20 pts — distance depuis le domicile. */
export function scoreDistance(km: number | null | undefined): number {
  // Distance inconnue : note NEUTRE, jamais 0. Un 0 dirait « c'est loin », or on ne sait pas.
  if (km == null) return 10;
  if (km > RAYON_MAX_KM) return 0;
  // Au-delà du dernier palier mais dans le rayon : le plancher du barème.
  return PALIERS_DISTANCE_KM.find((p) => km <= p.max)?.points ?? 5;
}

/** 15 pts — l'exigence de séniorité est-elle atteignable avec environ 3 ans d'expérience ? */
export function scoreSeniorite(description = ""): number {
  // « 5 ans d'expérience », « 5-10 ans d'expérience », « 2 à 3 années d'expérience ».
  const m = description.match(/(\d+)\s*(?:à|-|a)?\s*\d*\s*an(?:s|nées)?\s+d['’]exp/i);
  if (!m) return 11; // non précisé : neutre favorable, l'absence d'exigence n'est pas un obstacle
  const min = Number.parseInt(m[1] ?? "", 10);
  if (!Number.isFinite(min)) return 11;
  if (min <= 2) return 15;
  if (min <= 3) return 13;
  if (min <= 5) return 9;
  return 5;
}

/** 15 pts — salaire annuel affiché, comparé au marché régional. */
export function scoreSalaire(salaireAnnuel: number | null): number {
  // Non affiché : neutre. La majorité des offres n'affichent rien, les pénaliser
  // reviendrait à noter la politique de communication de l'employeur, pas le poste.
  if (salaireAnnuel == null || !Number.isFinite(salaireAnnuel)) return 9;
  if (salaireAnnuel >= 90_000) return 15; // au-dessus du repère « spécialiste automatisation »
  if (salaireAnnuel >= 80_000) return 14;
  if (salaireAnnuel >= 70_000) return 12;
  if (salaireAnnuel >= 60_000) return 9; // autour de la médiane « coordonnateur »
  return 5;
}

/** 10 pts — friction liée au statut migratoire. */
export function scoreImmigration(description = ""): number {
  const t = description.toLowerCase();
  if (MOTS_DISQUALIFIANTS.some((m) => t.includes(m))) return 0;
  // Un ordre professionnel n'est pas une barrière absolue, mais un délai et une démarche.
  if (/ordre des ingénieurs|oiq|ing\.\s|membre de l['’]ordre/.test(t)) return 6;
  return 10;
}

export interface DetailNote {
  /** Note finale, plafonnée si elle est calculée. */
  total: number;
  /** Somme des composantes AVANT plafond — utile pour expliquer un écrêtage. */
  brut: number;
  parts: Record<keyof typeof PONDERATION, number>;
}

/**
 * Calcule la note d'une offre à partir de ses champs structurés.
 * Le résultat est PLAFONNÉ : voir `PLAFOND_NOTE_CALCULEE`.
 */
export function computeScore(input: {
  titre: string;
  description?: string;
  km?: number | null;
  salaireAnnuel?: number | null;
}): DetailNote {
  const parts = {
    fitRole: scoreFitRole(input.titre, input.description),
    distance: scoreDistance(input.km),
    seniorite: scoreSeniorite(input.description),
    salaire: scoreSalaire(input.salaireAnnuel ?? null),
    immigration: scoreImmigration(input.description),
  };
  const brut = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total: Math.min(brut, PLAFOND_NOTE_CALCULEE), brut, parts };
}

export type Palier = "A" | "B" | "C";

/**
 * Seuils des paliers — EXPORTÉS pour que la légende de la carte les LISE au lieu de les
 * recopier : un seuil recopié dans un texte explicatif se met à mentir dès qu'on ajuste
 * le barème (même règle que les points du barème dans `Panneaux`).
 */
export const SEUIL_PALIER_A = 80;
export const SEUIL_PALIER_B = 65;

/** A = fonce · B = solide · C = opportuniste. Sans note, on ne présume pas : C. */
export function palier(score: number | null | undefined): Palier {
  if (score == null) return "C";
  if (score >= SEUIL_PALIER_A) return "A";
  if (score >= SEUIL_PALIER_B) return "B";
  return "C";
}

/** Filtre dur, appliqué AVANT la notation : hors rayon, l'offre n'entre pas. */
export function dansLeRayon(km: number | null | undefined): boolean {
  // Distance inconnue : on garde. Écarter sur une donnée absente reviendrait à décider
  // à la place de Marc sur la base de rien.
  return km == null || km <= RAYON_MAX_KM;
}
