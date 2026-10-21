// lib/dossierEmployeur.ts — le dossier d'un employeur : une lettre A, B ou C, et les lignes qui la justifient (JobAI#161).
//
// Demande (plan « analyse du CV et dossier employeur », étape B3) : un bloc « Employeur » avec une note A, B ou C et ses
// raisons, CHAQUE LIGNE CITANT SA SOURCE ET SA DATE ; sans source, « inconnu ». La note de l'offre ne change pas.
//
// ⚠️ UNE SEULE SOURCE POUR L'INSTANT : LE SUIVI DE LA VEILLE (ADR-0029, ADR-0037). Le registre des entreprises en base n'a ni date
// d'import ni statut, et le RENA ne s'affirme jamais sur une simple égalité de nom (ADR-0030) : aucun des deux ne peut citer
// une date, donc aucun n'entre dans une ligne. Mieux vaut « inconnu » qu'une affirmation sans source (garde-fou n°3).
//
// ⚠️ LA LETTRE NE JUGE QUE CE QUE LE SUIVI A VU. « C » veut dire « le suivi a vu deux signaux défavorables », pas « mauvais
// employeur ». Chaque seuil ci-dessous est un choix de Marc à relire (ADR-0037), écrit ici une seule fois.
//
// Fonction PURE : aucune horloge, aucune base.

import type { SignauxEmployeur } from "./signauxEmployeur";

export type Lettre = "A" | "B" | "C" | "inconnu";

/** Une offre ouverte depuis au moins ce nombre de jours (vus) est un signal défavorable. */
export const SEUIL_OUVERTE_LONGUE_JOURS = 60;
/** Une durée médiane des offres fermées d'au moins ce nombre de jours est un signal défavorable. */
export const SEUIL_MEDIANE_LONGUE_JOURS = 45;
/** Intitulés repris (offres « en plus ») à partir desquels c'est un signal défavorable : un seul peut être un hasard. */
export const SEUIL_INTITULES_REPRIS = 2;
/**
 * Offres observées à partir desquelles l'employeur est lu comme EMBAUCHANT EN CONTINU : des intitulés repris y disent le roulement
 * des postes (une chaîne qui affiche « Cuisinier » pour ses succursales), pas un mauvais employeur. Le signal « intitulés repris »
 * ne compte plus pour la lettre à partir de là ; la ligne reste, en constat (réglage de Marc, 2026-10-21, JobAI#161).
 * [Supposition : 10 est un seuil de bon sens, à revoir sur les prochains dossiers.]
 */
export const SEUIL_EMBAUCHE_CONTINUE = 10;
/** Offres observées par la veille en dessous desquelles le dossier dit « inconnu ». */
export const MINIMUM_OBSERVEES = 3;
/** Offres observées (dont 3 fermées, la médiane) qu'il faut pour que l'absence de signal défavorable donne un A. */
export const OBSERVEES_POUR_A = 6;

/** Le nom de l'unique source d'une ligne. */
export const SOURCE_SUIVI = "Suivi JobAI (veille)";

export interface LigneDossier {
  texte: string;
  /** Défavorable = compte pour la lettre. Neutre = un constat, sans poids. */
  ton: "defavorable" | "neutre";
  source: string;
  /** Dernier jour (AAAA-MM-JJ) observé par la veille. */
  date: string;
}

export interface DossierEmployeur {
  lettre: Lettre;
  /** Une phrase qui dit POURQUOI cette lettre (ou pourquoi « inconnu »). */
  resume: string;
  /** Vide quand la lettre est « inconnu ». */
  lignes: LigneDossier[];
}

const s = (n: number) => (n > 1 ? "s" : "");

