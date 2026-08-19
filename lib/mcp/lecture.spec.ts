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
export function resumerPourMcp(offres: readonly Offre[]): ResumeMcp {
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
  };
}
