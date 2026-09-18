// lib/ingest/adresseAnnoncee.ts — une adresse d'annonce est-elle exploitable, et cohérente
// avec la ville annoncée ?
//
// ⚠️ CE FICHIER EST CE QUI SURVIT DE `lib/ingest/depotSchema.ts`, supprimé le 2026-09-18 avec
// les deux canaux de dépôt (`POST /api/ingest/depot` et `data/depot/*.json`). Le schéma Zod
// du lot est parti avec eux — il n'avait plus de déposant. Ces deux règles-ci, elles, ont un
// consommateur VIVANT : le flux du Guichet les applique aux adresses qu'il rencontre.
//
// Les sortir plutôt que de les laisser dans un fichier nommé d'après un canal mort : un
// module dont le nom ment sur son contenu est la prochaine chose que personne ne relit.
//
// PURES toutes les deux : aucune I/O, aucun accès réseau.

import { estDansLaRegion, normaliserLieu } from "./region";

/**
 * Cette adresse d'annonce vaut-elle la peine d'être retenue ?
 *
 * PURE, et volontairement GROSSIÈRE : le vrai juge est le géocodeur, qui exige déjà un
 * numéro civique ET une voie avant d'accepter de déplacer une épingle. Ce filtre-ci écarte
 * seulement ce qui n'a aucune chance — « En présentiel », « Télétravail », « Québec » seul —
 * pour ne pas envoyer à Nominatim des requêtes dont on sait qu'elles rendront la
 * municipalité, laquelle passerait ensuite pour une adresse exacte.
 *
 * Trois conditions, et elles se justifient chacune :
 *   · un CHIFFRE, parce qu'une adresse civique en porte toujours un ;
 *   · des LETTRES, parce qu'un code postal ou un numéro seul ne situe rien ;
 *   · une longueur plancher, parce que « 8 » n'est pas une adresse.
 */
export function adresseUtilisable(brut: string): boolean {
  const t = brut.trim();
  if (t.length < 8 || t.length > 200) return false;
  if (!/\d/.test(t)) return false;
  // Au moins trois lettres consécutives : un nom de voie, pas « 12 A ».
  return /\p{L}{3}/u.test(t);
}

/**
 * L'adresse et la ville annoncée parlent-elles du même endroit ?
 *
 * ⚠️ C'EST LA GARDE QUI REND LA RECHERCHE WEB ACCEPTABLE. Sans elle, « trouve l'adresse de
 * X » rend le siège social, le bureau de Montréal, ou l'établissement d'une homonyme —
 * toutes plausibles, toutes fausses, et toutes indiscernables d'une bonne réponse une fois
 * écrites en base. L'offre, elle, DIT dans quelle ville est le poste : c'est un fait
 * indépendant, venu d'une autre source, et deux faits indépendants qui concordent valent
 * infiniment mieux qu'un seul qui affirme.
 *
 * ⚠️ ELLE ACCEPTE LES ARRONDISSEMENTS DEPUIS LE 2026-08-12, et ce paragraphe disait le
 * contraire jusque-là : « Sainte-Foy pour une offre annoncée à Québec sera rejetée ». C'était
 * vrai, et c'était le défaut — Sainte-Foy EST Québec, à sept kilomètres du centre, et on
 * perdait ainsi les adresses mêmes qu'on cherchait. Le second volet de la garde consulte
 * maintenant le référentiel des municipalités de la région (voir le corps de la fonction).
 *
 * Ce qui n'a PAS changé : elle refuse plutôt qu'elle ne devine. Ne pas prendre une bonne
 * adresse fait perdre une épingle ; en prendre une mauvaise envoie Marc à la mauvaise porte.
 * Les deux erreurs ne se valent pas, et l'élargissement ne tient que parce que le géocodeur
 * reste l'arbitre final par la DISTANCE.
 *
 * Sans ville annoncée, il n'y a RIEN à vérifier — donc on refuse. Une adresse invérifiable
 * n'est pas une adresse prudente, c'est une adresse dont on ignore si elle est bonne.
 */
export function villeCoherente(adresse: string, villeAnnoncee: string): boolean {
  const ville = normaliserLieu(villeAnnoncee);
  if (ville === "" || !adresseUtilisable(adresse)) return false;

  // 1. L'adresse nomme la ville annoncée. Cas nominal, inchangé.
  if (normaliserLieu(adresse).includes(ville)) return true;

  // 2. ⚠️ SINON, ELLE DOIT NOMMER UNE MUNICIPALITÉ DE LA RÉGION — élargissement du
  //    2026-08-12 (`[LIEU-06]`, ADR-0005).
  //
  //    La règle « le nom de la ville doit apparaître dans l'adresse » rejetait les
  //    ARRONDISSEMENTS. Exemple mesuré : « 1234 rue de Marly, Sainte-Foy » pour une annonce
  //    à « Québec » était refusée, alors que Sainte-Foy EST Québec, à sept kilomètres du
  //    centre. Idem Beauport et Charlesbourg. On perdait exactement les adresses qu'on
  //    cherchait, et le motif du refus ressemblait à de la prudence.
  //
  //    `situer` est le bon arbitre parce qu'il teste HORS_PORTEE **avant** d'accepter :
  //    l'exemple « 100 rue Sainte-Catherine, Montréal, QC » contient « Québec » (la province)
  //    et reste pourtant rejeté. Une garde écrite à la main ici aurait raté ce piège — et
  //    surtout elle aurait dupliqué un référentiel que le filtre régional tient déjà. Une
  //    seule liste de municipalités, deux consommateurs.
  //
  //    ⚠️ CETTE GARDE N'EST QU'UN PRÉ-FILTRE, et c'est ce qui rend l'élargissement sûr :
  //    l'arbitre FINAL est le géocodeur, qui rejette toute résolution à plus de
  //    `RAYON_VALIDATION_KM` (30 km) du centre de la ville annoncée et retombe alors sur ce
  //    centre SANS conserver l'adresse. Le rôle d'ici est d'éviter une requête inutile, pas
  //    de trancher la vérité géographique — c'est une question de distance, pas de chaînes.
  return estDansLaRegion(adresse);
}
