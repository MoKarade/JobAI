// lib/overpass.ts — demander à OpenStreetMap où sont les bornes de recharge.
//
// ⚠️ TROISIÈME FRONTIÈRE RÉSEAU DE L'APP, et elle est déclarée ici comme les deux autres :
// `lib/ingest/` parle aux sources d'offres, `lib/geocodage.ts` parle à Nominatim, ce fichier
// parle à Overpass. Aucun autre module n'a le droit de sortir. Overpass sert la MÊME base
// de données qu'OpenStreetMap — celle qui nous donne déjà les positions — par une autre
// porte : elle répond à « qu'y a-t-il dans ce rectangle ? » là où Nominatim répond à « où
// est ce nom ? ».
//
// ⚠️ CE SERVICE TOMBE, ET IL FAUT COMPTER AVEC
// Mesuré le 2026-08-05 sur un runner au réseau ouvert : `overpass-api.de` a répondu
// **HTTP 504** à la première interrogation. Ce n'est pas un refus — c'est une instance
// bénévole saturée. Toute la conception en découle :
//   · plusieurs instances, essayées l'une après l'autre ;
//   · un échec n'est JAMAIS une réponse « aucune borne » — les deux ne se disent pas pareil
//     à l'écran, et les confondre ferait passer un lieu non mesuré pour un lieu sans borne ;
//   · le résultat se GARDE en base, pour ne pas redemander ce qu'on sait déjà.
//
// USAGE PARCIMONIEUX, comme pour Nominatim : ce sont des bénévoles qui paient la facture.
// Une entreprise n'est interrogée qu'une fois, et rien n'est demandé au chargement d'une
// page.

import { boiteAutour, type Borne } from "./bornes";

/**
 * Les instances publiques, dans l'ordre d'essai.
 *
 * Plusieurs, parce qu'une seule est un point unique de panne — et qu'on en a eu la preuve
 * avant même d'écrire ce fichier. On s'arrête à la PREMIÈRE qui répond : ce n'est pas une
 * répartition de charge, c'est un repli.
 */
export const INSTANCES_OVERPASS: readonly string[] = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

/** Au-delà, on abandonne : une requête qui pend bloquerait toute la passe. */
export const DELAI_MAX_MS = 15_000;

/** Ce qu'une interrogation a donné — l'échec est DIT, jamais confondu avec un vide. */
export type ResultatBornes =
  | { ok: true; bornes: Borne[] }
  | { ok: false; raison: string };

/**
 * La requête Overpass QL pour les bornes d'un rectangle.
 *
 * `node` ET `way` : une borne est parfois cartographiée comme un point, parfois comme la
 * surface d'une station. N'interroger que les points en manquerait une partie — et « aucune
 * borne » serait alors faux.
 */
export function requeteBornes(boite: {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}): string {
  const b = `${boite.latMin},${boite.lonMin},${boite.latMax},${boite.lonMax}`;
  return `[out:json][timeout:12];(node["amenity"="charging_station"](${b});way["amenity"="amenity_placeholder"](${b}););out center;`
    .replace("amenity_placeholder", "charging_station");
}

/** Lit une réponse Overpass. PURE : c'est ce qui la rend testable sans réseau. */
export function lireBornes(charge: unknown): Borne[] {
  if (typeof charge !== "object" || charge === null) return [];
  const elements = (charge as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return [];

  const bornes: Borne[] = [];
  for (const e of elements as Record<string, unknown>[]) {
    // `center` pour les surfaces (`way`), `lat`/`lon` pour les points (`node`).
    const centre = e.center as { lat?: unknown; lon?: unknown } | undefined;
    const lat = Number(centre?.lat ?? e.lat);
    const lon = Number(centre?.lon ?? e.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tags = (e.tags ?? {}) as Record<string, unknown>;
    const brut = [tags.name, tags.operator, tags.network].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );

    bornes.push({
      id: Number(e.id) || 0,
      lat,
      lon,
      // Borné : un nom d'exploitant est court, et cette chaîne finit à l'écran.
      nom: brut ? brut.trim().slice(0, 80) : null,
    });
  }
  return bornes;
}

/** De quoi appeler le réseau — injecté, donc testable. */
export interface OutilsOverpass {
  recuperer?: typeof fetch;
  instances?: readonly string[];
}

/**
 * Les bornes autour d'un point.
 *
 * Essaie les instances l'une après l'autre et s'arrête à la première qui RÉPOND. Un échec
 * de toutes rend `ok: false` avec sa raison — jamais une liste vide, qui se lirait comme
 * « aucune borne ici » alors qu'on n'a rien pu mesurer.
 */
export async function chercherBornes(
  lieu: { lat: number; lon: number },
  rayonM: number,
  outils: OutilsOverpass = {},
): Promise<ResultatBornes> {
  const recuperer = outils.recuperer ?? fetch;
  const instances = outils.instances ?? INSTANCES_OVERPASS;
  const corps = requeteBornes(boiteAutour(lieu, rayonM));
  const echecs: string[] = [];

  for (const url of instances) {
    try {
      const r = await recuperer(url, {
        method: "POST",
        body: new URLSearchParams({ data: corps }),
        headers: {
          // Se présenter : Overpass refuse les appelants anonymes trop insistants, et
          // c'est la moindre des politesses envers un service bénévole.
          "User-Agent": "JobAI/1.0 (recherche d'emploi personnelle)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(DELAI_MAX_MS),
      });

      if (!r.ok) {
        // 504 mesuré en vrai : l'instance est saturée, pas en panne. On passe à la
        // suivante plutôt que d'abandonner.
        echecs.push(`${hote(url)} → HTTP ${r.status}`);
        continue;
      }

      return { ok: true, bornes: lireBornes(await r.json()) };
    } catch (err) {
      echecs.push(`${hote(url)} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: false, raison: echecs.join(" · ") || "aucune instance interrogée" };
}

/** L'hôte seul, pour un message d'erreur lisible sans étaler l'URL entière. */
function hote(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
