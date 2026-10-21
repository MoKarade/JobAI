// lib/propositionMetiers.ts — proposer à Marc des métiers précis, tirés des offres qu'il suit. PURE (ADR-0038, JobAI#151).
//
// POURQUOI UNE PROPOSITION
// Les quatre domaines par défaut (21, 22, 70, 92) retiennent des centaines de métiers que Marc ne vise pas : un
// paysagiste (22114) et un physicien du laser (21100) sont « de son domaine » à deux chiffres, et le plancher de
// rôle les remonte tous au même niveau. Retenir des métiers PRÉCIS (cinq chiffres) règle cela, mais Marc ne
// connaît pas les codes par cœur. La proposition les lui montre, avec des titres réels, et il coche.
//
// ⚠️ ELLE PROPOSE, ELLE NE DÉCIDE PAS. Rien n'est enregistré par ce module : le résultat nourrit un écran où Marc
// valide. Quels métiers l'intéressent est sa décision ; on lui épargne seulement le tri.
//
// ⚠️ LE CRITÈRE EST CELUI DE LA NOTE, PAS UN SECOND VOCABULAIRE. Un titre « se lit comme son domaine » quand
// `scoreFitRole` lui donne plus que « technicien » et « hors sujet » : coordination, technique ou combinaison, avec
// les mots du PROFIL (ceux que son CV a produits). Deux vocabulaires finiraient par diverger.
//
// ⚠️ DEUX SEUILS, ET CE SONT DES HYPOTHÈSES (à relire sur la proposition rendue, ADR-0038) : un code n'est proposé
// qu'avec au moins `MIN_OFFRES_PAR_CODE` offres suivies (sous ce nombre, une part de 100 % ne prouve rien), dont au
// moins `PART_MINIMALE` se lisent comme son domaine.

import { lireCodeNoc } from "./nocProfession";
import { normaliserTitre, scoreFitRole } from "./scoring";
import type { Profil } from "./profil";

/** Offres suivies qu'un code doit porter pour être proposé. */
export const MIN_OFFRES_PAR_CODE = 3;
/** Part des offres du code dont le titre se lit comme le domaine de Marc. */
export const PART_MINIMALE = 0.5;
/** Codes proposés au plus : au-delà, ce n'est plus une proposition mais un second tri à faire. */
export const MAX_PROPOSES = 20;
/** Codes montrés au plus (proposés ou non, pour que Marc voie aussi ce qui a été écarté de peu). */
export const MAX_MONTRES = 40;
/** Titres montrés par code : trois suffisent à reconnaître un métier. */
export const TITRES_PAR_CODE = 3;

export interface LigneProposition {
  /** Le métier précis (cinq chiffres). */
  code: string;
  /** Offres suivies portant ce code. */
  offres: number;
  /** Parmi elles, celles dont le titre se lit comme le domaine de Marc. */
  lues: number;
  /** `lues / offres`, entre 0 et 1. */
  part: number;
  /** Titres réels : d'abord ceux qui se lisent comme son domaine, puis les autres. */
  titres: string[];
  /** Pré-coché ? */
  propose: boolean;
}

export interface Proposition {
  /** Offres lues avec un code de profession valide. Le dénominateur. */
  avecCode: number;
  lignes: LigneProposition[];
  /** Les codes proposés, triés. */
  proposes: string[];
}

interface EntreeProposition {
  noc?: string | null;
  poste: string;
}

/**
 * Les métiers à proposer. PURE : même offres et même profil, même proposition.
 *
 * `offres` : l'appelant ne passe que les offres OUVERTES (une offre fermée ne dit plus ce que le marché cherche).
 */
export function proposerMetiers(offres: readonly EntreeProposition[], profil: Profil): Proposition {
  const parCode = new Map<string, { lus: string[]; autres: string[] }>();
  let avecCode = 0;

  for (const o of offres) {
    const code = lireCodeNoc(o.noc);
    if (code === null) continue;
    avecCode += 1;
    const groupe = parCode.get(code.code) ?? { lus: [], autres: [] };
    const seRit = scoreFitRole(o.poste, "", profil) > Math.max(profil.pointsRole.technicien, profil.pointsRole.horsSujet);
    (seRit ? groupe.lus : groupe.autres).push(o.poste);
    parCode.set(code.code, groupe);
  }

  const candidats: LigneProposition[] = [];
  for (const [code, g] of parCode) {
    const total = g.lus.length + g.autres.length;
    if (total < MIN_OFFRES_PAR_CODE || g.lus.length === 0) continue;
    candidats.push({
      code,
      offres: total,
      lues: g.lus.length,
      part: g.lus.length / total,
      // Triés : l'ordre des titres ne doit pas dépendre de l'ordre dans lequel le suivi a rendu les offres.
      titres: titresDistincts([...[...g.lus].sort(), ...[...g.autres].sort()]),
      propose: false,
    });
  }

  // Les mieux lus d'abord ; à part égale, le code le plus fourni, puis l'ordre du code (le résultat se refait).
  candidats.sort((a, b) => b.part - a.part || b.offres - a.offres || (a.code < b.code ? -1 : 1));
  const lignes = candidats.slice(0, MAX_MONTRES);

  let proposes = 0;
  for (const l of lignes) {
    if (l.part >= PART_MINIMALE && proposes < MAX_PROPOSES) {
      l.propose = true;
      proposes += 1;
    }
  }

  return { avecCode, lignes, proposes: lignes.filter((l) => l.propose).map((l) => l.code).sort() };
}

/** Jusqu'à `TITRES_PAR_CODE` titres différents (comparés repliés), dans l'ordre reçu. */
function titresDistincts(titres: readonly string[]): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const t of titres) {
    const cle = normaliserTitre(t);
    if (cle === "" || vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(t);
    if (sortie.length === TITRES_PAR_CODE) break;
  }
  return sortie;
}
