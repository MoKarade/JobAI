// lib/actionsOffrePur.ts — les règles PURES des actions sur une offre (ajout, modification),
// sorties de `lib/actions.ts` pour être éprouvées sans base ni session.

/** Un problème de validation, réduit à ce dont la règle a besoin (compatible avec Zod). */
export interface ProblemeChamp {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

/**
 * Regroupe les problèmes de validation par champ : le PREMIER message de chaque champ.
 *
 * Au-delà du premier, on empile des reformulations du même problème. Un problème dont le
 * chemin ne commence pas par un nom de champ (chemin vide, indice de tableau) est ignoré :
 * il n'a pas de champ où s'afficher.
 */
export function premierMessageParChamp(problemes: readonly ProblemeChamp[]): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const probleme of problemes) {
    const cle = probleme.path[0];
    if (typeof cle === "string" && !(cle in champs)) champs[cle] = probleme.message;
  }
  return champs;
}

/**
 * Le code d'erreur Postgres porté par une erreur, ou `undefined`.
 *
 * Drizzle enveloppe l'erreur du pilote : le code est dans `cause.code`, sinon directement
 * dans `code`. `cause.code` gagne quand les deux existent.
 */
export function codeErreurBase(err: unknown): string | undefined {
  const enveloppe = err as { cause?: { code?: string }; code?: string } | null | undefined;
  return enveloppe?.cause?.code ?? enveloppe?.code;
}

/** Violation d'unicité Postgres : le seul cas réaliste est une double soumission. */
export const CODE_VIOLATION_UNICITE = "23505";

/**
 * La date d'envoi à écrire lors d'une modification d'offre.
 *
 * Passer à « CV envoyé » pose la date du jour, et SEULEMENT si aucune date n'est déjà connue
 * (en base) ni fournie (dans la modification) : réappliquer le statut ne doit pas réécrire
 * une date. Une chaîne vide fournie compte comme « pas de date ». Sinon la date fournie est
 * rendue telle quelle, `undefined` voulant dire « ne pas toucher à la colonne ».
 */
export function dateEnvoiAEcrire(
  champs: { statut?: string; dateEnvoi?: string },
  dateEnvoiEnBase: string | null,
  aujourdhuiDeMarc: string,
): string | undefined {
  if (champs.statut === "CVenvoye" && !dateEnvoiEnBase && !champs.dateEnvoi) {
    return aujourdhuiDeMarc;
  }
  return champs.dateEnvoi;
}
