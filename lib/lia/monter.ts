// lib/lia/monter.ts — LIA n'apparaît que pour une session admise (pas sur /login).

import { NonAutorise, exigerSession } from "@/lib/session";

export async function liaAutorisee(): Promise<boolean> {
  try {
    await exigerSession();
    return true;
  } catch (erreur) {
    if (erreur instanceof NonAutorise) return false;
    throw erreur;
  }
}
