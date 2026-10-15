// lib/titreOffre.ts — titre d'onglet de la fiche d'une offre (fonction pure).
//
// Avant : « Entreprise — JobAI ». Quand plusieurs offres d'une même entreprise sont
// ouvertes dans des onglets (ou dans l'historique), on ne pouvait pas les distinguer.
// Maintenant : « Poste · Entreprise — JobAI ». Une offre absente donne un titre neutre :
// le titre d'onglet ne doit pas fuir le contenu d'une page inaccessible.

export function titreOffre(offre: { poste: string; entreprise: string } | null): string {
  if (!offre) return "Offre — JobAI";
  const poste = offre.poste.trim();
  return poste ? `${poste} · ${offre.entreprise} — JobAI` : `${offre.entreprise} — JobAI`;
}
