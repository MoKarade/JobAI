// lib/groupesEntreprise.ts — les offres regroupées par employeur, classées par mérite. PUR.
//
// ⚠️ LA MÊME RÈGLE DE REGROUPEMENT QUE LA CARTE, PAS UNE SECONDE. `nomCanonique` applique
// exactement ce que fait `construireVue` : la cible qui apparie, sinon un employeur déjà
// rencontré qui apparie, sinon l'employeur tel que l'offre le nomme. Deux règles écrites
// séparément divergent toujours — et ici la divergence serait VISIBLE : la carte montrerait
// une épingle là où la liste montre deux entreprises, sans que rien ne dise laquelle a
// raison.

import { apparier } from "./employeurs";
import type { Offre } from "./types";

/** Une entreprise et ses offres, telles que la liste les présente. */
export interface GroupeEntreprise {
  /** Le nom retenu : celui de la première offre rencontrée pour cet employeur. */
  nom: string;
  offres: Offre[];
  /**
   * Moyenne des notes, arrondie — ou `null` quand AUCUNE offre du groupe n'est notée.
   *
   * ⚠️ JAMAIS ZÉRO. Une entreprise dont les offres n'ont pas encore été notées n'est pas
   * une mauvaise entreprise : c'est une entreprise qu'on n'a pas jugée. Un zéro la
   * classerait dernière avec l'autorité d'une mesure — la faute que ce dépôt nomme partout
   * « un cumul discrètement amputé se présente comme une mesure ».
   */
  noteMoyenne: number | null;
  /** La meilleure note du groupe, pour départager à moyenne égale. */
  meilleureNote: number | null;
  /** Combien d'offres du groupe portent une note. Dit l'assise de la moyenne. */
  notees: number;
  /** La distance mesurée la plus courte du groupe, ou `null` si aucune ne l'est. */
  kmMin: number | null;
}

/**
 * Le nom sous lequel une offre rejoint un groupe.
 *
 * Reprend la règle de `construireVue` : on cherche d'abord parmi les noms DÉJÀ retenus un
 * employeur qui apparie, et on ne crée un groupe que si aucun ne correspond. L'appariement
 * est borné par le plancher de longueur d'`apparier` — un sigle court exige l'égalité
 * stricte, sinon une sous-chaîne apparierait n'importe quoi.
 */
function nomCanonique(entreprise: string, connus: readonly string[]): string {
  return connus.find((connu) => apparier(entreprise, connu)) ?? entreprise;
}

/** La moyenne des notes présentes, arrondie. `null` s'il n'y en a aucune. */
function moyenneDesNotes(offres: readonly Offre[]): number | null {
  const notes = offres.map((o) => o.score).filter((n): n is number => typeof n === "number");
  if (notes.length === 0) return null;
  return Math.round(notes.reduce((a, b) => a + b, 0) / notes.length);
}

/**
 * Trie les offres D'UN GROUPE : meilleure note d'abord, non notées en dernier — puis, à
 * note égale, distance croissante, non mesurées en dernier — puis le poste, pour la
 * stabilité. Sans ce tri, la meilleure offre de l'entreprise ne serait pas la première
 * qu'on voit en dépliant sa carte : le même défaut que trierait un tri par `null` comme zéro.
 */
function trierOffresDuGroupe(offres: readonly Offre[]): Offre[] {
  return [...offres].sort((a, b) => {
    if (a.score !== b.score) {
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    }
    if (a.km !== b.km) {
      if (a.km === null) return 1;
      if (b.km === null) return -1;
      return a.km - b.km;
    }
    return a.poste.localeCompare(b.poste, "fr");
  });
}

/**
 * Regroupe les offres par employeur et classe les groupes par mérite.
 *
 * L'ordre : la meilleure moyenne d'abord ; à moyenne égale, la meilleure note ; puis le
 * plus grand nombre d'offres notées ; puis le nom, pour que deux affichages successifs de
 * la même donnée ne s'échangent pas de place.
 *
 * ⚠️ LES GROUPES SANS AUCUNE NOTE PASSENT EN DERNIER, pas en premier. Trier `null` comme
 * zéro les enverrait au fond avec l'apparence d'un jugement ; les trier comme l'infini les
 * mettrait en tête. Ils sont écartés de la comparaison et ajoutés à la fin, par ordre
 * alphabétique — et l'interface dit « pas encore notée » plutôt qu'un chiffre.
 */
export function grouperParEntreprise(offres: readonly Offre[]): GroupeEntreprise[] {
  const groupes = new Map<string, Offre[]>();
  for (const o of offres) {
    const nom = nomCanonique(o.entreprise, [...groupes.keys()]);
    const liste = groupes.get(nom);
    if (liste) liste.push(o);
    else groupes.set(nom, [o]);
  }

  const tous: GroupeEntreprise[] = [...groupes.entries()].map(([nom, liste]) => {
    const notes = liste.map((o) => o.score).filter((n): n is number => typeof n === "number");
    const kms = liste.map((o) => o.km).filter((n): n is number => typeof n === "number");
    return {
      nom,
      offres: trierOffresDuGroupe(liste),
      noteMoyenne: moyenneDesNotes(liste),
      meilleureNote: notes.length > 0 ? Math.max(...notes) : null,
      notees: notes.length,
      kmMin: kms.length > 0 ? Math.min(...kms) : null,
    };
  });

  const notes = tous.filter((g) => g.noteMoyenne !== null);
  const sansNote = tous.filter((g) => g.noteMoyenne === null);

  notes.sort(
    (a, b) =>
      b.noteMoyenne! - a.noteMoyenne! ||
      (b.meilleureNote ?? 0) - (a.meilleureNote ?? 0) ||
      b.notees - a.notees ||
      a.nom.localeCompare(b.nom, "fr"),
  );
  sansNote.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return [...notes, ...sansNote];
}
