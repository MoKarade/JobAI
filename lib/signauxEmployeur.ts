// lib/signauxEmployeur.ts — ce que le suivi sait DÉJÀ d'un employeur, sans rien chercher d'autre.
//
// Demande (JobAI#159, plan « analyse du CV et dossier employeur », étape B1) : afficher, pour
// chaque entreprise, depuis combien de temps ses offres sont ouvertes, si elle republie les
// mêmes postes, et combien d'offres elle a d'ouvertes. Tout se tire des offres suivies et du
// journal de veille : aucune source de plus, aucun appel IA, aucun scraping (garde-fous 3 et 4).
//
// ⚠️ QUATRE HONNÊTETÉS, DONT TROIS VIENNENT DE `lib/dureeVie.ts` ET SONT REPRISES TELLES QUELLES
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
//   4. UNE « REPUBLICATION » EST UN INTITULÉ REPRIS, PAS UNE PREUVE. Le Guichet republie un
//      poste sous un nouveau numéro, mais un employeur peut aussi ouvrir deux postes vraiment
//      distincts sous le même titre. Le module compte donc des INTITULÉS REPRIS (même employeur,
//      même titre une fois accents, casse et ponctuation écartés) et l'écran les nomme ainsi.
//
// Fonctions PURES : le journal et les offres sont des paramètres, aucune horloge.

import { cleGroupement } from "./employeurs";
import { joursEntre } from "./dureeVie";
import type { Offre } from "./types";
import type { JournalVeille } from "./veille";

/** Effectif minimal d'offres FERMÉES pour qu'une médiane soit publiée. */
export const MINIMUM_FERMEES_MEDIANE = 3;

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
   * Durée médiane observée des offres FERMÉES (durée définitive, bornée à la dernière vue).
   * `null` sous `MINIMUM_FERMEES_MEDIANE` fermées observées — jamais un zéro.
   */
  dureeFermeeMedianeJours: number | null;
  /** Fermées qui ont une durée (ligne de journal) : l'assise de la médiane. */
  fermeesObservees: number;
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

/** Les signaux d'UN employeur, à partir de ses offres. PURE. */
export function signauxDe(offres: readonly Offre[], journal: Readonly<JournalVeille>): SignauxEmployeur {
  const suivies = offres.filter((o) => !o.histo);
  const ouvertes = suivies.filter((o) => o.perimeeLe === null);
  const fermees = suivies.filter((o) => o.perimeeLe !== null);

  const duree = (o: Offre): { jours: number; premiereVue: string } | null => {
    const l = journal[o.id];
    if (!l) return null;
    const j = joursEntre(l.premiereVue, l.derniereVue);
    return j === null ? null : { jours: Math.max(0, j), premiereVue: l.premiereVue };
  };

  let plusAncienneOuverte: SignauxEmployeur["plusAncienneOuverte"] = null;
  for (const o of ouvertes) {
    const d = duree(o);
    if (d && (plusAncienneOuverte === null || d.jours > plusAncienneOuverte.jours)) {
      plusAncienneOuverte = { jours: d.jours, repereeLe: d.premiereVue };
    }
  }

  const joursFermees = fermees.map(duree).filter((d): d is NonNullable<typeof d> => d !== null);

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
    dureeFermeeMedianeJours:
      joursFermees.length >= MINIMUM_FERMEES_MEDIANE ? mediane(joursFermees.map((d) => d.jours)) : null,
    fermeesObservees: joursFermees.length,
    intitulesReprisTotal: repris.reduce((n, p) => n + p.fois - 1, 0),
    intitulesRepris: repris.slice(0, MAX_INTITULES_REPRIS),
  };
}

/**
 * Les signaux de tous les employeurs, par `cleGroupement` — la MÊME clé que la carte et la
 * liste, pour qu'une entreprise regroupée à l'écran porte les signaux de tout son groupe.
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
    const cle = cleGroupement(o.entreprise, o.id);
    const liste = groupes.get(cle);
    if (liste) liste.push(o);
    else groupes.set(cle, [o]);
  }
  const resultat: Record<string, SignauxEmployeur> = {};
  for (const [cle, liste] of groupes) {
    const s = signauxDe(liste, journal);
    if (s.offres > 0) resultat[cle] = s;
  }
  return resultat;
}
