// lib/trajetRoutes.ts — l'appel Routes API et les règles du cache. Le SEUL fichier qui
// parle à routes.googleapis.com (ADR-0016, lot B).
//
// ⚠️ CHAQUE APPEL COÛTE DE L'ARGENT. Les trois gardes de ce module existent pour ça :
// le cache ne se recalcule que si quelque chose a BOUGÉ, le compteur journalier refuse
// au-delà du plafond EN LE DISANT, et la durée est SANS trafic — une durée « avec trafic »
// mise en cache des jours serait un mensonge daté.

import { z } from "zod";
import type { TrajetRow } from "./db/schema";

/**
 * En deçà de cet écart (en degrés, ≈ 110 m en latitude), une position est « la même ».
 *
 * Un géocodage re-passé rend rarement le mètre près : invalider le cache pour trois
 * mètres re-paierait l'appel pour un trajet identique.
 */
export const TOLERANCE_POSITION_DEG = 0.001;

/** Le cache tient-il toujours ? PURE — les deux extrémités doivent ne pas avoir bougé. */
export function cacheValide(
  ligne: Pick<TrajetRow, "lat" | "lon" | "origineLat" | "origineLon">,
  entreprise: { lat: number; lon: number },
  domicile: { lat: number; lon: number },
): boolean {
  const proche = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_POSITION_DEG;
  return (
    proche(ligne.lat, entreprise.lat) &&
    proche(ligne.lon, entreprise.lon) &&
    proche(ligne.origineLat, domicile.lat) &&
    proche(ligne.origineLon, domicile.lon)
  );
}

/** « 34 min », « 1 h 05 ». PURE. Jamais de secondes : la précision serait un mensonge. */
export function formaterDuree(dureeS: number): string {
  const minutes = Math.round(dureeS / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${h} h` : `${h} h ${String(reste).padStart(2, "0")}`;
}

/** « 28 km », « 850 m ». PURE. */
export function formaterDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${Math.round(distanceM / 1000)} km`;
}

/**
 * La réponse Routes, réduite à ce qu'on consomme. La durée arrive en `"1234s"` — une
 * CHAÎNE avec un s, pas un nombre : le schéma la convertit et refuse ce qui n'y ressemble
 * pas, plutôt que de laisser un NaN se glisser dans le cache.
 */
const ReponseRoutesSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z
          .string()
          .regex(/^\d+(\.\d+)?s$/)
          .transform((d) => Math.round(Number.parseFloat(d))),
        distanceMeters: z.number().int().nonnegative(),
        polyline: z.object({ encodedPolyline: z.string().min(1) }),
      }),
    )
    .min(1),
});

export type ResultatRoutes =
  | { ok: true; dureeS: number; distanceM: number; polyline: string }
  | { ok: false; raison: string };

/**
 * Appelle Routes API pour UN trajet voiture, sans trafic.
 *
 * `fetchFn` est injectable : les tests ne touchent jamais le réseau, et ne le doivent pas —
 * chaque appel réel est facturé.
 */
export async function appelerRoutes(
  origine: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  cle: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResultatRoutes> {
  let reponse: Response;
  try {
    reponse = await fetchFn("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cle,
        // ⚠️ LE FIELDMASK EST UNE BORNE DE COÛT, pas un détail : sans lui Routes refuse, et
        // un masque large ferait payer des champs qu'on jette.
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origine.lat, longitude: origine.lon } } },
        destination: {
          location: { latLng: { latitude: destination.lat, longitude: destination.lon } },
        },
        travelMode: "DRIVE",
        // Sans trafic : c'est ce qui rend la durée CACHABLE. Le temps réel vit dans le
        // lien Google Maps externe, calculé au moment du départ.
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
  } catch (e) {
    return { ok: false, raison: `Routes injoignable : ${e instanceof Error ? e.message : e}` };
  }

  if (!reponse.ok) {
    // Le statut se DIT : un 403 (clé mal restreinte) et un 429 (quota) appellent des gestes
    // opposés, et « ça n'a pas marché » n'en permet aucun.
    return { ok: false, raison: `Routes a répondu ${reponse.status}` };
  }

  const analyse = ReponseRoutesSchema.safeParse(await reponse.json().catch(() => null));
  if (!analyse.success) {
    return { ok: false, raison: "Réponse Routes hors schéma — trajet non conservé." };
  }
  const r = analyse.data.routes[0]!;
  return {
    ok: true,
    dureeS: r.duration,
    distanceM: r.distanceMeters,
    polyline: r.polyline.encodedPolyline,
  };
}

