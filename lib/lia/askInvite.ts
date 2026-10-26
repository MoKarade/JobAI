// lib/lia/askInvite.ts — LIA présente aussi sans session (mode invité), mais sans question possible.
//
// LIA est montée sur toutes les pages, `/connexion` et les écrans d'erreur compris (Marc, 24/10/2026). Sans session
// admise elle bouge, a une humeur et parle avec ses propres phrases, mais son `ask` refuse AVANT tout réseau :
// la route `/api/lia/ask` reste derrière la session, le navigateur n'y envoie rien d'inutile, et LIA dit
// « indisponible » (échec fermé). Fonctions pures : le module client les branche (components/LiaMontee.tsx).

import type { EtatHote } from "@mokarade/lia-ui";
import type { ReponseLiaApp } from "@/lib/lia/contrat";

export type AskLia = (question: string, signal: AbortSignal) => Promise<ReponseLiaApp>;

export type IndicateurSession = {
  actif: () => boolean;
  activer: () => void;
  /** Attend que la session soit vue (`true`) ; `false` si elle ne l'est pas dans le délai : la page est alors celle d'un invité. */
  attendre: (delaiMs: number) => Promise<boolean>;
};

/** Le drapeau ne fait que monter : une fois la session vue, une page d'erreur ne referme pas `ask`. */
export function creerIndicateurSession(): IndicateurSession {
  let actif = false;
  const attentes = new Set<(vue: boolean) => void>();
  return {
    actif: () => actif,
    activer: () => {
      actif = true;
      for (const rendre of attentes) rendre(true);
      attentes.clear();
    },
    attendre: (delaiMs) => {
      if (actif) return Promise.resolve(true);
      return new Promise<boolean>((rendre) => {
        const fin = (vue: boolean) => {
          clearTimeout(minuteur);
          attentes.delete(fin);
          rendre(vue);
        };
        const minuteur = setTimeout(() => fin(false), delaiMs);
        attentes.add(fin);
      });
    },
  };
}

/** Enveloppe `ask` : sans session, rejette sans appeler le réseau ; avec session, délègue tel quel. */
export function creerAskInvite(session: IndicateurSession, ask: AskLia): AskLia {
  return (question, signal) => {
    if (!session.actif()) return Promise.reject(new Error("LIA indisponible (pas de session)"));
    return ask(question, signal);
  };
}

/** Délai laissé à la page pour dire que la session est admise : `LiaMontee` la lève dans un effet, juste après l'hydratation. */
export const DELAI_SESSION_ETAT_MS = 3_000;

/**
 * Enveloppe l'état partagé : un invité n'appelle JAMAIS `/api/lia/etat` (ni lecture ni écriture), LIA garde son état local.
 * La première lecture attend que la page dise si la session est admise, pour que la discussion d'une autre app se rouvre
 * aussi quand le module démarre avant l'effet qui lève le drapeau.
 */
export function creerEtatInvite(session: IndicateurSession, hote: EtatHote, delaiMs = DELAI_SESSION_ETAT_MS): EtatHote {
  return {
    lire: async () => ((await session.attendre(delaiMs)) ? hote.lire() : null),
    ecrire: async (etat) => (session.actif() ? hote.ecrire(etat) : null),
  };
}
