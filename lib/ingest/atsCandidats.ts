// lib/ingest/atsCandidats.ts — les paires qu'on a une RAISON de tenter.
//
// ⚠️ POURQUOI CETTE LISTE EXISTE, ET POURQUOI ELLE EST VIDE — 2026-08-17, constat de Marc.
//
// La découverte devinait un identifiant pour chaque entreprise chez chacune des cinq
// familles d'ATS, puis vérifiait. Premier lot réel : quinze essais, quinze échecs — douze
// « pas de page à cette adresse », trois « sans réponse exploitable ». Marc l'a dit
// exactement : « ça sert à rien de faire ça […] il faut une recherche en amont pour voir
// lesquelles peuvent répondre, sinon perte d'argent et de temps. » Il a raison.
//
// CE QUE LA RECHERCHE A MONTRÉ (cinq cibles, 2026-08-17) : aucune n'utilise ces cinq
// familles. Elles publient sur leur PROPRE site — canam.com/offres-demplois,
// robotiq.com/about/careers, laserax.com/careers — et sont reprises par Jobillico, le
// Guichet-Emplois et Indeed. Greenhouse, Lever, Recruitee et Workable sont l'écosystème
// des entreprises technologiques américaines ; ce n'est pas celui des PME manufacturières
// de la région de Québec. Le catalogue était le mauvais pour cette population.
//
// LA FAUTE EST DE MÉTHODE, PAS DE CODE. La machinerie de vérification est juste — un jeton
// qui répond n'est pas un jeton qui a raison, et elle le prouve. Ce qui manquait, c'est
// d'avoir ÉPROUVÉ LE CATALOGUE sur du réel avant de bâtir dessus : deux recherches web ont
// suffi à le réfuter, elles auraient tenu avant le premier commit. C'est mot pour mot la
// règle déjà écrite au §7 (« prouver sur un échantillon réel large AVANT de coder »),
// contournée parce que le proxy de la session bloquait les hôtes — un empêchement de
// mesure transformé en permission de supposer.
//
// TANT QUE CETTE LISTE EST VIDE, LA DÉCOUVERTE NE TENTE RIEN. C'est voulu : mieux vaut un
// canal qui dit « je n'ai rien à essayer » qu'un canal qui brûle des requêtes chez cinq
// services tiers pour rapporter des échecs. Une entrée ne s'y ajoute qu'avec une raison
// vérifiable — une page carrières observée sur ce service, pas un nom normalisé.

import type { FamilleAts } from "./types";

/** Une paire qu'une recherche a désignée, avec ce qui permet de la contrôler. */
export interface CandidatAts {
  /** Le nom tel qu'il apparaît dans les cibles ou dans une offre. */
  entreprise: string;
  famille: FamilleAts;
  /**
   * L'identifiant OBSERVÉ, pas deviné. C'est toute la différence : `jetonProbable` fabrique
   * une supposition à partir du nom, alors qu'ici on inscrit ce qu'on a vu sur la page.
   */
  jeton: string;
  /** D'où vient la certitude. Une entrée sans provenance n'est pas vérifiable. */
  source: string;
}

/**
 * Les candidats vérifiés.
 *
 * VIDE — et ce vide est un RÉSULTAT, pas un travail en attente. Voir l'en-tête : la
 * recherche a montré que les cibles publient hors de ces cinq services. Remplir cette liste
 * demande une observation par entreprise, pas une règle de nommage.
 */
export const CANDIDATS_ATS: readonly CandidatAts[] = [];
