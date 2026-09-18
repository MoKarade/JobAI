// lib/ingest/sources.ts — aller chercher, et dire honnêtement ce qu'on a obtenu.
//
// Le SEUL fichier qui contacte une source d'offres (garde-fou n°4). Il ne décide rien :
// il récupère, confie au bon analyseur, et rend un compte par source.
//
// POURQUOI UN COMPTE PAR SOURCE, ET PAS UN TOTAL
// Un total de zéro ne veut rien dire : marché calme, API déplacée, réseau coupé ? Sans le
// détail, on ne débogue rien et on finit par croire que « la veille tourne » alors qu'elle
// est muette depuis trois semaines. Chaque source rend donc son propre résultat, succès ou
// échec nommé. ⚠️ IL N'EN RESTE QU'UNE depuis le 2026-09-18 (le flux du Guichet) — la règle
// vaut quand même : elle a été écrite parce que six sources muettes s'additionnaient en un
// seul zéro, et c'est elle qui a fini par montrer que cinq d'entre elles ne servaient à rien.

import type { Recuperateur } from "./types";

/** Délai maximal accordé à une source. Une source lente ne doit pas geler la passe. */
export const DELAI_MAX_MS = 8_000;

/**
 * Identification de l'appelant.
 *
 * Le Guichet-Emplois accepte le trafic identifié et bloque l'anonyme.
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

// ⚠️ TOUTE LA SURFACE ATS A ÉTÉ SUPPRIMÉE LE 2026-09-18 : `urlAts`, `analyseurAts`,
// `verifierAts` (les quatre verdicts confirme/refute/indecis/absent) et `jetonProbable`.
// Elles servaient la DÉCOUVERTE d'une page carrières chez un ATS à partir du nom d'une
// entreprise — un mécanisme prudent, dont la leçon (« un identifiant deviné trouve des
// homonymes, et ils sont crédibles ») reste écrite dans `docs/LESSONS.md`. Ce qui l'a
// condamné n'est pas sa justesse : aucune entreprise d'ATS n'a jamais été déclarée, donc
// la source interrogeait une liste vide à chaque passe depuis un mois.
