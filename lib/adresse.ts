// lib/adresse.ts — dire d'où vient une adresse, et ce que ça vaut.
//
// Demande de Marc (2026-08-05) : « quand tu ne trouves pas l'adresse exacte je veux une
// recherche […] pour trouver, et L'INDIQUER ».
//
// ⚠️ POURQUOI CE N'EST PAS DÉCORATIF. Deux sources d'adresse ne disent pas la même chose,
// et l'écart n'est pas un détail de provenance :
//
//   · OpenStreetMap donne l'emplacement d'un objet CARTOGRAPHIÉ — l'usine est là où
//     l'épingle est. C'est la meilleure réponse quand elle existe.
//   · GOOGLE MAPS GEOCODING, en repli quand Nominatim (OpenStreetMap) ne reconnaît pas la
//     raison sociale — son cœur de métier, contrairement à Nominatim. Une réponse
//     STRUCTURÉE d'un géocodeur, de la même nature qu'OpenStreetMap : pas de mise en garde
//     « à confirmer », qui n'aurait pas de sens ici ([CARTE-03], 2026-08-12).
//   · Le Registre des entreprises donne le DOMICILE LÉGAL de l'entreprise. Ce peut être
//     son usine, mais tout aussi bien le bureau de son comptable, un siège social à
//     Montréal, ou une case postale. Afficher ça comme « l'adresse » enverrait Marc à la
//     mauvaise porte — une donnée plausible et fausse, ce qu'interdit le garde-fou n°3.
//   · L'ANNONCE elle-même donne l'adresse du POSTE, écrite par l'employeur. C'est la plus
//     pertinente des quatre pour Marc — c'est là qu'il irait travailler, et un même
//     employeur affiche des postes sur plusieurs sites. Elle n'est pas vérifiée
//     cartographiquement, d'où la mention : elle vient d'un texte, pas d'une carte.
//   · UNE RECHERCHE WEB, en dernier recours, quand l'annonce n'en donne aucune. C'est la
//     source la plus RISQUÉE du projet : « adresse AMETEK » rend un siège social de
//     Pennsylvanie pour une usine de Lévis. Elle n'entre qu'accompagnée de sa page source
//     et si sa ville concorde avec celle de l'offre — deux faits indépendants qui se
//     confirment. Et l'écran le DIT : « à confirmer », parce que personne ne l'a vue.
//
// D'où une mention COURTE mais présente à chaque fois. Le texte n'est écrit qu'ICI :
// répété dans la liste et dans la fenêtre de la carte, il finirait par diverger, et c'est
// la version la plus vague qui survivrait.

export type SourceAdresse = "osm" | "google" | "registre" | "offre" | "recherche";

/** Ce que l'écran ajoute après une adresse, pour dire ce qu'elle vaut. */
export function mentionSource(source: SourceAdresse | null): string {
  if (source === "osm") return "OpenStreetMap";
  if (source === "google") return "Google Maps";
  if (source === "registre") return "registre des entreprises — domicile légal";
  if (source === "offre") return "annoncée dans l'offre";
  // ⚠️ LA MENTION LA PLUS IMPORTANTE DES QUATRE. Une adresse trouvée sur le web a passé la
  // garde de cohérence (sa ville concorde avec celle de l'offre) et le géocodeur, mais
  // personne ne l'a vue de ses yeux. Le dire n'est pas une précaution de forme : c'est la
  // différence entre « voici l'adresse » et « voici ce qu'on a trouvé ».
  if (source === "recherche") return "trouvée sur le web — à confirmer";
  return "";
}

/**
 * Le texte affiché quand il n'y a PAS d'adresse.
 *
 * Il dit ce qui a été tenté, pas seulement ce qui manque : « non trouvée » laisserait
 * croire à un oubli, alors que la mesure du 2026-08-05 a montré que certaines entreprises
 * ne sont dans OpenStreetMap sous aucun nom, et que d'autres y sont sans adresse taguée.
 * Le lien vers Maps reste le recours, et il est utile de le dire là où le manque se voit.
 */
export const ADRESSE_ABSENTE =
  "Adresse non publiée dans les sources ouvertes — le lien Maps ci-dessous la retrouve par le nom.";
