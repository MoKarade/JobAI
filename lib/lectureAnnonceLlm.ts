// lib/lectureAnnonceLlm.ts — l'appel au modèle qui lit une annonce (JobAI#109, ADR-0039).
//
// ⚠️ CINQUIÈME SITE D'APPEL DU DÉPÔT, ET IL COMPTE SON COÛT LUI-MÊME : le relevé part au compteur par modèle
// (`lib/coutLlmStore.ts`) et remonte au hub dans le bloc `usage`. Pas de plafond dur (Marc, 16/10 : « surveiller »), mais la
// taille d'un lot est bornée par l'appelant (`LECTURES_PAR_APPEL_MAX`).
//
// ⚠️ UN APPEL PAYANT NE PART QUE SUR LE GESTE DE MARC OU DE CLAUDE (l'outil MCP `lire_annonces`), jamais seul : aucun
// cron, aucune lecture au chargement d'une page.
//
// ⚠️ LE MODÈLE NE VOIT NI LA FICHE NI LE NOM DE MARC : seulement le titre et l'extrait expurgé de l'annonce, balisés comme
// donnée, et les mots de vocabulaire du profil.

import Anthropic from "@anthropic-ai/sdk";
import { enregistrerUsageLlm } from "./coutLlmStore";
import { baliserDonnees, CONSIGNE_DONNEES, sanitizePromptText } from "./promptSafety";
import {
  MODELE_LECTURE,
  OUTIL_LECTURE,
  consigneLecture,
  validerLecture,
  type LectureAnnonce,
} from "./lectureAnnonce";
import type { Profil } from "./profil";

/** Sous le `maxDuration` de la route MCP (60 s), pour qu'une panne se dise au lieu de tuer la fonction. */
const DELAI_MS = 25_000;

/**
 * Borne de COÛT et de réponse : un rôle, un entier et trois phrases de 160 caractères tiennent largement. Une coupure
 * (`stop_reason: max_tokens`) est DITE, jamais rendue comme une lecture. 800 et non 500 : le tokenizer de Haiku 5.5 donne
 * environ 30 % de jetons de plus pour le même texte.
 */
const MAX_TOKENS = 800;

export type ResultatLecture = { ok: true; lecture: LectureAnnonce } | { ok: false; raison: string };

/**
 * Lit UNE annonce. NE LÈVE PAS : un échec se nomme (clé absente, panne de plateforme, réponse coupée, hors schéma), parce
 * que chacun appelle un geste différent. `comptabiliser`, `cle` et `maintenant` sont injectables pour les tests.
 */
export async function lireAnnonce(
  offre: { poste: string; texte: string },
  profil: Pick<Profil, "motsCoordination" | "motsTechnique">,
  options: {
    comptabiliser?: (usage: unknown, modele: string) => Promise<void>;
    cle?: string | undefined;
    maintenant?: () => Date;
  } = {},
): Promise<ResultatLecture> {
  const comptabiliser = options.comptabiliser ?? enregistrerUsageLlm;
  // `cle` passée (même vide ou undefined) l'emporte : un test de l'absence ne doit jamais faire un vrai appel facturé.
  const cle = "cle" in options ? options.cle : process.env.ANTHROPIC_API_KEY;
  if (!cle) return { ok: false, raison: "ANTHROPIC_API_KEY absente : la lecture est désactivée." };
  if (offre.texte.trim() === "") {
    return { ok: false, raison: "Aucun texte d'annonce n'a été gardé pour cette offre : rien à lire." };
  }

  // Le texte EXACT que le modèle lira : sa longueur est celle qu'on garde avec la lecture.
  const texteLu = sanitizePromptText(`Poste : ${offre.poste}\n${offre.texte}`);

  let reponse;
  try {
    const client = new Anthropic({ apiKey: cle, timeout: DELAI_MS, maxRetries: 1 });
    reponse = await client.messages.create({
      model: MODELE_LECTURE,
      max_tokens: MAX_TOKENS,
      system: `${consigneLecture(profil)}\n\n${CONSIGNE_DONNEES}`,
      tools: [OUTIL_LECTURE],
      tool_choice: { type: "tool", name: OUTIL_LECTURE.name },
      // L'annonce vient d'une source que Marc n'a pas écrite : DONNÉE, balisée et assainie.
      messages: [{ role: "user", content: baliserDonnees("annonce", texteLu) }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Trace opérateur : le nom et le statut, jamais d'extrait d'annonce (dépôt public).
    console.error("[lecture-annonce] appel API en échec", {
      name: e instanceof Error ? e.name : typeof e,
      status: (e as { status?: unknown }).status,
    });
    return { ok: false, raison: `Appel à l'API refusé ou indisponible : ${msg}` };
  }

  // ⚠️ COMPTÉ ICI, AVANT TOUTE VALIDATION, et sous son propre try : l'appel est facturé même si ce qui suit échoue, et une
  // comptabilité qui hoquette ne doit jamais coûter le résultat.
  try {
    await comptabiliser(reponse.usage, MODELE_LECTURE);
  } catch (e) {
    console.error("[lecture-annonce] comptabilité de l'appel impossible", e);
  }

  const bloc = reponse.content.find((c) => c.type === "tool_use");
  if (!bloc || bloc.type !== "tool_use") {
    console.error("[lecture-annonce] réponse sans lecture structurée", { stop_reason: reponse.stop_reason });
    return { ok: false, raison: `Le modèle n'a pas rendu de lecture structurée (fin : ${reponse.stop_reason}).` };
  }
  if (reponse.stop_reason === "max_tokens") {
    console.error("[lecture-annonce] réponse coupée par max_tokens");
    return { ok: false, raison: "La réponse a été coupée en cours de route." };
  }

  const valide = validerLecture(bloc.input, {
    caracteresLus: texteLu.length,
    maintenant: (options.maintenant ?? (() => new Date()))(),
  });
  if (!valide.ok) {
    console.error("[lecture-annonce] lecture refusée", { raison: valide.raison });
    return valide;
  }
  return { ok: true, lecture: valide.lecture };
}
