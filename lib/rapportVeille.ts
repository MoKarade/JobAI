// lib/rapportVeille.ts — ce qu'une passe de veille a fait, sous une forme lisible.
//
// POURQUOI CE FICHIER EXISTE
// Le compte rendu vivait en DEUX exemplaires, et aucun n'était complet. Le premier était une
// ligne de `console.log` que seuls les journaux Vercel montrent ; le second, une phrase
// assemblée à la main dans le composant du bouton — donc absente dès que la passe était
// lancée par le planificateur, c'est-à-dire la plupart du temps. Marc voyait un rapport
// quand il cliquait, rien quand la veille tournait toute seule, et les deux ne disaient pas
// la même chose.
//
// Ici : UNE structure, construite par UNE fonction pure, écrite à chaque passe quel que soit
// le déclencheur, relue par l'écran. Le bouton et le planificateur produisent désormais le
// même rapport — parce que c'est littéralement le même code.
//
// CE QU'IL NE FAIT PAS
// Il ne recalcule rien. Chaque nombre vient de la passe qui vient d'avoir lieu ; cette
// fonction les met en forme et les VÉRIFIE l'un par l'autre (voir `sansMotif`). Un rapport
// qui recalculerait ses propres chiffres pourrait être en accord avec lui-même et en
// désaccord avec ce qui s'est réellement écrit en base.

import type { MotifRefus, Tri } from "./ingest/pipeline";
import { villesRefusees } from "./ingest/pipeline";
// L'id de la source, importé et jamais recopié : le rapport doit RECONNAÎTRE le dépôt parmi
// les autres pour en dire la fraîcheur, et deux exemplaires d'une chaîne finissent par
// diverger — la fraîcheur deviendrait muette sans qu'aucune erreur ne le signale.
import { ID_SOURCE_DEPOT } from "./ingest/types";
import type { Offre } from "./types";

/** Clé sous laquelle le dernier rapport est conservé, pour l'écran. */
export const CLE_RAPPORT = "veille-rapport";

/** Un refus, groupé : son motif, son compte, et les villes qui l'ont provoqué. */
export interface RefusGroupe {
  motif: MotifRefus;
  n: number;
  /** Vide pour les motifs qui ne portent pas sur le lieu (plancher, doublon). */
  villes: { ville: string; n: number }[];
}

export interface RapportVeille {
  /** Jour du balayage, dans le fuseau de Marc. */
  jour: string;
  /** Instant de fin, ISO. Sert à dire « il y a deux heures » à l'écran. */
  fini: string;
  /** Qui a lancé la passe. `bouton-app`, `cron-veille`, `cron-geocodage`… */
  declencheur: string;

  /** Offres rendues par les sources, avant tout tri. */
  trouvees: number;
  /** Entrées dans le suivi à cette passe. */
  nouvelles: number;
  /** Note moyenne des offres entrées à cette passe. `null` s'il n'y en a aucune. */
  noteMoyenneNouvelles: number | null;
  /** Note moyenne de TOUT le suivi actif — la santé de la liste, pas de la passe. */
  noteMoyenneSuivi: number | null;
  /** La meilleure des offres entrées à cette passe. `null` s'il n'y en a aucune. */
  meilleure: { entreprise: string; poste: string; score: number } | null;

  /** Ce qui a été écarté, par motif, du plus fréquent au moins fréquent. */
  refusees: RefusGroupe[];
  /**
   * Trouvées moins tout ce qu'on sait expliquer.
   *
   * ⚠️ CE NOMBRE DOIT ÊTRE ZÉRO, ET C'EST TOUT SON INTÉRÊT. Le 17 août, le compte rendu
   * affichait « 100 trouvées · 0 nouvelle · 26 déjà connues » : soixante-quatorze offres
   * s'évaporaient sans motif. Elles étaient hors région — le tri travaillait très bien,
   * c'est le rapport qui mentait par omission. Un total dont les parties ne font pas la
   * somme se lit comme une panne. On l'expose donc, plutôt que d'attendre qu'il se voie.
   */
  sansMotif: number;

