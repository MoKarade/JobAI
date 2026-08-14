// lib/diagnostic.ts — quelles variables d'environnement sont réellement en place.
//
// POURQUOI C'EST SÛR d'afficher ça sur une page publique : on ne rend que des BOOLÉENS,
// jamais une valeur ni un fragment. Et savoir qu'une variable manque n'ouvre aucune porte —
// l'app est en échec fermé : si `AUTHORIZED_EMAIL` est absent, PERSONNE ne peut entrer.
// L'information « personne ne peut se connecter » n'aide pas un attaquant ; elle aide
// énormément la personne qui configure.
//
// Ce diagnostic ne s'affiche que sur un ÉCHEC de connexion, pas en temps normal.
//
// GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET ont disparu de cette liste le 14/08 : JobAI ne
// parle plus à Google (ADR 0001 de Hubperso). Les y laisser ferait chercher une variable
// qui n'a plus à exister, et le diagnostic vaut par ce qu'il n'affirme PAS.

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
