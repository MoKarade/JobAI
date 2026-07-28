// lib/diagnostic.ts — quelles variables d'environnement sont réellement en place.
//
// POURQUOI C'EST SÛR d'afficher ça sur une page publique : on ne rend que des BOOLÉENS,
// jamais une valeur ni un fragment. Et savoir qu'une variable manque n'ouvre aucune porte —
// l'app est en échec fermé : si `AUTHORIZED_EMAIL` est absent, PERSONNE ne peut entrer.
// L'information « personne ne peut se connecter » n'aide pas un attaquant ; elle aide
// énormément la personne qui configure.
//
// Ce diagnostic ne s'affiche que sur un ÉCHEC de connexion, pas en temps normal.

export interface EtatVariable {
  nom: string;
  presente: boolean;
  /** À quoi elle sert, en une ligne — pour savoir où aller la chercher. */
  role: string;
}

/** Une variable compte comme absente si elle est vide ou blanche : c'est le piège classique. */
function posee(valeur: string | undefined): boolean {
  return Boolean(valeur?.trim());
}

export function diagnostiquerConfiguration(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): EtatVariable[] {
  return [
    {
      nom: "AUTH_SECRET",
      presente: posee(env.AUTH_SECRET),
      role: "signe les sessions",
    },
    {
      nom: "AUTHORIZED_EMAIL",
      presente: posee(env.AUTHORIZED_EMAIL),
      role: "la seule adresse admise",
    },
    {
      nom: "GOOGLE_CLIENT_ID",
      presente: posee(env.GOOGLE_CLIENT_ID),
      role: "client OAuth Google",
    },
    {
      nom: "GOOGLE_CLIENT_SECRET",
      presente: posee(env.GOOGLE_CLIENT_SECRET),
      role: "client OAuth Google",
    },
    {
      nom: "DATABASE_URL",
      presente: posee(env.DATABASE_URL),
      role: "base Neon",
    },
    {
      nom: "HUB_TOKEN",
      presente: posee(env.HUB_TOKEN),
      role: "widget du hub (facultatif pour se connecter)",
    },
  ];
}
