// lib/filtres.ts — le filtrage de la liste, en fonction PURE.
//
// Extrait du composant pour être testable : c'est la logique que Marc utilise à chaque
// consultation, et un filtre faux se remarque tard (on croit simplement qu'il n'y a rien).

import type { Offre } from "./types";

export interface EtatFiltres {
  /** Recherche libre sur l'entreprise, le poste et les notes. */
  texte: string;
  /** Masquer les candidatures de 2025. */
  activesSeules: boolean;
  /** Ne garder que les offres de palier A. */
  notees80Plus: boolean;
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
}

export const FILTRES_VIDES: EtatFiltres = {
  texte: "",
  activesSeules: false,
  notees80Plus: false,
  distanceMaxKm: null,
  historique: false,
  avecPerimees: false,
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

export function filtrer(offres: readonly Offre[], f: EtatFiltres): Offre[] {
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

    if (f.notees80Plus && (o.score ?? 0) < 80) return false;

    // Une distance NON MESURÉE ne passe pas un seuil : on ne sait pas où elle est, et la
    // faire passer reviendrait à affirmer qu'elle est proche. Ce n'est pas gratuit — les
    // offres fraîchement ingérées n'ont pas encore de distance — donc l'interface COMPTE
    // celles qui sont écartées pour cette raison, au lieu de les faire disparaître.
    if (f.distanceMaxKm !== null && (o.km === null || o.km > f.distanceMaxKm)) return false;

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
