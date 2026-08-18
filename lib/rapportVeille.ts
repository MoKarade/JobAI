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
  sources: { id: string; ok: boolean; offres: number; erreur?: string }[];
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
    lieux: entree.lieux,
    localisation: entree.localisation,
    villesCompletees: entree.villesCompletees,
    adressesAnnoncees: entree.adressesAnnoncees,
  };
}

/** Libellé lisible d'un motif de refus. Une seule table, lue par l'écran ET par les tests. */
export const LIBELLE_MOTIF: Record<MotifRefus, string> = {
  "hors-region": "hors région",
  "lieu-inconnu": "lieu inconnu",
  "sous-le-plancher": "sous le plancher",
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
