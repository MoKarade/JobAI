// lib/gmail/acces.ts — lire les courriels récents de Marc par la chaîne complète de l'échec fermé. (ADR-0041, JobAI#107 puis #218)
//
// Une seule marche d'escalier pour la route `/api/gmail/courriels` et pour l'outil MCP des propositions de statut : chaque marche a son
// état nommé, pour que Marc sache QUOI faire. Rien n'est écrit, ni chez Gmail ni dans le suivi. Aucun corps de réponse de Google n'est repris.

import { configGmail } from "./config";
import { dechiffrerJeton } from "./jeton";
import { lireCourriels, type CourrielLu } from "./lecture";
import { GoogleErreur, rafraichir, type FetchFn } from "./oauth";
import { lireJetonChiffre } from "./store";

export type LectureCourriels =
  | { etat: "ok"; courriels: CourrielLu[] }
  | { etat: "non-configure"; manquantes: readonly string[] }
  | { etat: "non-connecte" }
  | { etat: "jeton-illisible" }
  | { etat: "google-refuse"; statut: number | null };

export async function lireCourrielsRecus(opts: { depuisJours: number; max: number }, fetchFn: FetchFn = fetch): Promise<LectureCourriels> {
  const cfg = configGmail();
  if (!cfg.ok) return { etat: "non-configure", manquantes: cfg.manquantes };

  const blob = await lireJetonChiffre();
  if (blob === null) return { etat: "non-connecte" };
  const refreshToken = dechiffrerJeton(blob, cfg.secretChiffrement);
  if (refreshToken === null) return { etat: "jeton-illisible" };

  try {
    const acces = await rafraichir(cfg, refreshToken, fetchFn);
    return { etat: "ok", courriels: await lireCourriels(acces, opts, fetchFn) };
  } catch (err) {
    console.error("[gmail] lecture échouée", { name: err instanceof Error ? err.name : typeof err, statut: err instanceof GoogleErreur ? err.statut : null });
    return { etat: "google-refuse", statut: err instanceof GoogleErreur ? err.statut : null };
  }
}
