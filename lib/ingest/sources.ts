// lib/ingest/sources.ts — aller chercher, et dire honnêtement ce qu'on a obtenu.
//
// Le SEUL fichier qui contacte une source d'offres (garde-fou n°4). Il ne décide rien :
// il récupère, confie au bon analyseur, et rend un compte par source.
//
// POURQUOI UN COMPTE PAR SOURCE, ET PAS UN TOTAL
// Avec six sources, un total de zéro ne veut rien dire : marché calme, jeton d'entreprise
// périmé, API déplacée, réseau coupé ? Sans le détail, on ne débogue rien et on finit par
// croire que « la veille tourne » alors qu'elle est muette depuis trois semaines. Chaque
// source rend donc son propre résultat, succès ou échec nommé.

import {
  analyserGreenhouse,
  analyserLever,
  analyserRecruitee,
  analyserRss,
  analyserSmartRecruiters,
  analyserWorkable,
} from "./analyseurs";
import type { AtsEntreprise, FamilleAts, OffreBrute, Recuperateur, ResultatSource } from "./types";
import { PROFIL_DEFAUT } from "../profil";

/** Délai maximal accordé à une source. Une source lente ne doit pas geler la passe. */
export const DELAI_MAX_MS = 8_000;

/**
 * Identification de l'appelant.
 *
 * Les API d'ATS et le Guichet-Emplois acceptent le trafic identifié et bloquent l'anonyme.
 * Se nommer est aussi la contrepartie honnête de l'automatisation : on ne se fait pas
 * passer pour un navigateur.
 */
