// lib/lienTelephone.ts — transforme un numéro affiché en lien `tel:` touchable.
//
// ⚠️ Pas assez de chiffres = pas de lien (null) : un texte qui n'est pas un numéro ne doit
// pas devenir un bouton d'appel. On garde seulement les chiffres et un + en tête.

/** Nombre minimal de chiffres pour qu'un texte soit traité comme un numéro. */
const CHIFFRES_MIN = 7;

export function lienTelephone(brut: string | null | undefined): string | null {
  if (!brut) return null;
  const texte = brut.trim();
  const chiffres = texte.replace(/\D/g, "");
  if (chiffres.length < CHIFFRES_MIN) return null;
  return `tel:${texte.startsWith("+") ? "+" : ""}${chiffres}`;
}
