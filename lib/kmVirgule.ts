// lib/kmVirgule.ts — distance écrite à la française (« 12,3 km »), comme partout dans l'app.

export function kmVirgule(km: number, approchee = false): string {
  return `${approchee ? "≈ " : ""}${km.toString().replace(".", ",")} km`;
}
