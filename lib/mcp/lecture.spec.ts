// lib/mcp/lecture.spec.ts — ce que Claude peut CONSULTER du suivi de Marc.
//
// ⚠️ AUCUN IMPORT DU SDK MCP, AUCUN IMPORT DE LA BASE. La frontière est un FICHIER, pas une
// intention : le SDK tire `express` et `cors`, et le tree-shaking n'est pas une garantie.
// Ces fonctions reçoivent les offres déjà lues et rendent le résultat — c'est ce qui les rend
// testables sans réseau, et c'est aussi ce qui garantit qu'un outil ne peut pas contourner
// `lib/donnees.ts`. Verrou : `tests/mcpSurface.test.ts`.
//
// ⚠️ TOUT NOMBRE PORTE `.finite()`. `.min()` et `.positive()` n'excluent PAS `Infinity`
// (leçon `MCP-WHATIF` de FinanceAI : un `Infinity` a traversé un schéma et le moteur a
// fabriqué un impact de plusieurs dizaines de milliers de dollars « sans erreur »). Et un
// handler appelé DIRECTEMENT en test contourne la validation du SDK : la logique garde donc
// aussi, en ceinture.

import { z } from "zod";
import { PrioriteSchema, StatutSchema, type Offre, type Statut } from "../types";
import { vueOffre, type OffreVue } from "./vue";
import { joursEntre } from "../dureeVie";
import type { SuiviVeille } from "../veille";

/**
 * Offres rendues au maximum par une recherche.
 *
 * ⚠️ C'EST UNE BORNE DE CONTEXTE, PAS DE PERFORMANCE. Le flux du Guichet peut porter plus de
 * mille offres régionales : les rendre toutes noierait la fenêtre du modèle et lui ferait
 * perdre la question posée. Une recherche qui mord le plafond le DIT (`tronque`), sinon
 * « voici tes offres » se lirait comme une liste complète alors que c'en est le début — la
 * faute déjà payée en lisant les comptes d'une passe arrêtée à mi-chemin.
 */
export const MAX_RESULTATS = 40;

export const FiltresSchema = z.object({
  /** Texte cherché dans l'employeur et l'intitulé. Insensible à la casse et aux accents. */
  texte: z.string().max(120).optional(),
  // ⚠️ DÉRIVÉS DES SCHÉMAS, JAMAIS RECOPIÉS. Une liste de valeurs réécrite à côté de sa
  // source finit toujours par en perdre une — ce dépôt l'a payé avec quatre listes de
  // colonnes recopiées, dont chacune avait oublié un champ différent. Ici, un statut ajouté
  // au modèle devient interrogeable sans qu'on y pense.
  statut: StatutSchema.optional(),
  priorite: PrioriteSchema.optional(),
  /** Note minimale. `.finite()` : `Infinity` traverserait un simple `.min()`. */
  scoreMin: z.number().finite().int().min(0).max(100).optional(),
  /** Distance maximale en km. Une offre jamais mesurée (`km` nul) est EXCLUE si ce filtre est posé. */
  kmMax: z.number().finite().min(0).max(10_000).optional(),
  /** Par défaut on ne rend que les offres réputées ouvertes. */
  inclurePerimees: z.boolean().default(false),
  /** Par défaut on écarte les candidatures d'avant le suivi courant. */
  inclureHisto: z.boolean().default(false),
  limite: z.number().finite().int().min(1).max(MAX_RESULTATS).default(20),
});
export type Filtres = z.infer<typeof FiltresSchema>;

export interface ResultatRecherche {
  /** Offres correspondant aux filtres, les mieux notées d'abord. */
  offres: OffreVue[];
  /** Combien correspondaient AVANT la limite. */
  correspondances: number;
  /**
   * `true` si la limite a mordu.
   *
   * Sans ce drapeau, vingt offres sur deux cents se liraient comme « voilà tout ».
   */
  tronque: boolean;
}

