// lib/trajetMatrice.ts — le remplissage NOCTURNE des durées de trajet (ADR-0016, lot C).
//
// Appelé par la passe de veille, jamais par un affichage : le badge « ~34 min » sur les
// épingles vient d'ici, au rythme du cron — un calcul à l'affichage ferait suivre la
// facture au nombre de visites.

import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { entreprisesLieux, trajets } from "./db/schema";
import { domicile } from "./domicile";
import {
  MARGE_CLICS_PAR_JOUR,
  ROUTES_ELEMENTS_MAX_PAR_JOUR,
  consommerBudgetRoutes,
  jourBudgetRoutes,
  rendreBudgetRoutes,
} from "./budgetRoutes";
import { appelerMatrice, cacheValide, type DestinationMatrice } from "./trajetRoutes";

/**
 * Destinations par passe — TOUT le budget du jour sauf la marge réservée aux clics.
 *
 * ⚠️ DÉRIVÉ, JAMAIS ÉCRIT EN DUR, et c'est la moitié qui compte. Un nombre posé à la main
 * au-dessus de `ROUTES_ELEMENTS_MAX_PAR_JOUR` ferait refuser la réservation ENTIÈRE à
 * chaque passe (`consommerBudgetRoutes` refuse `n + elements > plafond`) : plus une seule
 * durée remplie, pour toujours, avec « Budget Routes du jour épuisé » pour seule trace —
 * une configuration qui se bloque elle-même et qui ressemble à un frein qui fonctionne.
 * Dérivée, la borne suit le plafond quand il bouge et ne peut pas le dépasser.
 *
 * ⚠️ ET LE CHIFFRE PRÉCÉDENT AVAIT ROTI. Il valait douze, avec en commentaire « douze par
 * nuit couvrent le stock d'entreprises placées en TROIS JOURS ». Mesuré le 2026-09-16, à la
 * première passe qui a réussi : `12 durée(s) remplie(s) · 277 restante(s)`, soit ~23 jours
 * au lieu de trois. Le stock avait grandi, la promesse non — et rien ne pouvait le dire,
 * une durée en commentaire ne se re-mesure pas toute seule. D'où une borne exprimée en
 * BUDGET (ce qu'on accepte de dépenser par jour), qui reste vraie quel que soit le stock.
 * Le rythme, lui, se lit dans le journal : `[trajets] N remplie(s) · M restante(s)`.
 *
 * ⚠️ CE QUE ÇA COÛTE quand la passe a du travail : autant d'écritures que d'éléments, à la
 * fin d'une invocation qui a déjà ingéré et géocodé. Le cron de veille a 300 s (large), mais
 * le cron de géocodage qui la REPREND quand elle est restée muette n'a que 60 s : là, une
 * coupure au mur laisse des éléments réservés pour un travail à moitié écrit. La passe
 * suivante refait le reliquat — c'est du budget perdu, jamais une ligne fausse.
 */
export const MATRICE_MAX_PAR_PASSE = ROUTES_ELEMENTS_MAX_PAR_JOUR - MARGE_CLICS_PAR_JOUR;

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
  const jourReserve = jourBudgetRoutes();

  const r = await appelerMatrice(maison, aFaire, cle);
  if (!r.ok) {
    // ⚠️ UN REFUS À LA PORTE NE SE PAIE PAS. Sans ce rendu, quatre passes refusées en 403
    // brûlaient les 50 éléments du jour sans produire un seul trajet — vécu le 2026-09-15,
    // et le frein a fini par bloquer la vérification du correctif qui réglait ce 403.
    if (r.nonFacture) await rendreBudgetRoutes(aFaire.length, jourReserve);
    return { resume: `échec : ${r.raison}`, remplies: 0 };
  }

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
