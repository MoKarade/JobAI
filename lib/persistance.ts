// lib/persistance.ts — une offre, une seule façon de l'écrire.
//
// POURQUOI CE FICHIER EXISTE
// La liste des colonnes de `offers` était recopiée à QUATRE endroits : le cron de veille,
// le point de dépôt, l'ajout manuel et la synchronisation du jeu de départ. Le jour où une
// colonne s'est ajoutée (`ville`, le 2026-07-31), elle a été oubliée dans les quatre — et
// rien ne l'a signalé : le type `Offre` la porte, la lecture la lit, l'insertion la perd.
// Résultat mesuré : 40 offres déposées avec `ville = NULL`, donc jamais géocodables, donc
// sans distance ni position sur la carte. Le critère numéro un de Marc, perdu en silence.
//
// La correction n'est pas « ajouter `ville` aux quatre endroits » — ce serait remettre la
// même bombe à retardement en place pour la prochaine colonne. C'est de n'avoir qu'UNE
// copie, et de la verrouiller par un test qui DÉRIVE la liste attendue du schéma plutôt
// que de la réécrire (`tests/persistance.test.ts`).
//
// CE QUI N'EST PAS ICI
// Les justifications (`raisons`) vivent dans leur propre table, `offer_reasons` : une offre
// en porte plusieurs et elles sont remplacées en bloc. Cette exemption est NOMMÉE dans le
// test — c'est la seule.

import type { Offre } from "./types";

/**
 * Les colonnes de `offers` pour une offre donnée, `raisons` exclue.
 *
 * `majLe` est posée par l'appelant : un ajout manuel et une passe de veille n'ont pas la
 * même notion de « modifié le », et laisser la date entrer ici la rendrait impossible à
 * fixer dans un test.
 */
export function colonnesOffre(o: Offre) {
  return {
    ...colonnesSeed(o),
    perimeeLe: o.perimeeLe === null ? null : new Date(o.perimeeLe),
  };
}

/**
 * Les colonnes qu'un rafraîchissement du JEU DE DÉPART a le droit d'écrire.
 *
 * `perimeeLe` en est RETIRÉE, et c'est le point important : la péremption est un CONSTAT de
 * la veille, pas une propriété du jeu de départ. L'écrire ferait revivre toute offre
 * constatée fermée dès le prochain changement de seed — une offre morte réapparaîtrait
 * comme ouverte, ce qu'interdit le garde-fou n°3. La synchronisation ne l'écrivait pas
 * avant l'unification des colonnes ; elle ne doit pas se mettre à le faire par effet de
 * bord d'un refactor.
 */
export function colonnesSeed(o: Offre) {
  return {
    id: o.id,
    source: o.source,
    dateReperage: o.dateReperage,
    entreprise: o.entreprise,
    poste: o.poste,
    lien: o.lien,
    km: o.km,
    noc: o.noc ?? null,
    ville: o.ville,
    salaireAffiche: o.salaireAffiche,
    priorite: o.priorite,
    statut: o.statut,
    dateEnvoi: o.dateEnvoi,
    score: o.score,
    scoreSource: o.scoreSource,
    notes: o.notes,
    userNote: o.userNote,
    histo: o.histo,
  };
}

/**
 * Le champ qui ne passe pas par `colonnesOffre`, et pourquoi.
 *
 * Exporté pour que le test le lise ici plutôt que de le redire : une exemption écrite deux
 * fois finit par ne plus décrire la même chose.
 */
export const CHAMPS_HORS_TABLE_OFFERS = ["raisons"] as const;
