// lib/trajetMatrice.ts — le remplissage NOCTURNE des durées de trajet (ADR-0016, lot C).
//
// Appelé par la passe de veille, jamais par un affichage : le badge « ~34 min » sur les
// épingles vient d'ici, au rythme du cron — un calcul à l'affichage ferait suivre la
// facture au nombre de visites.

import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { entreprisesLieux, trajets } from "./db/schema";
import { domicile } from "./domicile";
import { consommerBudgetRoutes } from "./budgetRoutes";
import { appelerMatrice, cacheValide, type DestinationMatrice } from "./trajetRoutes";

/**
 * Destinations par passe. Douze : la matrice les facture à l'ÉLÉMENT, et douze par nuit
 * couvrent le stock d'entreprises placées en trois jours sans jamais approcher le budget
 * quotidien — la veille du lendemain reprend là où celle-ci s'arrête.
 */
export const MATRICE_MAX_PAR_PASSE = 12;

export interface BilanMatrice {
  /** Ce que la passe a fait — ou POURQUOI elle n'a rien fait (« sautée : … »). */
  resume: string;
  remplies: number;
}

/**
 * Remplit les durées manquantes ou périmées, borné et repris à la passe suivante.
 *
 * ⚠️ N'ÉCRASE JAMAIS UNE POLYLIGNE VALIDE : une ligne dont le cache tient garde son tracé.
 * Une ligne INVALIDE (l'entreprise ou le domicile a bougé) est réécrite SANS tracé — un
 * tracé calculé depuis l'ancienne position serait faux, et le clic « tracer » le refera.
 */
export async function remplirDureesTrajet(): Promise<BilanMatrice> {
  const maison = await domicile();
  if (!maison) return { resume: "sautée : domicile non configuré", remplies: 0 };
  const cle = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!cle) return { resume: "sautée : GOOGLE_MAPS_API_KEY absente", remplies: 0 };

  // Les entreprises PLACÉES (position exacte) dont la ligne de cache manque ou ne tient
  // plus. Les approximatives n'ont pas de durée : elle mentirait (centre-ville ≠ usine).
  const lieux = await db
    .select()
    .from(entreprisesLieux)
    .where(eq(entreprisesLieux.precision, "exacte"));
  if (lieux.length === 0) return { resume: "rien à faire : aucune entreprise placée", remplies: 0 };

  const lignes = await db
    .select()
    .from(trajets)
    .where(inArray(trajets.destinationNom, lieux.map((l) => l.nom)));
  const parNom = new Map(lignes.map((l) => [l.destinationNom, l]));

  const aFaire: DestinationMatrice[] = [];
  for (const lieu of lieux) {
    const ligne = parNom.get(lieu.nom);
    if (ligne && cacheValide(ligne, lieu, maison)) continue;
    aFaire.push({ nom: lieu.nom, lat: lieu.lat, lon: lieu.lon });
    if (aFaire.length >= MATRICE_MAX_PAR_PASSE) break;
  }
  if (aFaire.length === 0) return { resume: "à jour : toutes les durées tiennent", remplies: 0 };

  // Le budget se réserve à l'ÉLÉMENT — N destinations = N éléments, dans UN appel HTTP.
  const budget = await consommerBudgetRoutes(aFaire.length);
  if (!budget.ok) return { resume: `sautée : ${budget.raison}`, remplies: 0 };

  const r = await appelerMatrice(maison, aFaire, cle);
  if (!r.ok) return { resume: `échec : ${r.raison}`, remplies: 0 };

  for (const e of r.elements) {
    await db
      .insert(trajets)
      .values({
        destinationNom: e.nom,
        lat: aFaire.find((d) => d.nom === e.nom)!.lat,
        lon: aFaire.find((d) => d.nom === e.nom)!.lon,
        origineLat: maison.lat,
        origineLon: maison.lon,
        dureeS: e.dureeS,
        distanceM: e.distanceM,
        polyline: null,
        calculeLe: new Date(),
      })
      .onConflictDoUpdate({
        target: trajets.destinationNom,
        set: {
          lat: aFaire.find((d) => d.nom === e.nom)!.lat,
          lon: aFaire.find((d) => d.nom === e.nom)!.lon,
          origineLat: maison.lat,
          origineLon: maison.lon,
          dureeS: e.dureeS,
          distanceM: e.distanceM,
          // La ligne était invalide (sinon elle ne serait pas dans aFaire) : son ancien
          // tracé est faux, il tombe avec elle.
          polyline: null,
          calculeLe: new Date(),
        },
      });
  }

  const parts = [`${r.elements.length} durée(s) remplie(s)`];
  if (r.inatteignables.length > 0) parts.push(`inatteignables : ${r.inatteignables.join(", ")}`);
  const restantes = lieux.length - parNom.size - r.elements.length;
  if (restantes > 0) parts.push(`${restantes} restante(s) pour les passes suivantes`);
  return { resume: parts.join(" · "), remplies: r.elements.length };
}
