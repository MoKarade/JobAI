// lib/lia/monter.ts — dit si la session est admise. LIA est montée partout ; ce booléen la fait passer
// du mode invité (sans question possible, voir askInvite.ts) au mode connecté.

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
