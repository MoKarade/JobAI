// lib/gmail/lecture.ts — lire des courriels reçus, en lecture seule. (ADR-0041, JobAI#107)
//
// ⚠️ DES GET, RIEN D'AUTRE. Ce fichier n'émet qu'une méthode HTTP, `GET`, vers `gmail.googleapis.com/gmail/v1/users/me/messages` :
// ni envoi, ni suppression, ni étiquette. Le test `tests/gmailLecture.test.ts` le verrouille.
//
// ⚠️ CE QU'ON GARDE D'UN COURRIEL. L'expéditeur (adresse + nom d'affichage), le sujet, la date, et l'EXTRAIT (`snippet`, ~200
// caractères) passé par `expurgerPII` avant toute autre utilisation (dépôt public, garde-fou n°1). Jamais le corps complet, jamais
// une pièce jointe. Tout cela est une DONNÉE écrite par un tiers (garde-fou n°6), jamais une consigne.
//
// ⚠️ BORNÉ. `max` plafonne le nombre de courriels, `depuisJours` l'âge : une boîte de dix ans n'est jamais lue d'un coup.

import { expurgerPII } from "../ingest/expurger";
import { GoogleErreur, type FetchFn } from "./oauth";

const RACINE = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
export const COURRIELS_MAX = 50;
const JOURS_MAX = 60;

export interface CourrielLu {
  id: string;
  de: string;
  sujet: string;
  /** Date de réception, ISO, ou `null` si l'en-tête est illisible. */
  recuLe: string | null;
  extrait: string;
}

/** Les promotions et réseaux sociaux ne sont jamais des réponses de recruteur : écartés par la requête, pas lus puis jetés. */
export function requeteReponses(depuisJours: number): string {
  const jours = Math.min(Math.max(Math.trunc(depuisJours), 1), JOURS_MAX);
  return `in:inbox newer_than:${jours}d -category:promotions -category:social -category:forums`;
}

function enTete(entetes: readonly { name?: string; value?: string }[], nom: string): string {
  const e = entetes.find((h) => h.name?.toLowerCase() === nom.toLowerCase());
  return (e?.value ?? "").replace(/\s+/g, " ").trim();
}

function dateIso(brut: string): string | null {
  if (brut === "") return null;
  const t = Date.parse(brut);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

async function get(fetchFn: FetchFn, url: string, accessToken: string): Promise<unknown> {
  let rep: Response;
  try {
    rep = await fetchFn(url, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new GoogleErreur("Gmail injoignable.", null);
  }
  if (!rep.ok) throw new GoogleErreur(`Gmail a refusé la lecture (${rep.status}).`, rep.status);
  return rep.json().catch(() => {
    throw new GoogleErreur("Réponse de Gmail illisible.", rep.status);
  });
}

/** Les courriels reçus récents, du plus récent au plus ancien, dans les bornes. */
export async function lireCourriels(
  accessToken: string,
  opts: { depuisJours: number; max: number },
  fetchFn: FetchFn,
): Promise<CourrielLu[]> {
  const max = Math.min(Math.max(Math.trunc(opts.max), 1), COURRIELS_MAX);
  const liste = (await get(
    fetchFn,
    `${RACINE}?${new URLSearchParams({ q: requeteReponses(opts.depuisJours), maxResults: String(max) }).toString()}`,
    accessToken,
  )) as { messages?: { id?: string }[] };
  const ids = (liste.messages ?? []).flatMap((m) => (typeof m.id === "string" ? [m.id] : [])).slice(0, max);

  const rendus: CourrielLu[] = [];
  for (const id of ids) {
    const m = (await get(
      fetchFn,
      `${RACINE}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      accessToken,
    )) as { snippet?: string; payload?: { headers?: { name?: string; value?: string }[] } };
    const entetes = m.payload?.headers ?? [];
    rendus.push({
      id,
      de: enTete(entetes, "From"),
      sujet: enTete(entetes, "Subject"),
      recuLe: dateIso(enTete(entetes, "Date")),
      extrait: expurgerPII(typeof m.snippet === "string" ? m.snippet : "").texte.replace(/\s+/g, " ").trim(),
    });
  }
  return rendus;
}
