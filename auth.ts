// auth.ts — Auth.js (NextAuth v5), Google, un seul compte admis.
//
// Même patron que le hub perso et BatchChef : session JWT, secrets par l'environnement,
// filtre d'accès en fonction pure (lib/autorisation.ts).
//
// PAS DE SCOPE GMAIL NI DRIVE ICI. Le scan des réponses (V2) et la lecture du CV (V3) en
// auront besoin, mais ce sont des scopes RESTREINTS chez Google : les ajouter change le
// régime de vérification de l'application entière. Ils feront l'objet de l'ADR-0002 du
// chantier V2, pas d'un ajout discret aujourd'hui.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { estEmailAutorise } from "@/lib/autorisation";
import { cookiesSessionPartagee } from "@/lib/sessionPartagee";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // Mêmes noms de variables que le hub et BatchChef : trois conventions différentes
      // pour la même chose finiraient par coûter une soirée de débogage.
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
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
    signIn({ user }) {
      return estEmailAutorise(user?.email, process.env.AUTHORIZED_EMAIL);
    },
    // ⚠️ REVÉRIFICATION À CHAQUE LECTURE — c'est la contrepartie du cookie partagé.
    //
    // `signIn` ne tourne qu'à la CONNEXION. Le cookie étant désormais lisible par tous
    // les sous-domaines, JobAI accepterait sans broncher une session fabriquée par une
    // autre app du hub. Aujourd'hui c'est cohérent — les apps partagent la même
    // AUTHORIZED_EMAIL — mais ça ne l'est que par coïncidence de configuration, et
    // JobAI est celle qui a le plus à perdre : adresse du domicile, statut migratoire,
    // noms de tiers.
    //
    // `jwt` tourne à chaque lecture de session. Renvoyer `null` INVALIDE la session
    // (Auth.js v5) — le garde redirige vers /connexion, aucune donnée n'est rendue.
    jwt({ token, user }) {
      // À la connexion seulement : on fixe l'adresse dans le jeton. Aux lectures
      // suivantes, `user` est absent et c'est `token.email` qui fait foi.
      if (user?.email) token.email = user.email;
      if (!estEmailAutorise(token.email, process.env.AUTHORIZED_EMAIL)) return null;
      return token;
    },
  },
});
