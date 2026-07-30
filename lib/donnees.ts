// lib/donnees.ts — lecture des offres depuis la base, côté serveur uniquement.
//
// Même sémantique que `getTrackerState` : `null` signifie « pas branché », jamais « vide ».
// La différence entre les deux est réelle et l'interface doit la montrer — un écran qui
// affiche « aucune offre » alors que la base n'est pas configurée envoie Marc chercher un
// bug dans ses données au lieu de sa configuration.

import { asc, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { offerReasons, offers } from "./db/schema";
import { assurerSeedAJour } from "./synchro";
import type { Offre, Raison } from "./types";

/**
 * Toutes les offres, prêtes à afficher, ou `null` si la base n'est pas configurée.
 * Trie comme l'artifact : actives avant historique, puis par note décroissante.
 */
export async function lireOffres(): Promise<Offre[] | null> {
  if (!process.env.DATABASE_URL) return null;

  // Met la base au niveau du jeu de départ si un déploiement l'a fait changer. Presque
  // toujours une seule lecture puis retour immédiat ; l'écriture n'a lieu qu'au premier
  // affichage suivant un balayage. Volontairement AVANT la lecture, sinon Marc verrait
  // l'ancienne liste une fois de plus avant que la nouvelle apparaisse.
  await assurerSeedAJour(db);

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
    // `Date` en base, chaîne ISO côté application : un objet Date ne traverse pas la
    // frontière serveur/client d'un Server Component sans surprise.
    perimeeLe: l.perimeeLe ? l.perimeeLe.toISOString() : null,
  }));
}

/**
 * Une offre par son identifiant, ou `null` si elle n'existe pas — ou si la base n'est pas
 * configurée. Les deux cas donnent le même écran (« introuvable ») et c'est volontaire :
 * un visiteur n'a pas à distinguer une offre absente d'une base éteinte.
 *
 * Une requête ciblée plutôt qu'un filtre sur `lireOffres()` : la page de détail ne doit pas
 * dépendre du chargement de tout le suivi.
 */
export async function lireOffre(id: string): Promise<Offre | null> {
  if (!process.env.DATABASE_URL) return null;

  const [ligne] = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
  if (!ligne) return null;

  const raisons = await db
    .select()
    .from(offerReasons)
    .where(eq(offerReasons.offerId, id))
    .orderBy(asc(offerReasons.ordre));

  return {
    id: ligne.id,
    source: ligne.source,
    dateReperage: ligne.dateReperage,
    entreprise: ligne.entreprise,
    poste: ligne.poste,
    lien: ligne.lien,
    km: ligne.km,
    salaireAffiche: ligne.salaireAffiche,
    priorite: ligne.priorite,
    statut: ligne.statut,
    dateEnvoi: ligne.dateEnvoi,
    score: ligne.score,
    scoreSource: ligne.scoreSource,
    raisons: raisons.map((r) => ({ ton: r.ton, texte: r.texte })),
    notes: ligne.notes,
    userNote: ligne.userNote,
    histo: ligne.histo,
    perimeeLe: ligne.perimeeLe ? ligne.perimeeLe.toISOString() : null,
  };
}

/** Remplace la justification d'une offre. Utilisé par le chargement du jeu de départ. */
export async function remplacerRaisons(offreId: string, raisons: readonly Raison[]) {
  await db.delete(offerReasons).where(eq(offerReasons.offerId, offreId));
  if (raisons.length === 0) return;
  await db.insert(offerReasons).values(
    raisons.map((r, i) => ({ offerId: offreId, ton: r.ton, texte: r.texte, ordre: i })),
  );
}
