// lib/env.ts — lire une variable d'environnement sans confondre VIDE et ABSENTE.
//
// ⚠️ POURQUOI CE MODULE EXISTE (`[ENV-VIDE-01]`, 2026-09-18)
//
// `Number("")` vaut **0**, et `Number.isFinite(0)` vaut **true**. Une variable créée puis
// laissée blanche dans l'interface Vercel donne une chaîne vide, pas une absence — donc un
// `DOMICILE_LAT` blanc rendait la coordonnée `0`, au large de la Guinée, et TOUTES les
// distances partaient de là sans qu'aucun écran ne puisse le démentir. C'est « no fake data »
// pris à revers : une valeur plausible et fausse, née d'un champ laissé vide.
//
// Le coalescement NULLISH (`??`) porte le même piège dans l'autre sens : `""` n'étant pas
// nullish, `process.env.A ?? process.env.B` garde `A` vide et n'essaie JAMAIS `B`. La chaîne
// de repli se coupe donc silencieusement à la première variable blanche.
//
// UNE RÈGLE, DEUX FORMES, ET LE MÊME VERDICT : blanc ⇒ absent. PURE, module feuille.

/** La variable, ou `null` si elle est absente, vide ou blanche. */
export function texteEnv(...noms: readonly string[]): string | null {
  for (const nom of noms) {
    const brut = process.env[nom];
    if (typeof brut !== "string") continue;
    const valeur = brut.trim();
    if (valeur !== "") return valeur;
  }
  return null;
}

/**
 * La variable convertie en nombre FINI, ou `null`.
 *
 * ⚠️ Le `trim()` de `texteEnv` fait le travail que `Number` ne fait pas : sans lui, `" "` se
 * convertit aussi en `0`. La conversion n'a lieu que sur une chaîne non vide.
 */
export function nombreEnv(nom: string): number | null {
  const texte = texteEnv(nom);
  if (texte === null) return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : null;
}