/** Une destination de matrice : le nom sert à rattacher l'élément à sa ligne de cache. */
export interface DestinationMatrice {
  nom: string;
  lat: number;
  lon: number;
}

/**
 * La réponse computeRouteMatrix : un tableau d'ÉLÉMENTS indexés, pas de routes. La
 * `condition` compte : un élément sans `ROUTE_EXISTS` (île sans pont, position aberrante)
 * n'a pas de durée à conserver — l'écarter vaut mieux qu'un zéro plausible.
 */
const ReponseMatriceSchema = z.array(
  z.object({
    originIndex: z.number().int(),
    destinationIndex: z.number().int(),
    condition: z.string().optional(),
    duration: z
      .string()
      .regex(/^\d+(\.\d+)?s$/)
      .transform((d) => Math.round(Number.parseFloat(d)))
      .optional(),
    distanceMeters: z.number().int().nonnegative().optional(),
  }),
);

export type ResultatMatrice =
  | {
      ok: true;
      /** Les destinations atteignables, avec leur durée. Les autres sont NOMMÉES à part. */
      elements: { nom: string; dureeS: number; distanceM: number }[];
      inatteignables: string[];
    }
  | { ok: false; raison: string };

/**
 * UNE origine vers N destinations, en UN appel HTTP — mais N ÉLÉMENTS facturés : c'est à
 * l'appelant d'avoir réservé N sur le budget AVANT (lib/budgetRoutes.ts).
 */
export async function appelerMatrice(
  origine: { lat: number; lon: number },
  destinations: readonly DestinationMatrice[],
  cle: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResultatMatrice> {
  if (destinations.length === 0) return { ok: true, elements: [], inatteignables: [] };

  let reponse: Response;
  try {
    reponse = await fetchFn("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cle,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
      },
      body: JSON.stringify({
        origins: [
          { waypoint: { location: { latLng: { latitude: origine.lat, longitude: origine.lon } } } },
        ],
        destinations: destinations.map((d) => ({
          waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lon } } },
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
  } catch (e) {
    return { ok: false, raison: `Matrice injoignable : ${e instanceof Error ? e.message : e}` };
  }
  if (!reponse.ok) return { ok: false, raison: `Matrice a répondu ${reponse.status}` };

  const analyse = ReponseMatriceSchema.safeParse(await reponse.json().catch(() => null));
  if (!analyse.success) return { ok: false, raison: "Réponse matrice hors schéma." };

  const elements: { nom: string; dureeS: number; distanceM: number }[] = [];
  const inatteignables: string[] = [];
  for (const e of analyse.data) {
    const dest = destinations[e.destinationIndex];
    if (!dest) continue;
    if (e.condition !== "ROUTE_EXISTS" || e.duration === undefined || e.distanceMeters === undefined) {
      inatteignables.push(dest.nom);
      continue;
    }
    elements.push({ nom: dest.nom, dureeS: e.duration, distanceM: e.distanceMeters });
  }
  return { ok: true, elements, inatteignables };
}

/**
 * Les bornes des bandes de durée (minutes), pour la carte (ADR-0016, lot E).
 *
 * ⚠️ EN MINUTES DE ROUTE, PAS EN KILOMÈTRES : un rayon kilométrique est un cercle, un
 * rayon de trajet est une forme — et c'est la seconde qui décide si Marc postule. Les
 * bornes suivent sa réponse du 2026-08-20 (« ~50 km, au-delà ça chute vite ») transposée
 * en temps de route.
 */
export const BANDES_DUREE_MIN = [15, 30, 50] as const;

/** La bande d'une durée : 1 (toute proche) à 4 (au-delà de la dernière borne). PURE. */
export function bandeDuree(dureeS: number): 1 | 2 | 3 | 4 {
  const minutes = dureeS / 60;
  if (minutes <= BANDES_DUREE_MIN[0]) return 1;
  if (minutes <= BANDES_DUREE_MIN[1]) return 2;
  if (minutes <= BANDES_DUREE_MIN[2]) return 3;
  return 4;
}

/** La réponse d'une tournée : l'ordre OPTIMISÉ arrive en indices des étapes envoyées. */
const ReponseTourneeSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z
          .string()
          .regex(/^\d+(\.\d+)?s$/)
          .transform((d) => Math.round(Number.parseFloat(d))),
        distanceMeters: z.number().int().nonnegative(),
        polyline: z.object({ encodedPolyline: z.string().min(1) }),
        optimizedIntermediateWaypointIndex: z.array(z.number().int()).optional(),
      }),
    )
    .min(1),
});

