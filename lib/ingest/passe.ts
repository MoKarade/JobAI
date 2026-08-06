// lib/ingest/passe.ts — la passe quotidienne, de bout en bout.
//
// Enchaîne : interroger les sources → trier (dédoublonner, noter, filtrer) → écrire les
// nouvelles offres → appliquer la péremption. C'est ce que le cron appelle chaque jour.
//
// CE QUI EST BORNÉ, ET POURQUOI
// Une fonction serverless a une durée de vie courte. La passe interroge donc un nombre
// PLAFONNÉ de sources par exécution, et reprend où elle s'est arrêtée le lendemain. Mieux
// vaut une passe complète tous les deux jours qu'une passe tuée en plein milieu, qui
// n'écrirait rien et recommencerait à l'identique le lendemain.
//
// LA PÉREMPTION RÉUTILISE `lib/veille.ts`
// Aucune règle de péremption n'est réécrite ici : seuil de trois absences, résurrection,
// et protection des offres jamais vues par un balayage. Une seconde implémentation
// divergerait, et c'est le jeu de données qui en paierait le prix.

import { appliquerBalayage, resumerBalayage, type JournalVeille } from "../veille";
import type { Offre } from "../types";
import { idOffre, trier, villesACompleter, type Tri, type VilleACompleter } from "./pipeline";
import { RECHERCHES_GUICHET, sourceAts, sourceGuichet } from "./sources";
import { sourceDepotFichier } from "./depotFichier";
import type { AtsEntreprise, OffreBrute, Recuperateur, ResultatSource, Source } from "./types";

/** Sources interrogées par exécution. Au-delà, on dépasse la durée d'une fonction. */
export const MAX_SOURCES_PAR_PASSE = 14;

/** Le compte rendu d'une passe. Tout y est dit, y compris ce qui a échoué. */
export interface RapportPasse {
  /** Ce que chaque source a rendu, succès comme échec. */
  sources: { id: string; ok: boolean; offres: number; erreur?: string }[];
  trouvees: number;
  tri: Omit<Tri, "retenues">;
  nouvelles: string[];
  perimees: string[];
  revenues: string[];
  enSursis: number;
  /**
   * Villes manquantes que cette passe permet de rattraper sur des offres DÉJÀ suivies.
   *
   * Une offre connue est comptée « doublon » et le tri n'en fait plus rien — juste tant
   * que la source n'apporte rien de neuf. Mais une offre entrée avant que la ville soit
   * écrite n'est pas géocodable, donc reste sans distance et hors de la carte : la source
   * qui la republie porte pourtant l'information. Le point de dépôt faisait déjà ce
   * rattrapage ; ne pas le faire ici laissait la veille quotidienne aveugle au même
   * manque, pour la seule raison qu'on l'avait codé ailleurs.
   */
  villesACompleter: VilleACompleter[];
  /** Le suivi après la passe, prêt à écrire. */
  offres: Offre[];
  journal: JournalVeille;
  resume: string;
}

/**
 * Les sources d'une exécution.
 *
 * `depart` fait tourner la sélection d'un jour à l'autre : sans lui, les mêmes sources
 * seraient interrogées chaque jour et les dernières de la liste ne le seraient JAMAIS.
 */
export function selectionnerSources(
  ats: readonly AtsEntreprise[],
  depart: number,
  aujourdhui: string,
): Source[] {
  // ⚠️ LE DÉPÔT DE FICHIERS EST HORS ROTATION, ET C'EST TOUT L'INTÉRÊT. La rotation existe
  // pour ne pas dépasser la durée d'une fonction en interrogeant douze sources RÉSEAU. Le
  // dépôt ne fait aucune requête : il lit un fichier du projet. Le mettre dans la rotation
  // le ferait sauter certains jours — donc les offres qu'il porte ne seraient pas « revues »
  // ce jour-là, et la péremption les ferait disparaître alors qu'elles sont bien là.
  const depot = sourceDepotFichier(aujourdhui);

  const reseau = [
    ...RECHERCHES_GUICHET.map((r) => sourceGuichet(r)),
    ...ats.map((a) => sourceAts(a)),
  ];
  if (reseau.length <= MAX_SOURCES_PAR_PASSE) return [depot, ...reseau];

  const debut = ((depart % reseau.length) + reseau.length) % reseau.length;
  const choisies: typeof reseau = [];
  for (let i = 0; i < MAX_SOURCES_PAR_PASSE; i++) {
    choisies.push(reseau[(debut + i) % reseau.length]!);
  }
  return [depot, ...choisies];
}

