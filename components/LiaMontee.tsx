"use client";

// LIA, montée une fois pour toute l'app (l'état du moteur est global : une seule par page).
// Tout ce qui se décide est dans lib/lia/ ; ce composant ne fait que brancher.

import { Lia } from "@mokarade/lia-ui/react";
import { demanderLia } from "@/lib/lia/client";

export default function LiaMontee() {
  // Mêmes options que le hub : LIA identique partout, même quand le système réduit les animations
  // (`quandMouvementReduit`), et la pastille d'humeur est celle du paquet (aucune pastille maison).
  return (
    <Lia
      quandMouvementReduit="complet"
      humeurVisible
      ask={(question, signal) => demanderLia(question, signal, { page: window.location.pathname })}
    />
  );
}
