"use server";

// lib/actionsAnalyse.ts — le bouton « analyser le marché », côté serveur.
//
// ⚠️ FICHIER À PART, comme `actionsRayon` et `actionsMetiers` : `lib/actions.ts` importe
// déjà les modules du barème, et l'import inverse ferait un cycle ESM — la panne qui
// n'apparaît qu'en production et jamais au typecheck.
//
// ⚠️ L'ANALYSE EST UN APPEL PAYANT, DONC ELLE NE SE DÉCLENCHE JAMAIS TOUTE SEULE. Pas au
// chargement de la page, pas au cron : uniquement au clic. Le résultat est CONSERVÉ avec sa
// date, pour que revenir sur la page ne le recalcule pas — un bouton qui coûte un centime à
// chaque affichage finirait par coûter cher sans que personne ne s'en aperçoive.

import { revalidatePath } from "next/cache";
import { exigerSession } from "./session";
import { lireEtat, ecrireEtat } from "./etat";
import { CLE_HISTORIQUE, lireHistorique } from "./historiqueVeille";
import { calculerTendances } from "./analyseMarche";
import { CLE_ANALYSE, type AnalyseConservee } from "./analyseConservee";
import { analyserMarche } from "./analyseMarcheLlm";

export type ResultatAction =
  | { ok: true; analyse: AnalyseConservee }
  | { ok: false; erreur: string };

/** Lance l'analyse et conserve son résultat. */
export async function lancerAnalyseMarche(): Promise<ResultatAction> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  let historique;
  try {
    historique = lireHistorique(await lireEtat<unknown>(CLE_HISTORIQUE, []));
  } catch (err) {
    console.error("[marche] historique illisible", err);
    return { ok: false, erreur: "L’historique n’a pas pu être lu. Voir les journaux." };
  }

  // ⚠️ LE REFUS VIENT AVANT L'APPEL, ET IL EST NOMMÉ. Payer un appel pour s'entendre dire
  // « pas assez de données » serait absurde ; et rendre une analyse molle sur trois passes
  // serait pire — elle aurait l'air d'une mesure.
  const t = calculerTendances(historique);
  if (!t.ok) return { ok: false, erreur: t.raison };

  const r = await analyserMarche(t.tendances);
  if (!r.ok) return { ok: false, erreur: r.raison };

  const analyse: AnalyseConservee = {
    texte: r.texte,
    le: new Date().toISOString(),
    passes: t.tendances.passes,
    tronquee: r.tronquee,
    tendances: t.tendances,
  };

  try {
    await ecrireEtat(CLE_ANALYSE, analyse);
  } catch (err) {
    // L'analyse est FAITE et PAYÉE : on la rend même si on n'a pas su la conserver. La
    // perdre en plus de l'avoir payée serait le pire des deux mondes.
    console.error("[marche] analyse non conservée", err);
  }
  revalidatePath("/sources");
  return { ok: true, analyse };
}
