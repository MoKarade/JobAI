// lib/session.ts — la garde des Server Actions.
//
// Le middleware protège les ROUTES. Une Server Action n'est pas une route : c'est un point
// d'entrée POST généré par Next, appelable directement. Chaque action DOIT donc revérifier
// la session elle-même — c'est la défense en profondeur, pas une redondance.

import { auth } from "@/auth";

export class NonAutorise extends Error {
  constructor() {
    super("Authentification requise.");
    this.name = "NonAutorise";
  }
}

/** Rend la session, ou lève. À appeler en PREMIÈRE ligne de chaque Server Action. */
export async function exigerSession() {
  const session = await auth();
  if (!session?.user) throw new NonAutorise();
  return session;
}
