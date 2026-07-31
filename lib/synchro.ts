// lib/synchro.ts — mettre la base au niveau du jeu de départ, sans commande à taper.
//
// Marc ne doit pas avoir à lancer `npm run db:seed` après chaque balayage (demande du
// 2026-07-30). L'app s'en charge : au premier affichage qui suit un déploiement, elle
// constate que le jeu de départ a changé et l'applique. Les fois suivantes — c'est-à-dire
// presque toujours — elle ne fait qu'UNE lecture et repart.
//
// CE QUE ÇA NE FAIT PAS
// Ce n'est pas une ingestion : rien n'est cherché sur le réseau, aucune source d'offres
// n'est contactée (garde-fou n°4). La seule chose recopiée est `lib/seed.ts`, versionné,
// relu et livré par un commit — la même chose qu'avant, sans l'étape manuelle.
//
// LE SUIVI DE MARC EST INTOUCHABLE (garde-fou n°2)
// L'écriture passe par `fusionner`, qui préserve statut, priorité, date d'envoi et note
// personnelle. Une synchronisation automatique rend ce point CRITIQUE : avant, une erreur
// de fusion se voyait au moment où on lançait la commande ; maintenant elle s'appliquerait
// toute seule, sur toutes les offres, sans que personne ne regarde.
//
// UNE SEULE COPIE DE LA LOGIQUE D'ÉCRITURE
// `appliquerSeed` sert à la fois à l'app et à `scripts/charger-seed.ts`. Deux copies d'un
// même « upsert » finissent toujours par diverger, et c'est le suivi qui en paie le prix.

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "./db/schema";
import { offerReasons, offers, syncState } from "./db/schema";
import { colonnesSeed } from "./persistance";
import { SEED } from "./seed";
import { fusionner } from "./suivi";
import type { Offre } from "./types";

/** Clé de la ligne d'état qui suit le jeu de départ. */
export const CLE_SEED = "seed";

/** Préfixe du verrou. Une valeur ainsi préfixée signifie « quelqu'un applique en ce moment ». */
export const PREFIXE_EN_COURS = "en-cours:";

type Db = NeonHttpDatabase<typeof schema>;

/**
 * Empreinte du jeu de départ.
 *
 * Ne prend QUE les champs que la synchronisation écrit — pas `statut`, `priorite`,
 * `dateEnvoi` ni `userNote`, qui appartiennent à Marc et ne viennent jamais du jeu de
 * départ. Sinon la moindre modification de son suivi ferait croire à un jeu de départ
 * modifié, et déclencherait une réécriture complète à chaque fois.
 */
export function empreinteSeed(seed: readonly Offre[] = SEED): string {
  const utile = seed.map((o) => ({
    id: o.id,
    source: o.source,
    dateReperage: o.dateReperage,
    entreprise: o.entreprise,
    poste: o.poste,
    lien: o.lien,
    km: o.km,
    // `ville` a MANQUÉ ici jusqu'au 2026-07-31, et c'était le même défaut que celui qui a
    // coûté 40 villes : une liste de champs recopiée à la main, un champ oublié, aucun
    // signal. Sans elle, corriger la ville d'une offre du jeu de départ ne changeait pas
    // l'empreinte — donc `assurerSeedAJour` répondait « à jour » et la correction ne
    // partait jamais en base. Mesuré : deux seeds ne différant que par `ville` rendaient
    // une empreinte IDENTIQUE.
    ville: o.ville,
    salaireAffiche: o.salaireAffiche,
    score: o.score,
    scoreSource: o.scoreSource,
    notes: o.notes,
    histo: o.histo,
    perimeeLe: o.perimeeLe,
    raisons: o.raisons.map((r) => [r.ton, r.texte]),
  }));
  return createHash("sha256").update(JSON.stringify(utile)).digest("hex").slice(0, 32);
}

