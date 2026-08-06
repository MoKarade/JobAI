// lib/ingest/depotFichier.ts — les offres déposées DANS LE DÉPÔT, lues au fil de l'eau.
//
// POURQUOI CE CANAL EXISTE, ALORS QUE `POST /api/ingest/depot` EXISTE DÉJÀ
// Demande de Marc, 2026-08-06 : « je veux que ça marche et que ça m'en trouve des nouvelles
// à chaque jour ». Les sept sources automatiques sont mortes — mesurées, pas supposées
// (voir `docs/ROUTINE-DEPOT.md`). Restait la Routine claude.ai, qui marche mais qu'il faut
// créer et alimenter d'un jeton À LA MAIN. Tant que ce geste n'est pas fait, rien n'arrive.
//
// Une session de développement, elle, a le connecteur Indeed ET le dépôt git — mais AUCUN
// accès réseau vers l'app (mesuré : le proxy refuse `emploi.hubperso.com` comme il refuse
// Overpass). Elle ne peut donc pas appeler le point de dépôt. Elle peut, en revanche,
// ÉCRIRE UN FICHIER et le pousser : Vercel déploie, et l'app lit ce qu'elle porte
// elle-même. Aucun jeton, aucune requête sortante, aucun secret nulle part.
//
// ⚠️ CE N'EST PAS UNE ENTORSE AU GARDE-FOU N°4. Ce garde-fou interdit à l'app d'aller
// CHERCHER des offres ailleurs que par `lib/ingest/`. Ici l'app ne fait aucun `fetch` : elle
// lit un fichier de son propre dépôt, et le passe au MÊME `trier()` que le cron — même
// filtre de région, même plancher, même dédoublonnage, même péremption. La frontière réseau
// est inchangée, et ce fichier vit bien dans `lib/ingest/`, là où la règle l'exige.
//
// ⚠️ CE QU'ON NE CROIT PAS SUR PAROLE. Le fichier est versionné, donc relu en revue — mais
// il est écrit par un outil, à partir de données d'un site tiers. Validation stricte,
// bornes de taille, et la note est RECALCULÉE par `trier()`, jamais reprise du fichier
// (qui n'en porte d'ailleurs pas : le schéma est volontairement pauvre, comme celui de la
// route HTTP).

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LotDeposeSchema, type LotDepose } from "./depotSchema";
import type { OffreBrute, ResultatSource, Source } from "./types";

/** Le dossier des dépôts, relatif à la racine du projet. */
export const DOSSIER_DEPOT = "data/depot";

/**
 * Combien de jours de dépôts sont relus à chaque passe.
 *
 * ⚠️ SANS CETTE FENÊTRE, PLUS AUCUNE OFFRE NE PÉRIMERAIT JAMAIS. La péremption
 * (`lib/veille.ts`) repose sur une idée simple : une offre que la veille du jour n'a PAS
 * revue commence à compter ses absences. Relire tous les dépôts depuis le début ferait
 * réapparaître chaque jour une offre déposée il y a six mois — elle serait « revue » à
 * l'infini, et une annonce fermée resterait ouverte à l'écran pour toujours. C'est
 * exactement le fake data que le garde-fou n°3 interdit, produit non par une invention mais
 * par une lecture trop généreuse.
 *
 * Sept jours : la même fenêtre que la recherche de la Routine (« publiées dans les 7
 * derniers jours »). Un dépôt cesse d'être une observation au bout d'une semaine.
 */
export const FENETRE_DEPOT_JOURS = 7;

/** Le nom d'un fichier de dépôt : la date du jour où il a été constitué. */
const NOM_FICHIER = /^(\d{4}-\d{2}-\d{2})\.json$/;

export type Depot = LotDepose;

