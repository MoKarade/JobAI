// lib/lienTrajet.ts — le trajet vers une entreprise, calculé par Google Maps, pas par nous.
//
// C'est la version retenue APRÈS l'annulation du chantier carte Google (ADR-0004, annulé
// par Marc le 2026-07-29) : un simple lien d'itinéraire, construit avec les URL officielles
// de Google Maps (`maps/dir/?api=1`, documentées, gratuites, sans clé API).
//
// LE POINT QUI COMPTE — L'ORIGINE DU TRAJET N'EST JAMAIS DANS LE LIEN. On ne transmet que
// la DESTINATION. Google, ouvert dans le navigateur de Marc où il est connecté à son
// compte, propose lui-même « votre position » ou son domicile ENREGISTRÉ CHEZ GOOGLE.
// Résultat : Marc voit sa maison, ses endroits et la durée réelle avec trafic — sans que
// JobAI ne connaisse, ne stocke ni ne transmette la moindre coordonnée personnelle. C'est
// ce qui permet de garder le garde-fou n°1 dans sa version STRICTE : l'app n'affiche ni
// n'envoie jamais le domicile, et n'en a plus besoin.
//
// La destination est une RECHERCHE (« Chantier Davie, Lévis, QC »), pas une coordonnée :
// c'est Google qui résout, dans Google Maps, sous les yeux de Marc — une résolution
// douteuse s'y voit immédiatement, au lieu de placer une épingle fausse chez nous.

import { villeDeLEntreprise } from "./carte";
import { villeGeocodable } from "./geocodage";
import { ENTREPRISES_CIBLES, type EntrepriseCible } from "./reference";

/**
 * L'URL d'itinéraire Google Maps vers une entreprise, ou `null` sans nom exploitable.
 *
 * La ville vient des entreprises cibles (`lib/reference.ts`) quand l'employeur y figure —
 * c'est le cas de toutes les offres actives, un test de référence le garantit. Sinon la
 * destination reste « {nom}, QC » : moins précise, mais résolue par Google à l'écran.
 */
export function lienTrajetGoogleMaps(
  entreprise: string,
  cibles: readonly EntrepriseCible[] = ENTREPRISES_CIBLES,
): string | null {
  const nom = entreprise.trim();
  if (nom.length === 0) return null;

  const libelle = villeDeLEntreprise(nom, cibles);
  // « Québec (Beauport) » → « Québec » : la parenthèse est un repère de lecture, pas une
  // adresse — la laisser dégraderait la recherche Google au lieu de l'aider.
  const ville = libelle === null ? null : villeGeocodable(libelle);
  const destination = ville === null ? `${nom}, QC` : `${nom}, ${ville}, QC`;

  const p = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
