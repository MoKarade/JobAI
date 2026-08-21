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

import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { entreprisesLieux, trajets } from "./db/schema";
import { exigerSession } from "./session";
import { domicile } from "./domicile";
import { appelerRoutes, appelerTournee, cacheValide } from "./trajetRoutes";
import { consommerBudgetRoutes } from "./budgetRoutes";

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
  // ⚠️ LE CACHE NE SUFFIT QUE S'IL PORTE UN TRACÉ. Une ligne venue de la MATRICE (lot C)
  // a la durée sans la polyligne — pour TRACER, il faut l'appel complet, qui complètera la
  // ligne au passage. Rendre la durée seule ferait un bouton « tracer » qui ne trace rien.
  if (enCache && enCache.polyline !== null && cacheValide(enCache, lieu, maison)) {
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

  // Le frein partagé (lib/budgetRoutes.ts) : consommé AVANT l'appel, refus nommé. Un
  // computeRoutes vaut UN élément.
  const budget = await consommerBudgetRoutes(1);
  if (!budget.ok) return budget;

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

export type ResultatTourneeAction =
  | { ok: true; dureeS: number; distanceM: number; polyline: string; ordre: string[] }
  | { ok: false; raison: string };

/**
 * La tournée : domicile → entreprises cochées (ordre optimisé) → domicile (ADR-0016, F).
 *
 * Le budget compte les ÉTAPES : une tournée de quatre entreprises pèse quatre éléments —
 * approximation CONSERVATRICE de la facturation « Routes avancé », documentée plutôt
 * qu'exacte : mieux vaut un frein qui mord un peu tôt qu'un compteur qui sous-estime.
 */
export async function obtenirTournee(noms: string[]): Promise<ResultatTourneeAction> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, raison: "Authentification requise." };
  }
  if (noms.length < 2 || noms.length > 8) {
    return { ok: false, raison: "Une tournée va de deux à huit étapes." };
  }

  const maison = await domicile();
  if (!maison) return { ok: false, raison: "Domicile non configuré." };
  const cle = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!cle) return { ok: false, raison: "GOOGLE_MAPS_API_KEY absente." };

  const lieux = await db
    .select()
    .from(entreprisesLieux)
    .where(inArray(entreprisesLieux.nom, noms));
  const exacts = lieux.filter((l) => l.precision === "exacte");
  if (exacts.length < noms.length) {
    const manquants = noms.filter((n) => !exacts.some((l) => l.nom === n));
    // Nommer ce qui manque : « certaines étapes » ne se corrige pas, une liste si.
    return {
      ok: false,
      raison: `Étape(s) sans position exacte : ${manquants.join(", ")} — une tournée vers un centre-ville mentirait.`,
    };
  }

  const budget = await consommerBudgetRoutes(noms.length);
  if (!budget.ok) return budget;

  return appelerTournee(
    maison,
    exacts.map((l) => ({ nom: l.nom, lat: l.lat, lon: l.lon })),
    cle,
  );
}
