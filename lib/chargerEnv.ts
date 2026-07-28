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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Dans l'ordre de lecture. `.env.local` d'abord : c'est le fichier propre à la machine. */
const FICHIERS = [".env.local", ".env"] as const;

/**
 * Lit un fichier `.env` et rend ses paires.
 *
 * ⚠️ POURQUOI ON N'UTILISE PLUS `process.loadEnvFile` : il ne retire PAS le BOM UTF-8.
 * Windows en écrit un par défaut — `Set-Content -Encoding utf8` sous PowerShell 5.1 comme
 * le Bloc-notes. La première clé du fichier devient alors « \uFEFFDATABASE_URL », et
 * `process.env.DATABASE_URL` reste `undefined` : le fichier est correct, la variable est
 * introuvable, et rien ne l'explique. Vécu le 2026-07-28, deux fois.
 *
 * On ne peut pas demander à quelqu'un de contourner le comportement par défaut de son
 * système d'exploitation. On lit donc le fichier nous-mêmes.
 */
function analyser(contenu: string): [string, string][] {
  const paires: [string, string][] = [];

  // Le BOM en tête, et les fins de ligne Windows.
  for (const brute of contenu.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const ligne = brute.trim();
    if (ligne.length === 0 || ligne.startsWith("#")) continue;

    const separateur = ligne.indexOf("=");
    if (separateur === -1) continue;

    // `export FOO=bar` est une forme courante quand on recopie depuis un script shell.
    const cle = ligne.slice(0, separateur).trim().replace(/^export\s+/, "");
    if (cle.length === 0) continue;

    let valeur = ligne.slice(separateur + 1).trim();
    // Guillemets encadrants : une chaîne Neon collée entre guillemets ne doit pas les garder.
    const premier = valeur[0];
    if ((premier === '"' || premier === "'") && valeur.endsWith(premier) && valeur.length > 1) {
      valeur = valeur.slice(1, -1);
    }

    paires.push([cle, valeur]);
  }

  return paires;
}

/**
 * Charge les fichiers d'environnement présents, et rend la liste de ceux qui l'ont été.
 *
 * Un fichier ABSENT est normal et silencieux — la plupart des environnements n'en ont pas.
 * Toute autre erreur (fichier illisible, dossier au lieu d'un fichier) est PROPAGÉE :
 * l'avaler ferait échouer la commande plus loin avec un message sans rapport.
 *
 * Une variable DÉJÀ posée dans l'environnement n'est jamais écrasée : ce qu'on passe
 * explicitement à une commande l'emporte sur un fichier qu'on a peut-être oublié.
 */
