// lib/quota.ts — servir une file bornée sans perdre le compte de ce qu'on n'a pas servi.
//
// POURQUOI CE MODULE EXISTE — `[V-ROUTINE-QUOTA]`
//
// Une passe de fond trie une file, en sert les N premiers, et rapporte « N sur M ». Le piège
// est que M se calcule APRÈS la tranche : le dénominateur vaut alors au plus N, quoi qu'il
// arrive. « Il n'y avait que trois candidates » et « il y en avait trois cents et huit ont été
// servies » rendent la MÊME ligne — alors qu'elles appellent des gestes opposés : ne rien
// faire, ou ajouter une passe.
//
// ⚠️ LA FONCTION REND LES DEUX ENSEMBLE, ET C'EST TOUT L'INTÉRÊT. Compter séparément marche
// jusqu'au jour où quelqu'un déplace le `slice` de deux lignes ; ici, la tranche et le reste
// sont dérivés du MÊME appel, sur la MÊME entrée. Le défaut ne peut pas revenir par
// inadvertance — il faudrait défaire la fonction.
//
// PURE, et le module est une feuille : aucune dépendance, testable sans base ni réseau.

/** Ce qu'une file bornée a donné : ce qui passe, et ce qui attend. */
export interface Tranche<T> {
  /** Les éléments effectivement servis cette passe. */
  servies: T[];
  /**
   * Ceux que le quota a laissés de côté.
   *
   * ⚠️ « En attente », jamais « écartés » : ils repasseront. Le tri de la file les remet en
   * tête au tour suivant, donc ce nombre décrit une FILE, pas un refus.
   */
  sansTentative: number;
}

/**
 * Sert au plus `max` éléments, et dit combien attendent. PURE.
 *
 * `max` négatif ou nul ⇒ rien n'est servi et TOUT attend : une borne à zéro est un arrêt, pas
 * une erreur, et le compte doit le dire au lieu de rendre une file vide.
 */
export function trancherParQuota<T>(eligibles: readonly T[], max: number): Tranche<T> {
  const borne = Math.max(0, Math.trunc(max));
  return {
    servies: eligibles.slice(0, borne),
    sansTentative: Math.max(0, eligibles.length - borne),
  };
}
