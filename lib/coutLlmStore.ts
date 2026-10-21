// lib/coutLlmStore.ts — la moitié IMPURE de la comptabilité des appels de modèle.
//
// La règle et les calculs vivent dans `lib/coutLlm.ts`, qui est pur et se teste sans base.
// Ici, seulement deux gestes : accumuler après un appel, relire pour publier.
//
// ⚠️ UNE PANNE DE COMPTABILITÉ NE DOIT JAMAIS COÛTER UNE EXTRACTION. Perdre la mesure d'un
// appel est regrettable ; perdre l'analyse d'un CV parce que la base a hoqueté ne l'est pas.
// D'où le `try` autour de l'écriture — mais avec un `console.error`, jamais un silence : une
// erreur avalée transformerait un cumul faux en cumul qui a l'air juste.

import { lireEtatBrut, ecrireEtat } from "./etat";
import { assurerMigrations } from "./migrations";
import {
  CLE_COUT_LLM,
  ajouterUsageModele,
  coutAPublier,
  relireCompteur,
  type CoutPublie,
} from "./coutLlm";

/**
 * Enregistre le relevé d'usage d'UN appel réussi, sous le nom du `modele` appelé.
 *
 * ⚠️ LE MODÈLE EST OBLIGATOIRE : les modèles ne se facturent pas au même prix (JobAI#158), donc un relevé sans nom de
 * modèle ne se chiffre pas. Chaque site d'appel passe le sien.
 *
 * ⚠️ LA LECTURE-MODIFICATION-ÉCRITURE N'EST PAS ATOMIQUE, ET C'EST SANS CONSÉQUENCE POUR DEUX APPELS SEULS : l'analyse d'un CV
 * est déclenchée par un formulaire à bouton unique, la comparaison d'offre par un clic. Le LOT de lectures d'annonces (JobAI#109,
 * `lire_annonces`) lance en revanche cinq appels de front : ses relevés passent par `enFileSerie` (`lib/serie.ts`), qui les
 * écrit un à la fois. Un nouveau site d'appel concurrent doit faire de même, ou rendre l'incrément atomique.
 */
export async function enregistrerUsageLlm(usage: unknown, modele: string): Promise<void> {
  try {
    // Le compteur peut être la PREMIÈRE écriture d'une instance froide (l'extraction
    // précède l'enregistrement du CV) : le schéma se garantit ici comme partout ailleurs.
    await assurerMigrations();

    // ⚠️ LECTURE BRUTE, PAS `lireEtat`. Son `catch` rend le défaut, donc un JSON corrompu
    // se lirait « aucun appel » et le cumul repartirait de zéro — un montant amputé publié
    // avec l'autorité d'une mesure. Ici, illisible ⇒ on n'écrase RIEN.
    const etat = relireCompteur(await lireEtatBrut(CLE_COUT_LLM));
    if (etat.etat === "illisible") {
      console.error(
        `[cout-llm] compteur illisible sous la clé « ${CLE_COUT_LLM} » : ` +
          "cet appel n'est pas comptabilisé et le cumul n'est pas écrasé.",
      );
      return;
    }

    const avant = etat.etat === "compteur" ? etat.parModele : {};
    await ecrireEtat(CLE_COUT_LLM, { parModele: ajouterUsageModele(avant, modele, usage) });
  } catch (err) {
    // Des NOMBRES dans les journaux, jamais un extrait de CV ni une réponse du modèle
    // (garde-fou n°1 : le dépôt est public, et les journaux se relisent).
    console.error("[cout-llm] écriture du compteur impossible", err);
  }
}

/**
 * Ce que le hub doit publier. Ne lève jamais : une panne se rend `illisible`.
 *
 * Elle est SÉPARÉE de `getTrackerState` alors que les deux sont impures, et c'est
 * délibéré : le `null` de `getTrackerState` a un sens précis et testé — « le suivi n'est pas
 * branché ». Un CV analysé avant la première offre suivie obligerait sinon à choisir entre
 * perdre le coût mesuré et mentir sur l'état du suivi. Deux questions, deux lectures ; la
 * route les compose, et la moitié pure reçoit le montant en paramètre.
 */
export async function lireCoutPublie(): Promise<CoutPublie> {
  if (!process.env.DATABASE_URL) return { etat: "aucun-appel" };
  try {
    await assurerMigrations();
    return coutAPublier(relireCompteur(await lireEtatBrut(CLE_COUT_LLM)));
  } catch (err) {
    console.error("[cout-llm] lecture du compteur impossible", err);
    return { etat: "illisible" };
  }
}
