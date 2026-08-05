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
//   · Le Registre des entreprises donne le DOMICILE LÉGAL de l'entreprise. Ce peut être
//     son usine, mais tout aussi bien le bureau de son comptable, un siège social à
//     Montréal, ou une case postale. Afficher ça comme « l'adresse » enverrait Marc à la
//     mauvaise porte — une donnée plausible et fausse, ce qu'interdit le garde-fou n°3.
//
// D'où une mention COURTE mais présente à chaque fois. Le texte n'est écrit qu'ICI :
// répété dans la liste et dans la fenêtre de la carte, il finirait par diverger, et c'est
// la version la plus vague qui survivrait.

export type SourceAdresse = "osm" | "registre";

/** Ce que l'écran ajoute après une adresse, pour dire ce qu'elle vaut. */
export function mentionSource(source: SourceAdresse | null): string {
  if (source === "osm") return "OpenStreetMap";
  if (source === "registre") return "registre des entreprises — domicile légal";
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
