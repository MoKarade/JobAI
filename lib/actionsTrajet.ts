"use server";

// lib/actionsTrajet.ts — le trajet domicile → entreprise, au clic (ADR-0016, lot B).
//
// ⚠️ FICHIER À PART, comme actionsRayon/actionsMetiers/actionsAnalyse : `lib/actions.ts`
// importe les modules du barème et l'import inverse ferait un cycle ESM — la panne qui
// n'apparaît qu'en production.
//
// L'ordre des gardes est l'ordre des COÛTS : session (gratuit), cache (une lecture),
// compteur (une lecture), et l'appel facturé en DERNIER. Inverser cache et compteur
// ferait « mordre » le plafond sur des trajets déjà payés.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { entreprisesLieux, trajets } from "./db/schema";
import { exigerSession } from "./session";
import { domicile } from "./domicile";
import { lireEtat, ecrireEtat } from "./etat";
import {
  ROUTES_MAX_PAR_JOUR,
  appelerRoutes,
  cacheValide,
} from "./trajetRoutes";

/** Clé d'état du compteur journalier d'appels Routes. */
const CLE_COMPTEUR = "routes-compteur";

export type ResultatTrajet =
  | {
      ok: true;
      dureeS: number;
      distanceM: number;
      polyline: string;
      /** Vrai quand le trajet sort du cache — l'écran peut dire « calculé le … ». */
      duCache: boolean;
    }
  | { ok: false; raison: string };

function aujourdhuiQuebec(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Le trajet vers une entreprise PLACÉE. Cache d'abord, plafond ensuite, appel en dernier. */
export async function obtenirTrajet(nomEntreprise: string): Promise<ResultatTrajet> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, raison: "Authentification requise." };
  }

  const maison = await domicile();
  if (!maison) {
    return {
      ok: false,
      raison: "Domicile non configuré (DOMICILE_ADRESSE ou DOMICILE_LAT/LON).",
    };
  }

  const [lieu] = await db
    .select()
    .from(entreprisesLieux)
    .where(eq(entreprisesLieux.nom, nomEntreprise));
  if (!lieu) {
    return { ok: false, raison: "Entreprise non géocodée — le trajet n'a pas de destination." };
  }
  if (lieu.precision !== "exacte") {
    // ⚠️ REFUS HONNÊTE, pas une approximation silencieuse : un trajet vers le centre-ville
    // affiché comme « trajet vers l'usine » est exactement le mensonge que la carte
    // s'interdit. Le lien Google Maps externe reste disponible pour se faire une idée.
    return {
      ok: false,
      raison:
        "Position approximative (centre-ville) : le trajet mentirait. Utilise le lien Google Maps, qui cherchera l'adresse réelle.",
    };
  }

  const [enCache] = await db.select().from(trajets).where(eq(trajets.destinationNom, lieu.nom));
  if (enCache && cacheValide(enCache, lieu, maison)) {
    return {
      ok: true,
      dureeS: enCache.dureeS,
      distanceM: enCache.distanceM,
      polyline: enCache.polyline,
      duCache: true,
    };
  }

  const cle = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!cle) {
    return { ok: false, raison: "GOOGLE_MAPS_API_KEY absente : le calcul de trajet est désactivé." };
  }

  // Le compteur journalier — le filet anti-emballement. Incrémenté AVANT l'appel : un appel
  // parti est facturé même si sa réponse est illisible, la comptabilité LLM tient déjà
  // cette règle et elle vaut ici aussi.
  const jour = aujourdhuiQuebec();
  const compteur = await lireEtat<{ jour: string; n: number }>(CLE_COMPTEUR, { jour, n: 0 });
  const n = compteur.jour === jour ? compteur.n : 0;
  if (n >= ROUTES_MAX_PAR_JOUR) {
    return {
      ok: false,
      raison: `Plafond de ${ROUTES_MAX_PAR_JOUR} appels Routes/jour atteint — demain, ou le lien Google Maps.`,
    };
  }
  await ecrireEtat(CLE_COMPTEUR, { jour, n: n + 1 });

  const r = await appelerRoutes(maison, { lat: lieu.lat, lon: lieu.lon }, cle);
  if (!r.ok) return r;

  // Écrit APRÈS le succès seulement : un échec ne doit pas poser une ligne vide qui
  // passerait pour un trajet.
  await db
    .insert(trajets)
    .values({
      destinationNom: lieu.nom,
      lat: lieu.lat,
      lon: lieu.lon,
      origineLat: maison.lat,
      origineLon: maison.lon,
      dureeS: r.dureeS,
      distanceM: r.distanceM,
      polyline: r.polyline,
      calculeLe: new Date(),
    })
    .onConflictDoUpdate({
      target: trajets.destinationNom,
      set: {
        lat: lieu.lat,
        lon: lieu.lon,
        origineLat: maison.lat,
        origineLon: maison.lon,
        dureeS: r.dureeS,
        distanceM: r.distanceM,
        polyline: r.polyline,
        calculeLe: new Date(),
      },
    });

  return { ok: true, dureeS: r.dureeS, distanceM: r.distanceM, polyline: r.polyline, duCache: false };
}
