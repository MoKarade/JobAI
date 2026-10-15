// lib/trajetMatricePur.ts — la logique PURE du remplissage nocturne des durées de trajet.
//
// Sortie de `lib/trajetMatrice.ts` pour pouvoir être éprouvée sans base ni réseau : ce
// fichier n'importe rien d'autre que des types. Le fichier d'origine garde les entrées-sorties
// (base, budget, appel Routes) ; ici vivent les décisions : quoi remplir, quoi écrire, quoi dire.

import type { DestinationMatrice } from "./trajetRoutes";

interface Position {
  lat: number;
  lon: number;
}

/**
 * Les destinations à remplir cette passe : celles dont la ligne de cache manque ou ne tient
 * plus, dans l'ordre des lieux, et pas plus de `max`. PURE.
 *
 * `cacheTient` est injecté (en production : `cacheValide`) pour que ce choix reste testable
 * sans reconstruire des lignes de base complètes.
 */
export function choisirDestinations<L extends DestinationMatrice, T>(
  lieux: readonly L[],
  lignesParNom: ReadonlyMap<string, T>,
  cacheTient: (ligne: T, lieu: L) => boolean,
  max: number,
): DestinationMatrice[] {
  const aFaire: DestinationMatrice[] = [];
  for (const lieu of lieux) {
    if (aFaire.length >= max) break;
    const ligne = lignesParNom.get(lieu.nom);
    if (ligne !== undefined && cacheTient(ligne, lieu)) continue;
    aFaire.push({ nom: lieu.nom, lat: lieu.lat, lon: lieu.lon });
  }
  return aFaire;
}

/**
 * La ligne de cache à écrire pour un élément mesuré. PURE.
 *
 * ⚠️ `polyline: null` TOUJOURS : une ligne remplie ici était absente ou invalide, son ancien
 * tracé (calculé depuis une autre position) serait faux. Le clic « tracer » le refera.
 * Renvoie `undefined` si la destination n'est pas dans la liste demandée (réponse incohérente) :
 * mieux vaut ne rien écrire qu'une ligne sans position.
 */
export function ligneTrajet(
  element: { nom: string; dureeS: number; distanceM: number },
  destinations: readonly DestinationMatrice[],
  maison: Position,
  calculeLe: Date,
) {
  const dest = destinations.find((d) => d.nom === element.nom);
  if (!dest) return undefined;
  return {
    destinationNom: element.nom,
    lat: dest.lat,
    lon: dest.lon,
    origineLat: maison.lat,
    origineLon: maison.lon,
    dureeS: element.dureeS,
    distanceM: element.distanceM,
    polyline: null,
    calculeLe,
  };
}

/**
 * La phrase du journal : « N durée(s) remplie(s) · inatteignables : … · M restante(s)… ». PURE.
 *
 * `lieux` = entreprises placées, `lignesExistantes` = lignes de cache déjà là, `remplies` = durées
 * écrites cette passe. Le reliquat n'est dit que s'il est strictement positif.
 */
export function resumerRemplissage(
  lieux: number,
  lignesExistantes: number,
  remplies: number,
  inatteignables: readonly string[],
): string {
  const parts = [`${remplies} durée(s) remplie(s)`];
  if (inatteignables.length > 0) parts.push(`inatteignables : ${inatteignables.join(", ")}`);
  const restantes = lieux - lignesExistantes - remplies;
  if (restantes > 0) parts.push(`${restantes} restante(s) pour les passes suivantes`);
  return parts.join(" · ");
}
