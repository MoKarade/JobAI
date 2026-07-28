// lib/chargerEnv.ts — donner à un outil en ligne de commande ce que Next.js lui donne déjà.
//
// POURQUOI CE FICHIER EXISTE. Next.js charge `.env.local` tout seul ; `drizzle-kit` et les
// scripts `tsx`, eux, tournent HORS de Next et ne le font pas. Résultat vécu le
// 2026-07-28 : `npm run db:migrate` a échoué sur « url: '' » alors que la chaîne de
// connexion était bien dans `.env.local`, juste à côté. Le contournement — poser
// `$env:DATABASE_URL` dans le terminal — ne survit pas à la fermeture de la fenêtre, et
// oblige à recoller un secret à la main chaque fois. C'est précisément le geste qu'on ne
// veut pas répéter.
//
// AUCUNE DÉPENDANCE. `process.loadEnvFile` est natif depuis Node 20.12 ; le projet épingle
// Node 22 (`.nvmrc`). Ajouter `dotenv` pour ça serait une dépendance de plus à surveiller.
//
// PRIORITÉ, mesurée et non supposée : une variable DÉJÀ posée dans l'environnement n'est
// jamais écrasée par le fichier. C'est le bon sens — ce qu'on passe explicitement à une
// commande doit l'emporter sur un fichier qu'on a oublié.

import { resolve } from "node:path";

/** Dans l'ordre de lecture. `.env.local` d'abord : c'est le fichier propre à la machine. */
const FICHIERS = [".env.local", ".env"] as const;

/**
 * Charge les fichiers d'environnement présents, et rend la liste de ceux qui l'ont été.
 *
 * Un fichier ABSENT est normal et silencieux — la plupart des environnements n'en ont pas.
 * Toute autre erreur (fichier illisible, syntaxe invalide) est PROPAGÉE : l'avaler ferait
 * échouer la commande plus loin avec un message sans rapport, ce qui est exactement le
 * genre de panne qu'on met une heure à diagnostiquer.
 */
export function chargerEnvLocal(racine: string = process.cwd()): string[] {
  const charges: string[] = [];

  for (const nom of FICHIERS) {
    try {
      process.loadEnvFile(resolve(racine, nom));
      charges.push(nom);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
  }

  return charges;
}

/**
 * La chaîne de connexion, ou `null` — avec, dans ce cas, un message qui dit QUOI FAIRE.
 *
 * `drizzle-kit` seul rend « [x] url: '' », ce qui est vrai mais n'aide personne : ça ne dit
 * ni où la variable est attendue, ni comment la poser.
 */
export function urlBaseDeDonnees(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : null;
}

/** Le message affiché quand la chaîne manque. Exporté pour être vérifié par test. */
export const AIDE_URL_MANQUANTE = [
  "DATABASE_URL est absente.",
  "",
  "Elle se pose dans le fichier `.env.local`, à la racine du dépôt (non versionné) :",
  "",
  "    DATABASE_URL=postgresql://…",
  "",
  "Ce fichier est lu automatiquement par `npm run db:migrate` et `npm run db:seed`.",
  "Voir docs/DEPLOIEMENT.md, étape 4.",
].join("\n");
