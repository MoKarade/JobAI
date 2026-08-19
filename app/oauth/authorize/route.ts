// app/oauth/authorize/route.ts — le point où MARC autorise, en personne.
//
// ⚠️ CETTE ROUTE RESTE DERRIÈRE LA GARDE DE SESSION, ET C'EST TOUT SON INTÉRÊT. Le
// middleware redirige un visiteur non connecté vers `/connexion?retour=…`, donc vers le
// login Google, qui le ramène ici avec les mêmes paramètres. On n'écrit aucun écran de
// connexion : celui de l'app fait le travail, et c'est le même compte, la même règle
// mono-adresse, le même cookie. L'ajouter aux chemins publics casserait tout le modèle.
//
// ⚠️ ON NE REDIRIGE JAMAIS VERS UNE ADRESSE NON VALIDÉE, MÊME POUR SIGNALER UNE ERREUR.
// OAuth veut qu'une erreur reparte vers le client — mais tant que `redirect_uri` n'a pas été
// reconnue comme enregistrée, y renvoyer quoi que ce soit fait de cette route une redirection
// ouverte. L'ordre est donc : identifier le client, RECONNAÎTRE l'adresse, et seulement
// ensuite se permettre de lui parler.

import { auth } from "@/auth";
import {
  CODE_TTL_MS,
  empreinte,
  estProprietaire,
  genererSecret,
  redirectUriEnregistree,
} from "@/lib/mcp/oauth";
import { lireClient, poserCode } from "@/lib/oauthStore";

export const dynamic = "force-dynamic";

/** Une erreur qu'on ne peut PAS renvoyer au client : on l'affiche ici. */
function mur(message: string, statut = 400): Response {
  return new Response(
    `Autorisation refusée.\n\n${message}\n\nRien n'a été délivré. Tu peux fermer cette page.`,
    { status: statut, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(requete: Request): Promise<Response> {
  const p = new URL(requete.url).searchParams;
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const etat = p.get("state");
  const defi = p.get("code_challenge") ?? "";
  const methode = p.get("code_challenge_method") ?? "";
  const type = p.get("response_type") ?? "";

  // 1. Le client existe-t-il, et cette adresse est-elle bien LA SIENNE ? Tant que ces deux
  //    réponses ne sont pas oui, on ne redirige nulle part.
  const client = clientId === "" ? null : await lireClient(clientId);
  if (client === null) return mur("Client inconnu. Reconnecte le connecteur depuis claude.ai.");
  if (!redirectUriEnregistree(redirectUri, client.redirectUris)) {
    return mur("L'adresse de retour ne fait pas partie de celles que ce client a enregistrées.");
  }

  // 2. À partir d'ici, l'adresse est reconnue : une erreur peut lui être renvoyée.
  const versClient = (code: string, description: string): Response => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", code);
    u.searchParams.set("error_description", description);
    if (etat !== null) u.searchParams.set("state", etat);
    return Response.redirect(u.toString(), 302);
  };

  if (type !== "code") return versClient("unsupported_response_type", "Seul `code` est accepté.");
  // PKCE OBLIGATOIRE, S256 SEULEMENT. `plain` rendrait le défi égal au vérificateur, donc
  // PKCE ne protégerait plus rien — OAuth 2.1 l'interdit et on ne l'annonce nulle part.
  if (methode !== "S256") return versClient("invalid_request", "PKCE S256 obligatoire.");
  if (defi.length < 43 || defi.length > 128) {
    return versClient("invalid_request", "`code_challenge` absent ou hors bornes.");
  }

  // 3. QUI autorise. Le middleware garantit déjà une session ; on la revérifie quand même —
  //    défense en profondeur — et on revérifie surtout que c'est bien LE compte autorisé.
  const session = await auth();
  const courriel = session?.user?.email ?? null;
  if (!estProprietaire(courriel, process.env.AUTHORIZED_EMAIL ?? "")) {
    // ⚠️ ÉCHEC FERMÉ : sans `AUTHORIZED_EMAIL`, `estProprietaire` rend faux. On ne laisse
    // pas passer « faute de règle » — un compte Google quelconque ayant traversé le flux
    // repartirait sinon avec un jeton sur le suivi de Marc.
    return mur("Ce compte Google n'est pas celui du propriétaire de ce suivi.", 403);
  }

  // 4. Le code. Stocké par son EMPREINTE : la base ne porte jamais la valeur utilisable.
  const code = genererSecret();
  await poserCode(
    empreinte(code),
    { clientId, redirectUri, defi, sujet: courriel ?? "" },
    new Date(Date.now() + CODE_TTL_MS),
  );

  const retour = new URL(redirectUri);
  retour.searchParams.set("code", code);
  if (etat !== null) retour.searchParams.set("state", etat);
  return Response.redirect(retour.toString(), 302);
}
