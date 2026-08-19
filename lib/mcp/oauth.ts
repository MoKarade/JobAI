// lib/mcp/oauth.ts — la logique du serveur d'autorisation, PURE et testable.
//
// POURQUOI OAUTH ICI PLUTÔT QU'UN JETON
// Mesuré sur FinanceAI le 2026-07-13 : les connecteurs personnalisés de claude.ai n'acceptent
// QUE OAuth 2.0/2.1. Il n'y a pas de champ « jeton statique » dans leur interface. Le patron
// éprouvé de ce dépôt — un secret comparé en temps constant — ne s'applique donc pas, et il
// n'y a pas de raccourci.
//
// ⚠️ CE FICHIER PORTE LE FINDING CRITIQUE DÉJÀ PAYÉ UNE FOIS. FinanceAI avait livré
// `uri.startsWith("http://127.0.0.1")` pour valider un `redirect_uri`. Deux agents l'ont
// prouvé exploitable :
//   · `http://127.0.0.1.evil.com/cb`  — un SOUS-DOMAINE, l'hôte réel est evil.com ;
//   · `http://127.0.0.1@evil.com/cb`  — la partie USERINFO, l'hôte réel est evil.com.
// Sur un endpoint d'enregistrement PUBLIC, c'est une prise de contrôle de compte par
// hameçonnage : l'attaquant enregistre son URI, fait cliquer Marc, et repart avec le code.
// Ici : `new URL()`, comparaison d'hôte EXACTE, et rejet de tout `username`/`password`.
// Jamais de comparaison de préfixe. Les deux chaînes ci-dessus sont dans les tests.
//
// ⚠️ ET UN CONTRÔLE FAIT À L'ÉMISSION N'ARRÊTE PAS LES JETONS DÉJÀ ÉMIS. Autre leçon
// FinanceAI : un cookie d'un an vérifié seulement au callback a survécu au verrou censé le
// fermer. L'appartenance à l'adresse autorisée se vérifie donc À CHAQUE USAGE du jeton
// (`estProprietaire`), pas seulement au moment de le délivrer.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Durée de vie d'un code d'autorisation. Court : il ne fait que traverser un navigateur. */
export const CODE_TTL_MS = 60_000;
/** Durée de vie d'un jeton d'accès. */
export const ACCES_TTL_MS = 60 * 60 * 1000;
/** Durée de vie d'un jeton de rafraîchissement. */
export const RAFRAICHISSEMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Un secret opaque, imprévisible. */
export function genererSecret(octets = 32): string {
  return randomBytes(octets).toString("base64url");
}

/**
 * L'empreinte d'un secret.
 *
 * ⚠️ ON NE STOCKE JAMAIS LE SECRET EN CLAIR. Une base lue par un tiers rendrait alors des
 * jetons utilisables ; elle ne rend que des empreintes inutilisables. C'est la même raison
 * qu'un mot de passe haché, appliquée à des jetons qui ouvrent le suivi de Marc.
 */
export function empreinte(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Comparaison en temps constant de deux empreintes. */
export function memeEmpreinte(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type RefusUri =
  | "illisible"
  | "schema-interdit"
  | "userinfo-interdit"
  | "fragment-interdit"
  | "http-hors-loopback";

/**
 * Une adresse de redirection est-elle acceptable À L'ENREGISTREMENT ?
 *
 * C'est la porte d'entrée publique, donc le contrôle qui compte le plus. Chaque refus porte
 * son motif : « rejeté » sans raison ferait deviner, et on finirait par relâcher la règle
 * pour débloquer un client légitime.
 */
export function jugerRedirectUri(brut: string): { ok: true } | { ok: false; motif: RefusUri } {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return { ok: false, motif: "illisible" };
  }

  // ⚠️ LE PIÈGE MESURÉ. `http://127.0.0.1@evil.com/cb` a pour HÔTE evil.com : la partie avant
  // l'arobase est de l'« userinfo », pas un hôte. Un `startsWith` la lit comme une adresse de
  // confiance. On refuse toute URL qui en porte — elle n'a aucun usage légitime ici.
  if (u.username !== "" || u.password !== "") return { ok: false, motif: "userinfo-interdit" };

  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, motif: "schema-interdit" };
  }

  // Le fragment n'est jamais envoyé au serveur : une redirection qui en porte cache une
  // partie de son adresse à la comparaison exacte faite plus tard.
  if (u.hash !== "") return { ok: false, motif: "fragment-interdit" };

  // `http` n'est toléré que sur la boucle locale — le cas d'un client de bureau. Et l'hôte se
  // compare EXACTEMENT : `127.0.0.1.evil.com` n'est pas `127.0.0.1`.
  if (u.protocol === "http:" && !LOOPBACK.has(u.hostname)) {
    return { ok: false, motif: "http-hors-loopback" };
  }

  return { ok: true };
}

