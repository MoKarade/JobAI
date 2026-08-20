// lib/analyseConservee.ts — la forme d'une analyse rendue, et sa relecture. PUR.
//
// ⚠️ SÉPARÉ DE L'ACTION, ET PAS PAR GOÛT DU DÉCOUPAGE. Un fichier `"use server"` ne peut
// exporter QUE des fonctions asynchrones : y laisser une constante, un type ou un lecteur
// synchrone fait échouer le build — pas le typecheck, le BUILD, donc en toute fin de gate.
// Ce qui n'est pas une action serveur vit ici.

import type { Tendances } from "./analyseMarche";

/** Clé sous laquelle la dernière analyse est conservée. */
export const CLE_ANALYSE = "veille-analyse";

/** Une analyse rendue, avec de quoi juger si elle est encore d'actualité. */
export interface AnalyseConservee {
  /** Le texte du modèle. */
  texte: string;
  /** Quand elle a été produite (ISO). */
  le: string;
  /** Sur combien de passes elle portait — une analyse vieille de 30 passes ne vaut plus. */
  passes: number;
  /** La réponse a-t-elle été coupée au plafond ? */
  tronquee: boolean;
  /** Les chiffres qu'elle interprète, pour les afficher À CÔTÉ d'elle. */
  tendances: Tendances;
}

/** Relit l'analyse conservée, sans jamais rien inventer si elle est illisible. */
export function lireAnalyseConservee(brut: unknown): AnalyseConservee | null {
  if (typeof brut !== "object" || brut === null) return null;
  const a = brut as Record<string, unknown>;
  if (typeof a.texte !== "string" || a.texte === "") return null;
  if (typeof a.le !== "string") return null;
  if (typeof a.tendances !== "object" || a.tendances === null) return null;
  return {
    texte: a.texte,
    le: a.le,
    passes: typeof a.passes === "number" && Number.isFinite(a.passes) ? a.passes : 0,
    tronquee: a.tronquee === true,
    tendances: a.tendances as Tendances,
  };
}

