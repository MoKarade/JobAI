// lib/accord.ts — singulier ou pluriel selon le nombre (en français, 0 et 1 restent au singulier).
// Remplace les « nouvelle(s) », « retenue(s) » qui font technique à l'écran.

export function accord(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return Math.abs(n) >= 2 ? pluriel : singulier;
}
