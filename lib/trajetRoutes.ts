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
 * Plafond d'appels Routes par jour — le même filet anti-emballement que le frein LLM de
 * DriveAI : il ne se désactive jamais, il se dit quand il mord.
 *
 * Cinquante : le stock d'entreprises placées tient dedans en deux jours au pire, et une
 * boucle accidentelle (re-render qui appelle en rafale) est coupée avant de coûter plus
 * qu'un café.
 */
export const ROUTES_MAX_PAR_JOUR = 50;

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