/** Le dossier d'un employeur à partir de ses signaux. PURE. */
export function dossierEmployeur(signaux: SignauxEmployeur | null | undefined): DossierEmployeur {
  if (!signaux || signaux.observeLe === null || signaux.offresObservees < MINIMUM_OBSERVEES) {
    const n = signaux?.offresObservees ?? 0;
    return {
      lettre: "inconnu",
      resume: `Inconnu : la veille a observé ${n} offre${s(n)} de cet employeur, il en faut ${MINIMUM_OBSERVEES} pour en dire quelque chose.`,
      lignes: [],
    };
  }

  const date = signaux.observeLe;
  // ⚠️ SEULE UNE OFFRE DONT ON A VU L'APPARITION COMPTE (réglage de Marc, 2026-10-21). Une offre déjà ouverte au premier jour de la
  // veille a une durée tronquée : « 62 jours » y veut dire « depuis qu'on regarde », et il touchait presque toutes les chaînes.
  const ancienne = signaux.plusAncienneOuverteMesurable;
  const toutesDejaLa = ancienne === null && signaux.plusAncienneOuverte !== null;
  const longue = ancienne !== null && ancienne.jours >= SEUIL_OUVERTE_LONGUE_JOURS;
  const medianeLongue =
    signaux.dureeFermeeMedianeJours !== null && signaux.dureeFermeeMedianeJours >= SEUIL_MEDIANE_LONGUE_JOURS;
  const embaucheEnContinu = signaux.offresObservees >= SEUIL_EMBAUCHE_CONTINUE;
  const repris = signaux.intitulesReprisTotal >= SEUIL_INTITULES_REPRIS && !embaucheEnContinu;

  const ligne = (texte: string, ton: LigneDossier["ton"]): LigneDossier => ({ texte, ton, source: SOURCE_SUIVI, date });
  const lignes: LigneDossier[] = [
    ligne(
      `${signaux.ouvertes} offre${s(signaux.ouvertes)} réputée${s(signaux.ouvertes)} ouverte${s(signaux.ouvertes)}, ${signaux.fermees} fermée${s(signaux.fermees)}.`,
      "neutre",
    ),
    ancienne
      ? ligne(
          `La plus ancienne offre ouverte dont on a vu l'apparition l'est depuis au moins ${ancienne.jours} jour${s(ancienne.jours)} (repérée le ${ancienne.repereeLe}).`,
          longue ? "defavorable" : "neutre",
        )
      : toutesDejaLa
        ? ligne(
            `Les offres ouvertes étaient déjà là au premier jour de la veille (${signaux.debutVeille}) : on ne peut pas dire depuis quand elles le sont.`,
            "neutre",
          )
        : ligne("Durée d'ouverture inconnue : aucune offre ouverte n'a été observée.", "neutre"),
    signaux.dureeFermeeMedianeJours !== null
      ? ligne(
          `Offres fermées : durée médiane vue de ${signaux.dureeFermeeMedianeJours} jour${s(signaux.dureeFermeeMedianeJours)}, sur ${signaux.fermeesObservees}.`,
          medianeLongue ? "defavorable" : "neutre",
        )
      : ligne(
          `Offres fermées : trop peu pour une durée médiane (${signaux.fermeesObservees} observée${s(signaux.fermeesObservees)}, il en faut 3).`,
          "neutre",
        ),
    ligne(
      signaux.intitulesRepris.length === 0
        ? "Aucun intitulé repris."
        : `${signaux.intitulesReprisTotal} offre${s(signaux.intitulesReprisTotal)} de plus sous un intitulé déjà vu : ${signaux.intitulesRepris
            .map((i) => `« ${i.intitule} » ×${i.fois}`)
            .join(" · ")}.${
          signaux.intitulesReprisTotal >= SEUIL_INTITULES_REPRIS && embaucheEnContinu
            ? ` Sans poids dans la lettre : ${signaux.offresObservees} offres observées, l'employeur embauche en continu et ses postes tournent.`
            : ""
        }`,
      repris ? "defavorable" : "neutre",
    ),
  ];

  const defavorables = lignes.filter((l) => l.ton === "defavorable").length;
  let lettre: Exclude<Lettre, "inconnu">;
  let resume: string;
  if (defavorables >= 2) {
    lettre = "C";
    resume = `C : le suivi voit ${defavorables} signaux défavorables.`;
  } else if (defavorables === 1) {
    lettre = "B";
    resume = "B : le suivi voit 1 signal défavorable.";
  } else if (signaux.offresObservees >= OBSERVEES_POUR_A && signaux.fermeesObservees >= 3) {
    lettre = "A";
    resume = `A : aucun signal défavorable sur ${signaux.offresObservees} offres observées, dont ${signaux.fermeesObservees} fermées.`;
  } else {
    lettre = "B";
    resume = `B : aucun signal défavorable, mais trop peu d'offres observées (${signaux.offresObservees}) pour un A.`;
  }

  return { lettre, resume, lignes };
}
