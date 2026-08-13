// Augmentation des types Auth.js : les jetons Google portés par le JWT de session.
//
// Cette app n'appelle AUCUNE API Google elle-même. Elle transporte quand même ces champs
// parce que le cookie de session est PARTAGÉ entre les quatre apps du hub : une connexion
// faite ici doit produire un jeton que BatchChef pourra utiliser pour écrire dans Google
// Tasks. Sans ces champs, la connexion serait valide mais amputée — et l'app d'à côté
// afficherait « Aucun jeton Google » sans qu'on comprenne pourquoi.
//
// Rien n'est exposé à la session : ces jetons restent dans le JWT chiffré, httpOnly.
// Voir `lib/jetonsGoogle.ts` et, dans Hubperso, `docs/CONNEXION-UNIQUE.md`.

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Epoch secondes d'expiration du access_token. */
    expiresAt?: number;
    scope?: string;
    error?: string;
  }
}

export {};
