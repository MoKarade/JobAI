// lib/comparaisonOffreLlm.ts — l'appel au modèle qui relève les exigences d'une annonce (JobAI#157, ADR-0034).
//
// ⚠️ QUATRIÈME SITE D'APPEL DU DÉPÔT (après `lib/cv/extraction.ts`, `lib/analyseMarcheLlm.ts` et
// `lib/candidatureLlm.ts`), ET IL COMPTE SON COÛT LUI-MÊME : le relevé part au même compteur
// (`lib/coutLlmStore.ts`) et remonte au hub dans le bloc `usage`. Pas de plafond dur (Marc, 16/10 : « surveiller »).
//
// ⚠️ LE MODÈLE NE VOIT PAS LA FICHE DE MARC. Il relève les exigences de l'annonce ; la comparaison est faite par le code
// (`lib/comparaisonOffre.ts`). Un appel payant ne part qu'au clic de Marc, jamais seul, et rien n'est écrit en base.

import Anthropic from "@anthropic-ai/sdk";
import { enregistrerUsageLlm } from "./coutLlmStore";
import { expurgerCoordonnees } from "./cv/extraction";
import { baliserDonnees, CONSIGNE_DONNEES, sanitizePromptText } from "./promptSafety";
import type { CompetenceProuvee } from "./competences";
import type { Offre } from "./types";
import {
  CONSIGNE,
  EXIGENCES_MAX,
  OUTIL_COMPARAISON,
  PHRASE_EXIGENCE_MAX,
  PHRASE_EXIGENCE_MIN,
  comparerALaFiche,
  texteAnnonce,
  verifierExigences,
  type ExigenceEcartee,
  type ExigenceLue,
  type LigneComparaison,
} from "./comparaisonOffre";

/** Borne de l'appel : sous le `maxDuration` de la page (60 s), pour qu'une panne se dise au lieu de tuer la fonction. */
const DELAI_MS = 40_000;

/** Haiku 4.5 (choix à trancher avec Marc, ADR-0035) : relever des phrases dans un extrait ne demande pas de raisonner. */
const MODELE = "claude-haiku-4-5-20251001";

/**
 * Borne de COÛT : quinze exigences de moins de 200 caractères tiennent dans ce plafond. Une coupure
 * (`stop_reason: max_tokens`) laisse l'appel d'outil incomplet : elle est DITE, jamais rendue comme une liste.
 */
const MAX_TOKENS = 1500;

export type ResultatComparaison =
  | {
      ok: true;
      lignes: LigneComparaison[];
      ecartees: ExigenceEcartee[];
      /** Nombre de caractères d'annonce que le modèle a lus : « il te manque » ne parle que de ça. */
      caracteresLus: number;
    }
  | { ok: false; raison: string };

const net = (s: string): string => expurgerCoordonnees(sanitizePromptText(s)).trim();

/**
 * Relève les exigences de `offre` et les pose à côté de `fiche`.
 *
 * NE LÈVE PAS : un échec se nomme (clé absente, panne de plateforme, réponse coupée, hors schéma), parce que chacun
 * appelle un geste différent de Marc. L'éligibilité (fiche, texte, rang) est vérifiée AVANT par l'appelant ; ici, un
 * texte vide est tout de même refusé avant l'appel. `comptabiliser` et `cle` sont injectables pour les tests.
 */
