// lib/mcp/ecriture.spec.ts — ce que Claude peut MODIFIER du suivi de Marc.
//
// ⚠️ CE FICHIER AMENDE UN GARDE-FOU NON NÉGOCIABLE. Le n°2 dit que `statut`, `priorite`,
// `dateEnvoi` et `userNote` appartiennent à Marc, et que rien d'automatique ne les écrit —
// « le scan propose, Marc valide. Exception : aucune ». Marc a créé une exception le
// 2026-08-19 (ADR-0011). Elle tient à quatre conditions, et retirer l'une d'elles rouvre
// exactement le trou que le garde-fou fermait :
//
// 1. ELLE NE COUVRE QUE CE QUE MARC DEMANDE. Un traitement automatique — seed, ingestion,
//    scan de courriels — reste interdit d'écrire ces champs. Ce qui change n'est pas QUI a le
//    droit, c'est PAR OÙ la demande de Marc peut arriver.
// 2. TOUT PASSE PAR `lib/suivi.ts`. `appliquerModification` est le seul écrivain, et il
//    ignore en silence tout champ hors `CHAMPS_UTILISATEUR` : l'MCP n'a donc aucun pouvoir
//    que l'interface n'a pas. Ce module ne touche ni la base ni le SQL.
// 3. L'AVANT/APRÈS REMPLACE L'ÉCRAN. Dans l'app, Marc VOIT ce qu'il change. Dans une
//    conversation, il ne voit rien — sauf si l'outil le lui dit. Une écriture qui répondrait
//    « fait » serait une modification invisible du jeu de données, précisément ce que le
//    garde-fou n°2 protège. Chaque changement est donc rendu champ par champ.
// 4. LE MOTEUR GARDE SES CALCULS. Le score, la péremption, les justifications et la distance
//    ne sont pas modifiables ici. Une note « corrigée » par une conversation cesserait d'être
//    reproductible — et c'est elle qui décide de ce que Marc regarde en premier.

import { z } from "zod";
import { CHAMPS_UTILISATEUR, MiseAJourOffreSchema, type ChampUtilisateur, type Offre } from "../types";
import { appliquerModification, marquerEnvoi } from "../suivi";
import { vueOffre, type OffreVue } from "./vue";

/**
 * Ce qu'un appel d'écriture peut porter.
 *
 * ⚠️ DÉRIVÉ DE `MiseAJourOffreSchema`, LE MÊME QUE L'INTERFACE. Un schéma jumeau écrit ici
 * divergerait au premier champ ajouté, et l'MCP deviendrait plus permissif que l'écran sans
 * que rien ne le signale.
 */
export const EcritureSuiviSchema = z.object({
  id: z.string().min(1).max(80),
  patch: MiseAJourOffreSchema,
});
export type EcritureSuivi = z.infer<typeof EcritureSuiviSchema>;

/** Un champ qui a bougé, avec ce qu'il valait et ce qu'il vaut. */
export interface Changement {
  champ: ChampUtilisateur;
  avant: string;
  apres: string;
}

export type ResultatEcriture =
  | {
      ok: true;
      /** L'offre après modification, telle que le modèle la verra. */
      offre: OffreVue;
      /**
       * Ce qui a RÉELLEMENT bougé.
       *
       * Vide quand la demande ne changeait rien : « aucun changement » et « statut passé de
       * X à Y » sont deux réponses différentes, et les confondre ferait croire à un effet
       * qui n'a pas eu lieu.
       */
      changements: Changement[];
      /** `true` si la date d'envoi a été posée automatiquement par le passage à « CV envoyé ». */
      dateEnvoiPosee: boolean;
    }
  | { ok: false; erreur: "offre-introuvable" | "offre-perimee" | "patch-vide" };

/**
 * Applique une demande de Marc à une offre. PURE.
 *
 * Ne touche ni la base ni l'horloge : `aujourdhui` est un PARAMÈTRE. Une fonction qui lit
 * l'heure n'est pas testable de façon déterministe — et sur ce dépôt, toute date écrite se
 * calcule dans le fuseau de Marc, jamais en UTC (Vercel tourne en UTC, Marc vit à UTC−4 :
 * une offre modifiée après 20 h locale daterait du lendemain).
 *
 * Rend l'offre SUIVANTE ; c'est à l'appelant de la persister. Cette séparation est ce qui
 * permet de tester la règle sans base, et d'empêcher ce module de toucher au SQL.
 */
export function preparerEcriture(
  offres: readonly Offre[],
  demande: EcritureSuivi,
  aujourdhui: string,
): { resultat: ResultatEcriture; suivante: Offre | null } {
  const offre = offres.find((o) => o.id === demande.id);
  if (offre === undefined) {
    return { resultat: { ok: false, erreur: "offre-introuvable" }, suivante: null };
  }

  // ⚠️ REFUS EXPLICITE SUR UNE OFFRE PÉRIMÉE. Modifier le statut d'une annonce qu'on a
  // constatée fermée produit un suivi qui raconte une histoire fausse — « CV envoyé » sur un
  // poste qui n'existe plus. Marc peut toujours la ressusciter depuis l'app ; c'est un geste
  // qui mérite un écran.
  if (offre.perimeeLe !== null) {
    return { resultat: { ok: false, erreur: "offre-perimee" }, suivante: null };
  }

  const demandes = Object.entries(demande.patch).filter(([, v]) => v !== undefined);
  if (demandes.length === 0) {
    return { resultat: { ok: false, erreur: "patch-vide" }, suivante: null };
  }

  const modifiee = appliquerModification(offre, demande.patch);
  // La date d'envoi se pose au passage à « CV envoyé », exactement comme dans l'interface —
  // et seulement si elle était vide, pour ne jamais écraser une date que Marc a saisie.
  const suivante = marquerEnvoi(modifiee, aujourdhui);

  const changements: Changement[] = [];
  for (const champ of CHAMPS_UTILISATEUR) {
    const avant = String(offre[champ]);
    const apres = String(suivante[champ]);
    if (avant !== apres) changements.push({ champ, avant, apres });
  }

  return {
    resultat: {
      ok: true,
      offre: vueOffre(suivante),
      changements,
      dateEnvoiPosee: offre.dateEnvoi === "" && suivante.dateEnvoi !== "",
    },
    suivante,
  };
}
