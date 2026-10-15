// lib/resumePasse.ts — le résumé de la dernière passe de distances, gardé pour pouvoir le relire.
//
// `[OBS-02]` / tâche #95. `[OBS-01]` a rendu lisible QUAND une passe a réservé son tour
// (`etat_synchro`, `majLe`) ; il manquait son CONTENU. `villesManquantes`, `distancesEffacees`
// et `centresCorriges` n'existaient que dans la réponse HTTP d'un cron que personne ne lit et
// dans les journaux Vercel (~17 min de rétention) : trois des quatre témoins de la veille du
// 22/09 étaient donc structurellement immesurables.
//
// Ici : UNE ligne de `sync_state` (`distances-resume`), réécrite à la fin de chaque passe qui
// va jusqu'au bout. Pas de table neuve, pas de migration : `sync_state` est déjà un registre
// clé/valeur, et c'est le même patron que `veille-rapport` (`lib/rapportVeille.ts`).
//
// ⚠️ ELLE DIT LA DERNIÈRE PASSE TERMINÉE, PAS LA DERNIÈRE PASSE DÉMARRÉE. Une passe qui lève
// n'écrit rien : le résumé précédent reste, avec son `finiLe`, et c'est l'écart entre ce
// `finiLe` et le `majLe` de `distances-auto` (la réservation) qui dit « la dernière a échoué ».
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

export const ResumeDistancesSchema = z.object({
  /** Instant de fin de la passe, ISO. */
  finiLe: z.iso.datetime(),
  /** Offres dont la distance vient d'être écrite. */
  mesurees: Compte,
  /** Employeurs situés cette passe… */
  situees: Compte,
  /** …sur autant de candidats : « 0/0 » (rien à faire) ≠ « 0/6 » (six écartés). */
  candidatesSituees: Compte,
  /** Épinglées au centre-ville, sans requête Nominatim. */
  placees: Compte,
  /** Villes DISTINCTES encore sans centre : la file qui borne vraiment la convergence. */
  villesManquantes: Compte,
  /** Km retirés parce qu'ils venaient d'une position invraisemblable (ADR-0021). */
  distancesEffacees: Compte,
  /** Centres que la re-vérification a déplacés de plus de `RAYON_VALIDATION_KM`. */
  centresCorriges: Compte,
  bornesMesurees: Compte,
  bornesCandidates: Compte,
  /** Budget restant à la fin, en ms. `null` = illimité (passe lancée sans budget). */
  budgetRestantMs: z.number().finite().nullable(),
  /** Le budget par étape, dans l'ordre chronologique. */
  etapes: z.array(EtapeSchema).max(30),
});

export type ResumeDistances = z.infer<typeof ResumeDistancesSchema>;

/** Ce que la passe sait d'elle-même à sa fin. `finiLe` est posé par `construireResume`. */
export type EntreeResume = Omit<ResumeDistances, "finiLe">;

/**
 * Le résumé prêt à écrire. Pur : l'horloge est passée en paramètre.
 *
 * Passe par le schéma — une valeur que la lecture refuserait ne doit pas pouvoir être écrite
 * (un compteur négatif ou fractionnaire serait un bug de la passe, pas une donnée).
 */
export function construireResume(entree: EntreeResume, fini: Date): ResumeDistances {
  return ResumeDistancesSchema.parse({ ...entree, finiLe: fini.toISOString() });
}

/**
 * Ce que la base contient sous `distances-resume`, en trois états qui ne se confondent pas :
 *  - `absent`    : aucune passe n'est encore allée au bout depuis la mise en service ;
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