export async function comparerOffreALaFiche(
  offre: Offre,
  fiche: readonly CompetenceProuvee[],
  options: {
    comptabiliser?: (usage: unknown, modele: string) => Promise<void>;
    cle?: string | undefined;
  } = {},
): Promise<ResultatComparaison> {
  const comptabiliser = options.comptabiliser ?? enregistrerUsageLlm;
  // `cle` passée (même vide ou undefined) l'emporte : un test de l'absence ne doit jamais faire un vrai appel facturé.
  const cle = "cle" in options ? options.cle : process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    // Échec fermé et NOMMÉ, avant tout appel.
    return { ok: false, raison: "ANTHROPIC_API_KEY absente : la comparaison est désactivée." };
  }
  const annonce = texteAnnonce(offre);
  if (annonce === "") {
    return { ok: false, raison: "Aucun texte d'annonce n'a été gardé pour cette offre : rien à comparer." };
  }

  // Le texte EXACT que le modèle lira : c'est contre lui que chaque phrase sera retrouvée.
  const texteLu = sanitizePromptText(`Poste : ${offre.poste}\n${annonce}`);

  let reponse;
  try {
    const client = new Anthropic({ apiKey: cle, timeout: DELAI_MS, maxRetries: 1 });
    reponse = await client.messages.create({
      model: MODELE,
      max_tokens: MAX_TOKENS,
      system: `${CONSIGNE}\n\n${CONSIGNE_DONNEES}`,
      tools: [OUTIL_COMPARAISON],
      tool_choice: { type: "tool", name: OUTIL_COMPARAISON.name },
      // L'annonce vient d'une source que Marc n'a pas écrite : DONNÉE, balisée et assainie.
      messages: [{ role: "user", content: baliserDonnees("annonce", texteLu) }],
    });
  } catch (e) {
    // Une panne de plateforme ne s'impute pas à l'offre : « recharge ton crédit » n'est pas « annonce vide ».
    const msg = e instanceof Error ? e.message : String(e);
    // Trace opérateur : le nom et le statut, jamais d'extrait d'annonce (dépôt public).
    console.error("[comparaison] appel API en échec", {
      name: e instanceof Error ? e.name : typeof e,
      status: (e as { status?: unknown }).status,
    });
    return { ok: false, raison: `Appel à l'API refusé ou indisponible : ${msg}` };
  }

  // ⚠️ COMPTÉ ICI, AVANT TOUTE VALIDATION, et sous son propre try : l'appel est facturé même si ce qui suit échoue,
  // et une comptabilité qui hoquette ne doit jamais coûter le résultat.
  try {
    await comptabiliser(reponse.usage, MODELE);
  } catch (e) {
    console.error("[comparaison] comptabilité de l'appel impossible", e);
  }

  const bloc = reponse.content.find((c) => c.type === "tool_use");
  if (!bloc || bloc.type !== "tool_use") {
    console.error("[comparaison] réponse sans liste structurée", { stop_reason: reponse.stop_reason });
    return {
      ok: false,
      raison: `Le modèle n'a pas rendu de liste structurée (fin : ${reponse.stop_reason}).`,
    };
  }
  if (reponse.stop_reason === "max_tokens") {
    console.error("[comparaison] réponse coupée par max_tokens");
    return { ok: false, raison: "La réponse a été coupée en cours de route. Relance la comparaison." };
  }

  const entree = (bloc.input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(entree.exigences)) {
    console.error("[comparaison] réponse hors schéma : exigences n'est pas une liste");
    return { ok: false, raison: "Réponse hors schéma : « exigences » n'est pas une liste." };
  }
  // Borne avant de vérifier : un tableau démesuré ne coûte pas de temps de calcul.
  const brutes = entree.exigences.slice(0, EXIGENCES_MAX * 2);

  const { retenues, ecartees } = verifierExigences(brutes, texteLu);
  const auDela = entree.exigences.length - brutes.length;
  if (auDela > 0) {
    ecartees.push({ competence: "?", raison: `${auDela} exigence(s) reçues au-delà de ${EXIGENCES_MAX * 2}, non lues` });
  }

  // Nettoyage (coordonnées, caractères invisibles) APRÈS la vérification, qui s'est faite sur le texte lu.
  const propres: ExigenceLue[] = [];
  for (const r of retenues) {
    const phrase = net(r.phrase);
    if (phrase.length < PHRASE_EXIGENCE_MIN || phrase.length > PHRASE_EXIGENCE_MAX) {
      ecartees.push({ competence: r.competence, raison: "phrase hors longueur après nettoyage" });
      continue;
    }
    propres.push({ phrase, competence: r.competence });
  }

  if (ecartees.length > 0) {
    // Des NOMBRES et des identifiants du vocabulaire dans les journaux, jamais un extrait d'annonce (dépôt public).
    console.warn(
      `[comparaison] ${ecartees.length} exigence(s) écartée(s) : ${ecartees.map((e) => `${e.competence} (${e.raison})`).join(", ")}`,
    );
  }

  return {
    ok: true,
    lignes: comparerALaFiche(propres, fiche),
    ecartees,
    caracteresLus: texteLu.length,
  };
}
