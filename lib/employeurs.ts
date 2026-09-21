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
// ⚠️ HISTORIQUE — CE FICHIER PORTAIT DEUX RÈGLES, ET NE LES PORTE PLUS QUE POUR UN SEUL USAGE
// (ADR-0022, 2026-09-21). Jusque-là :
//
//   `apparier`      — SOUS-CHAÎNE, floue. GROUPAIT l'affichage (carte, liste) : deux
//                     annonces du même employeur sous des noms voisins tombaient sur une
//                     seule épingle. Une erreur ici coûtait un regroupement discutable.
//
//   `memeEmployeur` — ÉGALITÉ après normalisation (accents, casse, forme juridique).
//                     DÉCIDAIT des données : quelle position sert à mesurer une distance,
//                     quel employeur n'a plus besoin d'être géocodé.
//
// La distinction n'était pas théorique — elle a été violée le jour même où ce fichier a été
// écrit. `positionDe` employait `apparier`, et `lib/distances.ts` s'en servait pour ÉCRIRE
// la distance et la note. Mesuré : `apparier("Robert", "Groupe Robert")` est VRAI, donc une
// offre d'un employeur nommé « Robert » aurait reçu en silence la position de « Groupe
// Robert » — deux entreprises sans le moindre rapport.
//
// ADR-0022 est allé plus loin : l'AFFICHAGE utilise désormais `memeEmployeur` LUI AUSSI
// (via `cleGroupement`, ci-dessous), pas `apparier`. Deux raisons. (1) `apparier` était en
// O(n) par recherche — ré-allouer la liste des clés et re-normaliser les deux côtés à
// chaque comparaison, mesuré à 1 900 ms sur un corpus de forme production — alors qu'une
// égalité de clé normalisée est du O(1) natif (`Map.get`), sans structure auxiliaire.
// (2) Le flou d'`apparier` groupait AUSSI ce qu'il n'aurait pas dû : le même défaut qui
// avait fait fusionner « Robert » et « Groupe Robert » côté données existait côté affichage
// depuis le début, personne ne l'avait remarqué parce qu'un regroupement visuel se corrige
// à l'œil — mais il reste faux.
//
// `apparier` SURVIT pour un usage distinct et légitime : une comparaison de PROOFREADING,
// large exprès (`tests/reference.test.ts` — « ai-je oublié une cible pour cet employeur,
// même sous un nom approximatif ? »). Là, un faux positif coûte un coup d'œil humain ; en
// grouper d'affichage ou en données, il coûtait une fusion silencieuse.
//
// RÈGLE : une heuristique peut SIGNALER ce qu'on REGARDE, jamais décider ce qu'on GROUPE ni
// ce qu'on ÉCRIT. Ce n'est de toute façon pas une résolution d'identité d'entreprise — il
// n'y a ici ni registre ni numéro d'entreprise, et `apparier` se trompera un jour.
//
// ADR-0023 (2026-09-21) : deux cas où même `memeEmployeur` (strict) ne rapprochait pas deux
// noms d'un même employeur — un qualificatif de pays/lieu (« STERIS Canada », « Exo-s
// Saint-Damien »), pas une forme juridique. Pas de troisième règle : `normaliserNomEmployeur`
// consulte `ALIAS_EMPLOYEUR`, une liste FERMÉE de faits vérifiés (jamais une règle de
// rapprochement géographique, qui se tromperait comme `apparier`).

/**
 * En deçà de cette longueur, seule l'égalité stricte apparie.
 *
 * Sans ce plancher, un sigle de deux ou trois lettres apparierait la moitié de la liste par
 * sous-chaîne — c'est le piège classique du rapprochement par `includes`, et il ne se voit
 * qu'une fois le mal fait. La contrepartie est assumée : « ISS » et « ISS Facility
 * Services » restent deux entrées distinctes.
 */
export const LONGUEUR_MIN_APPARIEMENT = 4;

/** Deux noms d'entreprise désignent-ils le même employeur, au sens LARGE ? Voir l'en-tête. */
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
 * Paires CONNUES d'un même employeur sous deux noms qu'aucune règle syntaxique ne rapproche
 * (ni suffixe juridique, ni casse/accent) — ADR-0023.
 *
 * ⚠️ CE N'EST PAS UNE HEURISTIQUE, ET C'EST LA DISTINCTION QUI COMPTE. `apparier` se trompe
 * un jour sur un cas qu'il n'a jamais vu (`apparier("Robert", "Groupe Robert")` est vrai) ;
 * une entrée ICI est un FAIT vérifié à la main avant d'entrer dans la table, exactement le
 * patron déjà accepté pour `SUFFIXES_CORPORATIFS` — sauf qu'un suffixe est une classe fermée
 * énumérable d'avance, alors qu'un alias d'entreprise s'ajoute un par un, au fil des cas
 * RENCONTRÉS réellement (audit `SEED` × `ENTREPRISES_CIBLES`), jamais devinés à l'avance.
 * Chaque entrée nouvelle se vérifie par le même audit AVANT d'être ajoutée (protocole §11).
 *
 * Volontairement PETITE : une table qui grossit sans être relue redevient une heuristique
 * qu'on cesse de vérifier — voir le test dédié qui la garde sous une borne haute.
 */
export const ALIAS_EMPLOYEUR: ReadonlyMap<string, string> = new Map([
  ["steris canada", "steris"],
  ["exo-s saint-damien", "exo-s"],
]);

/**
 * La forme canonique d'une raison sociale : accents, casse, ponctuation, forme juridique et
 * alias connu retirés. « Laserax inc. » et « LASERAX » y arrivent tous deux à « laserax » ;
 * « STERIS Canada » et « STERIS » y arrivent tous deux à « steris » (`ALIAS_EMPLOYEUR`).
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
  // Après le retrait des suffixes : un alias vise la forme déjà nettoyée, jamais le nom brut.
  return ALIAS_EMPLOYEUR.get(n) ?? n;
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
 * La clé de regroupement d'un employeur — MÊME identité que `memeEmployeur`, en O(1).
 *
 * ⚠️ POURQUOI ELLE EXISTE, ET PAS UN INDEX (ADR-0022). Une égalité (contrairement à une
 * sous-chaîne) se prête à une clé de `Map` native : `cleGroupement(a) === cleGroupement(b)`
 * ⟺ `memeEmployeur(a, b)`, sans structure auxiliaire ni boucle de recherche. C'est ce qui
 * rend le regroupement de la carte et de la liste O(1) par offre, pas seulement plus rapide
 * que la version substring qu'elles employaient avant.
 *
 * ⚠️ LE SECOURS EXISTE PARCE QUE `memeEmployeur` REFUSE D'ÉGALER DEUX CHAÎNES VIDES —
 * délibérément, ci-dessus. Une clé de `Map`, elle, ne peut pas « refuser » : la chaîne vide
 * SERAIT une clé comme une autre, et deux offres à l'entreprise vide fusionneraient en
 * silence — une affirmation qu'on n'a pas le droit de faire (garde-fou n°3, no fake data).
 * `secours` — un identifiant déjà unique à l'appelant (l'id de l'offre, par exemple) — sert
 * de clé de repli SEULEMENT dans ce cas, pour que chaque nom vide reste son PROPRE groupe.
 */
export function cleGroupement(nom: string, secours: string): string {
  const forme = normaliserNomEmployeur(nom);
  return forme === "" ? `\u0000${secours}` : forme;
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
