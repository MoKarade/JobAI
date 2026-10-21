// lib/gmail/config.ts — la configuration de l'accès Gmail, ou la liste de ce qui manque. PUR (ADR-0041, JobAI#107).
//
// ⚠️ ÉCHEC FERMÉ. Tant qu'une variable manque, `configGmail()` rend `ok: false` et TOUT se tait : aucune requête sortante, aucune
// route de connexion. Le client OAuth est un geste de Marc (JobAI#201) ; avant lui, ce module est la seule chose qui tourne.
//
// ⚠️ SEUL SCOPE DEMANDÉ : `gmail.readonly`. Il ne permet ni d'envoyer, ni de supprimer, ni de classer. Le code ne dépend pas de cette
// promesse : `lire.ts` n'émet que des GET, et `oauth.ts` refuse un jeton dont le scope accordé serait autre.

import { texteEnv } from "../env";

export const SCOPE_GMAIL = "https://www.googleapis.com/auth/gmail.readonly";
export const REDIRECT_PAR_DEFAUT = "https://emploi.hubperso.com/api/gmail/retour";

/** `AUTH_SECRET` est requis aussi : la clé qui chiffre le jeton de rafraîchissement en est dérivée (pas de seconde variable à poser). */
const VARIABLES_REQUISES = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "AUTH_SECRET"] as const;

export interface ConfigGmailPrete {
  ok: true;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Secret dont la clé de chiffrement est dérivée. */
  secretChiffrement: string;
}

export type ConfigGmail = ConfigGmailPrete | { ok: false; manquantes: string[] };

/** Les NOMS des variables absentes ou blanches, jamais leur valeur. */
export function configGmail(): ConfigGmail {
  const manquantes = VARIABLES_REQUISES.filter((nom) => texteEnv(nom) === null);
  const clientId = texteEnv("GMAIL_CLIENT_ID");
  const clientSecret = texteEnv("GMAIL_CLIENT_SECRET");
  const secretChiffrement = texteEnv("AUTH_SECRET");
  if (manquantes.length > 0 || clientId === null || clientSecret === null || secretChiffrement === null) {
    return { ok: false, manquantes: [...manquantes] };
  }
  return {
    ok: true,
    clientId,
    clientSecret,
    redirectUri: texteEnv("GMAIL_REDIRECT_URI") ?? REDIRECT_PAR_DEFAUT,
    secretChiffrement,
  };
}
