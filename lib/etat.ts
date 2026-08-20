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

/**
 * La valeur BRUTE, sans parser. `null` = la ligne n'existe pas.
 *
 * ⚠️ ELLE EXISTE PARCE QUE `lireEtat` NE PEUT PAS DISTINGUER « absent » DE « illisible » :
 * son `catch` rend le défaut dans les deux cas, ce qui est le bon comportement pour un
 * curseur ou un registre (on repart, la passe suivante réécrit). Pour un COMPTEUR DE COÛT,
 * c'est le pire : un JSON corrompu repartirait de zéro et publierait un cumul amputé avec
 * l'autorité d'une mesure. L'appelant qui a besoin de la distinction parse lui-même.
 *
 * Une deuxième copie de l'`upsert` aurait fini par diverger — d'où une lecture de plus ici,
 * plutôt qu'un module d'état parallèle.
 */
export async function lireEtatBrut(cle: string): Promise<string | null> {
  const [ligne] = await db.select().from(syncState).where(eq(syncState.cle, cle));
  return ligne ? ligne.valeur : null;
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
