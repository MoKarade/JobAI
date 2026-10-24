// lib/signauxEmployeur.ts — ce que le suivi sait DÉJÀ d'un employeur, sans rien chercher d'autre.
//
// Demande (JobAI#159, plan « analyse du CV et dossier employeur », étape B1) : afficher, pour
// chaque entreprise, depuis combien de temps ses offres sont ouvertes, si elle republie les
// mêmes postes, et combien d'offres elle a d'ouvertes. Tout se tire des offres suivies et du
// journal de veille : aucune source de plus, aucun appel IA, aucun scraping (garde-fous 3 et 4).
//
// ⚠️ CINQ HONNÊTETÉS, DONT TROIS VIENNENT DE `lib/dureeVie.ts` ET SONT REPRISES TELLES QUELLES
// (une règle écrite deux fois est une règle et demie) :
//
//   1. UNE DURÉE EST CELLE QU'ON A VUE. `premiereVue` est le jour où NOTRE balayage a trouvé
//      l'offre, jamais le jour de sa publication : « ouverte depuis au moins N jours », pas
//      « depuis N jours ». On s'arrête à la dernière vue, jamais au constat de péremption.
//   2. UNE OFFRE SANS LIGNE DE JOURNAL N'A PAS DE DURÉE. Saisie à la main ou jamais revue, elle
//      compte parmi les offres ouvertes mais n'entre dans aucune durée : inventer un jour de
//      première vue serait un chiffre fabriqué.
//   3. UNE MÉDIANE SE TIENT À UN EFFECTIF. Trois offres fermées au minimum, sinon pas de
//      médiane (deux offres de plus la déplaceraient de moitié) ; le nombre de fermées reste dit.
//   4. UNE ANNONCE COMPTE POUR UNE OFFRE (JobAI#195). Le Guichet renomme parfois l'employeur d'une annonce : elle entre
//      alors deux fois dans le suivi, sous deux noms. Les copies d'un même numéro d'annonce forment UNE offre ; sa durée
//      court de la première vue de ses copies à leur dernière vue. Le suivi, lui, n'est pas touché.
//   5. UNE « REPUBLICATION » EST UN INTITULÉ REPRIS, PAS UNE PREUVE. Le Guichet republie un
//      poste sous un nouveau numéro, mais un employeur peut aussi ouvrir deux postes vraiment
//      distincts sous le même titre. Le module compte donc des INTITULÉS REPRIS (même employeur,
//      même titre une fois accents, casse et ponctuation écartés) et l'écran les nomme ainsi.
//
// Fonctions PURES : le journal et les offres sont des paramètres, aucune horloge.

import { copiesParAnnonce, representante } from "./doublonsAnnonce";
import { joursEntre } from "./dureeVie";
import { cleEnseigne } from "./enseigne";
import type { Offre } from "./types";
import type { JournalVeille } from "./veille";

/** Effectif minimal d'offres FERMÉES pour qu'une médiane soit publiée. */
export const MINIMUM_FERMEES_MEDIANE = 3;

/**
 * Un jour de BALAYAGE LARGE est un jour où le journal reçoit au moins ce multiple du nombre habituel de premières vues par jour
 * (JobAI#261). [Supposition : 10 est un seuil de bon sens, non calibré ; mesuré le 2026-10-24, la médiane est de l'ordre de 30 par
 * jour, les deux pics sont à 1 392 et 4 550 et le plus fort jour ordinaire à 226.]
 */
const FACTEUR_BALAYAGE_LARGE = 10;

/** Nombre minimal de jours distincts au journal pour dire ce qu'est un jour habituel : en deçà, aucun jour n'est dit « large ». */
const MINIMUM_JOURS_POUR_HABITUEL = 7;

/** Combien d'intitulés repris l'écran montre au plus. */
const MAX_INTITULES_REPRIS = 3;

interface IntituleRepris {
  /** L'intitulé tel qu'écrit sur la première offre rencontrée. */
  intitule: string;
  /** Combien d'offres suivies le portent (au moins 2). */
  fois: number;
}