  perimees: number;
  revenues: number;
  enSursis: number;
  /** Offres actives dans le suivi APRÈS la passe. */
  suivies: number;

  /** Une ligne par source interrogée : « 0 au total » ne dit pas laquelle s'est tue. */
  sources: {
    id: string;
    ok: boolean;
    offres: number;
    erreur?: string;
    dernierJour?: string;
    /**
     * Ce que la source a REFUSÉ, en une ligne (`ResultatSource.note`).
     *
     * ⚠️ SANS ELLE, UNE SOURCE QUI FILTRE BEAUCOUP EST INDISCERNABLE D'UNE SOURCE MUETTE.
     * Le flux complet du Guichet voit des dizaines de milliers d'offres et n'en rapporte
     * qu'une poignée : « 0 offre » peut vouloir dire « rien de neuf dans la région » ou
     * « la liste de métiers retenus ne correspond à rien ». Deux corrections opposées,
     * qu'aucun compte seul ne sépare.
     */
    note?: string;
  }[];
  /**
   * Fraîcheur du dépôt — le SEUL canal vivant depuis le retrait des pages carrières.
   *
   * ⚠️ C'EST LE SEUL CHIFFRE QUI DISTINGUE « RIEN DE NEUF » DE « PLUS RIEN N'ARRIVE ».
   * Le dépôt lit une fenêtre de sept jours : le jour où aucun lot n'est déposé, il rend
   * quand même ceux de la veille, tout est compté « déjà connue », et le rapport affiche
   * « 0 nouvelle » — mot pour mot ce qu'il afficherait un jour sans embauche. Les deux
   * situations appellent des gestes opposés : attendre, ou aller réparer la chaîne qui
   * dépose. Ce projet a déjà payé ce silence — le cron de la veille a cessé d'être appelé
   * pendant trois jours sans qu'un voyant ne change, pendant que la péremption éteignait
   * les offres une à une.
   *
   * `retardJours` vaut 0 quand un lot du jour a bien été déposé, `null` quand le dépôt n'a
   * rien rendu du tout (fenêtre vide, ou source en échec) — deux aveux différents, jamais
   * un zéro qui aurait l'air d'une mesure.
   */
  depot: { dernierJour: string | null; retardJours: number | null };
  /** Lieux inconnus soumis au géocodeur pendant cette passe. */
  lieux: { demandes: number; juges: number; introuvables: number };
  /** Ce que la passe de localisation a fait, en clair. */
  localisation: string;
  /** Villes rattrapées sur des offres déjà suivies. */
  villesCompletees: number;
  /** Adresses reprises du texte des annonces. */
  adressesAnnoncees: number;
}

/**
 * Moyenne arrondie à l'unité des notes CONNUES, ou `null` si aucune ne l'est.
 *
 * ⚠️ UNE NOTE ABSENTE EST EXCLUE, JAMAIS COMPTÉE ZÉRO. `Offre.score` est nullable : une
 * offre saisie à la main peut n'avoir jamais été notée. La traiter comme un zéro ferait
 * chuter la moyenne d'un stock en bonne santé, et le chiffre affiché décrirait alors la
 * complétude de la saisie plutôt que la qualité des offres. Et `null` sur un ensemble sans
 * aucune note connue, plutôt qu'un 0 qui aurait l'air d'une mesure.
 */
function moyenne(notes: readonly (number | null)[]): number | null {
  const connues = notes.filter((n): n is number => typeof n === "number");
  if (connues.length === 0) return null;
  return Math.round(connues.reduce((t, n) => t + n, 0) / connues.length);
}

