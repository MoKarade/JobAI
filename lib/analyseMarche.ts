// lib/analyseMarche.ts — les CHIFFRES de l'analyse de marché. PUR, sans appel réseau.
//
// ⚠️ POURQUOI CE MODULE EXISTE PLUTÔT QUE DE TOUT DONNER AU MODÈLE.
//
// Un modèle à qui l'on donne quatre-vingt-dix lignes de comptes et qu'on prie de « dégager
// la tendance » rendra une prose crédible où les nombres sont approximatifs — et personne
// ne les recomptera. Les nombres se calculent ici, en arithmétique vérifiable ; le modèle
// n'a droit qu'à l'INTERPRÉTATION. Ce qui s'affiche à l'écran vient donc de ce fichier, pas
// de la réponse du modèle.
//
// C'est la même frontière que partout ailleurs dans ce dépôt : la mesure d'un côté, ce
// qu'on en dit de l'autre.

import type { EntreeHistorique } from "./historiqueVeille";

/**
 * Passes nécessaires avant de parler de « tendance ».
 *
 * ⚠️ CE N'EST PAS UNE PRUDENCE DE PRINCIPE. Deux points font une droite, et une droite
 * tracée sur deux jours de veille dirait « le marché s'effondre » un lundi férié. En
 * dessous du seuil, l'analyse est REFUSÉE avec sa raison — jamais rendue plus molle.
 */
export const PASSES_MINIMUM = 5;

/** Une moyenne, ou `null` quand il n'y a rien à moyenner. Jamais 0 : 0 est une valeur. */
function moyenne(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  return Math.round((valeurs.reduce((a, b) => a + b, 0) / valeurs.length) * 10) / 10;
}

/** Les chiffres d'une fenêtre de passes. */
export interface Fenetre {
  passes: number;
  nouvellesParPasse: number | null;
  noteMoyenne: number | null;
  perimeesParPasse: number | null;
}

function fenetre(entrees: readonly EntreeHistorique[]): Fenetre {
  const notes = entrees
    .map((e) => e.noteMoyenneNouvelles)
    .filter((n): n is number => n !== null);
  return {
    passes: entrees.length,
    nouvellesParPasse: moyenne(entrees.map((e) => e.nouvelles)),
    // ⚠️ MOYENNE DES PASSES QUI ONT RAPPORTÉ, pas de toutes. Compter une passe sans nouvelle
    // offre comme « note 0 » écraserait la moyenne vers le bas et ferait lire une chute de
    // qualité là où il n'y a eu qu'un jour calme.
    noteMoyenne: moyenne(notes),
    perimeesParPasse: moyenne(entrees.map((e) => e.perimees)),
  };
}

/** Ce que l'analyse a à dire, en nombres. */
export interface Tendances {
  /** Nombre de passes tracées. */
  passes: number;
  /** Première et dernière date couvertes. */
  du: string;
  au: string;
  /** Les sept dernières passes, et les trente. La seconde englobe la première. */
  recent: Fenetre;
  ensemble: Fenetre;
  /** Offres suivies au début et à la fin de la période. */
  suiviesDebut: number;
  suiviesFin: number;
  /** Meilleure note moyenne observée sur une passe, et son jour. `null` si aucune. */
  meilleurJour: { jour: string; note: number } | null;
}

/**
 * Calcule les tendances, ou dit pourquoi elle ne peut pas. PURE.
 *
 * ⚠️ L'HISTORIQUE ARRIVE LE PLUS RÉCENT EN TÊTE (voir `historiqueVeille`). Le lire à
 * l'envers donnerait des « du / au » inversés et une tendance de signe opposé — c'est le
 * genre d'erreur qui produit une analyse parfaitement rédigée et parfaitement fausse.
 */
export function calculerTendances(
  historique: readonly EntreeHistorique[],
): { ok: true; tendances: Tendances } | { ok: false; raison: string } {
  if (historique.length < PASSES_MINIMUM) {
    return {
      ok: false,
      raison:
        `Il faut au moins ${PASSES_MINIMUM} passes pour parler de tendance ; ` +
        `l'historique en compte ${historique.length}. Reviens dans quelques jours.`,
    };
  }

  const recent = historique.slice(0, 7);
  const plusAncienne = historique[historique.length - 1]!;
  const plusRecente = historique[0]!;

  const avecNote = historique.filter(
    (e): e is EntreeHistorique & { noteMoyenneNouvelles: number } =>
      e.noteMoyenneNouvelles !== null,
  );
  const meilleure = avecNote.reduce<(typeof avecNote)[number] | null>(
    (best, e) => (best === null || e.noteMoyenneNouvelles > best.noteMoyenneNouvelles ? e : best),
    null,
  );

  return {
    ok: true,
    tendances: {
      passes: historique.length,
      du: plusAncienne.jour,
      au: plusRecente.jour,
      recent: fenetre(recent),
      ensemble: fenetre(historique),
      suiviesDebut: plusAncienne.suivies,
      suiviesFin: plusRecente.suivies,
      meilleurJour:
        meilleure === null
          ? null
          : { jour: meilleure.jour, note: meilleure.noteMoyenneNouvelles },
    },
  };
}

/**
 * Les tendances mises en texte, pour le prompt. PURE.
 *
 * ⚠️ DES PHRASES, PAS DU JSON. Un modèle à qui l'on donne du JSON le recrache volontiers
 * tel quel ; des phrases courtes l'orientent vers l'interprétation, qui est le seul travail
 * qu'on lui demande. Et c'est lisible dans un journal en cas d'anomalie.
 */
export function tendancesEnTexte(t: Tendances): string {
  const chiffre = (n: number | null) => (n === null ? "aucune donnée" : String(n));
  return [
    `Période : ${t.du} au ${t.au}, ${t.passes} passes de veille.`,
    `Sur les ${t.recent.passes} dernières passes : ${chiffre(t.recent.nouvellesParPasse)} nouvelles offres par passe, note moyenne ${chiffre(t.recent.noteMoyenne)}, ${chiffre(t.recent.perimeesParPasse)} péremptions par passe.`,
    `Sur l'ensemble de la période : ${chiffre(t.ensemble.nouvellesParPasse)} nouvelles par passe, note moyenne ${chiffre(t.ensemble.noteMoyenne)}, ${chiffre(t.ensemble.perimeesParPasse)} péremptions par passe.`,
    `Offres suivies : ${t.suiviesDebut} au début de la période, ${t.suiviesFin} à la fin.`,
    t.meilleurJour === null
      ? `Aucune passe n'a rapporté d'offre notée.`
      : `Meilleure journée : ${t.meilleurJour.jour}, note moyenne ${t.meilleurJour.note}.`,
  ].join("\n");
}
