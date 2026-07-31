// lib/relances.ts — quelles candidatures dorment, et depuis quand.
//
// POURQUOI CE FICHIER EXISTE
// Le suivi porte `dateEnvoi` depuis le premier jour, et rien n'en faisait quoi que ce soit.
// Une candidature envoyée il y a trois semaines sans réponse ressemble exactement à une
// candidature envoyée hier : même ligne, même couleur, aucun signal. C'est pourtant là que
// se perdent les occasions — pas faute d'offres, faute de suivi.
//
// CE QU'ON NE FAIT PAS
// Aucune relance n'est envoyée à la place de Marc, aucun courriel n'est rédigé, aucun
// statut n'est changé tout seul. On CONSTATE et on affiche. Le garde-fou n°2 vaut ici comme
// ailleurs : `statut` et `dateEnvoi` lui appartiennent, et une automatisation qui les
// modifierait ferait disparaître l'information qu'elle prétend surveiller.
//
// Fonctions PURES : `aujourdhui` est un paramètre, jamais l'horloge. Sans ça, un test
// écrit en juillet se mettrait à échouer en août.

import { STATUTS_REPONDUS, type Offre } from "./types";

/**
 * Jours sans réponse avant qu'une relance soit suggérée.
 *
 * Quatorze : deux semaines pleines. En deçà, relancer paraît pressant — un recruteur
 * québécois qui trie des candidatures met couramment dix jours ouvrables. Au-delà de
 * trois semaines, le dossier est généralement classé et une relance sert surtout à savoir
 * à quoi s'en tenir. Le seuil est une CONSTANTE : les tests en dérivent leurs cas plutôt
 * que d'écrire « 14 », sinon ils mentiraient au premier ajustement.
 */
export const SEUIL_RELANCE_JOURS = 14;

/** Au-delà, une relance n'a plus grand sens : le silence est une réponse. */
export const SEUIL_SILENCE_JOURS = 45;

export type EtatRelance =
  /** Envoyée, sans réponse, et le délai est écoulé : c'est le moment. */
  | "a-relancer"
  /** Envoyée récemment : on laisse le temps au recruteur. */
  | "en-attente"
  /** Envoyée il y a longtemps, sans réponse : le silence est une réponse. */
  | "sans-suite"
  /** Rien à surveiller : pas encore envoyée, déjà répondue, ou historique. */
  | "sans-objet";

/** Nombre de jours entiers entre deux dates AAAA-MM-JJ. Négatif si `fin` précède `debut`. */
export function joursEntre(debut: string, fin: string): number | null {
  const d = Date.parse(`${debut}T00:00:00Z`);
  const f = Date.parse(`${fin}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f)) return null;
  return Math.round((f - d) / 86_400_000);
}

/**
 * Où en est cette candidature ?
 *
 * @param aujourdhui Date du jour (AAAA-MM-JJ), dans le fuseau de Marc — jamais UTC : après
 *                   20 h locale, un `toISOString()` donnerait demain et vieillirait toutes
 *                   les candidatures d'un jour.
 */
export function etatRelance(offre: Offre, aujourdhui: string): EtatRelance {
  if (offre.histo) return "sans-objet";
  if (offre.dateEnvoi === "") return "sans-objet";
  // Une réponse reçue clôt la surveillance, quelle qu'elle soit : entrevue, refus ou offre.
  if (STATUTS_REPONDUS.includes(offre.statut)) return "sans-objet";

  const jours = joursEntre(offre.dateEnvoi, aujourdhui);
  // Une date illisible ne doit pas fabriquer une alerte : on ne surveille pas ce qu'on ne
  // sait pas dater. Une date FUTURE non plus — c'est une saisie en cours, pas un envoi.
  if (jours === null || jours < 0) return "sans-objet";

  if (jours >= SEUIL_SILENCE_JOURS) return "sans-suite";
  if (jours >= SEUIL_RELANCE_JOURS) return "a-relancer";
  return "en-attente";
}

/** Une candidature à surveiller, avec son ancienneté. */
export interface Surveillance {
  offre: Offre;
  jours: number;
  etat: EtatRelance;
}

/**
 * Les candidatures qui demandent une décision, les plus anciennes d'abord.
 *
 * Trie par ancienneté DÉCROISSANTE : celle qui attend depuis le plus longtemps est celle
 * dont il faut décider en premier — la relancer, ou la classer.
 */
export function aSurveiller(offres: readonly Offre[], aujourdhui: string): Surveillance[] {
  const liste: Surveillance[] = [];

  for (const offre of offres) {
    const etat = etatRelance(offre, aujourdhui);
    if (etat === "sans-objet" || etat === "en-attente") continue;
    const jours = joursEntre(offre.dateEnvoi, aujourdhui);
    if (jours === null) continue;
    liste.push({ offre, jours, etat });
  }

  return liste.sort((a, b) => b.jours - a.jours);
}

/** Ce que le tableau de bord affiche en un coup d'œil. */
export interface ResumeRelances {
  /** Envoyées, en attente d'une réponse, tous délais confondus. */
  enCours: number;
  /** Le délai est écoulé : à relancer. */
  aRelancer: number;
  /** Silencieuses depuis très longtemps. */
  sansSuite: number;
  /** Ancienneté de la plus vieille candidature sans réponse, ou `null` s'il n'y en a pas. */
  plusAncienneJours: number | null;
}

export function resumerRelances(offres: readonly Offre[], aujourdhui: string): ResumeRelances {
  let enCours = 0;
  let aRelancer = 0;
  let sansSuite = 0;
  let plusAncienne: number | null = null;

  for (const offre of offres) {
    const etat = etatRelance(offre, aujourdhui);
    if (etat === "sans-objet") continue;

    enCours++;
    if (etat === "a-relancer") aRelancer++;
    if (etat === "sans-suite") sansSuite++;

    const jours = joursEntre(offre.dateEnvoi, aujourdhui);
    if (jours !== null && (plusAncienne === null || jours > plusAncienne)) {
      plusAncienne = jours;
    }
  }

  return { enCours, aRelancer, sansSuite, plusAncienneJours: plusAncienne };
}
