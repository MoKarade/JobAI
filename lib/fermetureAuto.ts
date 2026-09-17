// lib/fermetureAuto.ts — fermer tout seul ce qu'aucun balayage ne peut confirmer.
//
// Demande de Marc (2026-09-14) : « quasi toutes les offres sont à vérifier, mais je veux
// pas revérifier manuellement, je veux que tu le mettes en place ».
//
// ── CE QUE LA MESURE A MONTRÉ ────────────────────────────────────────────────────────
//
// `resume_suivi` en production, le 2026-09-14 : 1 593 offres vivantes, dont **1 572
// confirmées** par un balayage et **21 jamais vues**, toutes âgées de 30 à 90 jours. La
// veille tourne (la plus ancienne « dernière vue » date de 4 jours). Ce n'est donc pas la
// veille qui est en panne : ce sont ces 21 offres-là qui ne peuvent PAS se fermer seules,
// parce que `appliquerBalayage` ne compte d'absences que pour ce qu'il a déjà vu lui-même.
//
// ⚠️ ET CETTE GARDE-LÀ RESTE. Elle protège du vrai danger : une offre absente d'une requête
// n'est pas une offre fermée. Ce module ne la contourne pas — il répond à une AUTRE
// question. Pas « la requête l'a-t-elle vue ? » (le silence d'une requête ne prouve rien)
// mais « cette annonce a-t-elle dépassé l'âge auquel les annonces de CE marché ferment ? ».
// Le silence ne se mesure pas ; l'âge, si.
//
// ── LE SEUIL SE MESURE, IL NE SE CHOISIT PAS ─────────────────────────────────────────
//
// `lib/dureeVie.ts` estime déjà la survie des offres (Kaplan-Meier, censure comprise). On
// lui demande l'âge auquel il ne reste plus qu'une petite part des annonces en ligne, et
// c'est ce chiffre-là qui ferme. Écrire « 60 jours » ici aurait été une politique inventée,
// fausse le jour où le marché change de rythme et que personne ne relit la constante.
//
// Quand la mesure ne suffit pas — trop peu de fermetures observées, ou une courbe qui ne
// descend jamais assez bas — ce module rend `null` et NE FERME RIEN. Échec fermé : on ne
// ferme que ce qu'on peut justifier par une mesure.
//
// ── LA GARDE QUI COMPTE : UN JOURNAL PERDU NE DOIT ACCUSER PERSONNE ──────────────────
//
// Le journal de veille est un seul JSON dans une ligne d'état. S'il est perdu ou écrit à
// moitié, TOUTES les offres deviennent « jamais confirmées » d'un coup — et un module qui
// lirait cette absence comme une preuve archiverait le suivi entier en une passe. C'est la
// panne du 2026-08-12 (un balayage aveugle qui périmait 40 offres) multipliée par quarante.
// D'où `journalPlausible` : tant que le balayage n'a pas confirmé la MAJORITÉ du suivi
// vivant, on ne sait rien du suivi dans son ensemble, et on n'a rien à y fermer.

import { survie, observer, joursEntre, MINIMUM_GROUPE } from "./dureeVie";
import type { Offre } from "./types";
import type { JournalVeille } from "./veille";

/**
 * Part d'offres encore en ligne au-delà de laquelle on considère qu'une annonce a vécu.
 *
 * Un dixième : on ferme au point où la mesure dit que neuf annonces sur dix ont disparu.
 * Ce n'est pas une certitude, et ça ne peut pas en être une sans rouvrir chaque lien —
 * c'est le meilleur compromis qu'une mesure autorise, et il est réversible (Marc rouvre
 * depuis les archives, où l'offre garde son lien et sa recherche web).
 */
export const PART_SURVIE_RESIDUELLE = 0.1;

/**
 * Fermetures réellement observées en dessous desquelles la courbe ne conclut rien.
 *
 * ⚠️ DÉRIVÉ de `MINIMUM_GROUPE`, le seuil que `lib/dureeVie.ts` s'impose déjà pour publier
 * une médiane par groupe. Deux chiffres différents pour « assez d'observations pour parler »
 * finiraient par se contredire : l'écran dirait « trop peu de données » pendant que ce
 * module fermerait des offres sur ces mêmes données.
 */
export const MIN_FERMETURES_OBSERVEES = MINIMUM_GROUPE;