export function entetes(): Record<string, string> {
  return {
    "User-Agent": "JobAI/1.0 (veille personnelle; https://github.com/MoKarade/JobAI)",
    Accept: "application/json, application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  };
}

/** Le récupérateur réel. Injecté partout ailleurs, pour que tout le reste soit testable. */
export const recuperer: Recuperateur = async (url, entetesSup = {}) => {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MAX_MS);
  try {
    const r = await fetch(url, {
      headers: { ...entetes(), ...entetesSup },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Le corps est lu DANS le budget : un délai qui ne couvre que les en-têtes laisse
    // pendre une réponse qui stalle en cours de téléchargement.
    return await r.text();
  } finally {
    clearTimeout(minuteur);
  }
};

function messageErreur(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return `pas de réponse en ${DELAI_MAX_MS / 1000} s`;
    return err.message;
  }
  return String(err);
}

/**
 * Les recherches du Guichet-Emplois — DÉSACTIVÉES le 2026-07-31.
 *
 * ⚠️ MESURÉ, PAS SUPPOSÉ : aucune URL de flux ne répond. Cinq formes testées sur un runner
 * au réseau ouvert (`scripts/sonder-sources.ts`, banc d'essai) :
 *   · `jobsearch/rss?…`                    → 404
 *   · `rss?…`                              → 404
 *   · `jobsearch/jobsearch?fsrc=32&…`      → 200, mais une page HTML « Temporary Foreign
 *                                             Workers Search » : pas un flux
 *   · `guichetemplois.gc.ca/rechercheemploi/rss` → délai dépassé
 *   · `jobsearch/jobsearch?…` (page)       → délai dépassé
 *
 * Le Guichet-Emplois n'expose donc pas de flux public à ces adresses, et les délais
 * dépassés suggèrent qu'il ralentit les appels automatisés. Les laisser dans la liste
 * active ferait huit requêtes vouées à l'échec chaque matin — du bruit dans le rapport,
 * et l'habitude de voir des sources en erreur.
 *
 * Le code d'analyse RSS reste en place et testé : il servira le jour où une adresse
 * valide sera trouvée (leur API partenaire, sur clé, est la piste suivante).
 */
export const RECHERCHES_GUICHET: readonly string[] = [];

/**
 * Ce qu'on interrogerait si le flux répondait. Gardé pour le banc d'essai de la sonde.
 *
 * ⚠️ VIENT DU PROFIL (ADR-0009), pas d'une liste écrite ici. C'est le point de la
 * manœuvre : la veille doit chercher ce que Marc EST. Recopier ces termes en dur
 * garantissait qu'un CV mis à jour ne changerait jamais ce qu'on interroge le matin —
 * la moitié exacte de sa demande serait restée lettre morte.
 */
export const RECHERCHES_GUICHET_CANDIDATES: readonly string[] = PROFIL_DEFAUT.recherches;

/** L'URL du flux RSS officiel du Guichet-Emplois pour une recherche donnée. */
export function urlGuichet(recherche: string, lieu = "Quebec, QC"): string {
  const p = new URLSearchParams({ searchstring: recherche, locationstring: lieu, sort: "M" });
  return `https://www.jobbank.gc.ca/jobsearch/rss?${p.toString()}`;
}

/** L'URL de l'API publique d'un ATS pour une entreprise donnée. */
export function urlAts(famille: FamilleAts, jeton: string): string {
  switch (famille) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${jeton}/jobs?content=true`;
    case "lever":
      return `https://api.lever.co/v0/postings/${jeton}?mode=json`;
    case "recruitee":
      return `https://${jeton}.recruitee.com/api/offers/`;
    case "workable":
      return `https://apply.workable.com/api/v1/widget/accounts/${jeton}?details=true`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${jeton}/postings?limit=100`;
  }
}

/** L'analyseur qui correspond à une famille d'ATS. */
export function analyseurAts(
  famille: FamilleAts,
): (corps: string, entreprise: string) => OffreBrute[] {
  switch (famille) {
    case "greenhouse":
      return analyserGreenhouse;
    case "lever":
      return analyserLever;
    case "recruitee":
      return analyserRecruitee;
    case "workable":
      return analyserWorkable;
    case "smartrecruiters":
      return analyserSmartRecruiters;
  }
}

/** Une recherche du Guichet-Emplois, en source. */
export function sourceGuichet(recherche: string) {
  return {
    id: `guichet:${recherche}`,
    nom: `Guichet-Emplois — ${recherche}`,
    interroger: async (rec: Recuperateur): Promise<ResultatSource> => {
      try {
        const corps = await rec(urlGuichet(recherche));
        return { ok: true, source: `guichet:${recherche}`, offres: analyserRss(corps) };
      } catch (err) {
        return { ok: false, source: `guichet:${recherche}`, erreur: messageErreur(err) };
      }
    },
  };
}

/** La page carrières d'une entreprise, via son ATS. */
export function sourceAts(ats: AtsEntreprise) {
  const id = `${ats.famille}:${ats.jeton}`;
  return {
    id,
    nom: `${ats.entreprise} (${ats.famille})`,
    interroger: async (rec: Recuperateur): Promise<ResultatSource> => {
      try {
        const corps = await rec(urlAts(ats.famille, ats.jeton));
        const offres = analyseurAts(ats.famille)(corps, ats.entreprise);
        return { ok: true, source: id, offres };
      } catch (err) {
        return { ok: false, source: id, erreur: messageErreur(err) };
      }
    },
  };
}

/**
 * Teste si une entreprise a bien une page carrières chez cette famille d'ATS.
 *
 * Sert la découverte : le jeton d'une entreprise chez un ATS ne se devine pas de façon
 * fiable, il se VÉRIFIE. Une réponse qui n'est pas du JSON exploitable vaut « non » — et
 * « non » se mémorise, sinon on repaie la même recherche infructueuse chaque jour.
 *
 * Un tableau VIDE reste un succès : une entreprise peut réellement n'avoir aucun poste
 * ouvert aujourd'hui, et le confondre avec une absence d'ATS ferait perdre la source pour
 * de bon.
 */
export async function verifierAts(
  famille: FamilleAts,
  jeton: string,
  entreprise: string,
  rec: Recuperateur,
): Promise<{ trouve: boolean; offres: OffreBrute[] }> {
  try {
    const corps = await rec(urlAts(famille, jeton));
    const offres = analyseurAts(famille)(corps, entreprise);
    return { trouve: true, offres };
  } catch {
    return { trouve: false, offres: [] };
  }
}

/**
 * Le jeton probable d'une entreprise chez un ATS, à partir de son nom.
 *
 * Une SUPPOSITION, jamais une vérité : elle n'a de valeur qu'une fois passée par
 * `verifierAts`. C'est ce qui permet de chercher au-delà des entreprises déjà connues sans
 * inscrire nulle part une entreprise dont on n'a pas vu la page carrières.
 */
export function jetonProbable(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(inc|ltee|ltd|ltda|corp|corporation|groupe|group|company|cie)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}
