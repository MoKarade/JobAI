// lib/mcp/origine.ts — sous quelle adresse le serveur d'autorisation se présente.
//
// ⚠️ POURQUOI CE N'EST PAS UNE LIGNE ANODINE. Les métadonnées OAuth annoncent au client OÙ
// aller chercher le jeton. Les dériver naïvement de l'en-tête `Host` laisse quiconque
// atteint l'app décider de cette adresse : il suffit d'une requête portant un `Host` choisi
// pour que le document publié désigne un autre serveur. On préfère donc une origine
// CONFIGURÉE, et l'en-tête ne sert que de repli — utile en développement, où aucune variable
// n'est posée.

/** L'origine canonique, configurée si elle l'est, déduite de la requête sinon. */
export function origineDe(requete: Request): string {
  const configuree = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  if (configuree !== "") {
    try {
      return new URL(configuree).origin;
    } catch {
      // Une variable mal formée ne doit pas casser la découverte : on retombe sur la
      // requête, et le repli reste correct dans le cas courant.
    }
  }
  return new URL(requete.url).origin;
}
