// lib/dateLisible.ts — date AAAA-MM-JJ en toutes lettres (« 14 septembre 2026 »).
//
// Fonction pure, sans fuseau : la date est déjà écrite dans le fuseau de Marc, on ne la
// repasse jamais par `Date`. Une valeur qui n'est pas une vraie date est rendue telle quelle :
// on n'invente rien (pas de « date inconnue » à la place d'un texte réel).

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function dateLisible(valeur: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return valeur;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  const nom = MOIS[mois - 1];
  const joursDuMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  if (!nom || jour < 1 || jour > joursDuMois) return valeur;
  return `${jour === 1 ? "1er" : jour} ${nom} ${annee}`;
}