/** Sans accent, en minuscules. PURE. Les annonces de la région sont bilingues et accentuées. */
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Cherche dans le suivi. PURE.
 *
 * Le tri met les mieux notées en tête, et une offre NON NOTÉE passe APRÈS les notées plutôt
 * que de valoir zéro : `null` est une absence de jugement, pas un mauvais jugement — la
 * traiter comme un 0 la condamnerait au bas de toutes les listes à vie.
 */
export function chercherOffres(offres: readonly Offre[], filtres: Filtres): ResultatRecherche {
  const besoin = filtres.texte === undefined ? null : normaliser(filtres.texte);

  const gardees = offres.filter((o) => {
    if (!filtres.inclurePerimees && o.perimeeLe !== null) return false;
    if (!filtres.inclureHisto && o.histo) return false;
    if (filtres.statut !== undefined && o.statut !== filtres.statut) return false;
    if (filtres.priorite !== undefined && o.priorite !== filtres.priorite) return false;
    if (filtres.scoreMin !== undefined && (o.score === null || o.score < filtres.scoreMin)) return false;
    // Une distance inconnue n'est pas une distance acceptable : sans cette exclusion, un
    // filtre « à moins de 30 km » rendrait des offres qu'on n'a jamais su situer.
    if (filtres.kmMax !== undefined && (o.km === null || o.km > filtres.kmMax)) return false;
    if (besoin !== null && !normaliser(`${o.entreprise} ${o.poste}`).includes(besoin)) return false;
    return true;
  });

  const triees = [...gardees].sort((a, b) => {
    if (a.score === null && b.score === null) return a.entreprise.localeCompare(b.entreprise);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });

  return {
    offres: triees.slice(0, filtres.limite).map(vueOffre),
    correspondances: triees.length,
    tronque: triees.length > filtres.limite,
  };
}

/** Une offre précise, ou `null` si l'identifiant ne correspond à rien. PURE. */
export function lireOffreVue(offres: readonly Offre[], id: string): OffreVue | null {
  const trouvee = offres.find((o) => o.id === id);
  return trouvee === undefined ? null : vueOffre(trouvee);
}

export interface ResumeMcp {
  /** Offres réputées ouvertes, hors historique. */
  suivies: number;
  /** Par statut, les statuts à zéro compris — « aucune entrevue » est une information. */
  parStatut: Record<Statut, number>;
  /** Offres constatées périmées. */
  perimees: number;
  /** Offres jamais notées. Une note absente n'est pas une note basse. */
  nonNotees: number;
  /** Offres dont la distance n'a jamais pu être mesurée. */
  nonSituees: number;
  /** La meilleure note du suivi courant, ou `null` si rien n'est noté. */
  meilleureNote: number | null;
  /**
   * Ce que la VEILLE a confirmé, et ce qu'elle n'a jamais vu.
   *
   * ⚠️ C'EST LA DISTINCTION QUE LE RESTE DU RÉSUMÉ NE PORTE PAS, et elle change la lecture
   * de tous les autres chiffres. « 1 595 suivies » se lit très différemment selon que la
   * veille les a vues hier ou que personne ne les a jamais revues depuis leur saisie : une
   * offre qu'aucun balayage n'a confirmée n'est pas une offre ouverte, c'est une offre dont
   * on ne sait rien. La péremption ne compte d'absences que pour ce qu'elle a déjà vu
   * (`lib/veille.ts`), donc ces offres-là ne peuvent PAS se fermer toutes seules — leur
   * compte est le seul moyen de savoir si le suivi dérive.
   */
  veille: EtatVeilleMcp;
}

