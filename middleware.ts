// middleware.ts — garde global. JobAI est privé : il affiche un suivi de recherche
// d'emploi, un statut migratoire et un historique de candidatures.
//
// Le middleware ne DÉCIDE rien : il applique `deciderGarde` (pure et testée). Toute la
// subtilité — l'endpoint du hub gardé par jeton, le 401 JSON pour les routes machine —
// vit dans `lib/garde.ts` où elle peut être vérifiée exhaustivement.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deciderGarde } from "@/lib/garde";
import { estAuthConfiguree } from "@/lib/autorisation";

export default auth((req) => {
  // ÉCHEC FERMÉ : sans configuration d'authentification, on ne sert rien. Une variable
  // d'environnement peut disparaître d'un déploiement à l'autre ; ce jour-là, l'app doit
  // se taire, pas s'ouvrir.
  if (!estAuthConfiguree()) {
    return NextResponse.json(
      {
        error: "auth_non_configuree",
        message:
          "Authentification non configurée (AUTH_SECRET / AUTHORIZED_EMAIL manquants). Accès refusé.",
      },
      { status: 503 },
    );
  }

  const decision = deciderGarde({
    authentifie: Boolean(req.auth),
    chemin: req.nextUrl.pathname,
    recherche: req.nextUrl.search,
  });

  switch (decision.type) {
    case "laisser-passer":
      return;
    case "non-authentifie":
      return NextResponse.json(
        { error: "non_authentifie", message: "Authentification requise." },
        { status: 401 },
      );
    case "rediriger":
      return NextResponse.redirect(new URL(decision.vers, req.nextUrl.origin));
  }
});

export const config = {
  // Garde TOUT sauf les assets. Les exceptions légitimes (connexion, Auth.js, endpoint du
  // hub) passent par `estCheminPublic`, où elles sont documentées et testées.
  // ⚠️ NE JAMAIS ajouter ici une route qui affiche des données : ce matcher est le dernier
  // filet, et une route qui n'y entre pas n'est gardée par rien.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
