// lib/candidatureLlm.ts — l'appel au modèle qui rédige le brouillon de CV et de lettre.
//
// ⚠️ TROISIÈME SITE D'APPEL DU DÉPÔT (après `lib/cv/extraction.ts` et `lib/analyseMarcheLlm.ts`),
// ET IL PORTE SA PROPRE COMPTABILITÉ : la règle est que le coût se compte AU SITE D'APPEL,
// jamais chez ses appelants. Le relevé part au même compteur (`lib/coutLlmStore.ts`) et
// remonte au hub dans le bloc `usage`, avec le reste. Pas de plafond dur : Marc a tranché le
// 2026-10-16, « surveiller » — la dépense s'affiche, elle ne coupe rien.
//
// ⚠️ LE MODÈLE PROPOSE, MARC VALIDE. Aucun outil n'est exposé au modèle sauf celui qui rend le
// brouillon ; sa sortie passe par un schéma Zod, puis par `assemblerBrouillon` qui ne lui
// laisse choisir ni employeur, ni date, ni langue, ni diplôme. Rien n'est écrit en base : le
// suivi de l'offre (statut, date d'envoi) reste à Marc.

import Anthropic from "@anthropic-ai/sdk";
import { enregistrerUsageLlm } from "./coutLlmStore";
import { expurgerCoordonnees } from "./cv/extraction";
import { baliserDonnees, CONSIGNE_DONNEES, sanitizePromptText } from "./promptSafety";
import type { Faits } from "./profil";
import type { Offre } from "./types";
import {
  OUTIL_BROUILLON,
  ReponseBrouillonSchema,
  assemblerBrouillon,
  bornerBrouillon,
  offreEnTexte,
  profilEnTexte,
  profilSuffisant,
  type Brouillon,
  type ReponseBrouillon,
} from "./candidature";

/**
 * Haiku 4.5 (le choix du modèle de ce site est à trancher avec Marc, ADR-0035) : rédiger deux textes courts à partir de faits
 * donnés ne demande pas un raisonnement difficile, et le bouton se clique plusieurs fois.
 */
const MODELE = "claude-haiku-4-5-20251001";

/**
 * Borne de COÛT et de lisibilité : un CV ciblé et une lettre tiennent largement dans ce
 * plafond. Une coupure (`stop_reason: max_tokens`) laisse l'appel de l'outil incomplet : elle
 * est DITE comme telle, jamais rendue comme un brouillon.
 */
const MAX_TOKENS = 3000;

const CONSIGNE = [
  "Tu prépares un BROUILLON de CV ciblé et de lettre de présentation, en français québécois,",
  "pour une offre d'emploi précise. Le candidat relira tout avant de s'en servir.",
  "",
  CONSIGNE_DONNEES,
  "",
  "Règles strictes :",
  "- Tu travailles UNIQUEMENT à partir du bloc « profil ». Une réalisation, un outil, un",
  "  diplôme ou un chiffre qui n'y est pas n'existe pas : ne l'écris pas.",
  "- N'ajoute AUCUN chiffre que le profil ou l'offre ne porte pas (pourcentage, années, montant,",
  "  taille d'équipe). Mieux vaut une phrase sans chiffre qu'un chiffre plausible et faux.",
  "- Tu ne vois PAS l'annonce complète, seulement le poste, l'employeur et quelques notes. Ne",
  "  prétends pas connaître les exigences exactes de l'annonce ; appuie-toi sur ce que le bloc",
  "  « offre » dit. Si l'offre en dit peu, reste sobre.",
  "- postes : désigne les postes du profil par leur NUMÉRO entre crochets, du plus pertinent au",
  "  moins pertinent pour cette offre. Ne recopie ni employeur ni date : le code s'en charge.",
  "  Pour chaque poste, 2 à 4 puces tirées des réalisations de CE poste, reformulées pour",
  "  l'offre, une ligne chacune (200 caractères au plus).",
  "- competences : uniquement des éléments de la ligne « Outils et compétences » du profil,",
  "  recopiés tels quels.",
  "- accroche : deux ou trois phrases, sans formule creuse, sans superlatif.",
  "- lettre : trois ou quatre paragraphes, ton direct et professionnel. Pas de nom, pas",
  "  d'adresse, pas de téléphone, pas de courriel, pas de signature, pas de « Madame,",
  "  Monsieur » : le code les place. formule = la formule de politesse finale seulement.",
  "- Pas d'emoji. Pas de flatterie envers l'employeur.",
].join("\n");

export type ResultatRedaction =
  | { ok: true; brouillon: Brouillon }
  | { ok: false; raison: string };

const net = (s: string): string => expurgerCoordonnees(sanitizePromptText(s)).trim();

