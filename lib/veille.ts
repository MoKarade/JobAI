// lib/veille.ts — décider ce qu'un balayage quotidien change au suivi.
//
// Le balayage lui-même (interroger une source d'offres) ne vit PAS ici : il est fait par
// une session de travail, avec le connecteur Indeed, et ne tourne jamais dans l'app
// déployée (garde-fou n°4). Ce fichier ne contient que la DÉCISION, pure et testable :
// qu'est-ce qui est nouveau, qu'est-ce qui a disparu, et à partir de quand une
// disparition vaut une péremption.
//
// LE PIÈGE CENTRAL — « absente d'un balayage » ne veut PAS dire « fermée »
// Une offre peut manquer à une passe pour des raisons qui n'ont rien à voir avec sa
// fermeture : le classement de la source, un mot-clé qui ne matche pas ce jour-là, une
// requête qui a rendu dix résultats au lieu de douze. Périmer à la première absence
// remplirait le suivi d'offres ouvertes marquées mortes — l'inverse exact du service
// rendu, et un mensonge que Marc ne peut pas détecter sans rouvrir chaque lien.
// D'où le SEUIL d'absences consécutives, et la RÉSURRECTION automatique : une offre
// revue redevient active, parce qu'un faux positif ne doit jamais être définitif.
//
// CE QUE LA VEILLE NE TOUCHE JAMAIS
//   - les champs de Marc (garde-fou n°2) : elle n'écrit que `perimeeLe` ;
//   - les offres qu'elle n'a jamais vues. Les 23 offres relevées à la main ne viennent pas
//     d'un balayage : leur absence d'une requête Indeed ne prouve rien du tout, et les
//     périmer sur ce silence détruirait le travail le plus fiable du jeu.

import type { Offre } from "./types";

/**
 * Nombre de balayages consécutifs SANS voir une offre avant de la déclarer périmée.
 *
 * Trois, et non un : une absence isolée est du bruit de source (voir l'en-tête). Trois
 * jours de silence consécutifs sur une offre que la même requête voyait la veille, c'est
 * un signal. Le compte est visible dans le journal, donc contestable.
 */
export const SEUIL_ABSENCES_PEREMPTION = 3;

/** Ce que la veille retient d'une offre, entre deux passages. */
export interface SuiviVeille {
  /** Premier balayage qui l'a vue (AAAA-MM-JJ). */
  premiereVue: string;
  /** Dernier balayage qui l'a vue (AAAA-MM-JJ). */
  derniereVue: string;
  /** Balayages consécutifs sans la voir depuis. Remis à zéro dès qu'elle réapparaît. */
  absences: number;
}

/** L'état de la veille, par identifiant d'offre. Sérialisé en JSON entre deux passages. */
export type JournalVeille = Record<string, SuiviVeille>;

export interface ResultatBalayage {
  /** Les offres après application du balayage : ajouts, péremptions, résurrections. */
  offres: Offre[];
  journal: JournalVeille;
  /** Identifiants entrés dans le suivi à ce balayage. */
  nouvelles: string[];
  /** Identifiants passés en périmé à ce balayage (et non ceux qui l'étaient déjà). */
  perimees: string[];
  /** Identifiants qui étaient périmés et que ce balayage a revus : ils redeviennent actifs. */
  revenues: string[];
  /** Suivies par la veille, absentes de ce balayage, pas encore périmées. */
  enSursis: { id: string; absences: number }[];
}

/** Une offre historique est une trace de 2025 : aucun balayage ne la concerne. */
function estSousVeille(o: Offre): boolean {
  return !o.histo;
}

/**
 * Applique un balayage au suivi.
 *
 * `aujourdhui` est un PARAMÈTRE (AAAA-MM-JJ, dans le fuseau de Marc) : la fonction ne lit
 * jamais l'horloge, sans quoi le passage de minuit serait intestable et Vercel — qui
 * tourne en UTC — daterait du lendemain tout ce qui est produit après 20 h locale.
 *
 * @param connues     Le suivi actuel, offres historiques comprises.
 * @param vues        Ce que le balayage a réellement trouvé, converti au format d'offre.
 * @param journal     L'état de la veille au passage précédent.
 * @param aujourdhui  La date du balayage, AAAA-MM-JJ.
 */
