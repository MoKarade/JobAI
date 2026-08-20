// lib/categorie.ts — le TYPE de poste, pour filtrer d'un coup d'œil.
//
// ⚠️ POURQUOI PAS LE SECTEUR DE LA CLASSE NOC. Le flux publie un code à cinq chiffres dont
// les deux premiers désignent une grande classe professionnelle. Ces classes ont des noms
// officiels que ce dépôt N'A PAS : les écrire de mémoire fabriquerait une taxonomie
// plausible et fausse, sur un écran que Marc lirait comme une donnée. On s'en tient donc à
// ce que l'app SAIT déjà mesurer.
//
// ⚠️ DÉRIVÉE DU MÊME BARÈME QUE LA NOTE, jamais d'un calcul parallèle. Une catégorie
// « Autre » à côté d'une note de 73 serait la pire des deux : deux chiffres qui se
// contredisent à l'écran valent moins que pas de chiffre du tout. C'est pour ça que le code
// de profession est stocké sur l'offre — le plancher de rôle qu'il pose doit être visible
// ici aussi.

import { plancherRoleNoc, scoreFitRole } from "./scoring";
import { PROFIL_DEFAUT, type Profil } from "./profil";

export type Categorie = "combinaison" | "coordination" | "technique" | "technicien" | "autre";

/** Ce que chaque catégorie veut dire, en clair. Une règle, un exemplaire. */
export const CATEGORIE_LIBELLES: Readonly<Record<Categorie, string>> = {
  combinaison: "Coordination + technique",
  coordination: "Coordination",
  technique: "Technique",
  technicien: "Technicien",
  autre: "Autre",
};

/** L'ordre d'affichage : du plus proche du profil au plus lointain. */
export const CATEGORIES: readonly Categorie[] = [
  "combinaison",
  "coordination",
  "technique",
  "technicien",
  "autre",
];

/**
 * La catégorie d'une offre. PURE.
 *
 * Les seuils se DÉRIVENT des points du profil, jamais de leurs valeurs du jour : un barème
 * réglé sans que cette fonction suive rendrait des catégories qui ne correspondent plus à
 * rien, sans erreur.
 */
export function categorieOffre(
  poste: string,
  description = "",
  noc: string | null | undefined = null,
  metiers: readonly string[] = [],
  profil: Profil = PROFIL_DEFAUT,
): Categorie {
  const p = profil.pointsRole;
  const role = plancherRoleNoc(scoreFitRole(poste, description, profil), noc, metiers, profil);
  if (role >= p.combinaison) return "combinaison";
  if (role >= Math.min(p.coordination, p.technique)) {
    // Coordination et technique valent des points proches ; c'est le barème qui tranche,
    // pas un ordre écrit ici. On redemande au même juge quel signal a été trouvé.
    return role >= p.coordination ? "coordination" : "technique";
  }
  if (role >= p.technicien) return "technicien";
  return "autre";
}
