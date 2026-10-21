// lib/gmail/jeton.ts — chiffrer le jeton de rafraîchissement avant de le poser en base. (ADR-0041, JobAI#107)
//
// ⚠️ POURQUOI CHIFFRER. Ce dépôt est public mais la base ne l'est pas ; pourtant un jeton de rafraîchissement lit la boîte de Marc
// pour toujours, et une sauvegarde ou une lecture de base le rendrait. AES-256-GCM (authentifié : un blob altéré ne se déchiffre pas).
//
// ⚠️ LA CLÉ N'EST PAS UNE VARIABLE DE PLUS. Elle est dérivée (HKDF-SHA256) d'`AUTH_SECRET`, avec un contexte propre à cet usage : Marc
// n'a rien d'autre à poser. Corollaire assumé : changer `AUTH_SECRET` rend le jeton illisible, donc l'accès Gmail se redemande — ce
// qui est le bon comportement (échec fermé), pas une panne.
//
// Format : `v1.<iv>.<tag>.<chiffré>` en base64url. `dechiffrerJeton` ne LÈVE JAMAIS : tout ce qui ne se lit pas rend `null`.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const CONTEXTE = "jobai-gmail-refresh-token-v1";
/** Étiquette GCM de 16 octets, imposée à la lecture : une étiquette plus courte rendrait la falsification possible. */
const LONGUEUR_ETIQUETTE = 16;

function cle(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "jobai", CONTEXTE, 32));
}

export function chiffrerJeton(clair: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cle(secret), iv, { authTagLength: LONGUEUR_ETIQUETTE });
  const chiffre = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), chiffre.toString("base64url")].join(".");
}

export function dechiffrerJeton(blob: string, secret: string): string | null {
  const [version, iv, tag, chiffre, ...reste] = blob.split(".");
  if (version !== "v1" || !iv || !tag || !chiffre || reste.length > 0) return null;
  try {
    const etiquette = Buffer.from(tag, "base64url");
    if (etiquette.length !== LONGUEUR_ETIQUETTE) return null;
    const d = createDecipheriv("aes-256-gcm", cle(secret), Buffer.from(iv, "base64url"), { authTagLength: LONGUEUR_ETIQUETTE });
    d.setAuthTag(etiquette);
    return Buffer.concat([d.update(Buffer.from(chiffre, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