export function appliquerBalayage(
  connues: readonly Offre[],
  vues: readonly Offre[],
  journal: JournalVeille,
  aujourdhui: string,
): ResultatBalayage {
  const idsVues = new Set(vues.map((o) => o.id));
  const parId = new Map(connues.map((o) => [o.id, o]));

  const suivant: JournalVeille = {};
  const nouvelles: string[] = [];
  const perimees: string[] = [];
  const revenues: string[] = [];
  const enSursis: { id: string; absences: number }[] = [];

  // 1) Ce que le balayage a vu : le journal l'enregistre, et une offre périmée revient.
  for (const vue of vues) {
    const precedent = journal[vue.id];
    suivant[vue.id] = {
      premiereVue: precedent?.premiereVue ?? aujourdhui,
      derniereVue: aujourdhui,
      absences: 0,
    };
    if (!precedent && !parId.has(vue.id)) nouvelles.push(vue.id);
  }

  // 2) Les offres déjà suivies PAR LA VEILLE et absentes de ce balayage.
  //    Une offre jamais vue par la veille n'entre pas ici : son absence ne prouve rien.
  for (const [id, precedent] of Object.entries(journal)) {
    if (idsVues.has(id)) continue;
    const absences = precedent.absences + 1;
    suivant[id] = { ...precedent, absences };
    const offre = parId.get(id);
    // Une offre disparue du suivi (supprimée à la main) n'a plus à être comptée.
    if (!offre) continue;
    if (absences < SEUIL_ABSENCES_PEREMPTION) {
      enSursis.push({ id, absences });
    }
  }

  // 3) Application aux offres : péremption, résurrection, ajouts.
  const offres: Offre[] = connues.map((o) => {
    if (!estSousVeille(o)) return o;

    const etat = suivant[o.id];
    if (!etat) return o; // hors veille : intouchée

    if (idsVues.has(o.id)) {
      // Revue aujourd'hui. Si elle était périmée, c'est que la péremption était fausse —
      // ou que l'employeur a republié. Dans les deux cas elle est ouverte : on la rouvre.
      if (o.perimeeLe !== null) {
        revenues.push(o.id);
        return { ...o, perimeeLe: null };
      }
      return o;
    }

    if (o.perimeeLe === null && etat.absences >= SEUIL_ABSENCES_PEREMPTION) {
      perimees.push(o.id);
      // Date du CONSTAT, pas de la fermeture : on ne sait pas quand l'offre a fermé, on
      // sait quand on a cessé de la voir. `perimeeLe` est un instant ISO (schéma).
      return { ...o, perimeeLe: `${aujourdhui}T00:00:00.000Z` };
    }

    return o;
  });

  // 4) Les offres réellement nouvelles s'ajoutent à la fin, dans l'ordre du balayage.
  for (const vue of vues) {
    if (!parId.has(vue.id)) offres.push(vue);
  }

  return { offres, journal: suivant, nouvelles, perimees, revenues, enSursis };
}

/**
 * Résume un balayage en une ligne lisible, pour le message de commit et le HANDOVER.
 *
 * Un traitement automatique qui ne rend pas compte de ce qu'il a fait devient un
 * traitement qu'on ne relit plus — et le jour où il se trompe, personne ne le voit.
 */
export function resumerBalayage(r: ResultatBalayage): string {
  const bouts: string[] = [];
  bouts.push(`${r.nouvelles.length} nouvelle${r.nouvelles.length > 1 ? "s" : ""}`);
  if (r.perimees.length > 0) {
    bouts.push(`${r.perimees.length} périmée${r.perimees.length > 1 ? "s" : ""}`);
  }
  if (r.revenues.length > 0) {
    bouts.push(`${r.revenues.length} revenue${r.revenues.length > 1 ? "s" : ""}`);
  }
  if (r.enSursis.length > 0) {
    bouts.push(`${r.enSursis.length} en sursis`);
  }
  return bouts.join(", ");
}