export function chargerEnvLocal(racine: string = process.cwd()): string[] {
  const charges: string[] = [];

  for (const nom of FICHIERS) {
    let contenu: string;
    try {
      contenu = readFileSync(resolve(racine, nom), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      throw err;
    }

    for (const [cle, valeur] of analyser(contenu)) {
      if (process.env[cle] === undefined) process.env[cle] = valeur;
    }
    charges.push(nom);
  }

  return charges;
}

/**
 * Masque les identifiants d'une chaîne de connexion dans un texte quelconque.
 *
 * ⚠️ Ce helper existe à cause d'un vrai risque, constaté le 2026-07-28 : la bibliothèque
 * `neon()` ÉCHO LA CHAÎNE DE CONNEXION dans son message d'erreur. Ce jour-là elle contenait
 * un espace réservé, donc sans conséquence — avec la vraie valeur, le mot de passe Neon
 * s'affichait en clair dans le terminal, et de là dans un copier-coller, une capture, un
 * historique de shell.
 *
 * Tout message d'erreur d'outillage passe par ici AVANT d'être affiché. On ne contrôle pas
 * ce que les bibliothèques mettent dans leurs erreurs ; on contrôle ce qu'on imprime.
 */
export function masquerIdentifiants(texte: string): string {
  // La partie identifiants est capturée de façon GLOUTONNE jusqu'au DERNIER `@` avant
  // l'hôte. Un premier jet s'arrêtait au premier `@` : un mot de passe contenant lui-même
  // un `@` — parfaitement légal quand il n'est pas encodé — ressortait alors à moitié en
  // clair (`***@ssw0rd`). Le `[^\s/]` empêche de déborder sur le chemin.
  return texte.replace(
    /([a-z][a-z0-9+.-]*:\/\/)([^\s/]*)@([^\s@/]+)/gi,
    (_t, schema: string, identifiants: string, hote: string) => {
      const separateur = identifiants.indexOf(":");
      if (separateur === -1) return `${schema}${identifiants}@${hote}`;
      return `${schema}${identifiants.slice(0, separateur)}:***@${hote}`;
    },
  );
}

/**
 * Les espaces réservés de la documentation. Une valeur qui en contient un n'a pas été
 * remplacée — c'est une erreur de configuration très différente d'une variable absente,
 * et elle mérite son propre message.
 */
const ESPACES_RESERVES = ["…", "...", "COLLE-ICI", "TON_", "xxx", "VALEURFACTICE"];

export type EtatUrl = { ok: true; url: string } | { ok: false; message: string };

/**
 * La chaîne de connexion, ou un message qui dit QUOI FAIRE.
 *
 * Trois états distincts, parce qu'ils appellent trois gestes différents : absente, laissée
 * à l'espace réservé, ou utilisable. `drizzle-kit` seul rendait « [x] url: '' » — vrai, et
 * inutile.
 */
export function diagnostiquerUrl(): EtatUrl {
  const url = process.env.DATABASE_URL?.trim();

  if (!url || url.length === 0) return { ok: false, message: AIDE_URL_MANQUANTE };

  const reserve = ESPACES_RESERVES.find((marqueur) => url.includes(marqueur));
  if (reserve !== undefined) {
    return { ok: false, message: aideEspaceReserve(reserve) };
  }

  return { ok: true, url };
}

/** Compatibilité : rend la chaîne utilisable, ou `null`. */
export function urlBaseDeDonnees(): string | null {
  const etat = diagnostiquerUrl();
  return etat.ok ? etat.url : null;
}

/** Le message affiché quand la chaîne manque. Exporté pour être vérifié par test. */
export const AIDE_URL_MANQUANTE = [
  "DATABASE_URL est absente.",
  "",
  "Elle se pose dans le fichier `.env.local`, à la racine du dépôt (non versionné).",
  "Le fichier doit contenir UNE ligne, avec la chaîne COMPLÈTE copiée depuis neon.tech :",
  "",
  "    DATABASE_URL=postgresql://<utilisateur>:<motdepasse>@<hote>/<base>?sslmode=require",
  "",
  "Ce fichier est lu automatiquement par `npm run db:migrate` et `npm run db:seed`.",
  "Voir docs/DEPLOIEMENT.md, étape 4.",
].join("\n");

/** Le message affiché quand la chaîne est restée à l'espace réservé. */
export function aideEspaceReserve(marqueur: string): string {
  return [
    `DATABASE_URL contient encore un espace réservé (« ${marqueur} ») : elle n'a pas été`,
    "remplacée par la vraie chaîne de connexion.",
    "",
    "Ouvre `.env.local` à la racine du dépôt et remplace la ligne ENTIÈRE par la chaîne",
    "copiée depuis neon.tech (Dashboard → Connection string). Elle commence par",
    "`postgresql://`, contient un mot de passe, et fait plusieurs dizaines de caractères.",
    "",
    "    notepad .env.local",
    "",
    "⚠️ Ne colle pas cette chaîne dans un terminal ni dans une conversation : elle contient",
    "le mot de passe de la base.",
  ].join("\n");
}

/**
 * Déplie la chaîne des `cause` d'une erreur en un message lisible, identifiants masqués.
 *
 * ⚠️ Vécu le 2026-07-28 : une migration échouait sur « Failed query: CREATE SCHEMA IF NOT
 * EXISTS "drizzle" » — vrai, et sans aucune valeur diagnostique. La VRAIE raison était deux
 * niveaux plus bas : « Host not in allowlist ». N'afficher que `err.message` revient à
 * cacher la seule information utile derrière la moins utile.
 */
export function messageComplet(err: unknown, profondeurMax = 4): string {
  const morceaux: string[] = [];
  let courant: unknown = err;

  for (let i = 0; i < profondeurMax && courant != null; i += 1) {
    const m = courant instanceof Error ? courant.message : String(courant);
    // Un même message répété par chaque niveau d'emballage n'apporte rien.
    if (m && !morceaux.includes(m)) morceaux.push(m);
    courant = (courant as { cause?: unknown })?.cause;
  }

  return masquerIdentifiants(morceaux.join("\n  ↳ "));
}
