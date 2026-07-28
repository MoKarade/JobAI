// lib/panne.ts — nommer une panne de base de données.
//
// POURQUOI CE MODULE EXISTE. Cette classification vivait INLINE dans `app/page.tsx`. Quand
// la page Carte est arrivée, elle a été écrite sans elle — et son écran d'erreur annonçait
// « la base n'a pas répondu » alors que la base avait parfaitement répondu, pour dire que la
// table n'existait pas. Marc a donc lu « problème de connexion » là où il manquait une
// commande à lancer. Une règle dupliquée à la main finit toujours par ne pas l'être.
//
// Une règle, un endroit, tous les consommateurs.

export type Panne = "schema-absent" | "base-injoignable";

/**
 * Postgres `42P01` = `undefined_table`.
 *
 * C'est le cas le plus fréquent juste après un déploiement qui ajoute une table : la base
 * répond, les identifiants sont bons, mais la migration n'a pas été appliquée. Le confondre
 * avec une panne de connexion envoie vérifier `DATABASE_URL` pendant que le remède est une
 * seule commande.
 */
export const CODE_TABLE_ABSENTE = "42P01";

/**
 * Le pilote Neon enveloppe l'erreur Postgres : le code utile est dans `cause`. On regarde
 * les deux niveaux — un jour où le pilote cessera d'envelopper, la classification tiendra
 * quand même.
 */
export function classerPanne(err: unknown): Panne {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  return code === CODE_TABLE_ABSENTE ? "schema-absent" : "base-injoignable";
}
