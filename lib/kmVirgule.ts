// lib/kmVirgule.ts — distance écrite à la française (« 12,3 km »), comme partout dans l'app.

export function kmVirgule(km: number): string {
  return `${km.toString().replace(".", ",")} km`;
}
