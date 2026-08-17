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
  /**
   * Les flux que la PAGE ELLE-MÊME annonce (`<link rel="alternate" type="…rss+xml">`).
   *
   * ⚠️ C'EST LA SEULE FAÇON DE TROUVER UN FLUX SANS EN DEVINER L'ADRESSE. Le 2026-08-17,
   * quatre adresses de flux ont été supposées et trois ont rendu 404 ; la cinquième
   * supposition n'aurait pas mieux valu. Une page qui a un flux le DÉCLARE dans son en-tête :
   * on arrête de chercher à l'aveugle, on lit ce que le site publie de lui-même.
   */
  fluxAnnonces: string[];
  /** Le contenu ressemble-t-il à du XML ? Sinon, « 0 offre » ne juge que l'analyseur. */
  estXml: boolean;
  /** Renseigné seulement si la requête n'est jamais partie (réseau, blocage, délai). */
  erreur?: string;
}

/**
 * Délai par adresse.
 *
 * Monté de 8 s à 12 s le 2026-08-17 : une adresse a EXPIRÉ au lieu de répondre, et un délai
 * dépassé n'est pas un verdict — c'est une absence de verdict. Les quatre autres avaient
 * tranché en moins d'une seconde ; laisser la cinquième sans réponse aurait fait conclure
 * « rien ne marche » d'un essai qui n'a jamais abouti.
 */
export const DELAI_SONDE_MS = 12_000;

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
    // ── Guichet-Emplois : témoins, puis flux ────────────────────────────────────────────
    // Les deux premiers répondent à « l'hôte répond-il ? » avant « quelle page ? ».
    "https://www.jobbank.gc.ca/home",
    `https://www.jobbank.gc.ca/jobsearch/rss?searchstring=${q}&locationstring=${lieu}&sort=M`,
    `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${q}&locationstring=${lieu}`,
    "https://www.guichetemplois.gc.ca/parcourirlesoffresdemploi/province/QC",

    // ── Les gros sites d'emploi québécois ───────────────────────────────────────────────
    // Ce ne sont PAS des sources retenues : ce sont des candidats à MESURER. Aucun n'entrera
    // dans la veille sans passer par un ADR (garde-fou n°4) — la sonde dit seulement ce qui
    // répond et ce qui déclare un flux. Mesuré vaut mieux que supposé, et c'est tout l'objet.
    "https://www.jobboom.com/fr",
    `https://www.jobboom.com/fr/emploi/${q}/_lfr`,
    "https://www.jobillico.com/fr/emplois",
    `https://www.jobillico.com/fr/recherche-emploi?skwd=${q}`,
    "https://www.quebecemploi.gouv.qc.ca/",
    "https://emplois.espresso-jobs.com/",
    "https://www.isarta.com/emplois/",
    "https://www.grenier.qc.ca/emplois",
    "https://www.jobsquebec.com/",
    "https://quebecentete.com/emplois/",

    // ── Emplois publics et parapublics de la région ─────────────────────────────────────
    "https://www.ville.quebec.qc.ca/apropos/emplois/",
    "https://www.carrieres.gouv.qc.ca/",
    "https://www.ulaval.ca/notre-universite/travailler-a-ulaval",

    // ── Agrégateurs à flux, historiquement les plus susceptibles d'en publier ───────────
    `https://ca.indeed.com/rss?q=${q}&l=${lieu}`,
    `https://www.careerjet.ca/search/jobs?s=${q}&l=${lieu}`,
  ];
}

/**
 * Les flux qu'une page déclare elle-même, résolus en URL absolues.
 *
 * PURE. C'est de l'autodécouverte, pas de la devinette : un site qui publie un flux le
 * signale dans son `<head>`. Quatre adresses ont été SUPPOSÉES le 2026-08-17 et trois ont
 * rendu 404 ; une cinquième supposition n'aurait rien valu de plus. On demande à la page.
 */
export function fluxDeclares(html: string, base: string): string[] {
  const trouves = new Set<string>();
  // Les attributs d'une balise `link` arrivent dans n'importe quel ordre : on repère la
  // balise entière, puis on lit ses attributs — un motif qui exigerait `type` avant `href`
  // raterait la moitié des pages, et ne le dirait pas.
  for (const balise of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/type\s*=\s*["']application\/(rss|atom)\+xml["']/i.test(balise)) continue;
    const href = balise.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      trouves.add(new URL(href, base).toString());
    } catch {
      // Un href illisible n'est pas une panne de la sonde : on l'ignore et on continue.
    }
  }
  return [...trouves];
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
    const finale = r.url || url;
    return {
      url,
      urlFinale: finale,
      statut: r.status,
      typeContenu: r.headers.get("content-type"),
      octets: corps.length,
      offres,
      apercu: corps.slice(0, 240).replace(/\s+/g, " ").trim(),
      fluxAnnonces: fluxDeclares(corps, finale),
      estXml: /^\s*<\?xml|<(rss|feed)\b/i.test(corps),
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
      fluxAnnonces: [],
      estXml: false,
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

  // ⚠️ PARALLÈLE ENTRE HÔTES, SÉRIE CHEZ CHACUN — et c'est un CALCUL, pas un goût.
  //
  // Dix-huit adresses en série coûteraient au pire 18 × 12 s, très au-delà du mur de 60 s de
  // la fonction : la sonde mourrait sans rien rapporter, ce qui se lirait comme « le site ne
  // répond pas ». Tout mettre en parallèle serait rapide et impoli — plusieurs requêtes
  // simultanées vers le même service, dont des services publics gratuits.
  //
  // La politesse se doit par HÔTE, pas globalement : on n'ouvre jamais deux requêtes vers le
  // même domaine, mais rien n'oblige à faire attendre `jobboom.com` pendant qu'on interroge
  // `jobbank.gc.ca`. Le pire cas devient donc « la file du domaine le plus chargé », soit
  // deux ou trois adresses — largement sous le mur. Même patron que la découverte d'ATS.
  const parHote = new Map<string, string[]>();
  for (const url of adresses) {
    let hote: string;
    try {
      hote = new URL(url).hostname;
    } catch {
      hote = url; // Une URL illisible reste seule dans sa file : elle rendra son erreur.
    }
    const file = parHote.get(hote) ?? [];
    file.push(url);
    parHote.set(hote, file);
  }

  const nonEssayees: string[] = [];
  const lots = await Promise.all(
    [...parHote.values()].map(async (file) => {
      const rendus: VerdictSonde[] = [];
      for (const [i, url] of file.entries()) {
        // Vérifié AVANT de lancer : une requête partie se paie quoi qu'il arrive.
        if (maintenant() + DELAI_SONDE_MS > echeance) {
          nonEssayees.push(...file.slice(i));
          break;
        }
        rendus.push(await sonderUne(url));
        if (i < file.length - 1) await dormir(PAUSE_SONDE_MS);
      }
      return rendus;
    }),
  );

  // L'ordre d'origine est rétabli : la liste a été écrite du plus prometteur au plus
  // douteux, et la rendre dans l'ordre d'arrivée des réseaux la trierait par hasard.
  const parUrl = new Map(lots.flat().map((v) => [v.url, v]));
  return {
    verdicts: adresses.map((u) => parUrl.get(u)).filter((v): v is VerdictSonde => v !== undefined),
    nonEssayees: adresses.filter((u) => nonEssayees.includes(u)),
  };
}