const LOOPBACK = new Set(["127.0.0.1", "[::1]", "::1", "localhost"]);

/**
 * L'adresse demandée figure-t-elle parmi celles que le client a ENREGISTRÉES ?
 *
 * Comparaison EXACTE de chaîne, comme OAuth 2.1 l'exige — pas d'origine, pas de préfixe, pas
 * de « commence par ». Un client de bureau sur la boucle locale reçoit un port dynamique : il
 * n'a qu'à enregistrer les adresses qu'il utilisera, ce que fait l'enregistrement dynamique.
 */
export function redirectUriEnregistree(demandee: string, enregistrees: readonly string[]): boolean {
  return enregistrees.some((e) => e === demandee);
}

/**
 * Le vérificateur PKCE correspond-il au défi annoncé ?
 *
 * S256 seulement. `plain` est autorisé par la RFC et interdit par OAuth 2.1 : l'accepter
 * rendrait le défi équivalent au vérificateur, donc inutile.
 */
export function verifierPkceS256(verificateur: string, defi: string): boolean {
  if (verificateur.length < 43 || verificateur.length > 128) return false;
  const calcule = createHash("sha256").update(verificateur).digest("base64url");
  return memeEmpreinte(calcule, defi);
}

/**
 * Cette identité est-elle celle de Marc ?
 *
 * ⚠️ APPELÉE À CHAQUE USAGE D'UN JETON, pas seulement à l'émission. Un contrôle posé au
 * callback laisse vivre les jetons déjà délivrés jusqu'à leur expiration — vécu sur FinanceAI
 * avec un cookie d'un an. Comparaison insensible à la casse : Google rend l'adresse telle que
 * l'utilisateur l'a écrite, et « Marc@… » est le même compte que « marc@… ».
 */
export function estProprietaire(courriel: string | null | undefined, autorise: string): boolean {
  if (typeof courriel !== "string" || courriel === "") return false;
  if (autorise === "") return false;
  return courriel.trim().toLowerCase() === autorise.trim().toLowerCase();
}

/** Un instant est-il dépassé ? Le « maintenant » est un PARAMÈTRE, jamais une horloge lue. */
export function expire(echeance: Date, maintenant: Date): boolean {
  return echeance.getTime() <= maintenant.getTime();
}

/**
 * Les métadonnées du serveur d'autorisation (RFC 8414).
 *
 * claude.ai les lit AVANT de tenter quoi que ce soit : sans ce document, il refuse de se
 * connecter, et l'erreur qu'il affiche ne dit pas laquelle des pièces manque.
 */
export function metadonneesAutorisation(origine: string) {
  return {
    issuer: origine,
    authorization_endpoint: `${origine}/oauth/authorize`,
    token_endpoint: `${origine}/oauth/token`,
    registration_endpoint: `${origine}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // S256 SEULEMENT : annoncer `plain` inviterait un client à s'en servir.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["jobai"],
  };
}

/** Les métadonnées de la ressource protégée (RFC 9728) : qui délivre les jetons pour elle. */
export function metadonneesRessource(origine: string) {
  return {
    resource: `${origine}/api/mcp`,
    authorization_servers: [origine],
    scopes_supported: ["jobai"],
    bearer_methods_supported: ["header"],
  };
}
