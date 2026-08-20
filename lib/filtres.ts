// lib/filtres.ts — le filtrage de la liste, en fonction PURE.
//
// Extrait du composant pour être testable : c'est la logique que Marc utilise à chaque
// consultation, et un filtre faux se remarque tard (on croit simplement qu'il n'y a rien).

import { SEUIL_PALIER_A, SEUIL_PALIER_B } from "./scoring";
import type { Offre } from "./types";
import { categorieOffre, type Categorie } from "./categorie";

export interface EtatFiltres {
  /** Recherche libre sur l'entreprise, le poste et les notes. */
  texte: string;
  /** Masquer les candidatures de 2025. */
  activesSeules: boolean;
  /**
   * Note minimale retenue. `null` = pas de seuil.
   *
   * ⚠️ UN SEUIL ET NON UNE BASCULE (demande de Marc, 2026-08-19 : « des filtres si j'en veux
   * avec de meilleures notes »). C'était « Note 80+ », tout ou rien : au-dessous de 80 il
   * fallait reparcourir les 193 offres à la main. La distance avait déjà ses paliers ; il
   * n'y avait aucune raison que la note n'en ait pas — c'est le même geste.
   */
  noteMinimale: number | null;
  /**
   * Distance maximale retenue, en km. `null` = pas de limite.
   *
   * Un SEUIL et non un booléen (demande de Marc, 2026-07-31 : « filtrer par distance ») :
   * « proche » ne veut pas dire la même chose selon qu'on cherche à pied ou en voiture, et
   * un seul palier figé obligeait à parcourir toute la liste dès qu'il ne convenait pas.
   */
  distanceMaxKm: number | null;
  /** Afficher UNIQUEMENT l'historique 2025. */
  historique: boolean;
  /**
   * Afficher aussi les offres constatées périmées.
   *
   * Masquées par DÉFAUT : une offre fermée n'a rien à faire dans une liste qu'on parcourt
   * pour décider où postuler. Mais elle reste consultable — le suivi n'efface rien, et
   * savoir qu'une piste s'est fermée fait partie de l'histoire de la recherche.
   */
  avecPerimees: boolean;

  /**
   * Nombre de JOURS de repérage à garder, ou `null` pour toutes.
   *
   * ⚠️ C'est la date de REPÉRAGE, pas de publication : c'est celle que l'app connaît pour
   * toutes ses offres. Filtrer sur une date de publication que la plupart des sources ne
   * donnent pas écarterait en silence tout ce qui n'en porte pas.
   */
  jours: number | null;

  /** Catégorie de poste, ou `null` pour toutes. Voir `lib/categorie.ts`. */
  categorie: Categorie | null;
}

export const FILTRES_VIDES: EtatFiltres = {
  texte: "",
  activesSeules: false,
  noteMinimale: null,
  distanceMaxKm: null,
  historique: false,
  avecPerimees: false,
  jours: null,
  categorie: null,
};

/**
 * Les paliers proposés, en km.
 *
 * Des repères de la région de Québec, pas des nombres ronds pour faire joli : 10 km couvre
 * la ville, 25 km atteint Lévis et la banlieue, 50 km est le rayon au-delà duquel Marc ne
 * veut pas d'un trajet quotidien. C'est un confort de lecture, jamais une limite de ce qui
 * entre dans le suivi — le filtre de région, lui, vit dans `lib/ingest/region.ts`.
 */
export const PALIERS_DISTANCE_KM: readonly number[] = [10, 25, 50];

/**
 * Les paliers de note proposés.
 *
 * ⚠️ DÉRIVÉS DU BARÈME, PAS ÉCRITS ICI. Ce sont les seuils qui définissent déjà les paliers
 * A et B (`lib/scoring.ts`) : le filtre propose donc exactement les coupures que la note
 * elle-même reconnaît. Deux nombres recopiés auraient dérivé au premier ajustement du
 * barème, et l'écran se serait mis à offrir des seuils qui ne correspondent plus à rien —
 * la classe de défaut que ce dépôt a déjà payée cinq fois.
 */
export const PALIERS_NOTE: readonly number[] = [SEUIL_PALIER_B, SEUIL_PALIER_A];

/**
 * Fenêtres de fraîcheur, en jours.
 *
 * Des paliers plutôt qu'un calendrier : on cherche « ce qui est arrivé cette semaine », on
 * ne compose pas une date. Un second clic sur le palier actif le retire.
 */
export const PALIERS_JOURS: readonly number[] = [1, 7, 30];

/**
 * La date de repérage la plus ancienne acceptée, au format `AAAA-MM-JJ`.
 *
 * PURE et paramétrée par `maintenant` pour être testable : un helper de date qui lit
 * l'horloge ne se teste que par le hasard du jour où on lance la suite.
 */
