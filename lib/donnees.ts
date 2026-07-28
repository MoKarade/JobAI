// lib/donnees.ts — lecture des offres depuis la base, côté serveur uniquement.
//
// Même sémantique que `getTrackerState` : `null` signifie « pas branché », jamais « vide ».
// La différence entre les deux est réelle et l'interface doit la montrer — un écran qui
// affiche « aucune offre » alors que la base n'est pas configurée envoie Marc chercher un
// bug dans ses données au lieu de sa configuration.

import { asc, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { offerReasons, offers } from "./db/schema";
import type { Offre, Raison } from "./types";

/**
 * Toutes les offres, prêtes à afficher, ou `null` si la base n'est pas configurée.
 * Trie comme l'artifact : actives avant historique, puis par note décroissante.
 */
export async function lireOffres(): Promise<Offre[] | null> {
  if (!process.env.DATABASE_URL) return null;

  const [lignes, raisons] = await Promise.all([
    db
      .select()
      .from(offers)
      .orderBy(asc(offers.histo), desc(offers.score), asc(offers.entreprise)),
    db.select().from(offerReasons).orderBy(asc(offerReasons.offerId), asc(offerReasons.ordre)),
  ]);

  // Regroupement en mémoire plutôt qu'une jointure : le volume est de quelques dizaines
  // de lignes, et une jointure dupliquerait chaque offre par nombre de justifications.
  const parOffre = new Map<string, Raison[]>();
  for (const r of raisons) {
    const liste = parOffre.get(r.offerId) ?? [];
    liste.push({ ton: r.ton, texte: r.texte });
    parOffre.set(r.offerId, liste);
  }

  return lignes.map((l) => ({
    id: l.id,
    source: l.source,
    dateReperage: l.dateReperage,
    entreprise: l.entreprise,
    poste: l.poste,
    lien: l.lien,
    km: l.km,
    salaireAffiche: l.salaireAffiche,
    priorite: l.priorite,
    statut: l.statut,
    dateEnvoi: l.dateEnvoi,
    score: l.score,
    scoreSource: l.scoreSource,
    raisons: parOffre.get(l.id) ?? [],
    notes: l.notes,
    userNote: l.userNote,
    histo: l.histo,
  }));
}

/** Remplace la justification d'une offre. Utilisé par le chargement du jeu de départ. */
export async function remplacerRaisons(offreId: string, raisons: readonly Raison[]) {
  await db.delete(offerReasons).where(eq(offerReasons.offerId, offreId));
  if (raisons.length === 0) return;
  await db.insert(offerReasons).values(
    raisons.map((r, i) => ({ offerId: offreId, ton: r.ton, texte: r.texte, ordre: i })),
  );
}