/** Écart en jours entre deux dates AAAA-MM-JJ, ou `null` si l'une est illisible. */
function ecartJours(de: string, a: string): number | null {
  const t1 = Date.parse(`${de}T00:00:00Z`);
  const t2 = Date.parse(`${a}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  // Jamais négatif : un lot daté de demain signale une horloge fausse, pas de l'avance.
  return Math.max(0, Math.round((t1 - t2) / 86_400_000));
}

/**
 * Assemble le rapport d'une passe.
 *
 * PURE — c'est ce qui permet de le tester sans base ni réseau, et surtout de garantir que le
 * bouton et le planificateur en produisent le MÊME. Tous les nombres arrivent en paramètre :
 * la fonction ne va rien chercher, elle ne peut donc pas être en désaccord avec ce qui vient
 * de s'écrire.
 */
export function construireRapport(entree: {
  jour: string;
  fini: string;
  declencheur: string;
  trouvees: number;
  tri: Omit<Tri, "retenues">;
  nouvelles: readonly string[];
  perimees: readonly string[];
  revenues: readonly string[];
  enSursis: number;
  /** Le suivi APRÈS la passe — sert aux notes moyennes et au compte d'offres actives. */
  offres: readonly Offre[];
  sources: RapportVeille["sources"];
  lieux: RapportVeille["lieux"];
  localisation: string;
  villesCompletees: number;
  adressesAnnoncees: number;
}): RapportVeille {
  const idsNouvelles = new Set(entree.nouvelles);
  const entrees = entree.offres.filter((o) => idsNouvelles.has(o.id));

  // Le suivi ACTIF : ni les traces de 2025, ni ce qu'un balayage a déclaré fermé. Une note
  // moyenne qui inclurait les périmées décrirait un stock que Marc ne regarde plus.
  const actives = entree.offres.filter((o) => !o.histo && o.perimeeLe === null);

  const motifs: MotifRefus[] = ["hors-region", "lieu-inconnu", "sous-le-plancher", "doublon"];
  const refusees: RefusGroupe[] = motifs
    .map((motif) => ({
      motif,
      n: entree.tri.refusees.filter((r) => r.motif === motif).length,
      // Les villes ne sont nommées que pour les motifs qui se DÉCIDENT sur le lieu : les
      // afficher sous « sous le plancher » laisserait croire que la ville y est pour
      // quelque chose, alors que c'est le titre qui a tranché.
      villes:
        motif === "hors-region" || motif === "lieu-inconnu"
          ? villesRefusees(entree.tri.refusees, motif)
          : [],
    }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);

  const explique = entree.nouvelles.length + refusees.reduce((t, r) => t + r.n, 0);

  // Même règle que la moyenne : une offre sans note ne peut pas être « la meilleure ».
  const meilleure = entrees.reduce<RapportVeille["meilleure"]>((best, o) => {
    if (o.score === null) return best;
    if (best !== null && best.score >= o.score) return best;
    return { entreprise: o.entreprise, poste: o.poste, score: o.score };
  }, null);

  return {
    jour: entree.jour,
    fini: entree.fini,
    declencheur: entree.declencheur,
    trouvees: entree.trouvees,
    nouvelles: entree.nouvelles.length,
    noteMoyenneNouvelles: moyenne(entrees.map((o) => o.score)),
    noteMoyenneSuivi: moyenne(actives.map((o) => o.score)),
    meilleure,
    refusees,
    sansMotif: entree.trouvees - explique,
    perimees: entree.perimees.length,
    revenues: entree.revenues.length,
    enSursis: entree.enSursis,
    suivies: actives.length,
    sources: entree.sources,
    // Dérivé de ce que la source a RÉELLEMENT lu, jamais d'un paramètre séparé : un second
    // canal pour la même information finirait par dire autre chose que la passe elle-même.
    depot: (() => {
      const d = entree.sources.find((s) => s.id === ID_SOURCE_DEPOT);
      const dernierJour = d?.ok === true ? (d.dernierJour ?? null) : null;
      return {
        dernierJour,
        retardJours: dernierJour === null ? null : ecartJours(entree.jour, dernierJour),
      };
    })(),
    lieux: entree.lieux,
    localisation: entree.localisation,
    villesCompletees: entree.villesCompletees,
    adressesAnnoncees: entree.adressesAnnoncees,
  };
}

/**
 * Au-delà de ce retard, le dépôt n'est plus « en avance d'un jour » : il est rompu.
 *
 * Deux jours, pas un : la Routine peut manquer un matin sans que la chaîne soit cassée, et
 * crier au premier jour manquant apprendrait à ignorer le voyant — c'est exactement ainsi
 * que la CI de ce dépôt a été ignorée quatre commits d'affilée. Deux jours consécutifs sans
 * lot, en revanche, n'arrive pas par hasard.
 */
export const RETARD_DEPOT_ALERTE_JOURS = 2;

export interface FraicheurDepot {
  etat: "frais" | "vieillissant" | "rompu";
  texte: string;
}

/**
 * Ce que la fraîcheur du dépôt autorise à DIRE. PURE.
 *
 * ⚠️ ELLE EXISTE POUR QUALIFIER LE « 0 NOUVELLE », PAS POUR DÉCORER. Tant que le dépôt est
 * frais, « 0 nouvelle » est une information sur le marché : il n'y a rien eu aujourd'hui.
 * Dès qu'il rouille, le même « 0 » ne dit plus rien du tout — il dit que personne n'a
 * regardé. Les deux se ressemblent à l'écran et appellent des gestes opposés : attendre, ou
 * aller réparer la chaîne qui dépose. C'est précisément le silence que ce projet a déjà payé
 * — un cron muet trois jours durant, pendant que la péremption éteignait les offres une à une.
 */
export function fraicheurDepot(depot: RapportVeille["depot"]): FraicheurDepot {
  if (depot.retardJours === null) {
    return {
      etat: "rompu",
      texte:
        "Aucun lot de dépôt n’a été lu à cette passe. Le seul canal qui apporte des offres n’a rien rendu : tant que ça dure, « 0 nouvelle » ne dit rien du marché.",
    };
  }
  if (depot.retardJours === 0) {
    return { etat: "frais", texte: "Le lot du jour a bien été déposé." };
  }
  if (depot.retardJours < RETARD_DEPOT_ALERTE_JOURS) {
    return {
      etat: "vieillissant",
      texte: `Aucun lot déposé aujourd’hui — le dernier date d’hier (${depot.dernierJour}).`,
    };
  }
  return {
    etat: "rompu",
    texte: `Aucun lot déposé depuis ${depot.retardJours} jours — le dernier date du ${depot.dernierJour}. Tant que ça dure, « 0 nouvelle » ne dit rien du marché : la chaîne qui dépose est à vérifier.`,
  };
}

/** Libellé lisible d'un motif de refus. Une seule table, lue par l'écran ET par les tests. */
export const LIBELLE_MOTIF: Record<MotifRefus, string> = {
  "hors-region": "hors région",
  "lieu-inconnu": "lieu inconnu",
  // ⚠️ Le plancher ne juge plus QUE les offres sans code de profession (2026-08-20) : le
  // dire évite de lire « 1 204 sous le plancher » comme un refus du flux du Guichet.
  "sous-le-plancher": "hors sujet (sources sans code de métier)",
  doublon: "déjà connue",
};

/**
 * « il y a 2 h », « il y a 3 min ». `null` si l'instant est illisible.
 *
 * PURE : l'instant de référence est un paramètre. Sans ça, la fonction lirait l'horloge et
 * le rendu serveur ne pourrait pas être testé — ni comparé au rendu client, qui s'en écarte
 * d'une seconde et déclencherait une erreur d'hydratation à chaque affichage.
 */
export function depuis(iso: string, maintenant: number): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((maintenant - t) / 60_000));
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? "s" : ""}`;
}
