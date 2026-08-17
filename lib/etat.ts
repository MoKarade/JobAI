// lib/etat.ts — lire et écrire une ligne d'état, une seule fois pour toute l'app.
//
// Ces deux fonctions vivaient dans `lib/veilleComplete.ts`, où elles n'avaient qu'un seul
// appelant. Depuis que la découverte de pages carrières est déclenchable À LA MAIN autant
// que par le cron, elles en ont deux — et une deuxième copie du même `upsert` finirait par
// diverger, comme les quatre listes de colonnes d'insertion l'ont fait avant elle.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { syncState } from "./db/schema";

export async function lireEtat<T>(cle: string, defaut: T): Promise<T> {
  const [ligne] = await db.select().from(syncState).where(eq(syncState.cle, cle));
  if (!ligne) return defaut;
  try {
    return JSON.parse(ligne.valeur) as T;
  } catch {
    // Un état illisible ne doit pas bloquer la veille à vie : on repart du défaut, et la
    // passe réécrira une valeur saine.
    return defaut;
  }
}

export async function ecrireEtat(cle: string, valeur: unknown): Promise<void> {
  const v = JSON.stringify(valeur);
  const maj = await db
    .update(syncState)
    .set({ valeur: v, majLe: new Date() })
    .where(eq(syncState.cle, cle))
    .returning();
  if (maj.length === 0) {
    await db.insert(syncState).values({ cle, valeur: v }).onConflictDoNothing();
  }
}
