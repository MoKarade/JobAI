// lib/historiqueVeille.ts — la trace de ce que chaque passe a rapporté.
//
// ⚠️ DES NOMBRES, PAS DES OFFRES. Une entrée d'historique ne porte aucun titre, aucun
// employeur, aucune ville : uniquement des comptes. Deux raisons, et la seconde suffirait.
// D'abord le volume — garder 90 rapports complets ferait grossir l'état sans fin. Ensuite
// c'est cet historique qui partira à un modèle pour l'analyse de marché : ce qui n'y est pas
// ne peut pas fuir.
//
// ⚠️ ET C'EST CE QUI REND L'ANALYSE POSSIBLE, pas seulement sûre. Une série de comptes
// quotidiens dit comment le marché bouge ; une pile de rapports complets dirait la même
// chose, en cent fois plus gros et illisible.

/** Clé sous laquelle l'historique est conservé. */
export const CLE_HISTORIQUE = "veille-historique";

/**
 * Entrées gardées.
 *
 * Quatre-vingt-dix passes ≈ trois mois à une passe par jour : assez pour voir une tendance
 * saisonnière, assez peu pour tenir dans une valeur d'état. Au-delà, les plus anciennes
 * tombent — un historique qui grossit sans borne finit par ne plus s'écrire du tout, et la
 * panne est silencieuse.
 */
export const MAX_ENTREES = 90;

/** Ce qu'une passe laisse derrière elle. Que des nombres, et la date. */
export interface EntreeHistorique {
  /** Jour de la passe, `AAAA-MM-JJ` dans le fuseau de Marc. */
  jour: string;
  /** Horodatage de fin, ISO. Deux passes le même jour se distinguent par lui. */
  fini: string;
  /** Ce qui a lancé la passe — le planificateur, le bouton, le rattrapage. */
  declencheur: string;
  /** Offres vues par les sources, avant tout tri. */
  trouvees: number;
  /** Offres RETENUES et nouvelles pour le suivi. */
  nouvelles: number;
  /** Offres qui ont pris une absence de trop. */
  perimees: number;
  /** Offres périmées qu'une source republie. */
  revenues: number;
  /** Offres en train de prendre des absences. */
  enSursis: number;
  /** Note moyenne des nouvelles, arrondie. `null` si la passe n'en a rapporté aucune. */
  noteMoyenneNouvelles: number | null;
  /** Total suivi après la passe. */
  suivies: number;
}

/**
 * Ajoute une passe à l'historique, la plus récente EN TÊTE, et borne la liste. PURE.
 *
 * ⚠️ TÊTE ET NON QUEUE : l'écran montre les dernières, et une liste à parcourir à l'envers
 * finit toujours par être parcourue à l'endroit quelque part.
 */
export function ajouterEntree(
  historique: readonly EntreeHistorique[],
  entree: EntreeHistorique,
): EntreeHistorique[] {
  return [entree, ...historique].slice(0, MAX_ENTREES);
}

/**
 * Relit un historique venu de l'état. PURE.
 *
 * ⚠️ TOLÉRANTE PAR ENTRÉE, jamais par le tout. Une entrée corrompue est SAUTÉE ; le reste
 * de la série survit. Rejeter la liste entière parce qu'une ligne est mal formée effacerait
 * trois mois de mesure pour un octet — et l'analyse de marché repartirait de zéro sans que
 * rien ne le dise.
 */
export function lireHistorique(brut: unknown): EntreeHistorique[] {
  if (!Array.isArray(brut)) return [];
  const sorties: EntreeHistorique[] = [];
  for (const x of brut) {
    if (typeof x !== "object" || x === null) continue;
    const e = x as Record<string, unknown>;
    if (typeof e.jour !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.jour)) continue;
    const n = (cle: string): number =>
      typeof e[cle] === "number" && Number.isFinite(e[cle]) ? (e[cle] as number) : 0;
    sorties.push({
      jour: e.jour,
      fini: typeof e.fini === "string" ? e.fini : "",
      declencheur: typeof e.declencheur === "string" ? e.declencheur : "inconnu",
      trouvees: n("trouvees"),
      nouvelles: n("nouvelles"),
      perimees: n("perimees"),
      revenues: n("revenues"),
      enSursis: n("enSursis"),
      noteMoyenneNouvelles:
        typeof e.noteMoyenneNouvelles === "number" && Number.isFinite(e.noteMoyenneNouvelles)
          ? e.noteMoyenneNouvelles
          : null,
      suivies: n("suivies"),
    });
  }
  return sorties.slice(0, MAX_ENTREES);
}