/** Ce que la veille sait, ou ne sait pas, des offres vivantes. */
export interface EtatVeilleMcp {
  /** Offres vivantes qu'un balayage a déjà vues au moins une fois. */
  confirmees: number;
  /** Offres vivantes qu'AUCUN balayage n'a jamais vues : leur état est INCONNU. */
  jamaisConfirmees: number;
  /**
   * Les jamais-confirmées par ÂGE depuis le repérage, en jours.
   *
   * Un compte seul ne dit pas s'il faut agir : 40 offres repérées cette semaine sont un
   * intake normal, 40 offres repérées il y a six mois sont un suivi qui ment.
   */
  ageJamaisConfirmees: { moins7: number; de7a30: number; de30a90: number; plus90: number };
  /**
   * Parmi les offres que la veille SUIT, le plus grand nombre de jours depuis la dernière
   * vue. `null` s'il n'y en a aucune. Un grand nombre ici veut dire que la veille tourne
   * mais ne retrouve plus ce qu'elle suivait ; un `null` veut dire qu'elle ne suit rien.
   */
  plusVieilleVueJours: number | null;
}

/** Tous les statuts, dérivés du schéma — même raison que ci-dessus. */
const STATUTS: readonly Statut[] = StatutSchema.options;

/**
 * L'état du suivi, en chiffres. PURE.
 *
 * ⚠️ LES STATUTS À ZÉRO SONT RENDUS. « Entrevue : 0 » et « le champ entrevue n'existe pas »
 * sont deux situations opposées, et un objet qui n'aurait que les clés non vides forcerait le
 * modèle à deviner laquelle il regarde.
 */
export function resumerPourMcp(
  offres: readonly Offre[],
  /**
   * Le journal de veille, et le jour courant pour dater les âges.
   *
   * Optionnel : un appelant qui ne peut pas le lire obtient un bloc `veille` à zéro plutôt
   * qu'une panne. ⚠️ Et il obtient alors `confirmees: 0`, ce qui est VRAI de ce qu'il sait —
   * l'inverse (supposer tout confirmé) présenterait un suivi dont on ignore l'état comme
   * un suivi vérifié.
   */
  veille?: { journal: Readonly<Record<string, SuiviVeille>>; aujourdhui: string },
): ResumeMcp {
  const vivantes = offres.filter((o) => o.perimeeLe === null && !o.histo);
  const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0])) as Record<Statut, number>;
  for (const o of vivantes) parStatut[o.statut] += 1;

  const notes = vivantes.map((o) => o.score).filter((s): s is number => s !== null);

  return {
    suivies: vivantes.length,
    parStatut,
    perimees: offres.filter((o) => o.perimeeLe !== null).length,
    nonNotees: vivantes.filter((o) => o.score === null).length,
    nonSituees: vivantes.filter((o) => o.km === null).length,
    meilleureNote: notes.length === 0 ? null : Math.max(...notes),
    veille: etatVeille(vivantes, veille),
  };
}

/** La partie « veille » du résumé. PURE. */
function etatVeille(
  vivantes: readonly Offre[],
  veille?: { journal: Readonly<Record<string, SuiviVeille>>; aujourdhui: string },
): EtatVeilleMcp {
  const vide: EtatVeilleMcp = {
    confirmees: 0,
    jamaisConfirmees: vivantes.length,
    ageJamaisConfirmees: { moins7: 0, de7a30: 0, de30a90: 0, plus90: 0 },
    plusVieilleVueJours: null,
  };
  if (!veille) return vide;

  const age = { moins7: 0, de7a30: 0, de30a90: 0, plus90: 0 };
  let confirmees = 0;
  let plusVieille: number | null = null;

  for (const o of vivantes) {
    const suivi = veille.journal[o.id];
    if (suivi) {
      confirmees += 1;
      const j = joursEntre(suivi.derniereVue, veille.aujourdhui);
      if (Number.isFinite(j) && (plusVieille === null || j > plusVieille)) plusVieille = j;
      continue;
    }
    const j = joursEntre(o.dateReperage, veille.aujourdhui);
    if (!Number.isFinite(j)) continue;
    if (j < 7) age.moins7 += 1;
    else if (j < 30) age.de7a30 += 1;
    else if (j < 90) age.de30a90 += 1;
    else age.plus90 += 1;
  }

  return {
    confirmees,
    jamaisConfirmees: vivantes.length - confirmees,
    ageJamaisConfirmees: age,
    plusVieilleVueJours: plusVieille,
  };
}
