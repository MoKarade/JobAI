// lib/enseigne.ts — la clé d'une ENSEIGNE : un employeur dont le nom ne diffère que par un numéro de succursale.
//
// Demande (JobAI#195) : « Harvey's », « Harvey's 2538 » et « Harvey's 2789 » sont une même enseigne, mais trois
// noms pour `cleGroupement`. Les comptes d'un employeur (offres ouvertes, durée, intitulés repris) se répartissaient
// donc sur trois lignes.
//
// ⚠️ CETTE CLÉ NE SERT QU'À COMPTER (les signaux de `lib/signauxEmployeur.ts`). Jamais à placer une épingle, ni à
// mesurer une distance, ni à choisir une position : deux succursales sont à deux adresses (ADR-0022 : une heuristique
// peut signaler ce qu'on regarde, jamais décider ce qu'on écrit). `cleGroupement` reste la clé de la carte et des
// positions, inchangée.
//
// ⚠️ UN NUMÉRO N'EST RETIRÉ QUE S'IL RESSEMBLE À UN NUMÉRO DE SUCCURSALE : trois à cinq chiffres EN FIN de nom, après
// au moins une lettre. « Studio 54 » (deux chiffres) et « 9123-4567 Québec inc. » (une société à numéro, qui COMMENCE
// par des chiffres) gardent leur nom. Au pire, la règle ne réunit pas assez ; elle ne fusionne pas deux enseignes sans
// rapport sur un détail de format.
//
// Fonction PURE.

import { cleGroupement, normaliserNomEmployeur } from "./employeurs";

/** Un numéro de succursale : espace, puis (facultatif) « # » ou « no », puis trois à cinq chiffres, en fin de nom. */
const NUMERO_DE_SUCCURSALE = /\s+(?:#\s*|no\.?\s*|n°\s*)?\d{3,5}$/;

/** La clé d'enseigne d'un nom d'employeur. `secours` sert quand le nom est vide (même rôle que `cleGroupement`). */
export function cleEnseigne(nom: string, secours: string): string {
  const base = normaliserNomEmployeur(nom);
  if (base === "") return cleGroupement(nom, secours);
  // Une société à numéro commence par des chiffres : son nom EST le numéro.
  if (/^\d/.test(base)) return cleGroupement(nom, secours);
  const sans = base.replace(NUMERO_DE_SUCCURSALE, "").trim();
  // Il doit rester un nom lisible (au moins trois caractères dont une lettre).
  if (sans === base || sans.length < 3 || !/[a-z]/.test(sans)) return cleGroupement(nom, secours);
  return sans;
}