/**
 * Lit le contenu d'un fichier de dépôt. PURE : testable sans disque.
 *
 * Rend `null` sur tout ce qui n'est pas conforme, plutôt que de laisser passer une moitié
 * de lot. Un fichier mal formé est une erreur de l'outil qui l'a écrit — la traiter en
 * silence donnerait un dépôt qui « marche » en n'important rien.
 */
export function lireDepot(contenu: string): Depot | null {
  try {
    const brut: unknown = JSON.parse(contenu);
    const lot = LotDeposeSchema.parse(brut);
    return lot;
  } catch {
    return null;
  }
}

/**
 * Les fichiers à relire, du plus récent au plus ancien.
 *
 * PURE : elle reçoit la liste des noms et la date du jour. Le tri décroissant n'est pas
 * cosmétique — il fait que, à contenu égal, c'est le dépôt le plus récent qui est vu en
 * premier, donc celui dont la description et la ville sont les plus à jour.
 */
export function fichiersDansLaFenetre(
  noms: readonly string[],
  aujourdhui: string,
  fenetreJours = FENETRE_DEPOT_JOURS,
): string[] {
  const limite = Date.parse(`${aujourdhui}T00:00:00Z`);
  if (!Number.isFinite(limite)) return [];
  const plancher = limite - fenetreJours * 86_400_000;

  return noms
    .filter((n) => {
      const m = NOM_FICHIER.exec(n);
      if (m === null) return false;
      const t = Date.parse(`${m[1]}T00:00:00Z`);
      // Strictement dans la fenêtre, et jamais dans le FUTUR : un fichier daté de demain
      // signale une horloge fausse ou une faute de frappe, pas une observation.
      return Number.isFinite(t) && t > plancher && t <= limite;
    })
    .sort((a, b) => b.localeCompare(a));
}

/** Un lot validé, mis à la forme qu'attend le reste du pipeline. */
export function brutesDuDepot(lot: Depot): OffreBrute[] {
  return lot.offres.map((o) => ({
    // `refSource` retombe sur le lien : c'est lui la clé de dédoublonnage, et un lot sans
    // identifiant de source ne doit pas se ré-importer à chaque passe.
    refSource: o.refSource || o.lien,
    titre: o.titre,
    entreprise: o.entreprise,
    ville: o.ville,
    lien: o.lien,
    description: o.description,
    publieeLe: o.publieeLe,
  }));
}

/**
 * La source « dépôt de fichiers ». Elle ignore le récupérateur réseau : c'est le but.
 *
 * Un dossier absent n'est PAS une erreur — c'est l'état normal tant qu'aucun dépôt n'a été
 * poussé. Un fichier illisible, lui, EST une erreur et se dit : un lot silencieusement
 * ignoré est indiscernable d'un lot vide, et c'est la classe de panne que ce dépôt a déjà
 * payée plusieurs fois.
 */
export function sourceDepotFichier(aujourdhui: string, racine = process.cwd()): Source {
  return {
    id: "depot-fichier",
    nom: "Dépôt de fichiers (data/depot)",
    interroger: async (): Promise<ResultatSource> => {
      const dossier = resolve(racine, DOSSIER_DEPOT);
      let noms: string[];
      try {
        noms = await readdir(dossier);
      } catch {
        return { ok: true, source: "depot-fichier", offres: [] };
      }

      const offres: OffreBrute[] = [];
      const illisibles: string[] = [];
      for (const nom of fichiersDansLaFenetre(noms, aujourdhui)) {
        try {
          const lot = lireDepot(await readFile(resolve(dossier, nom), "utf8"));
          if (lot === null) {
            illisibles.push(nom);
            continue;
          }
          offres.push(...brutesDuDepot(lot));
        } catch {
          illisibles.push(nom);
        }
      }

      if (illisibles.length > 0) {
        return {
          ok: false,
          source: "depot-fichier",
          erreur: `fichier(s) illisible(s) : ${illisibles.join(", ")}`,
        };
      }
      return { ok: true, source: "depot-fichier", offres };
    },
  };
}
