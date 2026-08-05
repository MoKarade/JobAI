// lib/travaux.ts — reste-t-il quelque chose à faire ?
//
// UN SEUL ENDROIT DÉCIDE, ET C'EST TOUT L'INTÉRÊT DU FICHIER
// Trois déclencheurs appellent la même passe de fond : l'accueil, la carte, et le cron. Tant
// que chacun jugeait dans son coin, ils ne jugeaient pas la même chose — et c'est ce qui a
// affamé le rattrapage des adresses.
//
// ⚠️ LE DÉFAUT QU'ON CORRIGE ICI, ET COMMENT MARC L'A DÉCRIT
// « J'ai toujours pas toutes les adresses, pourtant les trajets Maps marchent. » Les deux
// moitiés de la phrase étaient LIÉES, et c'était la clé : les pages déclenchaient la passe
// sur « une offre n'a pas de distance ». Ce gate se referme dès que toutes les distances
// sont mesurées — donc dès que les trajets marchent. Or le rattrapage des adresses et la
// mesure des bornes vivent DANS cette même passe : une fois les distances faites, plus rien
// ne les appelait, et il ne restait que le cron nocturne, six entreprises par nuit. « Ça
// marche mais ça n'avance pas » n'était pas une impression : le seul moteur restant tournait
// une fois par jour.
//
// La leçon en toutes lettres : quand une passe fait PLUSIEURS travaux, son déclencheur doit
// couvrir CHACUN d'eux. Un gate calibré sur le premier travail fini affame tous les autres,
// et le symptôme — « ça marche, mais il en manque toujours » — ne désigne jamais le gate.
//
// Fonctions PURES : aucun accès à la base, l'instant est un paramètre. C'est ce qui permet
// à la requête SQL et au gate d'une page d'appliquer littéralement la MÊME règle.

/** Ce dont la décision a besoin — volontairement le strict minimum. */
export interface LieuTravail {
  precision: "exacte" | "ville";
  adresse: string | null;
  bornesLe: Date | null;
  geocodeLe: Date;
}

/** Ce que la décision a besoin de savoir d'une offre. */
export interface OffreTravail {
  histo: boolean;
  perimeeLe: string | null;
  km: number | null;
}

/**
 * Délai avant de retenter une adresse introuvable.
 *
 * Sans lui, le gate ne se refermerait JAMAIS pour une entreprise qu'OpenStreetMap ne
 * connaît pas sous ce nom : elle resterait « à rattraper » à vie, et chaque affichage de la
 * carte relancerait une passe pour redemander ce qui ne viendra pas. Nominatim est un
 * service bénévole ; une question sans réponse se repose une fois par jour, pas toutes les
 * cinq minutes.
 *
 * Le compteur est `geocodeLe`, marqué à CHAQUE tentative, réussie ou non — c'est déjà ce
 * qui fait tourner la file.
 */
export const DELAI_RETENTE_ADRESSE_MS = 24 * 60 * 60 * 1000;

/**
 * Cette entreprise attend-elle une adresse ?
 *
 * Seules les positions EXACTES : sur un repli au centre de la ville, l'adresse rendue serait
 * celle de la municipalité posée sur l'épingle d'une usine — une donnée plausible et fausse,
 * ce qu'interdit le garde-fou n°3.
 */
export function adresseARattraper(l: LieuTravail, maintenant: Date): boolean {
  if (l.precision !== "exacte") return false;
  if (l.adresse !== null) return false;
  return maintenant.getTime() - l.geocodeLe.getTime() >= DELAI_RETENTE_ADRESSE_MS;
}

/**
 * Faut-il regarder les bornes de recharge autour de cette entreprise ?
 *
 * Une seule fois par lieu, quel que soit le résultat : les bornes ne poussent pas du jour au
 * lendemain. C'est `bornesLe` qui porte cette mémoire — et une interrogation en ÉCHEC ne le
 * pose pas, si bien que la ligne repasse. « Jamais mesuré » n'est pas « aucune borne ».
 */
export function bornesAMesurer(l: LieuTravail): boolean {
  return l.bornesLe === null;
}

/** Cette offre attend-elle sa distance ? Les historiques et les périmées, non. */
export function distanceAMesurer(o: OffreTravail): boolean {
  return !o.histo && o.perimeeLe === null && o.km === null;
}

/**
 * Le gate des trois déclencheurs.
 *
 * ⚠️ Il DOIT converger : chaque terme s'éteint quand son travail est fait, sinon une page
 * relancerait une passe à chaque affichage sans que rien ne progresse. C'est pourquoi le
 * terme des adresses porte un délai de retente plutôt qu'un simple « adresse manquante ».
 */
export function resteDuTravail(
  offres: readonly OffreTravail[],
  lieux: readonly LieuTravail[],
  maintenant: Date,
): boolean {
  if (offres.some(distanceAMesurer)) return true;
  if (lieux.some((l) => adresseARattraper(l, maintenant))) return true;
  return lieux.some(bornesAMesurer);
}