export interface SignauxEmployeur {
  /** Offres suivies de cet employeur, hors historique 2025. */
  offres: number;
  /** Offres réputées ouvertes (`perimeeLe` nul). */
  ouvertes: number;
  /** Offres constatées périmées. */
  fermees: number;
  /**
   * L'offre ouverte la plus ancienne ayant une ligne de journal : jours entre la première et
   * la dernière vue (un MINIMUM), et le jour de première vue. `null` si aucune n'a de ligne.
   */
  plusAncienneOuverte: { jours: number; repereeLe: string } | null;
  /**
   * La même, mais parmi les offres ouvertes dont on a VU l'apparition : celles dont la première vue tombe APRÈS le premier jour de la
   * veille ET un jour qui n'est pas de balayage large (`joursDeBalayageLarge`, JobAI#261). Une offre déjà là ce jour-là a une durée tronquée (« depuis qu'on regarde », pas « depuis qu'elle existe ») : elle ne
   * prouve rien sur l'employeur (JobAI#161, réglage du 2026-10-21 demandé par Marc). `null` si aucune n'en remplit la condition.
   */
  plusAncienneOuverteMesurable: { jours: number; repereeLe: string } | null;
  /** Le premier jour de la veille (AAAA-MM-JJ), tiré du journal ; `null` sans aucune ligne. */
  debutVeille: string | null;
  /**
   * Durée médiane observée des offres FERMÉES (durée définitive, bornée à la dernière vue).
   * `null` sous `MINIMUM_FERMEES_MEDIANE` fermées observées — jamais un zéro.
   */
  dureeFermeeMedianeJours: number | null;
  /** Fermées qui ont une durée (ligne de journal) : l'assise de la médiane. */
  fermeesObservees: number;
  /** Offres (une annonce comptée une fois) que la veille a observées au moins une fois : l'assise du dossier (JobAI#161). */
  offresObservees: number;
  /**
   * Le dernier jour (AAAA-MM-JJ) où un balayage a vu une offre de cet employeur, ou `null` si la veille n'en a vu aucune.
   * C'est la DATE que citent les lignes du dossier : ce qu'on sait de l'employeur s'arrête là.
   */
  observeLe: string | null;
  /** Somme, sur chaque intitulé repris, de (fois − 1) : les offres « en plus ». */
  intitulesReprisTotal: number;
  /** Les intitulés repris les plus fréquents (au plus `MAX_INTITULES_REPRIS`). */
  intitulesRepris: IntituleRepris[];
}

