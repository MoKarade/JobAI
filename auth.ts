// auth.ts — Auth.js (NextAuth v5), SANS fournisseur. JobAI lit, elle n'émet plus.
//
// Depuis l'ADR 0001 de Hubperso, le hub est la porte d'entrée unique de l'écosystème.
// JobAI ne parle plus à Google : elle déchiffre le cookie de session posé sur
// `.hubperso.com` et s'en tient là. Le filtre d'accès reste une fonction pure
// (lib/autorisation.ts).
//
// AUCUN SCOPE GOOGLE ICI, ET PLUS AUCUN MOYEN D'EN DEMANDER. Le scan des réponses (V2) et
// la lecture du CV (V3) en auront besoin — ce sont des scopes RESTREINTS, qui changent le
// régime de vérification de l'application entière. Ils feront l'objet de l'ADR-0002 du
// chantier V2, et ils devront passer par le HUB : c'est lui qui détient désormais le
// client OAuth, et lui seul qui peut prêter un jeton.

import NextAuth from "next-auth";
import { estEmailAutorise } from "@/lib/autorisation";
import { cookiesSessionPartagee } from "@/lib/sessionPartagee";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // ── AUCUN FOURNISSEUR, ET C'EST LE POINT ────────────────────────────────────────
  // JobAI ne fabrique plus de session : elle LIT celle que le hub a posée sur
  // `.hubperso.com` (ADR 0001). Le `client_secret` Google n'existe plus dans cet
  // environnement — une copie de moins à faire tourner le jour d'un incident.
  //
  // Auth.js reste indispensable pour autant : c'est lui qui déchiffre le cookie et
  // expose `auth()` au garde. Les routes `/api/auth/*` continuent de servir la session
  // et la DÉCONNEXION — laquelle vaut désormais pour toutes les apps, le cookie étant
  // partagé.
  providers: [],
  session: { strategy: "jwt" },
  // ── CONNEXION UNIQUE ENTRE LES APPS DU HUB ───────────────────────────────────────
  // Avec `AUTH_COOKIE_DOMAIN=.hubperso.com`, le cookie de session est déclaré sur le
  // domaine parent : le navigateur l'envoie à TOUS les sous-domaines. Combiné à un
  // `AUTH_SECRET` IDENTIQUE dans chaque app (le JWT est chiffré avec — sans le même
  // secret, l'app reçoit le cookie mais n'en tire rien), se connecter à une app vaut
  // pour toutes. Corollaire assumé : une DÉCONNEXION vaut aussi pour toutes.
  //
  // Variable non définie (local, préversions) ⇒ comportement natif, cookie limité à
  // l'hôte. Voir `lib/sessionPartagee.ts`.
  cookies: cookiesSessionPartagee(process.env.AUTH_COOKIE_DOMAIN),
  // Requis en local et en auto-hébergement (sinon `UntrustedHost`). Sans risque : les
  // redirect URIs sont verrouillés côté Google.
  trustHost: true,
  pages: { signIn: "/connexion", error: "/connexion" },
  callbacks: {
    // ⚠️ LE SEUL CONTRÔLE D'ACCÈS QUI RESTE, ET IL TOURNE À CHAQUE LECTURE.
    //
    // Il n'y a plus de callback `signIn` : aucune connexion ne se fait ici, donc il ne
    // tournerait jamais. Tout le contrôle repose maintenant sur ce `jwt`, ce qui est plus
    // sain — il suit la DONNÉE, pas la connexion.
    //
    // Sans lui, JobAI accepterait sans broncher n'importe quelle session posée sur
    // `.hubperso.com` par une autre app. Aujourd'hui les apps partagent la même
    // AUTHORIZED_EMAIL, mais c'est une coïncidence de configuration, pas une garantie —
    // et JobAI est celle qui a le plus à perdre : adresse du domicile, statut migratoire,
    // noms de personnes tierces.
    //
    // Renvoyer `null` INVALIDE la session (Auth.js v5) : le garde redirige vers
    // /connexion, aucune donnée n'est rendue.
    //
    // ⚠️ `user` reste dans la signature bien qu'aucune connexion locale ne le fournisse :
    // Auth.js le passe encore si une session est créée par un chemin qu'on n'a pas prévu.
    // Le retirer ferait silencieusement perdre l'adresse dans ce cas-là.
    jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      if (!estEmailAutorise(token.email, process.env.AUTHORIZED_EMAIL)) return null;
      return token;
    },
  },
});
