// lib/declencheurVeille.ts — qui a lancé une passe de veille, en mots simples.
// Les noms internes (`cron-veille`, `bouton-app`…) ne s'affichent jamais à l'écran.

export function declencheurLisible(declencheur: string): string {
  return declencheur === "bouton-app" ? "à la main" : "automatique";
}
