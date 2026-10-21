// lib/diagnosticSynchro.ts — depuis quand une passe de fond a réservé son tour.
//
// `[OBS-01]`. La seule preuve qu'un cron (géocodage, distances) avait tourné était les
// journaux runtime Vercel — rétention **~17 min** sur le plan hobby, et l'heure réelle de
// départ d'un cron n'est pas son heure DÉCLARÉE (`vercel.json` dit 03:00, mesuré vers
// 03:31). Deux tentatives de vérification ont raté la fenêtre la même nuit. `sync_state`
// porte déjà `majLe` pour chaque réservation (`lib/synchro.ts` : `reserverPasse`) ; il ne
// manquait qu'un endroit pour la LIRE, à n'importe quelle heure — pas un nouveau signal.
//
// ⚠️ NE PROUVE QU'UN DÉMARRAGE, PAS UN SUCCÈS. La réservation se pose AVANT le travail :
// `majLe` récent dit « une passe a été prise », jamais « elle a fini » ni « elle a réussi ».
//
// ⚠️ NE REND JAMAIS `valeur`. Certaines clés de `sync_state` (`veille-journal`,
// `veille-historique`, `veille-rapport`…) portent des blocs JSON pouvant peser des dizaines
// de milliers de caractères — ce diagnostic sert à DATER un passage, jamais à le relire. Le
// type d'entrée ne porte donc que `cle` et `majLe` : un appelant qui passerait `valeur` ne
// la ferait pas fuiter par erreur, elle n'a simplement pas de place dans le type.
//
// ⚠️ UNE SEULE EXCEPTION, ET ELLE EST FERMÉE (`[OBS-02]`, tâche #95) : le résumé de la
// dernière passe de distances (`distances-resume`, `lib/resumePasse.ts`). Il ne passe pas par
// `valeur` : l'appelant le lit à part, le fait valider par un schéma qui ne laisse entrer que
// des compteurs, et le rend sous `resume`. Une autre clé ne gagne pas ce droit en copiant le
// patron sans y réfléchir : il faut un schéma à liste blanche, pas un `JSON.parse`.

import { CLE_RESUME_DISTANCES, type LectureResume, type ResumeDistances } from "./resumePasse";

export interface LigneSynchroBrute {
  readonly cle: string;
  readonly majLe: Date;
}

export interface EtatSynchro {
  readonly cle: string;
  readonly majLe: string;
  readonly ageMs: number;
  /**
   * Seulement sur la ligne `distances-resume` : le contenu de la dernière passe terminée.
   * `null` = la ligne existe mais n'est pas lisible (dit par `resumeIllisible`).
   */
  readonly resume?: ResumeDistances | null;
  readonly resumeIllisible?: true;
}

/**
 * L'accès Gmail (JobAI#107) : configuré ou non, et connecté ou non. Des NOMS de variables absentes et des booléens, jamais une valeur.
 * `connecte` = la ligne `gmail-jeton` existe (son contenu ne sort jamais, comme pour toute autre clé).
 */
export interface EtatGmail {
  readonly cle: "gmail";
  readonly configure: boolean;
  readonly manquantes: readonly string[];
  readonly connecte: boolean;
}

export interface ConfigGmailVue {
  readonly configure: boolean;
  readonly manquantes: readonly string[];
}

/**
 * Un instantané lisible de `sync_state` : quelle clé, écrite quand, il y a combien de temps.
 *
 * Découvre les clés au lieu de les nommer — la table en porte déjà onze (registre de coût,
 * journal de veille, réservations de cron…) et une liste écrite à la main deviendrait fausse
 * au premier ajout, exactement le défaut que `[PERSIST-02]` vient de corriger ailleurs.
 */
export function resumerEtatSynchro(
  lignes: readonly LigneSynchroBrute[],
  maintenant: Date,
  resumeDistances?: LectureResume,
): EtatSynchro[];
export function resumerEtatSynchro(
  lignes: readonly LigneSynchroBrute[],
  maintenant: Date,
  resumeDistances: LectureResume | undefined,
  gmail: ConfigGmailVue | undefined,
): (EtatSynchro | EtatGmail)[];
export function resumerEtatSynchro(
  lignes: readonly LigneSynchroBrute[],
  maintenant: Date,
  resumeDistances: LectureResume = { etat: "absent" },
  gmail?: ConfigGmailVue,
): (EtatSynchro | EtatGmail)[] {
  const rendu: (EtatSynchro | EtatGmail)[] = [...lignes]
    .sort((a, b) => a.cle.localeCompare(b.cle))
    .map((l) => {
      const base = {
        cle: l.cle,
        majLe: l.majLe.toISOString(),
        ageMs: maintenant.getTime() - l.majLe.getTime(),
      };
      if (l.cle !== CLE_RESUME_DISTANCES) return base;
      if (resumeDistances.etat === "ok") return { ...base, resume: resumeDistances.resume };
      // La ligne est là mais ne se lit pas : on le DIT, on ne rend ni zéros ni l'absence.
      if (resumeDistances.etat === "illisible") {
        return { ...base, resume: null, resumeIllisible: true as const };
      }
      return base;
    });
  if (gmail) {
    rendu.push({
      cle: "gmail",
      configure: gmail.configure,
      manquantes: [...gmail.manquantes],
      connecte: lignes.some((l) => l.cle === "gmail-jeton"),
    });
  }
  return rendu;
}