/** Ce qu'un passage de synchronisation a fait — ou pourquoi il n'a rien fait. */
export type ResultatSynchro =
  | { statut: "a-jour" }
  | { statut: "pas-de-base" }
  | { statut: "deja-en-cours" }
  | { statut: "applique"; crees: number; majs: number }
  | { statut: "echec"; message: string };

/**
 * Réserve le droit d'exécuter une passe de fond, au plus une fois par `delaiMs`.
 *
 * Sert la contre-pression du géocodage automatique. Sans elle, chaque rechargement de la
 * carte lancerait une passe : dix rafraîchissements de suite, et l'app martèle Nominatim —
 * un service gratuit qui BANNIT les appelants trop insistants. Ce qui était un confort
 * (« plus de bouton à cliquer ») coûterait alors la fonctionnalité entière.
 *
 * La réservation est atomique et passe par la base, pas par une variable de module : en
 * serverless, chaque instance a sa propre mémoire et le compteur local ne borne rien.
 *
 * `maintenant` est un paramètre : sans ça, la temporisation ne serait pas testable.
 */
export async function reserverPasse(
  db: Db | null,
  cle: string,
  delaiMs: number,
  maintenant: Date,
): Promise<boolean> {
  if (!db) return false;
  const jeton = String(maintenant.getTime());

  try {
    const [ligne] = await db.select().from(syncState).where(eq(syncState.cle, cle));

    if (!ligne) {
      const pris = await db
        .insert(syncState)
        .values({ cle, valeur: jeton, majLe: maintenant })
        .onConflictDoNothing()
        .returning();
      return pris.length > 0;
    }

    const precedent = Number(ligne.valeur);
    // Une valeur illisible ne doit pas bloquer à vie : on la traite comme « jamais fait ».
    const trop_tot = Number.isFinite(precedent) && maintenant.getTime() - precedent < delaiMs;
    if (trop_tot) return false;

    // Conditionnel sur la valeur lue : deux instances simultanées, une seule passe.
    const pris = await db
      .update(syncState)
      .set({ valeur: jeton, majLe: maintenant })
      .where(and(eq(syncState.cle, cle), eq(syncState.valeur, ligne.valeur)))
      .returning();
    return pris.length > 0;
  } catch {
    // Pas de passe plutôt qu'une passe non bornée : l'échec de la réservation ne doit
    // jamais ouvrir la porte au martèlement qu'elle est censée empêcher.
    return false;
  }
}

/**
 * Écrit le jeu de départ dans la base, en préservant le suivi.
 *
 * Extrait de `scripts/charger-seed.ts` sans changement de comportement, pour que l'app et
 * le script exécutent LE MÊME code.
 */
export async function appliquerSeed(db: Db): Promise<{ crees: number; majs: number }> {
  const existantes = await db.select().from(offers);

  // On ne relit que les champs que la fusion protège : le reste vient du jeu de départ.
  const suivi: Offre[] = existantes.map((l) => ({
    ...(SEED.find((s) => s.id === l.id) ?? ({} as Offre)),
    id: l.id,
    statut: l.statut,
    priorite: l.priorite,
    dateEnvoi: l.dateEnvoi,
    userNote: l.userNote,
  }));

  const aEcrire = fusionner(SEED, suivi);
  const connues = new Set(existantes.map((l) => l.id));
  let crees = 0;
  let majs = 0;

  for (const o of aEcrire) {
    // `colonnesSeed` et non `colonnesOffre` : le jeu de départ n'écrit pas `perimeeLe`,
    // sinon il ressusciterait les offres que la veille a constatées fermées.
    const valeurs = { ...colonnesSeed(o), majLe: new Date() };

    if (connues.has(o.id)) {
      await db.update(offers).set(valeurs).where(eq(offers.id, o.id));
      majs++;
    } else {
      await db.insert(offers).values(valeurs);
      crees++;
    }

    // Les justifications viennent toujours du jeu de départ : Marc ne les édite pas.
    await db.delete(offerReasons).where(eq(offerReasons.offerId, o.id));
    if (o.raisons.length > 0) {
      await db.insert(offerReasons).values(
        o.raisons.map((r, i) => ({ offerId: o.id, ton: r.ton, texte: r.texte, ordre: i })),
      );
    }
  }

  return { crees, majs };
}

