"use client";

// LIA, démarrée une fois pour toute l'app (l'état du moteur est global : une seule par page).
// Tout ce qui se décide est dans lib/lia/ ; ce module ne fait que brancher.
//
// ⚠️ Elle est démarrée AU CHARGEMENT DU MODULE, jamais dans un effet ni dans le rendu : `demarrerLia` la pose dans
// `document.body`, hors de l'arbre React, donc elle reste là pendant un chargement (`loading.tsx`), sur une erreur
// (`error.tsx`, `global-error.tsx`) et sur une 404. Une seule voie : ne jamais remonter `<Lia />` ailleurs.
// Le layout ne rend ce module que pour une session admise (`liaAutorisee`) : pas de LIA sur `/connexion`,
// où `/api/lia/ask` répondrait 401.

import { demarrerLia } from "@mokarade/lia-ui/boot";
import { demanderLia } from "@/lib/lia/client";

// Mêmes options que le hub : LIA identique partout, même quand le système réduit les animations
// (`quandMouvementReduit`), et la pastille d'humeur est celle du paquet (aucune pastille maison).
// Côté serveur (rendu du module) `demarrerLia` ne fait rien : pas de `document`.
demarrerLia({
  quandMouvementReduit: "complet",
  humeurVisible: true,
  ask: (question, signal) => demanderLia(question, signal, { page: window.location.pathname }),
});

export default function LiaMontee() {
  return null;
}
