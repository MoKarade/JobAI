// lib/aFaire.ts — ce qui mérite l'attention maintenant.
//
// Le tableau de bord dit OÙ EN EST la recherche ; ce module dit QUOI FAIRE. Ce sont deux
// questions différentes, et jusqu'ici seule la première avait une réponse : la page
// s'ouvrait sur une liste de 38 offres triées par note, ce qui ne dit pas par où commencer.
//
// PURE, et la date est un paramètre. Aucune action n'est inventée : chacune pointe une
// offre RÉELLE et se justifie par un fait du suivi (un statut, une date). Une suggestion
// qu'on ne peut pas rattacher à une ligne du suivi n'a rien à faire ici — c'est la version
// « conseil » du garde-fou no fake data.
//
// Les seuils ci-dessous sont des HEURISTIQUES, pas des vérités. Ils sont nommés, exportés
// et affichés dans le texte des suggestions pour qu'on puisse les contester ; ils ne
// changent AUCUNE donnée et ne notent rien.

import type { Offre } from "./types";

/** Sans réponse après ce délai, une relance se justifie. */
export const DELAI_RELANCE_JOURS = 14;

/** Une offre repérée et jamais traitée depuis ce délai est probablement fermée. */
export const DELAI_PEREMPTION_PROBABLE_JOURS = 30;

/** Au-dessus de cette note, ne pas avoir postulé mérite une explication. */
export const NOTE_PRIORITAIRE = 80;

/** Nombre d'actions affichées. Au-delà, ce n'est plus une liste d'actions, c'est la liste. */
export const MAX_ACTIONS = 6;

export type GenreAction = "entrevue" | "relancer" | "postuler" | "verifier";

export interface Action {
  offreId: string;
  genre: GenreAction;
  /** Ce qu'il y a à faire, en une ligne. */
  titre: string;
  /** LE FAIT qui déclenche la suggestion. C'est ce qui la rend contestable. */
  motif: string;
}

/**
 * Écart en jours entre deux dates AAAA-MM-JJ.
 *
 * Les deux bornes sont interprétées à minuit UTC — pas pour situer un instant, mais parce
 * que comparer deux dates CALENDAIRES dans un fuseau fixe évite qu'un changement d'heure
 * fasse apparaître ou disparaître une journée.
 */
export function joursEntre(depuis: string, jusqua: string): number {
  const a = Date.parse(`${depuis}T00:00:00Z`);
  const b = Date.parse(`${jusqua}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** « il y a 1 jour » / « il y a 12 jours » / « aujourd'hui ». */
function ilYA(jours: number): string {
  if (jours <= 0) return "aujourd’hui";
  return jours === 1 ? "il y a 1 jour" : `il y a ${jours} jours`;
}

/**
 * Les prochaines actions, de la plus urgente à la moins urgente.
 *
 * L'ordre des genres est délibéré et vaut décision : une entrevue à préparer passe avant
 * une relance, qui passe avant une candidature à envoyer, qui passe avant une vérification.
 * Un tri par note aurait mis en tête l'offre la mieux notée même si une entrevue a lieu
 * demain.
 */
export function prochainesActions(
  offres: readonly Offre[],
  aujourdhui: string,
): Action[] {
  const actions: Action[] = [];

  // Une offre périmée ou historique ne demande plus rien : suggérer d'y postuler serait
  // exactement le « poste pourvu présenté comme une piste » que le marquage périmé évite.
  const vivantes = offres.filter((o) => !o.histo && o.perimeeLe === null);

  for (const o of vivantes) {
    if (o.statut === "Entrevue") {
      actions.push({
        offreId: o.id,
        genre: "entrevue",
        titre: `Préparer l’entrevue chez ${o.entreprise}`,
        motif: `${o.poste} — statut « Entrevue ».`,
      });
      continue;
    }

    if (o.statut === "CVenvoye" && o.dateEnvoi) {
      const jours = joursEntre(o.dateEnvoi, aujourdhui);
      if (jours >= DELAI_RELANCE_JOURS) {
        actions.push({
          offreId: o.id,
          genre: "relancer",
          titre: `Relancer ${o.entreprise}`,
          motif: `CV envoyé ${ilYA(jours)}, sans réponse (seuil : ${DELAI_RELANCE_JOURS} jours).`,
        });
      }
      continue;
    }

    if (o.statut === "Identifiee") {
      const repereeDepuis = joursEntre(o.dateReperage, aujourdhui);

      if (o.score !== null && o.score >= NOTE_PRIORITAIRE) {
        actions.push({
          offreId: o.id,
          genre: "postuler",
          titre: `Postuler chez ${o.entreprise}`,
          motif: `Note ${o.score}/100, repérée ${ilYA(repereeDepuis)}, aucun CV envoyé.`,
        });
        continue;
      }

      if (repereeDepuis >= DELAI_PEREMPTION_PROBABLE_JOURS) {
        actions.push({
          offreId: o.id,
          genre: "verifier",
          titre: `Vérifier si l’offre de ${o.entreprise} est toujours ouverte`,
          motif: `Repérée ${ilYA(repereeDepuis)} et jamais traitée — à marquer périmée si elle est fermée.`,
        });
      }
    }
  }

  const rang: Record<GenreAction, number> = {
    entrevue: 0,
    relancer: 1,
    postuler: 2,
    verifier: 3,
  };

  return actions
    .sort((a, b) => rang[a.genre] - rang[b.genre])
    .slice(0, MAX_ACTIONS);
}
