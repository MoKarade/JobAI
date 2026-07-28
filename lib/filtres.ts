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
  /** Ne garder que ce qui est à 15 km ou moins. */
  proches: boolean;
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
  proches: false,
  historique: false,
  avecPerimees: false,
};

/** Seuil du filtre « proche ». Distinct du rayon maximal : c'est un confort, pas une limite. */
export const SEUIL_PROCHE_KM = 15;

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
    if (f.proches && (o.km === null || o.km > SEUIL_PROCHE_KM)) return false;

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
