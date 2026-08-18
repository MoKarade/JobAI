// lib/mesureLieux.ts — juger un nom de lieu par la MESURE, pas par une liste.
//
// La décision est ailleurs, et elle est pure : `lib/ingest/lieux.ts`. Ce fichier-ci ne fait
// que la brancher au monde — le géocodeur d'un côté, le domicile de l'autre — et il existe
// pour que cette jonction ait UN seul endroit.
//
// ⚠️ IL N'EST PAS `"use server"`, ET C'EST DÉLIBÉRÉ. Dans un tel fichier, toute fonction
// async exportée devient un point d'entrée HTTP anonyme. `mesurerLieuxInconnus` déclenche
// des requêtes vers un service bénévole : publiée ainsi, n'importe qui pourrait la marteler
// et faire bannir l'app de Nominatim. Elle est appelée par la passe de veille, qui est déjà
// gardée — elle n'a aucune raison d'être appelable de l'extérieur.

import { distanceKm, geocoderMunicipalites } from "./geocodage";
import { appliquerJugements, type RegistreLieux } from "./ingest/lieux";
import { domicile } from "./domicile";

/**
 * Budget de la mesure des lieux inconnus, en millisecondes.
 *
 * Elle tourne AVANT le tri, donc avant tout ce qui nourrit Marc : son dépassement coûterait
 * l'ingestion du jour. Douze secondes couvrent six noms à la cadence de Nominatim (1,1 s) en
 * laissant de quoi absorber une requête lente ; au-delà, la passe s'arrête d'elle-même et le
 * reste des noms attend demain — ce qui est sans conséquence, puisque les sources republient
 * les mêmes villes chaque jour.
 */
export const BUDGET_LIEUX_MS = 12_000;

/**
 * Mesure la distance de noms de lieu que la liste blanche ne reconnaît pas, et en tire un
 * verdict — dans la région, hors d'elle, ou introuvable.
 *
 * ⚠️ LE DOMICILE NE FRANCHIT PAS CETTE FONCTION. Il est lu ici, sert à construire une
 * closure de distance, et n'est transmis à personne : `appliquerJugements` reçoit une
 * fonction, jamais un point. La passe de veille, elle, ne voit passer que des verdicts.
 *
 * Le rayon est un PARAMÈTRE, pas une constante lue ici : c'est Marc qui le règle depuis
 * l'app (`lib/rayon.ts`), et la fonction qui le reçoit ne peut donc pas être en désaccord
 * avec ce que l'écran affiche. C'est exactement ce qui manquait à la liste blanche, qu'il
 * fallait rallonger à la main à chaque changement de rayon — et qui restait donc en retard
 * sur la décision.
 */
export async function mesurerLieuxInconnus(
  noms: readonly string[],
  registre: RegistreLieux,
  jour: string,
  rayonMaxKm: number,
): Promise<{ registre: RegistreLieux; juges: number; introuvables: number }> {
  if (noms.length === 0) return { registre, juges: 0, introuvables: 0 };

  const chezMoi = await domicile();
  if (chezMoi === null) {
    // Sans domicile, aucune distance n'est mesurable — et un verdict rendu sans mesure
    // serait précisément le pari qu'on cherche à retirer. On ne touche pas au registre.
    console.warn("[lieux] domicile non configuré : aucun lieu ne peut être jugé");
    return { registre, juges: 0, introuvables: 0 };
  }

  const r = await geocoderMunicipalites(
    noms,
    { recuperer: fetch, courrielContact: process.env.AUTHORIZED_EMAIL },
    BUDGET_LIEUX_MS,
  );
  // Une panne est DITE, jamais avalée : elle n'inscrit aucun verdict (les noms non traités
  // restent intacts), donc elle est invisible dans les compteurs sans cette ligne.
  if (r.panne !== null) console.warn("[lieux] géocodeur en panne :", r.panne);

  const suivant = appliquerJugements(
    registre,
    r,
    (p) => distanceKm(chezMoi, p),
    rayonMaxKm,
    jour,
  );
  return { registre: suivant, juges: r.trouvees.length, introuvables: r.introuvables.length };
}
