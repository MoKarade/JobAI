// lib/fraicheur.ts — depuis quand personne n'a vu cette offre ?
//
// Demande de Marc (2026-09-14) : « ça m'étonne, certaines devraient être périmées ».
//
// MESURÉ le 2026-09-14, et le diagnostic est net : les offres du suivi qui paraissent trop
// vieilles pour être encore ouvertes sont EXACTEMENT les 38 offres du jeu de départ
// (`lib/seed.ts`), saisies à la main entre le 2026-02-25 et le 2026-07-30. Aucune n'est
// jamais entrée dans le journal de veille, et `appliquerBalayage` ne compte d'absences que
// pour ce qu'il a déjà vu lui-même. Elles sont donc, par construction, INPÉRIMABLES.
//
// ⚠️ ET CETTE PROTECTION EST JUSTE — ce n'est pas elle qu'il faut retirer. Elle existe parce
// qu'une offre absente d'une requête Indeed ne prouve rien : périmer sur ce silence
// détruirait le travail le plus fiable du jeu (voir l'en-tête de `lib/veille.ts`). La
// question posée ici est AUTRE : pas « la requête l'a-t-elle vue ? » mais « depuis combien
// de temps personne, requête ou humain, n'a constaté sa présence ? ». Le silence d'un
// balayage ne se mesure pas ; l'ÂGE d'un constat, si.
//
// ⚠️ CE MODULE NE PÉRIME RIEN, ET C'EST UN CHOIX, PAS UN OUBLI. Les offres concernées sont
// les MIEUX NOTÉES du suivi (88, 85, 84, 82, 80…) : les archiver automatiquement sur leur
// seul âge retirerait à Marc ses meilleures pistes sur une supposition, et l'inverse exact
// de ce qu'il demande — il veut CLIQUER pour vérifier, pas qu'on décide à sa place. Le
// garde-fou n°3 exige qu'une offre dont on ne sait plus si elle est active ne soit « jamais
// présentée comme ouverte » : elle ne l'est plus, elle est présentée avec son âge et l'aveu
// qu'aucun balayage ne l'a confirmée. C'est l'information qui manquait, pas l'archivage.

import { joursEntre } from "./dureeVie";
import type { Offre } from "./types";
import { SEUIL_ABSENCES_PEREMPTION, type SuiviVeille } from "./veille";

/**
 * Au-delà de combien de jours sans constat le silence devient-il une information.
 *
 * ⚠️ DÉRIVÉ, JAMAIS CHOISI. C'est la patience que la veille s'accorde déjà avant de périmer
 * une offre qu'elle a vue disparaître. Une offre que PERSONNE n'a confirmée depuis plus
 * longtemps que ça est une offre dont l'app ne peut plus répondre — le dire est la seule
 * position honnête. Écrire un nombre rond ici en ferait une politique inventée, et le lien
 * avec la veille se perdrait au premier rajustement du seuil.
 */
export const JOURS_AVANT_DOUTE = SEUIL_ABSENCES_PEREMPTION;

/**
 * Le mot porté par la pastille, quand il n'y a pas la place pour la phrase.
 *
 * ⚠️ « À VÉRIFIER », PAS « PÉRIMÉE » NI « ANCIENNE ». « Périmée » affirmerait une fermeture
 * que personne n'a constatée ; « ancienne » ne dit que l'âge, or l'âge n'est pas le
 * problème — une offre vue hier peut dater de trois mois. Ce que l'app sait vraiment, c'est
 * qu'elle ne peut pas répondre : le mot le dit, et il désigne le geste (le second lien de
 * la carte, juste en dessous, ouvre la recherche qui tranche).
 *
 * Écrit ICI et pas dans les composants : la carte et la fiche doivent dire le même mot, et
 * deux copies auraient divergé au premier remaniement.
 */
export const MOT_DOUTE = "à vérifier";

/** Ce que l'écran a le droit d'affirmer sur la fraîcheur d'une offre. */
export interface Fraicheur {
  /** Jours depuis le dernier constat de présence (repérage, faute de balayage). */
  jours: number;
  /** La phrase à afficher, déjà accordée. */
  libelle: string;
}

/**
 * La fraîcheur à AFFICHER, ou `null` quand il n'y a rien à dire. PURE.
 *
 * `null` dans trois cas, et chacun pour une raison distincte :
 *   · une candidature historique (2025) — aucun balayage ne la concerne, son âge n'est pas
 *     une information, c'est sa nature ;
 *   · une offre déjà périmée — l'écran le dit déjà, et deux signaux pour un fait se
 *     neutralisent (leçon de l'épure du 2026-08-05) ;
 *   · une offre que la veille SUIT — c'est elle qui décide, avec un mécanisme qui compte de
 *     vraies absences. Doubler son verdict par un âge inventerait un second avis.
 *
 * @param aujourdhui Date du jour, AAAA-MM-JJ, dans le fuseau de Marc. PARAMÈTRE : la
 *                   fonction ne lit jamais l'horloge, sinon le passage de minuit est
 *                   intestable et Vercel — qui tourne en UTC — daterait du lendemain.
 */
export function fraicheurOffre(
  offre: Pick<Offre, "histo" | "perimeeLe" | "dateReperage">,
  suivi: SuiviVeille | undefined,
  aujourdhui: string,
): Fraicheur | null {
  if (offre.histo) return null;
  if (offre.perimeeLe !== null) return null;
  if (suivi) return null;

  const jours = joursEntre(offre.dateReperage, aujourdhui);
  // ⚠️ `joursEntre` rend NaN sur une date malformée, pas 0 : son garde teste `undefined`,
  // or `"pas-une-date".split("-").map(Number)` rend trois NaN, qui ne sont pas `undefined`.
  // Mesuré en écrivant le test ci-contre. Sans cette ligne, l'écran afficherait « repérée
  // il y a NaN jours » — un doute fabriqué, affiché avec l'autorité d'une mesure. On se
  // TAIT plutôt : une date illisible n'autorise à affirmer ni la fraîcheur, ni le doute.
  // (Le défaut de `joursEntre` lui-même est au BACKLOG — il n'appartient pas à ce lot.)
  if (!Number.isFinite(jours)) return null;
  if (jours < JOURS_AVANT_DOUTE) return null;

  return {
    jours,
    libelle: `repérée il y a ${jours} jours, jamais revue par un balayage`,
  };
}

/**
 * La fraîcheur de chaque offre qui a quelque chose à dire, par identifiant. PURE.
 *
 * Rendue comme une carte plutôt qu'en calculant dans le composant : `CarteOffre` est un
 * composant CLIENT, et le journal de veille est un état SERVEUR. Le calculer côté serveur
 * une fois évite d'ouvrir une route pour un libellé — et laisse la règle testable sans DOM.
 *
 * Les offres sans rien à dire sont ABSENTES de la carte, jamais présentes avec une valeur
 * nulle : un consommateur qui lit `carte[id]` obtient alors `undefined`, et le libellé ne
 * s'affiche pas. Une entrée « vide » se serait mise à s'afficher au premier oubli de garde.
 */
export function fraicheursDuSuivi(
  offres: readonly Offre[],
  journal: Readonly<Record<string, SuiviVeille>>,
  aujourdhui: string,
): Record<string, Fraicheur> {
  const carte: Record<string, Fraicheur> = {};
  for (const o of offres) {
    const f = fraicheurOffre(o, journal[o.id], aujourdhui);
    if (f) carte[o.id] = f;
  }
  return carte;
}
