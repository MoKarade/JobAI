// lib/couleurNote.ts — la couleur d'une note, du gris tiède au vert franc.
//
// Demande de Marc (2026-08-06) : « couleur de plus en plus verte pour le cercle avec le
// chiffre dedans, plus ça se rapproche de 100 ».
//
// POURQUOI UNE FONCTION PLUTÔT QUE TROIS CLASSES CSS
// Trois paliers (A/B/C) donnent trois couleurs : on lit une CATÉGORIE, et il faut en
// connaître les seuils pour comprendre. Un dégradé continu se lit sans rien connaître —
// plus c'est vert, mieux c'est. Mais une couleur qui ENCODE une donnée n'est plus du style :
// c'est un calcul, et un calcul se teste. D'où ce module pur.
//
// ⚠️ LA COULEUR N'EST JAMAIS LE SEUL SIGNAL (WCAG 1.4.1). Le nombre est écrit DANS le
// cercle : qui ne distingue pas le vert de l'ambre lit « 82 » et sait tout ce qu'il faut.
// Le dégradé accélère la lecture, il ne la porte pas.
//
// ⚠️ LA CLARTÉ RESTE CONSTANTE, ET C'EST CE QUI REND LE TEXTE LISIBLE PARTOUT. Faire varier
// la luminosité en même temps que la teinte donnerait un cercle sombre à un bout de
// l'échelle et clair à l'autre — le texte foncé posé dessus passerait sous le contraste
// minimum quelque part au milieu, sans qu'aucun test de couleur ne le signale.

/** Bornes de l'échelle. En dessous du plancher, la couleur ne bouge plus : gris tiède. */
export const NOTE_PLANCHER = 45;
export const NOTE_PLAFOND = 95;

/** Teinte de départ (ambre, l'accent de JobAI) et d'arrivée (vert). */
const TEINTE_BASSE = 72;
const TEINTE_HAUTE = 148;

/** Saturation : plus la note monte, plus la couleur s'affirme. */
const CHROMA_BAS = 0.045;
const CHROMA_HAUT = 0.155;

/** Clarté FIXE — voir l'en-tête : c'est elle qui garantit la lisibilité du nombre. */
const CLARTE = 0.78;

/** Ramène une valeur dans [0, 1]. */
function borner(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Où se situe cette note sur l'échelle, de 0 (plancher) à 1 (plafond).
 *
 * Exporté parce que la carte s'en sert aussi pour dimensionner ses épingles : la liste et
 * le plan doivent parler de la même échelle, sinon un même score se dit de deux façons.
 */
export function positionSurEchelle(score: number): number {
  return borner((score - NOTE_PLANCHER) / (NOTE_PLAFOND - NOTE_PLANCHER));
}

/**
 * La couleur de fond du cercle d'une note.
 *
 * `null` (une offre historique, jamais notée) rend un gris neutre : ne pas savoir n'est pas
 * une mauvaise note, et lui donner la couleur d'un mauvais score serait une donnée
 * inventée — le genre exact d'affichage plausible et faux qu'interdit le garde-fou n°3.
 */
export function couleurNote(score: number | null): string {
  if (score === null || !Number.isFinite(score)) {
    return `oklch(${CLARTE} 0.006 265)`;
  }

  const t = positionSurEchelle(score);
  const teinte = TEINTE_BASSE + (TEINTE_HAUTE - TEINTE_BASSE) * t;
  const chroma = CHROMA_BAS + (CHROMA_HAUT - CHROMA_BAS) * t;

  return `oklch(${CLARTE} ${chroma.toFixed(3)} ${teinte.toFixed(1)})`;
}

/**
 * La couleur du TEXTE à poser sur ce fond.
 *
 * Une seule valeur suffit, et c'est tout l'intérêt d'avoir figé la clarté : à 78 %, un
 * texte très foncé passe le contraste sur toute l'échelle. Deux couleurs de texte
 * exigeraient un seuil de bascule, donc un endroit où le contraste est au plus juste.
 */
export function encreSurNote(): string {
  return "oklch(0.22 0.02 265)";
}
