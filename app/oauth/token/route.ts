// app/oauth/token/route.ts — le code devient un jeton, et le rafraîchissement TOURNE.
//
// ⚠️ DEUX EXIGENCES D'OAUTH 2.1 QUI ONT L'AIR DE DÉTAILS ET N'EN SONT PAS.
//
// 1. LE CODE EST À USAGE UNIQUE. Un design sans état l'autoriserait à être rejoué — c'est
//    le finding relevé sur FinanceAI. Ici l'unicité est garantie par la BASE
//    (`UPDATE … WHERE consomme_le IS NULL RETURNING`), pas par un « lire puis écrire » côté
//    application qui laisserait une fenêtre entre les deux.
// 2. LE JETON DE RAFRAÎCHISSEMENT TOURNE. Chaque échange révoque celui qui a servi et en
//    délivre un neuf. Sans rotation, un jeton volé vaut trente jours ; avec, sa réutilisation
//    échoue et l'incident se voit.
//
// Publique par nécessité : le client n'a pas encore de jeton, c'est précisément ce qu'il
// vient chercher. Ce qui le protège est PKCE — le vérificateur que seul le client légitime
// connaît — et non un secret partagé.

import { z } from "zod";
import {
  ACCES_TTL_MS,
  RAFRAICHISSEMENT_TTL_MS,
  empreinte,
  estProprietaire,
  genererSecret,
  verifierPkceS256,
} from "@/lib/mcp/oauth";
import {
  consommerCode,
  lireJetonValide,
  poserJeton,
  purger,
  revoquerJeton,
} from "@/lib/oauthStore";
import { classerPanne } from "@/lib/panne";

export const dynamic = "force-dynamic";

function erreur(code: string, description: string, statut = 400): Response {
  return Response.json(
    { error: code, error_description: description },
    { status: statut, headers: { "Cache-Control": "no-store" } },
  );
}

const CodeSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1).max(500),
  redirect_uri: z.string().min(1).max(2000),
  client_id: z.string().min(1).max(200),
  code_verifier: z.string().min(43).max(128),
});

const RafraichirSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1).max(500),
  client_id: z.string().min(1).max(200),
});

/** Délivre une paire, et rend la réponse OAuth. */
async function delivrer(
  clientId: string,
  sujet: string,
  maintenant: Date,
): Promise<Response> {
  const acces = genererSecret();
  const rafraichissement = genererSecret();
  await poserJeton(
    empreinte(acces),
    "acces",
    clientId,
    sujet,
    new Date(maintenant.getTime() + ACCES_TTL_MS),
  );
  await poserJeton(
    empreinte(rafraichissement),
    "rafraichissement",
    clientId,
    sujet,
    new Date(maintenant.getTime() + RAFRAICHISSEMENT_TTL_MS),
  );

  return Response.json(
    {
      access_token: acces,
      token_type: "Bearer",
      expires_in: Math.floor(ACCES_TTL_MS / 1000),
      refresh_token: rafraichissement,
      scope: "jobai",
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

/** Une panne de base, NOMMÉE. Deux causes, deux gestes — les confondre égare. */
function pannBase(err: unknown, ou: string): Response {
  const panne = classerPanne(err);
  console.error(`[oauth/token] ${ou}`, { panne, err });
  return erreur(
    "server_error",
    panne === "schema-absent"
      ? "Le schéma du connecteur n'est pas encore appliqué. Réessaie dans un instant."
      : "La base n'a pas répondu. Réessaie.",
    503,
  );
}

export async function POST(requete: Request): Promise<Response> {
  // Le corps arrive en `application/x-www-form-urlencoded` : c'est ce que la RFC impose et
  // ce que claude.ai envoie. On accepte aussi le JSON, parce qu'un client de test en envoie
  // et qu'une erreur de format se déboguerait très mal côté claude.ai.
  const type = requete.headers.get("content-type") ?? "";
  let brut: Record<string, unknown>;
  try {
    brut = type.includes("json")
      ? ((await requete.json()) as Record<string, unknown>)
      : Object.fromEntries(new URLSearchParams(await requete.text()));
  } catch {
    return erreur("invalid_request", "Corps illisible.");
  }

  const maintenant = new Date();
  const autorise = process.env.AUTHORIZED_EMAIL ?? "";

  try {
    if (brut["grant_type"] === "authorization_code") {
      const parse = CodeSchema.safeParse(brut);
      if (!parse.success)
        return erreur("invalid_request", "Paramètres manquants ou invalides.");
      const d = parse.data;

      const enAttente = await consommerCode(empreinte(d.code), maintenant);
      // Un code inconnu, expiré OU DÉJÀ CONSOMMÉ rend la même chose : un rejeu ne doit pas se
      // distinguer d'une erreur ordinaire, sinon il devient un oracle.
      if (enAttente === null)
        return erreur(
          "invalid_grant",
          "Code invalide, expiré ou déjà utilisé.",
        );

      if (enAttente.clientId !== d.client_id)
        return erreur("invalid_grant", "Code émis pour un autre client.");
      // L'adresse doit être la MÊME qu'à l'autorisation : c'est ce qui empêche de faire
      // atterrir un code ailleurs que là où Marc l'a envoyé.
      if (enAttente.redirectUri !== d.redirect_uri)
        return erreur("invalid_grant", "Adresse de retour différente.");
      if (!verifierPkceS256(d.code_verifier, enAttente.defi)) {
        return erreur("invalid_grant", "Vérificateur PKCE invalide.");
      }
      // ⚠️ RE-VÉRIFIÉ À L'USAGE, pas seulement à l'autorisation : si l'adresse autorisée
      // change entre-temps, les codes en vol cessent immédiatement de valoir quelque chose.
      if (!estProprietaire(enAttente.sujet, autorise))
        return erreur("invalid_grant", "Compte non autorisé.", 403);

      await purger(maintenant);
      return delivrer(d.client_id, enAttente.sujet, maintenant);
    }

    if (brut["grant_type"] === "refresh_token") {
      const parse = RafraichirSchema.safeParse(brut);
      if (!parse.success)
        return erreur("invalid_request", "Paramètres manquants ou invalides.");
      const d = parse.data;

      const emp = empreinte(d.refresh_token);
      const jeton = await lireJetonValide(emp, "rafraichissement", maintenant);
      if (jeton === null)
        return erreur(
          "invalid_grant",
          "Jeton de rafraîchissement invalide ou expiré.",
        );
      if (jeton.clientId !== d.client_id)
        return erreur("invalid_grant", "Jeton émis pour un autre client.");
      if (!estProprietaire(jeton.sujet, autorise))
        return erreur("invalid_grant", "Compte non autorisé.", 403);

      // ROTATION : on révoque AVANT de délivrer, et le succès de la révocation fait foi. Deux
      // rafraîchissements simultanés portant le même jeton ne peuvent pas gagner tous les deux.
      const tourne = await revoquerJeton(emp, maintenant);
      if (!tourne)
        return erreur(
          "invalid_grant",
          "Jeton de rafraîchissement déjà utilisé.",
        );

      await purger(maintenant);
      return delivrer(d.client_id, jeton.sujet, maintenant);
    }

    return erreur(
      "unsupported_grant_type",
      "Seuls `authorization_code` et `refresh_token` sont acceptés.",
    );
  } catch (err) {
    return pannBase(err, "échange impossible");
  }
}