/** Nettoie chaque chaîne rédigée par le modèle, champ par champ (jamais un étalement du brut). */
function nettoyer(r: ReponseBrouillon): ReponseBrouillon {
  const liste = (xs: readonly string[]) => xs.map(net).filter((x) => x.length > 0);
  return {
    accroche: net(r.accroche),
    competences: liste(r.competences),
    postes: r.postes.map((p) => ({ indice: p.indice, puces: liste(p.puces) })),
    lettre: {
      objet: net(r.lettre.objet),
      paragraphes: liste(r.lettre.paragraphes),
      formule: net(r.lettre.formule),
    },
  };
}

/**
 * Demande au modèle le brouillon pour `offre`, à partir de `faits`.
 *
 * NE LÈVE PAS : un échec se nomme (« clé absente », « profil sans parcours », « réponse hors
 * schéma ») parce qu'il appelle un geste différent de la part de Marc. `comptabiliser` et
 * `cle` sont injectables pour les tests ; les défauts sont ce qui tourne en production.
 */
export async function redigerCandidature(
  offre: Offre,
  faits: Faits,
  options: {
    comptabiliser?: (usage: unknown, modele: string) => Promise<void>;
    cle?: string | undefined;
  } = {},
): Promise<ResultatRedaction> {
  const comptabiliser = options.comptabiliser ?? enregistrerUsageLlm;
  const cle = options.cle ?? process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    // Échec fermé et NOMMÉ, avant tout appel.
    return { ok: false, raison: "ANTHROPIC_API_KEY absente : le brouillon est désactivé." };
  }
  // Le refus vient AVANT l'appel : payer pour rédiger un CV sans parcours ne produirait
  // qu'une accroche et une lettre bâties sur rien.
  if (!profilSuffisant(faits)) {
    return {
      ok: false,
      // ⚠️ LE CAS RÉEL (2026-10-16) : un CV déposé AVANT que l'extraction ne lise le parcours (20 août)
      // a un profil validé sans poste. « Dépose ton CV » l'envoyait refaire ce qu'il avait déjà fait :
      // le geste est de RELANCER l'analyse du CV existant, puis de valider.
      raison:
        "Ton profil validé n'a aucun poste (il date d'avant la lecture du parcours). Dans Profil : " +
        "« Relancer l'analyse » sur ton CV, vérifie ce qu'elle propose, puis applique. " +
        "Si tu n'as aucun CV, dépose-en un.",
    };
  }

  let reponse;
  try {
    const client = new Anthropic({ apiKey: cle });
    reponse = await client.messages.create({
      model: MODELE,
      max_tokens: MAX_TOKENS,
      system: CONSIGNE,
      tools: [OUTIL_BROUILLON],
      tool_choice: { type: "tool", name: "rendre_brouillon" },
      messages: [
        {
          role: "user",
          // Profil ET offre sont de la DONNÉE : l'offre vient d'une source que Marc n'a pas
          // écrite, le profil d'un document extrait.
          content: [
            baliserDonnees("profil", profilEnTexte(faits)),
            baliserDonnees("offre", offreEnTexte(offre)),
          ].join("\n\n"),
        },
      ],
    });
  } catch (e) {
    // Une panne de plateforme ne s'impute pas au profil : le message doit distinguer
    // « recharge ton crédit » de « ton profil est vide ».
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, raison: `Appel à l'API refusé ou indisponible : ${msg}` };
  }

  // ⚠️ COMPTÉ ICI, AVANT TOUTE VALIDATION, et sous son propre try : l'appel est facturé même
  // si ce qui suit échoue, et une comptabilité qui hoquette ne doit jamais coûter le brouillon.
  try {
    await comptabiliser(reponse.usage, MODELE);
  } catch (e) {
    console.error("[candidature] comptabilité de l'appel impossible", e);
  }

  const bloc = reponse.content.find((c) => c.type === "tool_use");
  if (!bloc || bloc.type !== "tool_use") {
    return {
      ok: false,
      raison: `Le modèle n'a pas rendu de brouillon structuré (fin : ${reponse.stop_reason}).`,
    };
  }
  if (reponse.stop_reason === "max_tokens") {
    return { ok: false, raison: "Le brouillon a été coupé en cours de route. Relance la demande." };
  }

  const { valeur, tronquees } = bornerBrouillon(bloc.input);
  const analyse = ReponseBrouillonSchema.safeParse(valeur);
  if (!analyse.success) {
    const details = analyse.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" · ");
    return { ok: false, raison: `Réponse hors schéma : ${details}` };
  }

  const propre = nettoyer(analyse.data);
  if (propre.accroche === "" || propre.lettre.paragraphes.length === 0) {
    return { ok: false, raison: "Le modèle n'a rien rendu de lisible." };
  }
  return { ok: true, brouillon: assemblerBrouillon(propre, faits, offre, tronquees) };
}