/**
 * Applique le jeu de départ SI la base ne l'a pas déjà.
 *
 * Chemin normal — et de très loin le plus fréquent : une lecture, une comparaison de
 * chaînes, retour. Rien n'est écrit tant que le jeu de départ n'a pas bougé.
 *
 * N'ÉCHOUE JAMAIS VERS L'APPELANT : la synchronisation est un confort, l'affichage est
 * l'essentiel. Si la base refuse l'écriture, Marc doit voir ses offres — celles déjà
 * présentes — plutôt qu'une page d'erreur. L'échec est rendu dans le résultat pour que le
 * diagnostic puisse le montrer, jamais avalé en silence.
 */
export async function assurerSeedAJour(db: Db | null): Promise<ResultatSynchro> {
  if (!db) return { statut: "pas-de-base" };

  const cible = empreinteSeed();

  try {
    const [ligne] = await db.select().from(syncState).where(eq(syncState.cle, CLE_SEED));
    if (ligne?.valeur === cible) return { statut: "a-jour" };

    // Verrou : on ne prend la main que si la valeur n'a pas bougé entre la lecture et
    // l'écriture. Deux instances lancées ensemble ne peuvent pas appliquer en parallèle.
    const enCours = `${PREFIXE_EN_COURS}${cible}`;
    if (!ligne) {
      const pris = await db
        .insert(syncState)
        .values({ cle: CLE_SEED, valeur: enCours })
        .onConflictDoNothing()
        .returning();
      if (pris.length === 0) return { statut: "deja-en-cours" };
    } else {
      const pris = await db
        .update(syncState)
        .set({ valeur: enCours, majLe: new Date() })
        .where(and(eq(syncState.cle, CLE_SEED), eq(syncState.valeur, ligne.valeur)))
        .returning();
      if (pris.length === 0) return { statut: "deja-en-cours" };
    }

    const { crees, majs } = await appliquerSeed(db);

    // L'empreinte n'est posée qu'APRÈS l'écriture réussie. Si l'application échoue, la
    // valeur reste au verrou : le passage suivant voit qu'elle diffère de la cible et
    // reprend, au lieu de croire le travail fait.
    await db
      .update(syncState)
      .set({ valeur: cible, majLe: new Date() })
      .where(eq(syncState.cle, CLE_SEED));

    return { statut: "applique", crees, majs };
  } catch (err) {
    return { statut: "echec", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Clé de la temporisation du géocodage automatique. */
export const CLE_GEOCODAGE = "geocodage-auto";

/**
 * Intervalle minimal entre deux passes automatiques de géocodage.
 *
 * Cinq minutes : assez court pour qu'une poignée de visites suffise à tout situer, assez
 * long pour rester poli avec un service gratuit. Le bouton « Situer », lui, n'est pas
 * temporisé — un geste explicite de Marc n'a pas à attendre.
 */
export const DELAI_PASSE_AUTO_MS = 5 * 60 * 1000;

/** Clé de la temporisation de la mesure des distances. */
export const CLE_DISTANCES = "distances-auto";

/**
 * Intervalle minimal entre deux mesures automatiques.
 *
 * Plus court que le géocodage (5 min) : la mesure elle-même ne coûte rien — c'est du
 * calcul local. Ce qu'elle borne, c'est le géocodage des employeurs manquants qu'elle
 * déclenche en amont, lequel appelle Nominatim. D'où un délai du même ordre.
 */
export const DELAI_MESURE_AUTO_MS = 5 * 60 * 1000;
