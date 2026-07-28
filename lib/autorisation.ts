// lib/autorisation.ts — le filtre d'accès : UNE SEULE adresse admise.
//
// Fonction pure, donc testable exhaustivement. C'est le seul rempart entre le monde et les
// données personnelles de Marc : tout compte Google peut atteindre l'écran de connexion,
// seul celui-ci obtient une session.

/** Normalise pour comparer : une adresse ne se distingue ni par la casse ni par les espaces. */
function normaliser(valeur: string | null | undefined): string {
  return (valeur ?? "").trim().toLowerCase();
}

/**
 * Vrai seulement si l'adresse correspond exactement à celle autorisée.
 *
 * ÉCHEC FERMÉ : si l'une des deux valeurs manque, on refuse. Le cas dangereux serait une
 * variable d'environnement non configurée en production — sans cette garde, `"" === ""`
 * laisserait entrer n'importe qui.
 */
export function estEmailAutorise(
  email: string | null | undefined,
  autorise: string | null | undefined,
): boolean {
  const candidat = normaliser(email);
  const admis = normaliser(autorise);
  if (!candidat || !admis) return false;
  return candidat === admis;
}

/**
 * L'authentification est-elle réellement configurée côté serveur ?
 *
 * Sans ces variables, l'app ne doit RIEN servir : mieux vaut une porte fermée qu'une porte
 * ouverte par accident. C'est vérifié à chaque requête par le middleware, et non une seule
 * fois au démarrage — une variable peut disparaître d'un déploiement à l'autre.
 */
export function estAuthConfiguree(
  // `Partial<ProcessEnv>` et non `ProcessEnv` : ce dernier exige `NODE_ENV` (typage Next),
  // ce qui obligerait chaque test à fabriquer un faux environnement complet pour vérifier
  // deux variables. `Partial` accepte aussi bien `process.env` qu'un objet à deux clés.
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return Boolean(env.AUTH_SECRET?.trim() && env.AUTHORIZED_EMAIL?.trim());
}
