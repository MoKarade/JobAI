// lib/sessionSignee.ts — lecture du NOUVEAU cookie de session signé (JWS ES256).
//
// Phase 1 du plan `auth-asym-hubperso` (C:\dev\_pc-local\agence\pages\plans\
// auth-asym-hubperso.md, §5.1) : « accepter les deux ». Hubperso n'émet pas encore ce
// cookie — tant que `HUB_SESSION_PUBLIC_KEYS` n'est pas configurée, ce module ne fait
// rien et l'ancien chemin (`auth.ts`, cookie JWE) reste seul à décider. Additif, donc :
// aucune ligne ici ne retire quoi que ce soit à l'ancien chemin.
//
// La vérification cryptographique elle-même (algorithme figé ES256, `kid` requis, `exp`/
// `iat` obligatoires, tolérance d'horloge, durée de vie bornée, jamais d'exception) vit
// dans `@mokarade/hub-contract/session` — écrite et testée UNE fois pour tout le parc.
// Ce fichier ne fait que : lire la clé publique depuis l'environnement (jamais inventée),
// et appliquer la MÊME règle d'autorisation à deux étages que `auth.ts` (callback `jwt`).
//
// ⚠️ RÈGLE DUPLIQUÉE, VOLONTAIREMENT. `auth.ts` n'est pas touché ici (consigne du gérant :
// « le code ne touche pas à l'ancien chemin avant la phase 3 »), donc le test « Marc
// d'abord, puis le hub » vit à deux endroits le temps de la migration. Si l'un change,
// l'autre doit changer avec — la phase 3, qui retire l'ancien chemin, fait disparaître
// cette duplication en même temps qu'elle.

import { verifierSession, type ClesPubliques, type IdentiteSession } from "@mokarade/hub-contract/session";
import { estEmailAutorise } from "./autorisation";
import { aAccesHub } from "./accesHub";

/** Nom du nouveau cookie (plan §3). Domaine `.hubperso.com`, posé par Hubperso seul. */
export const NOM_COOKIE_SESSION_SIGNEE = "__Secure-hub.session";

/**
 * Les clés publiques du hub (JWKS, 1 à 2 `kid` pendant une rotation), lues depuis
 * l'environnement — JAMAIS écrites en dur (garde-fou sécurité). `null` si la variable est
 * absente ou illisible : ÉCHEC FERMÉ, le nouveau cookie est alors ignoré sans exception,
 * et l'ancien chemin continue de décider seul.
 */
export function clesPubliquesDepuisEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): ClesPubliques | null {
  const brut = env.HUB_SESSION_PUBLIC_KEYS?.trim();
  if (!brut) return null;

  let parsees: unknown;
  try {
    parsees = JSON.parse(brut);
  } catch {
    console.error("[sessionSignee] HUB_SESSION_PUBLIC_KEYS n'est pas du JSON valide.");
    return null;
  }

  const valide =
    typeof parsees === "object" &&
    parsees !== null &&
    Array.isArray((parsees as { keys?: unknown }).keys);
  if (!valide) {
    console.error("[sessionSignee] HUB_SESSION_PUBLIC_KEYS ne porte pas la forme { keys: [...] }.");
    return null;
  }

  return parsees as ClesPubliques;
}

/**
 * Vérifie le cookie et rend l'identité qu'il porte, ou `null`. Ne lève jamais — la
 * vérification cryptographique elle-même vient de `verifierSession` (hub-contract), qui
 * porte la même promesse.
 */
export async function lireIdentiteSignee(
  cookieValue: string | undefined,
  env: Partial<NodeJS.ProcessEnv> = process.env,
  verifier: typeof verifierSession = verifierSession,
): Promise<IdentiteSession | null> {
  if (!cookieValue) return null;
  const clesPubliques = clesPubliquesDepuisEnv(env);
  if (!clesPubliques) return null;
  return verifier(cookieValue, clesPubliques);
}

/**
 * Le nouveau cookie authentifie-t-il, ET autorise-t-il ? DEUX ÉTAGES, comme `auth.ts` :
 * `estEmailAutorise` d'abord (Marc entre sans dépendre du hub), `aAccesHub` ensuite pour
 * toute autre adresse. `verifierAcces` est injectable pour les tests — jamais de réseau
 * réel dans ce fichier.
 */
export async function estAuthentifieParSessionSignee(
  cookieValue: string | undefined,
  env: Partial<NodeJS.ProcessEnv> = process.env,
  verifier: typeof verifierSession = verifierSession,
  verifierAcces: (
    email: string | null | undefined,
    env: Partial<NodeJS.ProcessEnv>,
  ) => Promise<boolean> = aAccesHub,
): Promise<boolean> {
  const identite = await lireIdentiteSignee(cookieValue, env, verifier);
  if (!identite) return false;
  if (estEmailAutorise(identite.email, env.AUTHORIZED_EMAIL)) return true;
  return verifierAcces(identite.email, env);
}
