// lib/nocProfession.ts — lire un code de profession, et RIEN de plus.
//
// POURQUOI CE MODULE NE DÉCIDE DE RIEN
// Le flux du Guichet porte un `noc2021` sur 100 % de ses offres (mesuré : 2000/2000). C'est
// un classement NORMALISÉ, donc indépendant de la langue de l'annonce — la seule façon de
// trier un flux dont les titres sont en anglais sans traduire tout le vocabulaire du barème.
//
// ⚠️ MAIS CE FICHIER NE SAIT PAS CE QUI INTÉRESSE MARC, ET NE DOIT PAS LE SAVOIR. Il lit un
// code et en extrait sa structure. QUELS codes retenir est une décision de Marc, prise sur
// des chiffres mesurés, et elle vit dans le PROFIL — à côté de `motsCoordination`, comme
// tout ce qui pilote déjà le barème (ADR-0009). Une liste écrite en dur ici serait une
// politique déguisée en utilitaire, invisible et impossible à régler.
//
// ⚠️ ET IL N'ATTRIBUE AUCUN LIBELLÉ. « 2 = sciences et génie » est une lecture de la norme,
// pas une mesure : l'écrire ici en ferait un fait. La confirmation vient d'ailleurs — le
// diagnostic apparie chaque code à des TITRES RÉELS, et c'est ce tableau qui tranche. Un
// libellé faux dans un module qui filtre écarterait des offres en silence, et ce dépôt a
// déjà payé une constante non sourcée empruntée au mauvais formulaire.

/** Ce qu'un code de profession porte, une fois lu. Aucun jugement. */
export interface CodeProfession {
  /** Le code complet, normalisé (cinq chiffres). */
  code: string;
  /**
   * Le premier chiffre : le grand domaine professionnel.
   *
   * Rendu comme un CHIFFRE et non comme un libellé — voir l'en-tête. Ce qu'il désigne se
   * lit dans le tableau du diagnostic, où il est apparié à de vrais titres.
   */
  domaine: number;
  /**
   * Le deuxième chiffre : le niveau de qualification (TEER dans la norme).
   *
   * ⚠️ CETTE LECTURE VIENT DE LA NORME, PAS D'UNE MESURE. La distribution observée y est
   * cohérente (`60030` gestionnaire de restaurant, `75110` aide de construction, `12200`
   * technicien comptable) — mais cohérent n'est pas vérifié. Le tableau code↔titre du
   * diagnostic est ce qui la confirmera ou la démentira, et tant qu'il n'a pas parlé, aucun
   * filtre ne doit s'appuyer sur ce chiffre seul.
   */
  niveau: number;
}

/**
 * Lit un code de profession, ou rend `null` s'il n'en est pas un. PURE.
 *
 * ⚠️ `null` VEUT DIRE « JE NE SAIS PAS LIRE », JAMAIS « CE MÉTIER NE CONCERNE PAS MARC ».
 * C'est la distinction qui décide du sort d'une offre : un code absent ou malformé doit la
 * laisser au barème ordinaire, pas la faire disparaître. Confondre les deux perdrait en
 * silence exactement les offres que le Guichet code mal — et un tri qui écarte sans le dire
 * est indiscernable d'une source qui ne rend rien.
 */
export function lireCodeNoc(brut: string | null | undefined): CodeProfession | null {
  if (typeof brut !== "string") return null;
  const net = brut.trim();
  // Exactement cinq chiffres. Ni quatre (le format 2016 en avait quatre — un flux qui
  // servirait l'ancien serait lu de travers, chiffre par chiffre), ni six.
  if (!/^\d{5}$/.test(net)) return null;
  return {
    code: net,
    domaine: Number(net[0]),
    niveau: Number(net[1]),
  };
}

/**
 * Le code appartient-il à l'un des ensembles retenus ?
 *
 * `retenus` accepte deux granularités, et c'est délibéré :
 *   · un code COMPLET (`21301`) — « ce métier précis » ;
 *   · un PRÉFIXE de deux chiffres (`21`) — « ce domaine, à ce niveau ».
 *
 * Le préfixe de deux chiffres est l'unité utile : il dit « sciences et génie, niveau
 * universitaire » sans avoir à énumérer les quarante codes qui s'y rangent. Le code complet
 * sert aux exceptions — un métier précis qu'on veut malgré son voisinage.
 *
 * ⚠️ LA COMPARAISON EST ANCRÉE, jamais un `includes`. Un `startsWith` sur une liste qui
 * mélange les longueurs ferait qu'un code retenu `2` avalerait tout le domaine 2, niveaux
 * compris — le genre de sur-portée que ce dépôt a déjà payé sur les listes de villes, où
 * ajouter `saint-laurent` aurait exclu `saint-laurent-de-l-ile-d-orleans`.
 */
export function codeRetenu(code: CodeProfession, retenus: readonly string[]): boolean {
  return retenus.some((r) => {
    const cible = r.trim();
    if (cible.length === 5) return cible === code.code;
    if (cible.length === 2) return cible === code.code.slice(0, 2);
    // Toute autre longueur est une entrée mal écrite. On ne DEVINE pas ce qu'elle voulait
    // dire : elle ne retient rien, et le compte des écartées le rendra visible.
    return false;
  });
}

export type VerdictProfession = "retenue" | "ecartee" | "code-illisible";

/**
 * Le sort d'une offre au regard de son code. PURE.
 *
 * Trois réponses, pas deux — et c'est tout l'enjeu. « Écartée » est une décision ; « code
 * illisible » est un aveu, et il ne doit pas se comporter comme une décision. Les compter
 * ensemble ferait passer un défaut de la source (un flux qui cesse de coder ses offres) pour
 * un tri qui fonctionne, et personne ne le verrait.
 */
export function jugerProfession(
  brut: string | null | undefined,
  retenus: readonly string[],
): VerdictProfession {
  const code = lireCodeNoc(brut);
  if (code === null) return "code-illisible";
  return codeRetenu(code, retenus) ? "retenue" : "ecartee";
}
