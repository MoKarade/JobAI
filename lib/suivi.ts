// lib/suivi.ts — fusion du jeu de départ avec le suivi, et résumé.
//
// GARDE-FOU N°2 du CLAUDE.md : `statut`, `priorite`, `dateEnvoi` et `userNote`
// (CHAMPS_UTILISATEUR) appartiennent à Marc. Ils survivent à TOUT rafraîchissement du jeu
// de départ, à toute ingestion et à tout scan Gmail. Le reste — lien, note de recherche,
// justification, score — est rafraîchissable, et c'est le jeu de départ qui fait autorité.
//
// C'est la règle la plus facile à casser sans s'en apercevoir : un `{ ...ancien, ...neuf }`
// écrit dans le mauvais sens suffit, et la perte est SILENCIEUSE — on ne remarque pas
// qu'un statut est retombé à « Identifiée » avant d'en avoir besoin.
//
// Fonctions pures : aucune I/O, aucune horloge.

import {
  CHAMPS_UTILISATEUR,
  STATUTS_ENVOYES,
  STATUTS_REPONDUS,
  type Offre,
  type ResumeSuivi,
} from "./types";

/**
 * Fusionne le jeu de départ avec ce qui est déjà suivi.
 *
 * - Une offre du jeu de départ déjà connue : ses champs de suivi sont CONSERVÉS, le reste
 *   est rafraîchi depuis le jeu de départ.
 * - Une offre du jeu de départ inconnue : ajoutée telle quelle.
 * - Une offre existante ABSENTE du jeu de départ (ajout manuel, ingestion) : conservée
 *   intacte. Elle n'a pas d'équivalent à rafraîchir, et la supprimer effacerait du travail.
 *
 * L'ordre de sortie est stable : le jeu de départ dans son ordre, puis les autres dans le
 * leur. Un ordre instable ferait « bouger » la liste à chaque rafraîchissement.
 */
export function fusionner(seed: readonly Offre[], existantes: readonly Offre[]): Offre[] {
  const parId = new Map(existantes.map((o) => [o.id, o]));
  const idsSeed = new Set(seed.map((o) => o.id));

  const rafraichies = seed.map((neuve) => {
    const ancienne = parId.get(neuve.id);
    if (!ancienne) return { ...neuve };

    // On part du NEUF (le jeu de départ fait autorité) puis on RÉIMPOSE le suivi.
    // L'ordre compte : l'inverse écraserait le suivi en silence.
    const fusionnee: Offre = { ...neuve };
    for (const champ of CHAMPS_UTILISATEUR) {
      // @ts-expect-error — affectation champ à champ sur une union de types littéraux ;
      // la sûreté vient de CHAMPS_UTILISATEUR, dont les clés sont vérifiées à la compilation.
      fusionnee[champ] = ancienne[champ];
    }
    return fusionnee;
  });

  const horsSeed = existantes.filter((o) => !idsSeed.has(o.id));
  return [...rafraichies, ...horsSeed];
}

/**
 * Applique une modification venue de l'utilisateur.
 * Seuls les champs qui lui appartiennent peuvent bouger — un appelant qui tenterait de
 * modifier un score ou une justification par ce chemin n'a aucun effet.
 */
export function appliquerModification(
  offre: Offre,
  patch: Partial<Pick<Offre, (typeof CHAMPS_UTILISATEUR)[number]>>,
): Offre {
  const suivant: Offre = { ...offre };
  for (const champ of CHAMPS_UTILISATEUR) {
    const valeur = patch[champ];
    // @ts-expect-error — même raison que dans `fusionner`.
    if (valeur !== undefined) suivant[champ] = valeur;
  }
  return suivant;
}

/**
 * Date d'envoi posée automatiquement au passage à « CV envoyé ».
 * La date est PASSÉE en paramètre et non lue de l'horloge : une fonction qui lit l'heure
 * n'est pas testable de façon déterministe.
 */
export function marquerEnvoi(offre: Offre, aujourdhui: string): Offre {
  if (offre.statut !== "CVenvoye" || offre.dateEnvoi !== "") return offre;
  return { ...offre, dateEnvoi: aujourdhui };
}

