// lib/lia/askInvite.ts — LIA présente aussi sans session (mode invité), mais sans question possible.
//
// LIA est montée sur toutes les pages, `/connexion` et les écrans d'erreur compris (Marc, 24/10/2026). Sans session
// admise elle bouge, a une humeur et parle avec ses propres phrases, mais son `ask` refuse AVANT tout réseau :
// la route `/api/lia/ask` reste derrière la session, le navigateur n'y envoie rien d'inutile, et LIA dit
// « indisponible » (échec fermé). Fonctions pures : le module client les branche (components/LiaMontee.tsx).

import type { ReponseLiaApp } from "@/lib/lia/contrat";

export type AskLia = (question: string, signal: AbortSignal) => Promise<ReponseLiaApp>;

export type IndicateurSession = { actif: () => boolean; activer: () => void };

/** Le drapeau ne fait que monter : une fois la session vue, une page d'erreur ne referme pas `ask`. */
export function creerIndicateurSession(): IndicateurSession {
  let actif = false;
  return {
    actif: () => actif,
    activer: () => {
      actif = true;
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