export type ResultatTournee =
  | {
      ok: true;
      dureeS: number;
      distanceM: number;
      polyline: string;
      /** Les étapes dans l'ordre OPTIMISÉ par Google — les noms envoyés, réordonnés. */
      ordre: string[];
    }
  | { ok: false; raison: string };

/**
 * Une tournée : domicile → étapes (ordre optimisé par Google) → domicile.
 *
 * ⚠️ PAS DE CACHE EN BASE, et c'est un écart assumé au plan d'ADR-0016 : une tournée est
 * un GESTE ponctuel — l'ensemble d'étapes change à chaque fois, un cache par combinaison
 * ne servirait à peu près jamais. Ce qui borne le coût : l'appel ne part QUE sur un clic
 * explicite, et le budget d'éléments le précède.
 */
export async function appelerTournee(
  domicile: { lat: number; lon: number },
  etapes: readonly DestinationMatrice[],
  cle: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResultatTournee> {
  if (etapes.length < 2) {
    return { ok: false, raison: "Une tournée demande au moins deux étapes." };
  }

  let reponse: Response;
  try {
    reponse = await fetchFn("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cle,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: domicile.lat, longitude: domicile.lon } } },
        destination: { location: { latLng: { latitude: domicile.lat, longitude: domicile.lon } } },
        intermediates: etapes.map((e) => ({
          location: { latLng: { latitude: e.lat, longitude: e.lon } },
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        optimizeWaypointOrder: true,
      }),
    });
  } catch (e) {
    return { ok: false, raison: `Tournée injoignable : ${e instanceof Error ? e.message : e}` };
  }
  if (!reponse.ok) return { ok: false, raison: `Tournée : Routes a répondu ${reponse.status}` };

  const analyse = ReponseTourneeSchema.safeParse(await reponse.json().catch(() => null));
  if (!analyse.success) return { ok: false, raison: "Réponse de tournée hors schéma." };

  const r = analyse.data.routes[0]!;
  // Sans indice d'optimisation, l'ordre envoyé EST l'ordre — le dire tel quel plutôt que
  // d'inventer une permutation.
  const indices = r.optimizedIntermediateWaypointIndex ?? etapes.map((_, i) => i);
  const ordre = indices
    .map((i) => etapes[i]?.nom)
    .filter((n): n is string => n !== undefined);

  return {
    ok: true,
    dureeS: r.duration,
    distanceM: r.distanceMeters,
    polyline: r.polyline.encodedPolyline,
    ordre,
  };
}
