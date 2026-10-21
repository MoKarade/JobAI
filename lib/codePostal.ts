// lib/codePostal.ts — le début d'un code postal et son centre, pour approcher une distance (ADR-0040, JobAI#92). PUR.
//
// ⚠️ UN CENTRE, PAS UN POINT. Le début de code d'une zone rurale (`J0K`, `G0L`) couvre une région : la distance qu'on en tire est
// approchée, et c'est à l'appelant de la dire telle (`kmSource: "postale"`). Ce module ne connaît ni le domicile ni la note.

import { CENTRES_FSA_QUEBEC } from "./data/fsaQuebec";

/**
 * Le début (trois caractères) d'un code postal, en majuscules, ou `null`. PURE.
 *
 * ÉCHEC FERMÉ : une chaîne vide, un code trop court ou une forme qui n'est pas lettre-chiffre-lettre rend `null`, jamais un début
 * « presque bon ». Les espaces ne comptent pas (`g1v 4g6`, `G1V4G6`, `G1V`).
 */
export function debutCodePostal(brut: string | null | undefined): string | null {
  if (!brut) return null;
  const debut = brut.replace(/\s+/g, "").toUpperCase().slice(0, 3);
  return /^[A-Z]\d[A-Z]$/.test(debut) ? debut : null;
}

/** Le centre du début de ce code postal, ou `null` s'il n'est pas dans la table du Québec (aucune distance n'est alors inventée). */
export function centreDeCodePostal(debut: string | null | undefined): { lat: number; lon: number } | null {
  const bon = debutCodePostal(debut);
  const centre = bon === null ? undefined : CENTRES_FSA_QUEBEC[bon];
  return centre === undefined ? null : { lat: centre[0], lon: centre[1] };
}
