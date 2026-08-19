// lib/oauthStore.ts — l'état du serveur d'autorisation, et rien d'autre.
//
// ⚠️ POURQUOI CE FICHIER N'EST PAS DANS `lib/mcp/`. Le garde de frontière
// (`tests/mcpSurface.test.ts`) interdit à tout fichier de `lib/mcp/` d'atteindre la base :
// c'est ce qui garantit que le connecteur ne peut pas contourner `lib/suivi.ts`, donc la
// condition n°2 de l'exception au garde-fou n°2. Y glisser un accès SQL « juste pour les
// jetons » retirerait le garde d'un coup. L'état OAuth vit donc ici, à côté des autres
// modules de persistance.
//
// ⚠️ RIEN N'EST STOCKÉ EN CLAIR. Codes et jetons vivent par leur EMPREINTE : une base lue par
// un tiers ne rend que des valeurs inutilisables. Corollaire opérationnel : le kill-switch
// d'incident est direct — vider `oauth_jetons` invalide tout, sans clé à faire tourner.
//
// ⚠️ L'USAGE UNIQUE EST GARANTI PAR LA BASE, PAS PAR LE CODE APPELANT. `consommerCode` fait
// un `UPDATE … WHERE consomme_le IS NULL RETURNING` : deux requêtes simultanées portant le
// même code ne peuvent pas gagner toutes les deux, parce que c'est Postgres qui arbitre. Un
// « lire puis écrire » côté application laisserait une fenêtre où un code rejoué passe.

import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "./db";
import { oauthClients, oauthCodes, oauthJetons } from "./db/schema";

export interface ClientEnregistre {
  id: string;
  nom: string;
  redirectUris: string[];
}

export async function enregistrerClient(
  id: string,
  nom: string,
  redirectUris: readonly string[],
): Promise<void> {
  await db.insert(oauthClients).values({ id, nom, redirectUris: [...redirectUris] });
}

export async function lireClient(id: string): Promise<ClientEnregistre | null> {
  const [c] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
  return c === undefined ? null : { id: c.id, nom: c.nom, redirectUris: c.redirectUris };
}

export interface CodeEnAttente {
  clientId: string;
  redirectUri: string;
  defi: string;
  sujet: string;
}

export async function poserCode(
  empreinte: string,
  code: CodeEnAttente,
  expireLe: Date,
): Promise<void> {
  await db.insert(oauthCodes).values({ empreinte, ...code, expireLe });
}

/**
 * Consomme un code, ou rend `null`.
 *
 * ⚠️ ATOMIQUE. Le `WHERE consomme_le IS NULL` est ce qui rend le code à usage unique : un
 * rejeu ne met à jour aucune ligne et ne rend donc rien. L'expiration est vérifiée dans la
 * MÊME requête pour la même raison — un code expiré entre la lecture et l'écriture serait
 * accepté par un contrôle fait en deux temps.
 */
export async function consommerCode(
  empreinte: string,
  maintenant: Date,
): Promise<CodeEnAttente | null> {
  const lignes = await db
    .update(oauthCodes)
    .set({ consommeLe: maintenant })
    .where(
      and(
        eq(oauthCodes.empreinte, empreinte),
        isNull(oauthCodes.consommeLe),
        // `expireLe > maintenant` : la colonne à gauche, pour que Drizzle lie la date
        // comme un paramètre et non comme une chaîne à caster.
        gt(oauthCodes.expireLe, maintenant),
      ),
    )
    .returning();

  const c = lignes[0];
  if (c === undefined) return null;
  return { clientId: c.clientId, redirectUri: c.redirectUri, defi: c.defi, sujet: c.sujet };
}

export type GenreJeton = "acces" | "rafraichissement";

export async function poserJeton(
  empreinte: string,
  genre: GenreJeton,
  clientId: string,
  sujet: string,
  expireLe: Date,
): Promise<void> {
  await db.insert(oauthJetons).values({ empreinte, genre, clientId, sujet, expireLe });
}

export interface JetonValide {
  clientId: string;
  sujet: string;
}

/** Un jeton non révoqué et non expiré, ou `null`. Aucune distinction : un refus est un refus. */
export async function lireJetonValide(
  empreinte: string,
  genre: GenreJeton,
  maintenant: Date,
): Promise<JetonValide | null> {
  const [j] = await db
    .select()
    .from(oauthJetons)
    .where(and(eq(oauthJetons.empreinte, empreinte), eq(oauthJetons.genre, genre)))
    .limit(1);

  if (j === undefined) return null;
  if (j.revoqueLe !== null) return null;
  if (j.expireLe.getTime() <= maintenant.getTime()) return null;
  return { clientId: j.clientId, sujet: j.sujet };
}

/**
 * Révoque un jeton de rafraîchissement au moment de la ROTATION.
 *
 * Atomique pour la même raison que la consommation d'un code : deux rafraîchissements
 * simultanés ne doivent pas produire deux familles de jetons valides.
 */
export async function revoquerJeton(empreinte: string, maintenant: Date): Promise<boolean> {
  const lignes = await db
    .update(oauthJetons)
    .set({ revoqueLe: maintenant })
    .where(and(eq(oauthJetons.empreinte, empreinte), isNull(oauthJetons.revoqueLe)))
    .returning({ empreinte: oauthJetons.empreinte });
  return lignes.length > 0;
}

/**
 * Retire ce qui ne sert plus.
 *
 * ⚠️ SANS PURGE, CES TABLES NE FONT QUE GROSSIR. Un code dure une minute et un jeton d'accès
 * une heure : sans balayage, il en reste une ligne par connexion, à vie. C'est la classe
 * « déborner sans purge » déjà consignée. Appelée depuis le chemin du jeton, là où il y a
 * de toute façon une écriture — pas dans un cron de plus qui pourrait cesser d'être appelé
 * sans qu'on le voie.
 */
export async function purger(maintenant: Date): Promise<void> {
  // Par l'échéance seule : un jeton révoqué mais non expiré part avec les autres le moment
  // venu, et le garder d'ici là ne coûte rien. Une condition de plus ici serait une règle de
  // plus à tenir juste, pour un gain nul.
  await db.delete(oauthCodes).where(lt(oauthCodes.expireLe, maintenant));
  await db.delete(oauthJetons).where(lt(oauthJetons.expireLe, maintenant));
}
