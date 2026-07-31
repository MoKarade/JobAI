// lib/employeurs.ts — reconnaître qu'un employeur est le même sous deux noms.
//
// POURQUOI CE FICHIER EXISTE
// « Laserax » et « Laserax inc. » désignent le même employeur, mais pas la même chaîne de
// caractères. La carte savait les rapprocher ; la mesure des distances comparait les noms
// LITTÉRALEMENT. Deux règles pour une même question, et la moins bonne gagnait là où on ne
// regardait pas : une entreprise déjà située sous son nom canonique était re-géocodée sous
// celui de l'annonce — un appel de plus à un service bénévole, et une ligne en double dans
// `entreprises_lieux`.
//
// La règle vit donc ici, une seule fois, et tout le monde l'appelle : `lib/carte.ts` pour
// grouper les épingles, `lib/distances.ts` pour retrouver une position et décider qui reste
// à situer.
//
// CE QUE LA RÈGLE N'EST PAS
// Ce n'est pas une résolution d'identité d'entreprise — il n'y a ni registre ni numéro
// d'entreprise ici. C'est une heuristique de sous-chaîne, volontairement bornée par une
// longueur minimale, et elle se trompera un jour. C'est acceptable pour GROUPER un
// affichage et ÉVITER un appel réseau ; ça ne le serait pas pour fusionner des données.

/**
 * En deçà de cette longueur, seule l'égalité stricte apparie.
 *
 * Sans ce plancher, un sigle de deux ou trois lettres apparierait la moitié de la liste par
 * sous-chaîne — c'est le piège classique du rapprochement par `includes`, et il ne se voit
 * qu'une fois le mal fait. La contrepartie est assumée : « ISS » et « ISS Facility
 * Services » restent deux entrées distinctes.
 */
export const LONGUEUR_MIN_APPARIEMENT = 4;

/** Deux noms d'entreprise désignent-ils le même employeur ? */
export function apparier(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length < LONGUEUR_MIN_APPARIEMENT || y.length < LONGUEUR_MIN_APPARIEMENT) {
    return x === y && x.length > 0;
  }
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * La position d'un employeur, quel que soit le nom sous lequel elle a été inscrite.
 *
 * Deux chemins géocodent, et ils n'emploient pas le même nom : la passe de la carte inscrit
 * `cible.nom` (le nom de la liste de chasse), la mesure des distances inscrit
 * `offre.entreprise` (le nom de l'annonce). Chercher la seule correspondance exacte laisse
 * donc croire qu'une entreprise n'est pas située alors qu'elle l'est — et relance un
 * géocodage qui n'apprendra rien.
 *
 * L'égalité stricte est essayée D'ABORD : quand les deux noms coïncident, aucune heuristique
 * n'a à se prononcer. Rend `null` plutôt qu'`undefined` — l'absence est une réponse, pas un
 * oubli.
 */
export function positionDe<P>(nom: string, positions: ReadonlyMap<string, P>): P | null {
  const exacte = positions.get(nom);
  if (exacte !== undefined) return exacte;

  for (const [connu, position] of positions) {
    if (apparier(nom, connu)) return position;
  }
  return null;
}
