// lib/mcp/origine.ts — sous quelle adresse le serveur d'autorisation se présente.
//
// ⚠️ POURQUOI CE N'EST PAS UNE LIGNE ANODINE. Les métadonnées OAuth annoncent au client OÙ
// aller chercher le jeton. Les dériver naïvement de l'en-tête `Host` laisse quiconque
// atteint l'app décider de cette adresse : il suffit d'une requête portant un `Host` choisi
// pour que le document publié désigne un autre serveur. On préfère donc une origine
// CONFIGURÉE, et l'en-tête ne sert que de repli — utile en développement, où aucune variable
// n'est posée.

import { texteEnv } from "../env";

/** L'origine canonique, configurée si elle l'est, déduite de la requête sinon. */
export function origineDe(requete: Request): string {
  // ⚠️ `texteEnv` PLUTÔT QU'UN COALESCEMENT NULLISH (`[ENV-VIDE-01]`). `""` n'étant pas
  // nullish, `AUTH_URL` laissée BLANCHE n'était pas remplacée par `NEXTAUTH_URL` : elle
  // coupait la chaîne de repli et faisait retomber l'origine sur l'en-tête de la requête —
  // exactement ce que ce module existe pour refuser.
  const configuree = texteEnv("AUTH_URL", "NEXTAUTH_URL");
  if (configuree !== null) {
    try {
      return new URL(configuree).origin;
    } catch {
      // Une variable mal formée ne doit pas casser la découverte : on retombe sur la
      // requête, et le repli reste correct dans le cas courant.
    }
  }
  return new URL(requete.url).origin;
}
