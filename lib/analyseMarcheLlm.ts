// lib/analyseMarcheLlm.ts — ce que le modèle DIT des chiffres. Le seul appel réseau du lot.
//
// ⚠️ DEUXIÈME SITE D'APPEL DU DÉPÔT, ET IL PORTE SA PROPRE COMPTABILITÉ. La règle écrite au
// premier (`lib/cv/extraction.ts`) est que la comptabilité vit AU SITE D'APPEL, jamais chez
// ses appelants : un outil qu'on peut oublier d'appeler finit par être oublié. Le coût de
// cette analyse part donc au même compteur, et remonte au hub avec le reste.
//
// ⚠️ LE MODÈLE N'A AUCUN CHIFFRE À PRODUIRE. Les nombres sont calculés dans
// `lib/analyseMarche.ts` et affichés depuis là ; ici on ne demande qu'une lecture. C'est ce
// qui empêche une prose crédible aux nombres approximatifs — le mode d'erreur d'un modèle à
// qui l'on confie de l'arithmétique.

import Anthropic from "@anthropic-ai/sdk";
import { enregistrerUsageLlm } from "./coutLlmStore";
import { baliserDonnees, CONSIGNE_DONNEES } from "./promptSafety";
import { tendancesEnTexte, type Tendances } from "./analyseMarche";

/**
 * Haiku, comme l'extraction de CV et pour la même raison : c'est une lecture de quelques
 * lignes de chiffres, pas un raisonnement difficile, et le budget du projet ne supporte pas
 * un modèle plus cher pour un bouton qu'on peut cliquer plusieurs fois par jour.
 */
const MODELE = "claude-haiku-4-5-20251001";

/**
 * Plafond de sortie.
 *
 * L'analyse tient en un paragraphe : c'est une borne de COÛT, et aussi de qualité — sans
 * elle le modèle rédige un rapport que personne ne lit. La coupure éventuelle est DITE
 * (`stop_reason`), jamais rendue comme une réponse complète.
 */
const MAX_TOKENS = 700;

const CONSIGNE = `Tu lis les chiffres d'une veille d'offres d'emploi dans la région de Québec.

Ta tâche : dire en trois ou quatre phrases comment le marché se comporte, pour quelqu'un qui
cherche un poste de coordination ou de supervision technique.

Règles strictes :
- N'invente AUCUN chiffre. Tu peux citer ceux qu'on te donne, jamais en calculer d'autres.
- Si les données ne permettent pas de conclure, dis-le. Une absence de tendance est une
  information ; une tendance inventée n'en est pas une.
- Pas de conseil de carrière, pas d'encouragement. Une lecture, pas un coach.
- Écris en français, au tutoiement, sans emoji.`;

export type ResultatAnalyse =
  | { ok: true; texte: string; tronquee: boolean }
  | { ok: false; raison: string };

/**
 * Demande au modèle sa lecture des tendances.
 *
 * `comptabiliser` et `cle` sont injectables pour les tests — la valeur par défaut est ce qui
 * tourne en production.
 */
export async function analyserMarche(
  tendances: Tendances,
  options: {
    comptabiliser?: (usage: unknown) => Promise<void>;
    cle?: string;
  } = {},
): Promise<ResultatAnalyse> {
  const comptabiliser = options.comptabiliser ?? enregistrerUsageLlm;
  const cle = options.cle ?? process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    // Échec fermé et NOMMÉ : « pas de clé » et « le modèle n'a rien à dire » sont deux
    // choses opposées, et un message générique les confondrait.
    return { ok: false, raison: "ANTHROPIC_API_KEY absente : l'analyse est désactivée." };
  }

  let reponse;
  try {
    const client = new Anthropic({ apiKey: cle });
    reponse = await client.messages.create({
      model: MODELE,
      max_tokens: MAX_TOKENS,
      system: `${CONSIGNE}\n\n${CONSIGNE_DONNEES}`,
      messages: [
        { role: "user", content: baliserDonnees("tendances", tendancesEnTexte(tendances)) },
      ],
    });
  } catch (e) {
    // Panne de PLATEFORME : elle ne s'impute pas aux données. Le message doit permettre de
    // distinguer « recharge ton crédit » de « il n'y a rien à analyser ».
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, raison: `Appel à l'API refusé ou indisponible : ${msg}` };
  }

  // ⚠️ COMPTÉ ICI, AVANT TOUTE VALIDATION DE LA RÉPONSE, et sous son propre try — mêmes
  // raisons qu'à l'extraction de CV : l'appel est facturé même si ce qui suit échoue, et
  // une comptabilité qui hoquette ne doit jamais coûter le résultat.
  try {
    await comptabiliser(reponse.usage);
  } catch (e) {
    console.error("[marche] comptabilité de l'appel impossible", e);
  }

  const texte = reponse.content
    .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  if (texte === "") {
    return { ok: false, raison: "Le modèle n'a rien rendu de lisible." };
  }

  // ⚠️ UNE RÉPONSE COUPÉE SE DIT. Sans ce drapeau, une phrase tronquée en plein milieu
  // s'afficherait avec l'autorité d'une analyse complète — la même règle que pour un compte
  // de passe partielle.
  return { ok: true, texte, tronquee: reponse.stop_reason === "max_tokens" };
}
