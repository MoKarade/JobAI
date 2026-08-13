// public/sw.js — service worker MINIMAL, et volontairement inutile au réseau.
//
// Pourquoi il existe : les navigateurs Chromium exigent un service worker enregistré pour
// proposer « Installer l'application » sur PC et Android. iOS s'en passe et n'a besoin que
// du manifeste et de l'apple-touch-icon.
//
// Pourquoi il ne MET RIEN EN CACHE. JobAI affiche un suivi de candidatures qui bouge à
// chaque ajout, et un service worker qui sert du cache est exactement la machine à montrer
// un état périmé — la pire version, parce qu'elle survit au rechargement. Aucun
// `caches.put`, aucun `caches.match`, aucun mode hors-ligne : sans réseau, l'app ne s'ouvre
// pas. C'est préférable à une app qui s'ouvre sur les offres d'hier.
//
// Il y a une seconde raison, propre à ce dépôt : les données sont sensibles (adresse du
// domicile, statut migratoire, noms de tiers). Mettre des réponses en cache les écrirait
// sur le disque du navigateur, hors de tout contrôle de session. On ne le fait pas.
//
// `skipWaiting` + `clients.claim` : un nouveau déploiement remplace immédiatement l'ancien
// worker, sans attendre la fermeture des onglets.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Un gestionnaire `fetch` est REQUIS pour l'installabilité, mais il laisse tout passer :
// pas de `respondWith`, donc le navigateur applique son comportement réseau normal.
self.addEventListener("fetch", () => {});
