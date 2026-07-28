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
  // Requis en local et en auto-hébergement (sinon `UntrustedHost`). Sans risque : les
  // redirect URIs sont verrouillés côté Google.
  trustHost: true,
  pages: { signIn: "/connexion", error: "/connexion" },
  callbacks: {
    signIn({ user }) {
      return estEmailAutorise(user?.email, process.env.AUTHORIZED_EMAIL);
    },
  },
});
