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
 * Les candidats observés — recherche du 2026-08-17, 36 cibles passées en revue.
 *
 * ⚠️ DEUX SUR TRENTE-SIX, ET C'EST LA MESURE QUI COMPTE. Greenhouse, Lever, Recruitee et
 * Workable : AUCUNE cible. SmartRecruiters : deux. Le reste publie sur son propre portail
 * (canam.com, robotiq.com, laserax.com, jobsearch.alstom.com, jobs.domtar.com,
 * careers.honeywell.com), sur Workday (Labatt, via AB InBev) ou passe par Jobillico.
 *
 * ⚠️ ET LE JETON NE SE DÉDUIT PAS DU NOM — c'est la seconde leçon, plus importante que la
 * première. `jetonProbable("Chantier Davie")` donne `chantierdavie` ; le vrai identifiant
 * est `ChantierDavieCanada`. Deviner aurait manqué cette page carrières alors qu'elle
 * existe, et l'aurait inscrite « absente » pour quatorze jours. À l'inverse `dexterra` se
 * devinait — donc la devinette n'était pas sans espoir, seulement sans FIABILITÉ : elle
 * rate les vraies et ne le dit pas. Une observation ne rate pas.
 */
export const CANDIDATS_ATS: readonly CandidatAts[] = [
  {
    entreprise: "Chantier Davie",
    famille: "smartrecruiters",
    jeton: "ChantierDavieCanada",
    source: "careers.smartrecruiters.com/ChantierDavieCanada/frcbleu (recherche 2026-08-17)",
  },
  {
    entreprise: "Dexterra",
    famille: "smartrecruiters",
    jeton: "dexterra",
    source: "careers.smartrecruiters.com/dexterra (recherche 2026-08-17)",
  },
];
