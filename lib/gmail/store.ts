// lib/gmail/store.ts — où vit le jeton de rafraîchissement chiffré. (ADR-0041, JobAI#107)
//
// Une ligne de `sync_state` (clé `gmail-jeton`) : pas de table de plus, pas de migration. Le CONTENU n'en sort jamais par le
// connecteur MCP (`etat_synchro` ne rend que le nom et la date d'écriture), et ce fichier est hors de `lib/mcp/` exprès.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { syncState } from "../db/schema";
import { assurerMigrations } from "../migrations";

const CLE_JETON_GMAIL = "gmail-jeton";

export async function enregistrerJetonChiffre(blob: string): Promise<void> {
  await assurerMigrations();
  await db
    .insert(syncState)
    .values({ cle: CLE_JETON_GMAIL, valeur: blob, majLe: new Date() })
    .onConflictDoUpdate({ target: syncState.cle, set: { valeur: blob, majLe: new Date() } });
}

export async function lireJetonChiffre(): Promise<string | null> {
  await assurerMigrations();
  const [ligne] = await db.select({ valeur: syncState.valeur }).from(syncState).where(eq(syncState.cle, CLE_JETON_GMAIL));
  return ligne?.valeur ?? null;
}
