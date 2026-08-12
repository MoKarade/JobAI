"use client";

// components/ServiceWorker.tsx
//
// Enregistre `/sw.js`, uniquement pour rendre JobAI INSTALLABLE sur PC et Android
// (Chromium exige un service worker actif pour proposer l'installation ; iOS n'en a pas
// besoin). Le worker lui-même ne met RIEN en cache — voir l'en-tête de `public/sw.js`.
//
// Silencieux par conception : si l'enregistrement échoue (navigateur sans support, mode
// privé, contexte non sécurisé), l'app fonctionne exactement pareil, elle n'est simplement
// pas installable. Une capacité optionnelle ne doit pas produire d'erreur à l'écran — mais
// on ne l'avale pas non plus en silence total, la console garde la trace.

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("Service worker non enregistré — JobAI reste utilisable, mais pas installable.", err);
    });
  }, []);

  return null;
}
