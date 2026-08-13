// lib/cv/renotation.ts — recalculer toutes les notes après un changement de profil.
//
// Marc a choisi la re-notation IMMÉDIATE (ADR-0009) : dès qu'il valide un profil, tout est
// recalculé, sans second écran d'aperçu. La revue du profil EST le point de contrôle.
//
// ⚠️ UNE NOTE MANUELLE N'EST JAMAIS ÉCRASÉE, ET CE N'EST PAS UNE PRÉFÉRENCE.
//
// C'est la règle du barème (garde-fou n°3) : une note calculée ne lit que des champs
// structurés, une note manuelle vient de la lecture réelle de l'offre — c'est pour ça que
// les calculées sont plafonnées à 85. Un recalcul de masse est EXACTEMENT la circonstance
// où on perdrait ce travail sans s'en apercevoir : cinquante lignes changent d'un coup,
// personne ne relit, et une note posée à la main après lecture d'une annonce disparaît
// dans le lot.
//
// La fonction ci-dessous est PURE. Elle ne parle ni à la base ni à l'horloge : elle prend
// des offres, rend un plan de changements. C'est ce qui permet d'éprouver la règle
// ci-dessus sans monter une base, et de MONTRER le plan avant de l'écrire.

import { computeScore } from "../scoring";
import type { Profil } from "../profil";
import type { Offre } from "../types";

export interface ChangementNote {
  id: string;
  entreprise: string;
  poste: string;
  avant: number | null;
  apres: number;
  /** L'écart, signé. Sert à trier : les plus gros mouvements se relisent en premier. */
  delta: number;
}

export interface PlanRenotation {
  /** Les offres dont la note change, du plus gros écart au plus petit. */
  changements: ChangementNote[];
  /** Notes manuelles laissées intactes — comptées, pour que le total se réconcilie. */
  manuellesPreservees: number;
  /** Offres recalculées dont la note ne bouge pas. */
  inchangees: number;
}

/**
 * Calcule ce que le nouveau profil ferait aux notes, SANS rien écrire.
 *
 * `salaireAnnuel` n'est pas passé : `salaireAffiche` est du texte libre (« 40 $/h+ »,
 * « 52 260 – 120 727 $ ») et en tirer un annuel exige des arbitrages qui changent la note.
 * C'est une modification du barème, pas un détail d'implémentation — elle se décide, elle
 * ne se glisse pas dans une re-notation. Même choix qu'à l'ajout manuel (`lib/ajout.ts`).
 */
export function planifierRenotation(
  offres: readonly Offre[],
  profil: Profil,
): PlanRenotation {
  const changements: ChangementNote[] = [];
  let manuellesPreservees = 0;
  let inchangees = 0;

  for (const o of offres) {
    if (o.scoreSource === "manuel") {
      manuellesPreservees++;
      continue;
    }

    const r = computeScore(
      { titre: o.poste, description: o.notes ?? "", km: o.km },
      profil,
    );

    if (r.total === o.score) {
      inchangees++;
      continue;
    }

    changements.push({
      id: o.id,
      entreprise: o.entreprise,
      poste: o.poste,
      avant: o.score,
      apres: r.total,
      delta: r.total - (o.score ?? 0),
    });
  }

  // Du plus gros mouvement au plus petit : si Marc ne relit que trois lignes, ce sont
  // celles-là qui comptent.
  changements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { changements, manuellesPreservees, inchangees };
}

/** Résumé d'un plan en une phrase, pour l'écran. */
export function resumerPlan(plan: PlanRenotation): string {
  const n = plan.changements.length;
  const morceaux = [
    n === 0 ? "aucune note ne change" : `${n} note${n > 1 ? "s" : ""} modifiée${n > 1 ? "s" : ""}`,
    `${plan.inchangees} inchangée${plan.inchangees > 1 ? "s" : ""}`,
  ];
  if (plan.manuellesPreservees > 0) {
    morceaux.push(
      `${plan.manuellesPreservees} note${plan.manuellesPreservees > 1 ? "s" : ""} manuelle${
        plan.manuellesPreservees > 1 ? "s" : ""
      } préservée${plan.manuellesPreservees > 1 ? "s" : ""}`,
    );
  }
  return morceaux.join(" · ");
}