/**
 * Exécute une passe complète.
 *
 * @param connues     Le suivi actuel.
 * @param journal     L'état de la veille au passage précédent.
 * @param ats         Les pages carrières connues.
 * @param depart      Curseur de rotation des sources.
 * @param aujourdhui  Date du balayage (AAAA-MM-JJ). Paramètre, jamais l'horloge.
 * @param rec         L'accès réseau, injecté.
 */
export async function executerPasse(
  connues: readonly Offre[],
  journal: JournalVeille,
  ats: readonly AtsEntreprise[],
  depart: number,
  aujourdhui: string,
  rec: Recuperateur,
): Promise<RapportPasse> {
  const sources = selectionnerSources(ats, depart, aujourdhui);

  // En parallèle : les sources sont indépendantes, et les enchaîner ferait dépasser la
  // durée de la fonction bien avant d'avoir tout interrogé.
  const resultats: ResultatSource[] = await Promise.all(
    sources.map((s) => s.interroger(rec as Recuperateur)),
  );

  const brutes: OffreBrute[] = [];
  const compte: RapportPasse["sources"] = [];
  for (const r of resultats) {
    if (r.ok) {
      brutes.push(...r.offres);
      compte.push({ id: r.source, ok: true, offres: r.offres.length });
    } else {
      compte.push({ id: r.source, ok: false, offres: 0, erreur: r.erreur });
    }
  }

  const dejaSuivies = new Set(connues.map((o) => o.id));
  const tri = trier(brutes, dejaSuivies, aujourdhui);

  // Ce que le balayage a VU : les nouvelles retenues, et les offres déjà suivies qu'une
  // source vient de re-publier. Les secondes sont le signal qui remet leur compteur
  // d'absences à zéro — sans elles, une offre bien vivante se périmerait en trois jours.
  //
  // L'identifiant se calcule DIRECTEMENT, sans repasser par le filtre : une offre que Marc
  // suit peut porter un titre qui note sous le plancher (le plancher juge une offre
  // INCONNUE, pas une offre qu'il a déjà jugée digne d'intérêt). La faire passer par
  // `trier` l'écarterait, elle ne serait jamais marquée vue, et elle se périmerait au
  // troisième jour alors qu'elle est publiée sous nos yeux.
  const idsVus = new Set(tri.retenues.map((o) => o.id));
  for (const b of brutes) {
    const id = idOffre(b.entreprise.trim() || "Employeur non nommé", b.titre);
    if (dejaSuivies.has(id)) idsVus.add(id);
  }

  const apresAjout = [...connues, ...tri.retenues];
  const vues = apresAjout.filter((o) => idsVus.has(o.id));
  const balayage = appliquerBalayage(apresAjout, vues, journal, aujourdhui);

  return {
    sources: compte,
    trouvees: brutes.length,
    tri: {
      souslePlancher: tri.souslePlancher,
      doublons: tri.doublons,
      horsRegion: tri.horsRegion,
      lieuInconnu: tri.lieuInconnu,
      refusees: tri.refusees,
    },
    nouvelles: tri.retenues.map((o) => o.id),
    villesACompleter: villesACompleter(brutes, connues),
    perimees: balayage.perimees,
    revenues: balayage.revenues,
    enSursis: balayage.enSursis.length,
    offres: balayage.offres,
    journal: balayage.journal,
    resume: `${tri.retenues.length} nouvelle${tri.retenues.length > 1 ? "s" : ""}, ${resumerBalayage(balayage)}`,
  };
}
