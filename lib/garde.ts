// lib/garde.ts — la décision du middleware, en fonctions PURES.
//
// Le middleware lui-même ne fait qu'appliquer ce que ces fonctions décident. C'est ce qui
// rend la garde testable exhaustivement : un middleware Next ne se teste pas facilement,
// une fonction pure oui — et c'est précisément la pièce qu'il ne faut pas se tromper.

export type Decision =
  | { type: "laisser-passer" }
  | { type: "non-authentifie" } // 401 JSON, pour les appelants qui ne sont pas un navigateur
  | { type: "rediriger"; vers: string };

/**
 * Chemins accessibles sans session.
 *
 * ⚠️ N'AJOUTER ICI AUCUNE ROUTE QUI AFFICHE DES DONNÉES. La liste doit rester composée de :
 * la page de connexion, les routes d'Auth.js, les assets, et l'endpoint du hub — ce dernier
 * n'étant pas « ouvert » mais gardé AUTREMENT, par le jeton `x-hub-token` vérifié dans la
 * route elle-même.
 *
 * L'endpoint du hub DOIT être ici : sans ça, le hub recevrait une redirection HTML vers la
 * page de connexion au lieu du JSON attendu, et son widget afficherait « injoignable » en
 * permanence, sans que rien ne paraisse cassé côté app.
 */
export function estCheminPublic(chemin: string): boolean {
  if (chemin === "/connexion" || chemin.startsWith("/connexion/")) return true;
  if (chemin.startsWith("/api/auth/")) return true;
  if (chemin === "/api/hub/summary") return true;
  // Même statut que l'endpoint du hub : pas « ouverte », mais gardée AUTREMENT — par
  // `CRON_SECRET`, vérifié en temps constant dans la route, avec échec fermé (503 si le
  // secret n'est pas configuré, 401 s'il est faux). Sans cette ligne, l'appel de Vercel
  // recevrait une redirection vers l'écran de connexion, et la veille ne tournerait
  // jamais — en silence, puisque le cron ne remonte pas les redirections comme des échecs.
  if (chemin === "/api/cron/veille") return true;
  // Même famille, même CRON_SECRET (factorisé dans `lib/cronAuth.ts`) : une seconde passe
  // de géocodage quotidienne, à une autre heure que la veille (chantier #07, [CARTE-03]).
  if (chemin === "/api/cron/geocodage") return true;
  // Même famille : gardée par `INGEST_TOKEN`, en temps constant, échec fermé. C'est le
  // point d'entrée par lequel une Routine dépose ce qu'elle a trouvé — elle a le
  // connecteur Indeed mais aucun accès au dépôt, et aucune session Google.
  if (chemin === "/api/ingest/depot") return true;
  // Même famille : le connecteur MCP porte sa propre authentification (jeton en temps
  // constant aujourd'hui, OAuth 2.1 au lot 3 de l'ADR-0011). Un client MCP n'a pas de
  // session Google ; derrière la garde de session il recevrait une redirection HTML au lieu
  // du JSON-RPC attendu, et le connecteur serait muet sans qu'aucune erreur ne le dise.
  if (chemin === "/api/mcp") return true;

  if (
    chemin.startsWith("/_next/static/") ||
    chemin.startsWith("/_next/image") ||
    chemin === "/favicon.ico" ||
    chemin === "/icon.svg" ||
    chemin === "/manifest.webmanifest"
  ) {
    return true;
  }

  // Fichiers statiques servis depuis /public : ils portent une extension.
  const dernierSegment = chemin.split("/").pop() ?? "";
  return dernierSegment.includes(".");
}

/**
 * Que faire d'une requête ?
 *
 * Distinction essentielle : une route `/api/*` non authentifiée reçoit un **401**, jamais
 * une redirection. Un appelant machine ne suit pas une redirection vers un écran de
 * connexion — il reçoit du HTML là où il attend du JSON, et interprète ça comme une panne.
 */
export function deciderGarde(params: {
  authentifie: boolean;
  chemin: string;
  recherche?: string;
}): Decision {
  const { authentifie, chemin, recherche = "" } = params;

  if (estCheminPublic(chemin) || authentifie) return { type: "laisser-passer" };
  if (chemin.startsWith("/api/")) return { type: "non-authentifie" };

  // On mémorise la page demandée pour y revenir après la connexion.
  const retour = encodeURIComponent(chemin + recherche);
  return { type: "rediriger", vers: `/connexion?retour=${retour}` };
}
