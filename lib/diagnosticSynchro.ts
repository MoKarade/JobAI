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

export interface LigneSynchroBrute {
  readonly cle: string;
  readonly majLe: Date;
}

export interface EtatSynchro {
  readonly cle: string;
  readonly majLe: string;
  readonly ageMs: number;
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
): EtatSynchro[] {
  return [...lignes]
    .sort((a, b) => a.cle.localeCompare(b.cle))
    .map((l) => ({
      cle: l.cle,
      majLe: l.majLe.toISOString(),
      ageMs: maintenant.getTime() - l.majLe.getTime(),
    }));
}
