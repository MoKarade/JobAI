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
// ⚠️ DEUX RÈGLES, ET LA FRONTIÈRE ENTRE ELLES EST LE CŒUR DE CE FICHIER
//
//   `apparier`      — SOUS-CHAÎNE, floue. Elle GROUPE un affichage : deux annonces du même
//                     employeur sous des noms voisins tombent sur une seule épingle. Une
//                     erreur ici coûte un regroupement discutable, que l'œil rattrape.
//
//   `memeEmployeur` — ÉGALITÉ après normalisation (accents, casse, forme juridique). Elle
//                     décide de DONNÉES : quelle position sert à mesurer une distance, quel
//                     employeur n'a plus besoin d'être géocodé. Une erreur ici écrit un
//                     chiffre faux en base, sans bruit.
//
// La distinction n'est pas théorique — elle a été violée le jour même où ce fichier a été
// écrit. `positionDe` employait `apparier`, et `lib/distances.ts` s'en servait pour ÉCRIRE
// la distance et la note. Mesuré : `apparier("Robert", "Groupe Robert")` est VRAI, donc une
// offre d'un employeur nommé « Robert » aurait reçu en silence la position de « Groupe
// Robert » — deux entreprises sans le moindre rapport. Rien dans les tests ne l'aurait vu.
//
// RÈGLE : une heuristique peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.
// Ce n'est de toute façon pas une résolution d'identité d'entreprise — il n'y a ici ni
// registre ni numéro d'entreprise, et `apparier` se trompera un jour.

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
 * Formes juridiques et commerciales à ignorer pour comparer deux raisons sociales.
 *
 * Sans accent : la normalisation les retire avant la comparaison, « ltée » y arrive donc
 * sous la forme « ltee ».
 */
const SUFFIXES_CORPORATIFS = [
  "inc",
  "ltee",
  "ltd",
  "limitee",
  "corp",
  "corporation",
  "enr",
  "cie",
  "co",
  "senc",
  "sencrl",
];

/**
 * La forme canonique d'une raison sociale : accents, casse, ponctuation et forme juridique
 * retirés. « Laserax inc. » et « LASERAX » y arrivent tous deux à « laserax ».
 */
export function normaliserNomEmployeur(nom: string): string {
  let n = nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // En boucle : « Machin inc. ltée » existe, et retirer un seul suffixe laisserait l'autre.
  for (let encore = true; encore; ) {
    encore = false;
    for (const s of SUFFIXES_CORPORATIFS) {
      if (n.endsWith(` ${s}`)) {
        n = n.slice(0, -(s.length + 1)).trim();
        encore = true;
      }
    }
  }
  return n;
}

/**
 * Deux raisons sociales désignent-elles le même employeur, au sens STRICT ?
 *
 * Égalité après normalisation — jamais une sous-chaîne. C'est la règle des ÉCRITURES.
 */
export function memeEmployeur(a: string, b: string): boolean {
  const x = normaliserNomEmployeur(a);
  return x !== "" && x === normaliserNomEmployeur(b);
}

/**
 * La position d'un employeur, quel que soit le nom sous lequel elle a été inscrite.
 *
 * Deux chemins géocodent, et ils n'emploient pas le même nom : la passe de la carte inscrit
 * `cible.nom` (le nom de la liste de chasse), la mesure des distances inscrit
 * `offre.entreprise` (le nom de l'annonce). Chercher la seule correspondance exacte laisse
 * croire qu'une entreprise n'est pas située alors qu'elle l'est — et relance un géocodage
 * qui n'apprendra rien.
 *
 * ⚠️ POURQUOI `memeEmployeur` ET SURTOUT PAS `apparier`.
 * Cette fonction ne sert pas qu'à placer une épingle : `lib/distances.ts` s'en sert pour
 * ÉCRIRE la distance et la note d'une offre, et pour décider qu'un employeur n'a plus
 * besoin d'être géocodé. C'est la frontière que l'en-tête de ce fichier trace — une
 * heuristique de sous-chaîne peut grouper un affichage, elle n'a pas le droit de décider
 * d'une donnée. Mesuré : `apparier("Robert", "Groupe Robert")` est VRAI, donc une offre
 * d'un employeur nommé « Robert » aurait reçu en silence la position, la distance et la
 * note de « Groupe Robert » — deux entreprises sans aucun rapport. La normalisation, elle,
 * ne rapproche que ce qui ne diffère que par la forme juridique.
 *
 * L'égalité exacte est essayée D'ABORD, et les candidats sont parcourus par ordre de nom :
 * `db.select()` ne garantit aucun ordre, et sans tri le « gagnant » d'une ambiguïté
 * changerait d'une requête à l'autre — puis serait figé en base par la première mesure.
 */
export function positionDe<P>(nom: string, positions: ReadonlyMap<string, P>): P | null {
  const exacte = positions.get(nom);
  if (exacte !== undefined) return exacte;

  const candidats = [...positions.keys()]
    .filter((connu) => memeEmployeur(nom, connu))
    .sort((a, b) => a.localeCompare(b, "fr-CA"));

  const premier = candidats[0];
  return premier === undefined ? null : (positions.get(premier) as P);
}
