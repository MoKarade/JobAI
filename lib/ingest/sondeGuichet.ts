// lib/ingest/sondeGuichet.ts — quelle adresse du Guichet-Emplois répond VRAIMENT ?
//
// POURQUOI CE FICHIER EXISTE
// `sourceGuichet`, `urlGuichet` et `analyserRss` sont écrits et testés depuis longtemps. La
// source est éteinte par une seule ligne — `RECHERCHES_GUICHET = []` — parce que l'adresse
// du flux rendait 404. Il ne manque donc pas du code : il manque UNE ADRESSE QUI RÉPOND.
//
// Or cette question a été « répondue » trois fois le 2026-08-17 sans être mesurée une seule,
// à chaque fois en lisant un titre dans une liste de résultats de recherche. Marc a ouvert le
// premier lien proposé : il tombe sur l'accueil. La session de Claude, elle, ne peut pas
// trancher — le proxy de l'environnement refuse l'hôte au tunnel CONNECT (403).
//
// LA PRODUCTION, ELLE, N'EST PAS BLOQUÉE. Preuve du jour : Overpass a rendu 67 bornes à
// 15:52, Nominatim et l'API Google Maps ont répondu à 15:00 — depuis Vercel. C'est donc de
// LÀ qu'il faut poser la question, pas d'ici.
//
// CE QU'ELLE NE FAIT PAS : écrire. Aucune offre n'est ingérée, aucun état n'est touché. Elle
// regarde et elle rapporte. Une sonde qui écrit devient un chemin d'ingestion parallèle,
// c'est-à-dire une seconde implémentation de l'ingestion.

import { analyserRss } from "./analyseurs";
import { entetes } from "./sources";

/** Ce qu'on veut savoir d'une adresse, et rien de plus. */
export interface VerdictSonde {
  url: string;
  /**
   * L'URL RÉELLEMENT servie, après redirections.
   *
   * ⚠️ C'EST LE CHAMP QUI COMPTE. Une adresse d'employeur qui redirige vers l'accueil rend
   * un 200 parfaitement honnête — et ne contient aucune offre. Sans comparer l'arrivée au
   * départ, la sonde dirait « ça marche » sur exactement le cas que Marc a constaté à
   * l'écran. Un 200 ne prouve rien ; un 200 au bon endroit, si.
   */
  urlFinale: string;
  statut: number | null;
  typeContenu: string | null;
  octets: number;
  /** Ce qu'`analyserRss` en tire. Zéro sur du HTML, c'est attendu et ça se lit. */
  offres: number;
  /** Les premiers caractères, pour l'œil humain — aucun code ne remplace cette lecture. */
  apercu: string;
  /** Renseigné seulement si la requête n'est jamais partie (réseau, blocage, délai). */
  erreur?: string;
}

/** Délai par adresse. Court : on en essaie plusieurs sous le mur d'une fonction. */
export const DELAI_SONDE_MS = 8_000;

/** Pause entre deux adresses — un service public ne se martèle pas, même pour un test. */
export const PAUSE_SONDE_MS = 700;

/**
 * Les adresses à éprouver, de la plus prometteuse à la plus douteuse.
 *
 * ⚠️ AUCUNE N'EST « OBSERVÉE » : ce sont des HYPOTHÈSES, et c'est tout l'objet de la sonde.
 * Les deux premières sont des témoins — si l'accueil lui-même ne répond pas, tout le reste
 * est du bruit et on le saura en une ligne au lieu de conclure « le flux est mort ».
 */
export function adressesCandidates(recherche: string): string[] {
  const q = encodeURIComponent(recherche);
  const lieu = encodeURIComponent("Québec, QC");
  return [
    // Témoins de joignabilité — la question « l'hôte répond-il ? » avant « quelle page ? ».
    "https://www.jobbank.gc.ca/home",
    "https://www.guichetemplois.gc.ca/accueil",
    // L'adresse historique, celle qui rendait 404 et a fait éteindre la source.
    `https://www.jobbank.gc.ca/jobsearch/rss?searchstring=${q}&locationstring=${lieu}&sort=M`,
    // Variantes de flux plausibles, côté français et côté anglais.
    `https://www.guichetemplois.gc.ca/trouverunemploi/rss?searchstring=${q}&locationstring=${lieu}`,
    `https://www.jobbank.gc.ca/jobsearch/rss?searchstring=${q}`,
    // Les pages HTML : elles ne donnent pas de flux, mais leur URL FINALE dit si le chemin
    // existe encore ou s'il redirige vers l'accueil — ce que Marc a constaté à l'écran.
    `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${q}&locationstring=${lieu}`,
    "https://www.guichetemplois.gc.ca/parcourirlesoffresdemploi/province/QC",
    "https://www.guichetemplois.gc.ca/parcourirlesoffresdemploi/employeur/Laserax/QC",
  ];
}

async function sonderUne(url: string): Promise<VerdictSonde> {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_SONDE_MS);
  try {
    const r = await fetch(url, { headers: entetes(), signal: ctrl.signal, cache: "no-store" });
    const corps = await r.text();
    let offres = 0;
    try {
      offres = analyserRss(corps).length;
    } catch {
      // Du HTML donné à un analyseur RSS n'est pas une panne : c'est une réponse à la
      // question posée. On rend zéro, et l'aperçu dira ce que c'était.
      offres = 0;
    }
    return {
      url,
      urlFinale: r.url || url,
      statut: r.status,
      typeContenu: r.headers.get("content-type"),
      octets: corps.length,
      offres,
      apercu: corps.slice(0, 240).replace(/\s+/g, " ").trim(),
    };
  } catch (err) {
    return {
      url,
      urlFinale: url,
      statut: null,
      typeContenu: null,
      octets: 0,
      offres: 0,
      apercu: "",
      erreur: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Éprouve les adresses, EN SÉRIE.
 *
 * En série et non en parallèle : c'est un service public gratuit, et la sonde n'a aucune
 * raison d'être pressée. `budgetMs` la borne pour qu'elle ne dépasse pas la durée de la
 * fonction qui l'appelle — et elle DIT ce qu'elle n'a pas eu le temps d'essayer, parce
 * qu'une liste tronquée en silence se lirait comme une liste complète.
 */
export async function sonderGuichet(
  recherche: string,
  budgetMs: number,
  maintenant: () => number = Date.now,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((s) => setTimeout(s, ms)),
): Promise<{ verdicts: VerdictSonde[]; nonEssayees: string[] }> {
  const echeance = maintenant() + budgetMs;
  const adresses = adressesCandidates(recherche);
  const verdicts: VerdictSonde[] = [];

  for (const [i, url] of adresses.entries()) {
    // Vérifié AVANT de lancer : une requête partie se paie quoi qu'il arrive.
    if (maintenant() + DELAI_SONDE_MS > echeance) {
      return { verdicts, nonEssayees: adresses.slice(i) };
    }
    verdicts.push(await sonderUne(url));
    if (i < adresses.length - 1) await dormir(PAUSE_SONDE_MS);
  }

  return { verdicts, nonEssayees: [] };
}
