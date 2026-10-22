// lib/gmail/reponses.ts — les réponses de recruteurs à confirmer sur l'accueil. (JobAI#219, ADR-0043)
//
// Fonctions PURES : elles reçoivent l'état gardé en base (propositions lues, courriels déjà traités) et les offres, elles rendent la liste
// à afficher. Aucune lecture, aucune écriture : `lib/gmail/reponsesStore.ts` lit et écrit l'état, `lib/actionsReponses.ts` porte les gestes.
//
// ⚠️ CE BLOC NE CHANGE JAMAIS UN STATUT TOUT SEUL (garde-fou n°2). Il montre ce que `propositions_statut` a lu ; seul le geste « Confirmer »
// de Marc écrit, par `modifierOffre` (le même chemin que le menu de statut). « Écarter » n'écrit rien dans le suivi : il garde seulement
// l'identifiant du courriel, pour qu'il ne revienne pas à chaque chargement.

import { z } from "zod";
import { StatutSchema, type Offre, type Statut } from "../types";
import { faitAvancer, type Sens } from "./proposition";

export const CLE_PROPOSITIONS = "gmail-propositions";
export const CLE_TRAITEES = "gmail-traitees";
/** Clé de la réservation de passe (une lecture Gmail au plus par délai : une page rechargée dix fois ne lit pas dix fois). */
export const CLE_PASSE_GMAIL = "gmail-passe";
export const DELAI_ACTUALISATION_MS = 15 * 60 * 1000;
/** Fenêtre et plafond de la lecture de l'accueil : plus étroits que l'outil MCP (60 jours, 50 courriels), parce qu'ils se rejouent. */
export const LECTURE_ACCUEIL = { depuisJours: 14, max: 30 } as const;
const TRAITEES_MAX = 300;

const SENS = ["accuse", "entrevue", "refus", "offre"] as const satisfies readonly Sens[];

const PropositionGardeeSchema = z.object({
  courrielId: z.string().min(1).max(200),
  recuLe: z.string().nullable(),
  offreId: z.string().min(1).max(80),
  statutPropose: StatutSchema,
  sens: z.enum(SENS),
  phrase: z.string().max(400),
  sujet: z.string().max(400),
  expediteur: z.string().max(200),
});
export type PropositionGardee = z.infer<typeof PropositionGardeeSchema>;

const PropositionsGardeesSchema = z.object({
  luLe: z.string(),
  courrielsLus: z.number().int().min(0),
  propositions: z.array(PropositionGardeeSchema).max(200),
});
export type PropositionsGardees = z.infer<typeof PropositionsGardeesSchema>;

const TraiteeSchema = z.object({
  courrielId: z.string().min(1).max(200),
  action: z.enum(["confirmee", "ecartee"]),
  le: z.string(),
});
export type Traitee = z.infer<typeof TraiteeSchema>;

/** L'état gardé, validé à la frontière : une ligne illisible ou d'une autre forme vaut « rien gardé », jamais une proposition inventée. */
export function lirePropositionsGardees(brut: unknown): PropositionsGardees | null {
  const r = PropositionsGardeesSchema.safeParse(brut);
  return r.success ? r.data : null;
}

export function lireTraitees(brut: unknown): Traitee[] {
  const r = z.array(TraiteeSchema).safeParse(brut);
  return r.success ? r.data : [];
}

/** Ajoute un courriel traité (une seule entrée par courriel) et borne la liste aux plus récents. PURE. */
export function ajouterTraitee(liste: readonly Traitee[], nouvelle: Traitee): Traitee[] {
  return [...liste.filter((t) => t.courrielId !== nouvelle.courrielId), nouvelle].slice(-TRAITEES_MAX);
}

/** Ce que l'écran montre pour une réponse à confirmer. Sérialisable : il traverse la frontière serveur → client. */
export interface ReponseAConfirmer {
  courrielId: string;
  offreId: string;
  entreprise: string;
  poste: string;
  statutActuel: Statut;
  statutPropose: Statut;
  phrase: string;
  sujet: string;
  expediteur: string;
  recuLe: string | null;
}

/**
 * Les propositions qui attendent encore un geste de Marc. PURE.
 *
 * Une proposition disparaît quand : son courriel est déjà traité (confirmé ou écarté) ; son offre n'existe plus ; ou son statut ne ferait
 * plus avancer l'offre (Marc l'a déjà changé à la main depuis). Le statut ACTUEL est celui de l'offre MAINTENANT, jamais celui du moment
 * de la lecture : une proposition ne doit pas annoncer un point de départ périmé.
 */
export function reponsesAConfirmer(
  gardees: PropositionsGardees | null,
  traitees: readonly Traitee[],
  offres: readonly Offre[],
): ReponseAConfirmer[] {
  if (gardees === null) return [];
  const faits = new Set(traitees.map((t) => t.courrielId));
  const parId = new Map(offres.map((o) => [o.id, o]));
  const vues: ReponseAConfirmer[] = [];
  for (const p of gardees.propositions) {
    if (faits.has(p.courrielId)) continue;
    const offre = parId.get(p.offreId);
    if (offre === undefined || !faitAvancer(offre.statut, p.sens)) continue;
    vues.push({
      courrielId: p.courrielId,
      offreId: offre.id,
      entreprise: offre.entreprise,
      poste: offre.poste,
      statutActuel: offre.statut,
      statutPropose: p.statutPropose,
      phrase: p.phrase,
      sujet: p.sujet,
      expediteur: p.expediteur,
      recuLe: p.recuLe,
    });
  }
  return vues.sort((a, b) => (b.recuLe ?? "").localeCompare(a.recuLe ?? "") || (a.courrielId < b.courrielId ? -1 : 1));
}