/**
 * Le journal couvre-t-il assez du suivi pour qu'une ABSENCE y veuille dire quelque chose ?
 * PURE.
 *
 * ⚠️ « La majorité » n'est pas un seuil choisi au jugé, c'est l'énoncé de la règle : si le
 * balayage n'a pas confirmé plus de la moitié des offres vivantes, l'état du suivi est
 * inconnu DANS SON ENSEMBLE — et l'absence d'une offre du journal ne dit alors rien d'elle,
 * elle dit quelque chose du journal. Mesuré le 2026-09-14 : 1 572 sur 1 593, soit 98,7 %.
 * Un journal perdu donne 0 %, et tout ce qui dépend de cette fonction s'abstient.
 *
 * Un suivi VIDE rend `false` : il n'y a rien à confirmer, donc rien à conclure.
 */
export function journalPlausible(
  offres: readonly Offre[],
  journal: Readonly<JournalVeille>,
): boolean {
  const vivantes = offres.filter((o) => !o.histo && o.perimeeLe === null);
  if (vivantes.length === 0) return false;
  const confirmees = vivantes.filter((o) => journal[o.id] !== undefined).length;
  return confirmees * 2 > vivantes.length;
}

/**
 * L'âge à partir duquel une annonce jamais confirmée est réputée fermée. PURE.
 *
 * `null` = la mesure ne permet pas de conclure, donc on ne ferme rien. Trois raisons
 * distinctes, et toutes rendent `null` : pas assez de fermetures observées, une courbe qui
 * ne descend jamais sous la part résiduelle, ou aucune observation du tout.
 *
 * @param plancher Âge sous lequel on ne ferme jamais, quoi que dise la courbe — passé par
 *                 l'appelant pour rester dérivé de la patience de la veille plutôt que
 *                 réinventé ici.
 */
export function seuilFermetureJours(
  offres: readonly Offre[],
  journal: Readonly<JournalVeille>,
  plancher: number,
  metiers: readonly string[] = [],
): number | null {
  const { observations } = observer(offres, journal, metiers);
  const s = survie(observations);
  if (s.fermees < MIN_FERMETURES_OBSERVEES) return null;
  const point = s.courbe.find((p) => p.part <= PART_SURVIE_RESIDUELLE);
  if (point === undefined) return null;
  return Math.max(point.jours, plancher);
}

/** Une offre que la passe ferme d'office, et de quoi le dire à Marc. */
export interface FermetureAuto {
  id: string;
  entreprise: string;
  poste: string;
  /** Jours écoulés depuis le repérage — la seule preuve qu'on ait. */
  jours: number;
}

export interface ResultatFermetureAuto {
  /** Ce qui se ferme. Vide quand une garde a refusé — voir `motifAbstention`. */
  fermetures: FermetureAuto[];
  /**
   * Pourquoi rien ne se ferme, quand rien ne se ferme. `null` quand la règle a pu s'appliquer
   * (y compris si elle n'a trouvé aucune offre à fermer — « rien à faire » et « je n'avais
   * pas le droit de regarder » sont deux situations opposées).
   */
  motifAbstention: string | null;
  /** Le seuil d'âge retenu, en jours. `null` si la mesure n'a pas conclu. */
  seuilJours: number | null;
}

