// lib/resumePasse.ts — le résumé de la dernière passe de distances, gardé pour pouvoir le relire.
//
// `[OBS-02]` / tâche #95. `[OBS-01]` a rendu lisible QUAND une passe a réservé son tour
// (`etat_synchro`, `majLe`) ; il manquait son CONTENU. `villesManquantes`, `distancesEffacees`
// et `centresCorriges` n'existaient que dans la réponse HTTP d'un cron que personne ne lit et
// dans les journaux Vercel (~17 min de rétention) : trois des quatre témoins de la veille du
// 22/09 étaient donc structurellement immesurables.
//
// Ici : UNE ligne de `sync_state` (`distances-resume`), réécrite PAR ÉTAPES pendant la passe.
// Pas de table neuve, pas de migration : `sync_state` est déjà un registre clé/valeur, et
// c'est le même patron que `veille-rapport` (`lib/rapportVeille.ts`).
//
// ⚠️ PAR ÉTAPES, ET PAS SEULEMENT À LA FIN. Première version (PR #120) : une seule écriture,
// à la toute fin. Mesuré en production le 15/10 : la passe lancée par l'accueil a été coupée
// par le mur de 60 s de Vercel (« Task timed out after 60 seconds ») avant d'arriver à la fin,
// donc rien n'a été écrit — alors que les passes lentes sont précisément celles qu'on veut
// lire. Un mur ne se rattrape pas par un `catch` : la seule parade est d'écrire AVANT.
//
// ⚠️ ELLE DIT LA DERNIÈRE PASSE DÉMARRÉE, ET `terminee` DIT SI ELLE EST ALLÉE AU BOUT.
// `terminee: false` avec `derniereEtape: "bornes"` = la passe a été coupée ou a levé après la
// fin de l'étape « bornes » ; les chiffres `null` n'étaient pas encore connus à ce moment-là.
// Un `null` ne vaut PAS zéro : un zéro AFFIRME « rien n'a été corrigé », un `null` admet
// « pas mesuré ». La passe suivante remplace la ligne : on ne garde que la dernière.
//
// ⚠️ DES NOMBRES, JAMAIS DE TEXTE LIBRE. Le dépôt est public (garde-fou n°1) et ce bloc sort
// par l'outil MCP : seuls des compteurs et des noms d'étapes figés y entrent, aucun nom
// d'employeur ni de ville. Le schéma ci-dessous est la liste blanche, et la lecture le rejoue.

import { z } from "zod";

/** Clé sous laquelle le dernier résumé de passe de distances est conservé (`sync_state`). */
export const CLE_RESUME_DISTANCES = "distances-resume";

/** Le temps d'une étape de la passe — mêmes noms que la ligne `[distances] budget par étape`. */
const EtapeSchema = z.object({
  nom: z.string().min(1).max(40),
  ms: z.number().finite(),
});

const Compte = z.number().int().nonnegative();
/** Un compte, ou `null` = pas encore connu à cet instant de la passe (jamais un faux zéro). */
const CompteOuNull = Compte.nullable();

export const ResumeDistancesSchema = z.object({
  /** Instant de la dernière écriture de ce résumé, ISO. */
  ecritLe: z.iso.datetime(),
  /** `true` = la passe est allée jusqu'au bout ; `false` = en cours, coupée, ou levée. */
  terminee: z.boolean(),
  /** Nom de la dernière étape franchie (`villes`, `centres`, `situer`…), `null` avant la première. */
  derniereEtape: z.string().min(1).max(40).nullable(),
  /** Offres dont la distance vient d'être écrite. */
  mesurees: CompteOuNull,
  /** Employeurs situés cette passe… */
  situees: CompteOuNull,
  /** …sur autant de candidats : « 0/0 » (rien à faire) ≠ « 0/6 » (six écartés). */
  candidatesSituees: CompteOuNull,
  /** Épinglées au centre-ville, sans requête Nominatim. */
  placees: CompteOuNull,
  /** Villes DISTINCTES encore sans centre : la file qui borne vraiment la convergence. */
  villesManquantes: CompteOuNull,
  /** Km retirés parce qu'ils venaient d'une position invraisemblable (ADR-0021). */
  distancesEffacees: CompteOuNull,
  /**
   * Distances écrites cette passe depuis le début du code postal (ADR-0040) : approchées, pas mesurées.
   * Facultatif : un résumé écrit avant JobAI#92 doit rester lisible.
   */
  distancesPostales: CompteOuNull.optional(),
  /**
   * Offres ouvertes « lieu inconnu » qui n'ont toujours pas de distance à la fin de la passe : le compte qui doit BAISSER
   * (JobAI#92). Facultatif pour la même raison.
   */
  lieuInconnuSansDistance: CompteOuNull.optional(),
  /** Centres que la re-vérification a déplacés de plus de `RAYON_VALIDATION_KM`. */
  centresCorriges: CompteOuNull,
  bornesMesurees: CompteOuNull,
  bornesCandidates: CompteOuNull,
  /** Budget restant à la fin, en ms. `null` = illimité, ou pas encore connu (`terminee: false`). */
  budgetRestantMs: z.number().finite().nullable(),
  /** Le budget par étape, dans l'ordre chronologique, pour les étapes déjà franchies. */
  etapes: z.array(EtapeSchema).max(30),
});

export type ResumeDistances = z.infer<typeof ResumeDistancesSchema>;

/** Ce que la passe sait d'elle-même à cet instant. Date et `terminee` sont posées par `construireResume`. */
export type EntreeResume = Omit<ResumeDistances, "ecritLe" | "terminee">;

/** L'état de départ d'une passe : rien n'est encore connu. */
export function resumeVierge(): EntreeResume {
  return {
    derniereEtape: null,
    mesurees: null,
    situees: null,
    candidatesSituees: null,
    placees: null,
    villesManquantes: null,
    distancesEffacees: null,
    distancesPostales: null,
    lieuInconnuSansDistance: null,
    centresCorriges: null,
    bornesMesurees: null,
    bornesCandidates: null,
    budgetRestantMs: null,
    etapes: [],
  };
}

/**
 * Le résumé prêt à écrire. Pur : l'horloge est passée en paramètre.
 *
 * Passe par le schéma — une valeur que la lecture refuserait ne doit pas pouvoir être écrite
 * (un compteur négatif ou fractionnaire serait un bug de la passe, pas une donnée).
 */
export function construireResume(
  entree: EntreeResume,
  ecritLe: Date,
  terminee: boolean,
): ResumeDistances {
  return ResumeDistancesSchema.parse({ ...entree, ecritLe: ecritLe.toISOString(), terminee });
}

/**
 * Ce que la base contient sous `distances-resume`, en trois états qui ne se confondent pas :
 *  - `absent`    : aucune passe n'a encore écrit son résumé depuis la mise en service ;
 *  - `illisible` : la ligne existe mais ne passe pas le schéma — à dire, jamais à remplacer
 *                  par des zéros (un zéro AFFIRME « rien n'a été corrigé ») ;
 *  - `ok`        : le résumé.
 */
export type LectureResume =
  | { etat: "absent" }
  | { etat: "illisible" }
  | { etat: "ok"; resume: ResumeDistances };

export function lireResume(brut: string | null): LectureResume {
  if (brut === null) return { etat: "absent" };
  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch {
    return { etat: "illisible" };
  }
  const r = ResumeDistancesSchema.safeParse(json);
  return r.success ? { etat: "ok", resume: r.data } : { etat: "illisible" };
}
