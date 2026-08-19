// lib/mcp/vue.ts — ce qu'une offre devient quand elle part vers un modèle.
//
// POURQUOI UNE FORME À PART, PLUTÔT QUE `Offre` TELLE QUELLE
// Une `Offre` est la forme INTERNE : elle grandit au fil des chantiers, et chaque champ
// ajouté partirait alors vers claude.ai sans que personne ne l'ait décidé. La leçon est déjà
// écrite dans ce dépôt sous une autre forme : composer par `{ ...brut, quelquesChamps }`
// laisse passer TOUT LE RESTE. On compose donc champ par champ — ajouter un champ au modèle
// interne sans l'ajouter ici ne le publie pas, et c'est exactement ce qu'on veut.
//
// ⚠️ GARDE-FOU N°1 — CE QUI NE SORT JAMAIS
// L'adresse du domicile de Marc n'existe nulle part dans `Offre` : seule la DISTANCE (`km`)
// y vit, et `lib/domicile.ts` reste le seul à connaître le point de référence. Aucune
// composition ici ne doit introduire de coordonnée. Verrou : `tests/mcpSurface.test.ts`.
//
// ⚠️ GARDE-FOU N°6 — CE QUI SE NETTOIE, ET CE QUI NE SE NETTOIE PAS
// Une offre porte deux natures de texte, et les confondre casse quelque chose des deux côtés.
// Le texte VERBATIM d'une annonce (nom d'employeur, intitulé, ville, salaire affiché) est
// écrit par un tiers : c'est une surface d'injection, il passe par `sanitizePromptText`.
// Le texte écrit par NOUS — les justifications produites par le barème, la note de Marc — ne
// se nettoie pas : la leçon `MCP-PROMPT-SCRUB` de FinanceAI montre qu'un scrub appliqué en
// aveugle à toute chaîne a TRONQUÉ des mises en garde rédigées par le code, c'est-à-dire des
// garde-fous, en silence. On nettoie par ALLOWLIST DE CLÉS, jamais par balayage.

import type { Offre } from "../types";
import { sanitizePromptText } from "../promptSafety";

/**
 * Les champs d'une offre qui portent du texte VERBATIM d'une source tierce.
 *
 * ⚠️ TOUTE NOUVELLE SOURCE DE TEXTE TIERS S'AJOUTE ICI. Un champ oublié part brut vers le
 * modèle : c'est le vecteur d'injection indirecte, et il ne lève aucune erreur.
 */
export const CHAMPS_TEXTE_TIERS = ["entreprise", "poste", "ville", "salaireAffiche"] as const;

/** Une offre telle qu'un modèle la voit. */
export interface OffreVue {
  id: string;
  entreprise: string;
  poste: string;
  ville: string | null;
  /** Distance à vol d'oiseau, en km. `null` = jamais mesurée — pas zéro. */
  km: number | null;
  salaireAffiche: string | null;
  statut: Offre["statut"];
  priorite: Offre["priorite"];
  score: number | null;
  /** `manuel` = vérifié à la main et fait foi ; `calcule` = plafonné à 85. */
  scoreSource: Offre["scoreSource"];
  dateReperage: string;
  dateEnvoi: string;
  lien: string;
  /** `true` = candidature d'avant le suivi courant, gardée pour mémoire. */
  histo: boolean;
  /** Date de constat de péremption, ou `null` si l'offre est réputée ouverte. */
  perimeeLe: string | null;
  /** La note de Marc. Son texte, rendu tel quel. */
  userNote: string;
  atouts: string[];
  reserves: string[];
}

/** Le texte d'un tiers, neutralisé. PURE. */
function tiers(valeur: string): string {
  return sanitizePromptText(valeur);
}

/**
 * Une offre mise à la forme publiée. PURE.
 *
 * Composée champ par champ, à dessein : voir l'en-tête. Un `...offre` ici publierait tout
 * champ futur sans décision.
 */
export function vueOffre(o: Offre): OffreVue {
  return {
    id: o.id,
    entreprise: tiers(o.entreprise),
    poste: tiers(o.poste),
    ville: o.ville === null ? null : tiers(o.ville),
    km: o.km,
    salaireAffiche: o.salaireAffiche === null ? null : tiers(o.salaireAffiche),
    statut: o.statut,
    priorite: o.priorite,
    score: o.score,
    scoreSource: o.scoreSource,
    dateReperage: o.dateReperage,
    dateEnvoi: o.dateEnvoi,
    lien: o.lien,
    histo: o.histo,
    perimeeLe: o.perimeeLe,
    userNote: o.userNote,
    atouts: o.raisons.filter((r) => r.ton === "atout").map((r) => r.texte),
    reserves: o.raisons.filter((r) => r.ton === "reserve").map((r) => r.texte),
  };
}
