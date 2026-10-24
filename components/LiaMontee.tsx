"use client";

// LIA, démarrée une fois pour toute l'app (l'état du moteur est global : une seule par page).
// Tout ce qui se décide est dans lib/lia/ ; ce module ne fait que brancher.
//
// ⚠️ Elle est démarrée AU CHARGEMENT DU MODULE, jamais dans un effet ni dans le rendu : `demarrerLia` la pose dans
// `document.body`, hors de l'arbre React, donc elle reste là pendant un chargement (`loading.tsx`), sur une erreur
// (`error.tsx`, `global-error.tsx`) et sur une 404. Une seule voie : ne jamais remonter `<Lia />` ailleurs.
// Mode invité (24/10/2026, demande du Coordinateur : « LIA présente tout le temps ») : le layout et `global-error.tsx` la montent
// aussi sans session, `/connexion` compris. Son `ask` ne part alors pas sur le réseau (lib/lia/askInvite.ts) ;
// le layout dit si la session est admise, ce qui ouvre `ask` vers `/api/lia/ask` (toujours derrière la session).

import { demarrerLia } from "@mokarade/lia-ui/boot";
import { useEffect } from "react";
import { creerAskInvite, creerIndicateurSession } from "@/lib/lia/askInvite";
import { demanderLia } from "@/lib/lia/client";

const session = creerIndicateurSession();

// Mêmes options que le hub : LIA identique partout, même quand le système réduit les animations
// (`quandMouvementReduit`), et la pastille d'humeur est celle du paquet (aucune pastille maison).
// Côté serveur (rendu du module) `demarrerLia` ne fait rien : pas de `document`.
demarrerLia({
  quandMouvementReduit: "complet",
  humeurVisible: true,
  ask: creerAskInvite(session, (question, signal) => demanderLia(question, signal, { page: window.location.pathname })),
});

export default function LiaMontee({ session: admise = false }: { session?: boolean }) {
  // Dans un effet (jamais au rendu) : le drapeau vit côté navigateur seulement, pas partagé entre requêtes serveur.
  useEffect(() => {
    if (admise) session.activer();
  }, [admise]);
  return null;
}