/**
 * Ce dont le résumé a RÉELLEMENT besoin.
 *
 * Typer l'entrée sur ces cinq champs plutôt que sur `Offre` entière permet de résumer
 * aussi bien des offres applicatives que des lignes de base, sans conversion artificielle
 * — et documente au passage que le résumé ne lit ni les justifications ni les notes.
 */
export type OffrePourResume = Pick<
  Offre,
  "histo" | "score" | "statut" | "entreprise" | "poste" | "perimeeLe" | "dateReperage"
>;

/**
 * Sur combien de jours une offre reste « nouvelle ».
 *
 * Sept, comme `FENETRE_DEPOT_JOURS` : c'est exactement la durée pendant laquelle la passe
 * continue de RELIRE un dépôt. Aligner les deux n'est pas cosmétique — une offre cesse
 * d'être relue et cesse d'être annoncée « nouvelle » au même moment, donc le widget ne peut
 * pas vanter une nouveauté que le moteur a déjà cessé d'observer.
 */
export const FENETRE_NOUVELLES_JOURS = 7;

/**
 * Le résumé du suivi. C'est lui qui alimente le widget du hub.
 *
 * Une offre PÉRIMÉE ne compte plus parmi les actives, et ne peut plus être « la meilleure ».
 * C'est le garde-fou « no fake data » appliqué au temps : une offre fermée présentée comme
 * une opportunité est un chiffre faux, même s'il a été vrai. Le widget dirait « 92 chez IEL »
 * alors que le poste est pourvu depuis un mois.
 *
 * Elles restent dans `total` : elles ont existé, et le suivi n'efface rien.
 */
export function resumer(
  offres: readonly OffrePourResume[],
  aujourdhui: string,
): ResumeSuivi {
  const actives = offres.filter((o) => !o.histo && o.perimeeLe === null);

  // ⚠️ `aujourdhui` est un PARAMÈTRE, pas un `new Date()` caché : c'est la seule façon de
  // tester le passage de minuit, et la date se calcule dans le fuseau de Marc chez
  // l'appelant (leçon §9 — Vercel tourne en UTC, lui vit à UTC−4).
  const limite = Date.parse(`${aujourdhui}T00:00:00Z`);
  const plancher = Number.isFinite(limite)
    ? limite - FENETRE_NOUVELLES_JOURS * 86_400_000
    : NaN;
  const nouvelles = actives.filter((o) => {
    const t = Date.parse(`${o.dateReperage}T00:00:00Z`);
    // Une date illisible n'est pas une nouveauté : dans le doute, on ne compte pas.
    return Number.isFinite(t) && Number.isFinite(plancher) && t > plancher && t <= limite;
  });
  const nouvellesNotees = nouvelles.filter(
    (o): o is OffrePourResume & { score: number } => o.score !== null,
  );

  // La meilleure offre se cherche parmi les ACTIVES : une candidature de 2025 n'est pas
  // une cible, et la remonter en tête du widget serait trompeur.
  const notees = actives.filter(
    (o): o is OffrePourResume & { score: number } => o.score !== null,
  );
  const meilleure = notees.reduce<(OffrePourResume & { score: number }) | null>(
    (best, o) => (best === null || o.score > best.score ? o : best),
    null,
  );

  return {
    total: offres.length,
    actives: actives.length,
    nouvelles: nouvelles.length,
    noteMoyenneNouvelles:
      nouvellesNotees.length === 0
        ? null
        : Math.round(
            nouvellesNotees.reduce((s, o) => s + o.score, 0) / nouvellesNotees.length,
          ),
    notees80Plus: notees.filter((o) => o.score >= 80).length,
    // Les compteurs de candidature portent sur TOUT le suivi, historique inclus : ce sont
    // des faits accomplis, pas des cibles.
    cvEnvoyes: offres.filter((o) => STATUTS_ENVOYES.includes(o.statut)).length,
    reponses: offres.filter((o) => STATUTS_REPONDUS.includes(o.statut)).length,
    entrevues: offres.filter((o) => o.statut === "Entrevue" || o.statut === "Offre").length,
    meilleure: meilleure
      ? { entreprise: meilleure.entreprise, poste: meilleure.poste, score: meilleure.score }
      : null,
  };
}
