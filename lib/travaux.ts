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
  placeGoogleId: string | null;
  detailsLe: Date | null;
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
 * Délai avant de retenter la POSITION d'une entreprise posée au centre de sa ville.
 *
 * Plus long que pour l'adresse, et pour deux raisons : une entreprise absente
 * d'OpenStreetMap aujourd'hui n'y sera pas demain, et il y en a plusieurs dizaines — les
 * retenter chaque jour serait un filet d'appels permanent vers un service bénévole pour
 * une réponse qui ne change presque jamais. Une semaine laisse le temps qu'une fiche soit
 * créée, sans marteler.
 */
export const DELAI_RETENTE_POSITION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cette entreprise est-elle posée au centre-ville faute de mieux, et assez ancienne pour
 * qu'on retente de la situer vraiment ?
 *
 * ⚠️ C'EST LE CHEMIN DE RATTRAPAGE DE LA RÈGLE DE RÉSOLUTION, et il est indispensable.
 * Les deux passes de géocodage écartent ce qui est DÉJÀ situé — or un repli au centre-ville
 * EST situé. Améliorer la façon de résoudre une entreprise ne profiterait donc qu'aux
 * nouvelles, et les dizaines déjà posées au centre-ville y resteraient à vie. C'est mot
 * pour mot ce qui est arrivé à `ville`, puis à `adresse` : une règle (ou une colonne) qui
 * arrive après coup se livre AVEC ce qui la rattrape, jamais « plus tard ».
 */
export function positionARaffiner(l: LieuTravail, maintenant: Date): boolean {
  if (l.precision !== "ville") return false;
  return maintenant.getTime() - l.geocodeLe.getTime() >= DELAI_RETENTE_POSITION_MS;
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

/**
 * Faut-il enrichir cette fiche (site, téléphone, horaires) via Google Places ?
 *
 * [CARTE-03-PLACES], 2026-08-12. Même logique « une fois par lieu » que `bornesAMesurer` :
 * un site web ne change pas d'un jour à l'autre. Scopé aux entreprises qui ONT un
 * `placeGoogleId` — sans lui, il n'y a rien à interroger (voir migration 0016).
 */
export function detailsAEnrichir(l: LieuTravail): boolean {
  return l.placeGoogleId !== null && l.detailsLe === null;
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
  if (lieux.some((l) => positionARaffiner(l, maintenant))) return true;
  if (lieux.some(bornesAMesurer)) return true;
  return lieux.some(detailsAEnrichir);
}

/**
 * L'horodatage qui veut dire « à réessayer tout de suite ».
 *
 * ⚠️ ELLE NE PEUT PAS VIVRE DANS `lib/actions.ts`, et le build l'a prouvé : ce module est
 * `"use server"`, donc il ne peut EXPORTER que des fonctions asynchrones. Y ajouter une
 * constante casse la collecte des pages avec un message qui ne nomme ni le fichier ni la
 * cause (« Failed to collect page data »). Elle vit donc ici, avec les autres décisions
 * pures que les deux côtés partagent.
 *
 * POURQUOI ON REMET UNE DATE À ZÉRO. `positionARaffiner` attend un délai depuis la dernière
 * tentative, calibré sur une question dont la réponse ne change pas (« OSM connaît-il cette
 * entreprise ? »). Quand on vient d'acquérir une ADRESSE, la question change : le raffinage
 * la posera à la place du nom. Laisser l'horodatage en l'état ferait attendre une semaine à
 * une information déjà en main.
 */
export const EPOQUE_A_RETENTER = new Date(0);