/**
 * Ce que la passe doit fermer d'office. PURE.
 *
 * ⚠️ QUATRE GARDES, ET CHACUNE REFUSE POUR UNE RAISON DIFFÉRENTE — c'est ce qui permet de
 * dire dans le rapport POURQUOI rien ne s'est fermé, au lieu d'un silence qu'on lirait
 * comme « rien à faire ».
 *
 *   1. la passe n'a rien vu ⇒ elle n'a rien confirmé, donc rien gagné le droit de fermer ;
 *   2. le journal ne couvre pas la majorité du suivi ⇒ c'est lui qui est en panne ;
 *   3. la mesure de survie ne conclut pas ⇒ aucun seuil justifiable.
 *
 * ⚠️ ET PAS DE GARDE SUR LA COUVERTURE DU BASSIN, VOLONTAIREMENT — c'est la garde que le
 * voisin immédiat (`estPerimable`) a et que celle-ci n'a pas, donc elle se justifie par
 * écrit. `couvertureComplete` répond à « la passe a-t-elle relancé TOUS les termes, de sorte
 * qu'une absence veuille dire quelque chose ? ». C'est décisif pour une offre que le
 * balayage A DÉJÀ VUE : elle a été trouvée par un terme, et si ce terme n'a pas tourné, son
 * absence ne prouve rien. Ça ne dit RIEN d'une offre que le balayage n'a JAMAIS vue : aucun
 * terme ne l'a jamais trouvée, complète ou pas. Ce qui la ferme ici n'est pas un silence,
 * c'est un ÂGE mesuré contre la survie observée — une grandeur que la couverture du jour ne
 * touche pas. La garder aurait eu l'air prudent et aurait surtout été INOPÉRANT : mesuré le
 * 2026-09-14, aucun lot n'a été déposé depuis le 2026-08-21, donc la source dépôt rend
 * `couvertureComplete: false` et la règle n'aurait JAMAIS tiré — un mécanisme livré vert,
 * testé, et mort à l'arrivée.
 *
 * ⚠️ ET ON NE FERME JAMAIS PLUS QUE CE QUE LA PASSE VIENT DE CONFIRMER. Une passe qui a vu
 * 1 300 offres a montré qu'elle fonctionne ; une passe qui en a vu trois n'a rien montré du
 * tout. La borne se dérive donc du travail réellement fait, jamais d'un nombre rond.
 *
 * ⚠️ ET ON NE TOUCHE JAMAIS À CE QUE MARC A TRAVAILLÉ. Une offre dont il a changé le statut,
 * posé la date d'envoi ou écrit une note n'est plus du stock : c'est sa candidature. Elle
 * reste, quel que soit son âge — les archiver serait exactement le garde-fou n°2 contourné
 * par la bande (on n'écrit pas ses champs, mais on efface le contexte qui les porte).
 */
export function fermeturesAutomatiques(params: {
  offres: readonly Offre[];
  journal: Readonly<JournalVeille>;
  aujourdhui: string;
  /** Combien d'offres cette passe a réellement vues. */
  vues: number;
  /** Plancher d'âge, dérivé de la patience de la veille par l'appelant. */
  plancherJours: number;
  metiers?: readonly string[];
}): ResultatFermetureAuto {
  const { offres, journal, aujourdhui, vues, plancherJours } = params;

  if (vues <= 0) {
    return {
      fermetures: [],
      motifAbstention: "aucune offre vue : la passe n'a rien confirmé",
      seuilJours: null,
    };
  }
  if (!journalPlausible(offres, journal)) {
    return {
      fermetures: [],
      motifAbstention:
        "journal de veille trop maigre : il ne couvre pas la majorité du suivi, c'est lui qu'il faut regarder",
      seuilJours: null,
    };
  }

  const seuil = seuilFermetureJours(offres, journal, plancherJours, params.metiers ?? []);
  if (seuil === null) {
    return {
      fermetures: [],
      motifAbstention: "durée de vie pas encore mesurable : aucun seuil justifiable",
      seuilJours: null,
    };
  }

  const candidates: FermetureAuto[] = [];
  for (const o of offres) {
    if (o.histo || o.perimeeLe !== null) continue;
    if (journal[o.id] !== undefined) continue;
    if (marcYATouche(o)) continue;
    const jours = joursEntre(o.dateReperage, aujourdhui);
    // `null` = date illisible. Elle ne prouve PAS qu'une offre est vieille : on passe.
    if (jours === null || jours < seuil) continue;
    candidates.push({ id: o.id, entreprise: o.entreprise, poste: o.poste, jours });
  }

  // Les plus vieilles d'abord : si la borne mord, ce sont celles dont la fermeture est la
  // mieux justifiée qui partent, jamais un lot arbitraire.
  candidates.sort((a, b) => b.jours - a.jours);

  return { fermetures: candidates.slice(0, vues), motifAbstention: null, seuilJours: seuil };
}

/**
 * Marc a-t-il travaillé cette offre ? PURE.
 *
 * Les trois signaux sont ceux de `USER_OWNED_FIELDS` qui prouvent un GESTE — la priorité en
 * est exclue à dessein : elle a une valeur par défaut, donc elle ne distingue rien.
 */
function marcYATouche(o: Offre): boolean {
  return o.statut !== "Identifiee" || o.dateEnvoi.trim() !== "" || o.userNote.trim() !== "";
}