export function depuisJours(jours: number, maintenant: Date = new Date()): string {
  const d = new Date(maintenant);
  d.setDate(d.getDate() - (jours - 1));
  // Le fuseau de Marc, comme partout ailleurs : Vercel tourne en UTC, et `toISOString()`
  // rendrait DEMAIN après 20 h locale.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function filtrer(
  offres: readonly Offre[],
  f: EtatFiltres,
  /** Les métiers du domaine — la catégorie s'en sert, comme la note. */
  metiers: readonly string[] = [],
): Offre[] {
  const q = f.texte.trim().toLowerCase();

  return offres.filter((o) => {
    // « historique » est exclusif : il REMPLACE la vue active plutôt que de s'y ajouter.
    if (f.historique) {
      if (!o.histo) return false;
    } else if (f.activesSeules && o.histo) {
      return false;
    }

    // Les périmées sont masquées par défaut, mais restent visibles dans la vue
    // historique : celle-ci sert justement à regarder ce qui est derrière soi.
    if (!f.avecPerimees && !f.historique && o.perimeeLe !== null) return false;

    // ⚠️ UNE OFFRE NON NOTÉE NE FRANCHIT PAS UN SEUIL, et ce n'est pas la même chose que
    // « mal notée ». `null` veut dire « pas encore évaluée » : la compter zéro serait un
    // jugement qu'on n'a pas porté. Elle est donc écartée du seuil — on ne peut pas
    // affirmer qu'elle vaut 80 — mais elle est COMPTÉE à part et DITE sous la barre, comme
    // on le fait déjà pour une distance non mesurée.
    if (f.noteMinimale !== null && (o.score === null || o.score < f.noteMinimale)) return false;

    // Une distance NON MESURÉE ne passe pas un seuil : on ne sait pas où elle est, et la
    // faire passer reviendrait à affirmer qu'elle est proche. Ce n'est pas gratuit — les
    // offres fraîchement ingérées n'ont pas encore de distance — donc l'interface COMPTE
    // celles qui sont écartées pour cette raison, au lieu de les faire disparaître.
    if (f.distanceMaxKm !== null && (o.km === null || o.km > f.distanceMaxKm)) return false;

    if (f.jours !== null) {
      // ⚠️ COMPARAISON DE CHAÎNES `AAAA-MM-JJ`, pas de `Date`. Construire une `Date` depuis
      // « 2026-08-20 » la place à MINUIT UTC : sur un fuseau en retard, l'offre du jour se
      // retrouverait « demain » et le filtre « aujourd'hui » ne rendrait rien. Les deux
      // bornes sont produites dans le même format, l'ordre lexicographique suffit.
      if (o.dateReperage < depuisJours(f.jours)) return false;
    }

    if (f.categorie !== null) {
      const c = categorieOffre(o.poste, o.raisons.map((r) => r.texte).join(" "), o.noc, metiers);
      if (c !== f.categorie) return false;
    }

    if (q) {
      const foin = [
        o.entreprise,
        o.poste,
        o.notes,
        o.userNote,
        ...o.raisons.map((r) => r.texte),
      ]
        .join(" ")
        .toLowerCase();
      if (!foin.includes(q)) return false;
    }

    return true;
  });
}

/**
 * Combien d'offres un seuil de distance écarte FAUTE DE MESURE, et non parce qu'elles sont
 * loin.
 *
 * Sans ce compte, un filtre « ≤ 10 km » posé le lendemain d'une ingestion viderait la liste
 * et laisserait croire qu'il n'y a rien de proche — alors que la distance de la moitié des
 * offres n'est simplement pas encore mesurée. Le dire est la différence entre un filtre et
 * un mensonge par omission.
 */
/**
 * Combien d'offres un seuil de NOTE a écartées faute d'évaluation.
 *
 * Jumelle de `sansDistanceMesuree`, et pour la même raison : un filtre qui vide la liste
 * sans dire pourquoi laisse croire qu'il n'y a rien. « Douze offres pas encore notées » et
 * « douze offres sous le seuil » appellent deux gestes opposés — attendre une passe, ou
 * baisser le seuil.
 */
export function sansNoteCalculee(offres: readonly Offre[], f: EtatFiltres): number {
  if (f.noteMinimale === null) return 0;
  return offres.filter((o) => {
    if (f.historique ? !o.histo : f.activesSeules && o.histo) return false;
    if (!f.avecPerimees && !f.historique && o.perimeeLe !== null) return false;
    return o.score === null;
  }).length;
}

export function sansDistanceMesuree(offres: readonly Offre[], f: EtatFiltres): number {
  if (f.distanceMaxKm === null) return 0;
  return offres.filter((o) => {
    if (f.historique ? !o.histo : f.activesSeules && o.histo) return false;
    if (!f.avecPerimees && !f.historique && o.perimeeLe !== null) return false;
    return o.km === null;
  }).length;
}

/**
 * Marc a-t-il posé un filtre, quel qu'il soit ?
 *
 * Sert à la carte : sans filtre, elle montre aussi les entreprises cibles SANS offre active
 * — c'est la liste de chasse, une information utile quand on regarde le marché. Dès qu'un
 * filtre est posé, Marc pose une QUESTION (« qu'est-ce qui est à 25 km ? ») et des épingles
 * sans offre correspondante y répondraient à côté, en laissant croire qu'elles satisfont le
 * filtre.
 *
 * ⚠️ DÉRIVÉE DES CLÉS, jamais d'une liste écrite à la main : un filtre ajouté demain doit
 * être pris en compte ici sans que personne n'y pense. Un test le prouve en comparant les
 * clés de `FILTRES_VIDES` à celles que cette fonction inspecte.
 */
export function unFiltreEstActif(f: EtatFiltres): boolean {
  return (Object.keys(FILTRES_VIDES) as (keyof EtatFiltres)[]).some((cle) => {
    const valeur = f[cle];
    const defaut = FILTRES_VIDES[cle];
    // Le texte se compare NETTOYÉ : trois espaces ne sont pas une question.
    if (typeof valeur === "string") return valeur.trim() !== String(defaut).trim();
    return valeur !== defaut;
  });
}