/** Un intitulé de poste comparable : sans accent, casse, ponctuation ni espaces multiples. */
export function cleIntitule(poste: string): string {
  return poste
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mediane(valeurs: readonly number[]): number {
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 === 1 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}

/**
 * Le premier jour de la veille : la plus ancienne première vue du journal, ou `null` s'il est vide. PURE.
 *
 * ⚠️ TIRÉ DU JOURNAL ET NON ÉCRIT EN DUR : la veille a commencé le 2026-08-20, mais une date récitée ici dériverait en silence le jour
 * où le journal change de forme. Si le journal est élagué (offres retirées du suivi), la date avance, et un peu moins d'offres
 * sont alors reconnues « déjà là » : l'erreur va dans le sens prudent (plus de signaux, pas moins).
 */
export function debutDeLaVeille(journal: Readonly<JournalVeille>): string | null {
  let debut: string | null = null;
  for (const ligne of Object.values(journal)) {
    if (debut === null || ligne.premiereVue < debut) debut = ligne.premiereVue;
  }
  return debut;
}

/**
 * Les jours (AAAA-MM-JJ) où un balayage LARGE a fait entrer d'un coup bien plus d'offres que d'habitude. PURE.
 *
 * ⚠️ UNE OFFRE « PREMIÈRE VUE » UN JOUR DE BALAYAGE LARGE ÉTAIT TRÈS PROBABLEMENT DÉJÀ PUBLIÉE : sa durée est tronquée par le balayage,
 * pas par l'employeur (JobAI#261). Mesuré le 2026-10-24 (`resume_suivi.veille.premieresVuesParJour`) : 1 392 lignes le 2026-08-20 et
 * 4 550 le 2026-09-19, contre 1 à 226 les autres jours. Un seul « premier jour de la veille » ne les écartait pas, puisque le premier
 * lot réel du 2026-07-31 leur est antérieur.
 *
 * Tiré du journal, jamais récité : un jour est large s'il compte au moins `FACTEUR_BALAYAGE_LARGE` fois la médiane des comptes
 * quotidiens. Sous `MINIMUM_JOURS_POUR_HABITUEL` jours distincts, on ne sait pas ce qu'est un jour habituel : l'ensemble est vide.
 */
export function joursDeBalayageLarge(journal: Readonly<JournalVeille>): ReadonlySet<string> {
  const parJour = new Map<string, number>();
  for (const ligne of Object.values(journal)) {
    parJour.set(ligne.premiereVue, (parJour.get(ligne.premiereVue) ?? 0) + 1);
  }
  if (parJour.size < MINIMUM_JOURS_POUR_HABITUEL) return new Set();
  const seuil = mediane([...parJour.values()]) * FACTEUR_BALAYAGE_LARGE;
  return new Set([...parJour].filter(([, n]) => n >= seuil).map(([jour]) => jour));
}

/**
 * Les signaux d'UN employeur, à partir de ses offres. PURE.
 *
 * `debutVeille` et `joursLarges` se calculent UNE fois pour tous les employeurs (`signauxParEmployeur`) : les relire du journal entier
 * pour chacun serait quadratique.
 */
export function signauxDe(
  offres: readonly Offre[],
  journal: Readonly<JournalVeille>,
  debutVeille: string | null = debutDeLaVeille(journal),
  joursLarges: ReadonlySet<string> = joursDeBalayageLarge(journal),
): SignauxEmployeur {
  // Une annonce, une offre : la représentante compte, ses copies lui prêtent leurs lignes de journal.
  const annonces = copiesParAnnonce(offres.filter((o) => !o.histo)).map((copies) => ({
    offre: representante(copies),
    copies,
  }));
  const suivies = annonces.map((a) => a.offre);
  const ouvertes = annonces.filter((a) => a.offre.perimeeLe === null);
  const fermees = annonces.filter((a) => a.offre.perimeeLe !== null);

  const duree = (a: (typeof annonces)[number]): { jours: number; premiereVue: string } | null => {
    const lignes = a.copies.map((c) => journal[c.id]).filter((l): l is NonNullable<typeof l> => l !== undefined);
    if (lignes.length === 0) return null;
    const premiere = lignes.map((l) => l.premiereVue).reduce((x, y) => (x <= y ? x : y));
    const derniere = lignes.map((l) => l.derniereVue).reduce((x, y) => (x >= y ? x : y));
    const j = joursEntre(premiere, derniere);
    return j === null ? null : { jours: Math.max(0, j), premiereVue: premiere };
  };

  let plusAncienneOuverte: SignauxEmployeur["plusAncienneOuverte"] = null;
  let plusAncienneOuverteMesurable: SignauxEmployeur["plusAncienneOuverteMesurable"] = null;
  for (const a of ouvertes) {
    const d = duree(a);
    if (!d) continue;
    if (plusAncienneOuverte === null || d.jours > plusAncienneOuverte.jours) {
      plusAncienneOuverte = { jours: d.jours, repereeLe: d.premiereVue };
    }
    // Vue apparaître seulement si sa première vue est POSTÉRIEURE au premier jour de la veille ET ne tombe pas un jour de balayage
    // large (sinon durée tronquée, JobAI#261).
    const apparitionVue = debutVeille !== null && d.premiereVue > debutVeille && !joursLarges.has(d.premiereVue);
    if (apparitionVue && (plusAncienneOuverteMesurable === null || d.jours > plusAncienneOuverteMesurable.jours)) {
      plusAncienneOuverteMesurable = { jours: d.jours, repereeLe: d.premiereVue };
    }
  }

  const joursFermees = fermees.map(duree).filter((d): d is NonNullable<typeof d> => d !== null);

  const lignesVues = annonces.map((a) => a.copies.map((c) => journal[c.id]).filter((l) => l !== undefined));
  const offresObservees = lignesVues.filter((l) => l.length > 0).length;
  const dernieres = lignesVues.flat().map((l) => l!.derniereVue);
  const observeLe = dernieres.length === 0 ? null : dernieres.reduce((x, y) => (x >= y ? x : y));

  const paquets = new Map<string, { intitule: string; fois: number }>();
  for (const o of suivies) {
    const cle = cleIntitule(o.poste);
    if (cle === "") continue;
    const p = paquets.get(cle);
    if (p) p.fois++;
    else paquets.set(cle, { intitule: o.poste, fois: 1 });
  }
  const repris = [...paquets.values()]
    .filter((p) => p.fois >= 2)
    .sort((a, b) => b.fois - a.fois || a.intitule.localeCompare(b.intitule, "fr"));

  return {
    offres: suivies.length,
    ouvertes: ouvertes.length,
    fermees: fermees.length,
    plusAncienneOuverte,
    plusAncienneOuverteMesurable,
    debutVeille,
    dureeFermeeMedianeJours:
      joursFermees.length >= MINIMUM_FERMEES_MEDIANE ? mediane(joursFermees.map((d) => d.jours)) : null,
    fermeesObservees: joursFermees.length,
    offresObservees,
    observeLe,
    intitulesReprisTotal: repris.reduce((n, p) => n + p.fois - 1, 0),
    intitulesRepris: repris.slice(0, MAX_INTITULES_REPRIS),
  };
}

/**
 * Les signaux de tous les employeurs, par `cleEnseigne` : « Harvey's », « Harvey's 2538 » et « Harvey's 2789 » sont une
 * enseigne et portent les mêmes signaux (JobAI#195). C'est `cleGroupement` — la clé de la carte et des positions, que
 * rien ne change — dont `cleEnseigne` ne diffère QUE par le numéro de succursale retiré.
 *
 * Calculés sur TOUTES les offres suivies, jamais sur ce qu'un filtre laisse voir : un filtre de
 * distance ne change pas combien d'offres un employeur a d'ouvertes.
 */
export function signauxParEmployeur(
  offres: readonly Offre[],
  journal: Readonly<JournalVeille>,
): Record<string, SignauxEmployeur> {
  const groupes = new Map<string, Offre[]>();
  for (const o of offres) {
    const cle = cleEnseigne(o.entreprise, o.id);
    const liste = groupes.get(cle);
    if (liste) liste.push(o);
    else groupes.set(cle, [o]);
  }
  const resultat: Record<string, SignauxEmployeur> = {};
  const debutVeille = debutDeLaVeille(journal);
  const joursLarges = joursDeBalayageLarge(journal);
  for (const [cle, liste] of groupes) {
    const s = signauxDe(liste, journal, debutVeille, joursLarges);
    if (s.offres > 0) resultat[cle] = s;
  }
  return resultat;
}
