// lib/mcp/reponsesRecruteurs.spec.ts — ce que l'outil `propositions_statut` demande et comment il rend le résultat. (JobAI#218, ADR-0042)
//
// ⚠️ AUCUN IMPORT DU SDK MCP, AUCUN IMPORT DE LA BASE. Les courriels et les offres arrivent déjà lus (la lecture Gmail est injectée dans
// `serveur.ts`) : ces fonctions DÉCRIVENT, elles n'appellent rien. Verrou : `tests/mcpSurface.test.ts`. L'outil est en LECTURE SEULE : il ne
// modifie aucun statut (garde-fou n°2) ; c'est `modifier_suivi`, sur le geste de Marc, qui écrit.

import { z } from "zod";
import { COURRIELS_MAX } from "../gmail/lecture";
import type { LectureCourriels } from "../gmail/acces";
import type { BilanPropositions } from "../gmail/proposition";
import { sanitizePromptText } from "../promptSafety";

export const PropositionsStatutSchema = z.object({
  /** Âge maximal des courriels lus, en jours (la lecture Gmail plafonne à 60). */
  jours: z.number().finite().int().min(1).max(60).default(14),
  max: z.number().finite().int().min(1).max(COURRIELS_MAX).default(30),
});

/** Les états de la lecture Gmail qui ne rendent aucun courriel, avec ce que Marc doit faire. */
export function messageEtat(l: Exclude<LectureCourriels, { etat: "ok" }>): string {
  switch (l.etat) {
    case "non-configure":
      return `L'accès Gmail n'est pas configuré (variables manquantes : ${l.manquantes.join(", ")}). Geste de Marc : JobAI#201.`;
    case "non-connecte":
      return "Gmail est configuré mais pas connecté : Marc ouvre /api/gmail/connexion une fois.";
    case "jeton-illisible":
      return "Le jeton Gmail gardé est illisible (AUTH_SECRET a changé) : Marc se reconnecte par /api/gmail/connexion.";
    case "google-refuse":
      return `Google a refusé la lecture${l.statut === null ? "" : ` (${l.statut})`} : jeton révoqué ou quota ; Marc se reconnecte au besoin.`;
  }
}

/** Le bilan tel que Claude le voit. Les textes de tiers (sujet, phrase, expéditeur) passent par `sanitizePromptText`. */
export function vuePropositions(bilan: BilanPropositions) {
  return {
    courrielsLus: bilan.courrielsLus,
    propositions: bilan.propositions.map((p) => ({
      offreId: p.offreId,
      statutActuel: p.statutActuel,
      statutPropose: p.statutPropose,
      phraseSource: sanitizePromptText(p.phrase),
      sujet: sanitizePromptText(p.sujet),
      expediteur: sanitizePromptText(p.expediteur),
      recuLe: p.recuLe,
      indices: p.indices,
    })),
    abstentions: bilan.abstentions,
    note:
      "Propositions seulement : aucun statut n'a été modifié. Marc confirme chacune ; l'écriture passe par modifier_suivi. " +
      "Un courriel écarté est compté dans `abstentions` avec sa raison, jamais deviné.",
  };
}
