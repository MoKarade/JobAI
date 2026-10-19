// lib/mcp/reanalyse.spec.ts — sélection et cadrage de la ré-analyse du CV.
//
// ⚠️ AUCUN IMPORT DU SDK MCP, AUCUN IMPORT DE LA BASE. La frontière est un FICHIER :
// les fonctions d'ici reçoivent les résumés de CV déjà lus et choisissent la cible.
// Verrou : `tests/mcpSurface.test.ts`.

export interface CvInformationCible {
  id: number;
  actif: boolean;
  aUneProposition: boolean;
}

/**
 * Choisit le CV cible pour la ré-analyse. PURE.
 *
 * Règle :
 *   1. Le CV le plus récent qui porte une proposition sans être actif (à relire / valider) ;
 *   2. Sinon, le CV actif ;
 *   3. Si aucun CV ne correspond : `null`.
 */
export function choisirCvCible<T extends CvInformationCible>(cvs: readonly T[]): T | null {
  const aRelire = cvs.find((c) => c.aUneProposition && !c.actif);
  if (aRelire !== undefined) return aRelire;
  const actif = cvs.find((c) => c.actif);
  return actif ?? null;
}
