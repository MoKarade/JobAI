"use server";

// lib/actionsVeille.ts — lancer la veille depuis l'app, sans créer de cycle d'imports.
//
// ⚠️ POURQUOI CE FICHIER PLUTÔT QU'UNE LIGNE DE PLUS DANS `lib/actions.ts`.
//
// `lib/veilleComplete.ts` importe DÉJÀ `mesurerDistances` depuis `lib/actions.ts`. Ajouter
// l'import inverse dans `actions.ts` a créé un cycle — confirmé par `madge --circular`, qui
// n'en rendait aucun avant. Un cycle ESM ne casse pas toujours : les déclarations de
// fonctions sont hissées, donc « ça marche » jusqu'au jour où l'ordre d'évaluation change et
// où un module lit `undefined` au chargement. C'est précisément la panne qu'on ne diagnostique
// pas, parce qu'elle n'apparaît qu'en production et jamais au typecheck.
//
// Ce fichier casse le cycle par sa POSITION : il importe `veilleComplete`, et rien ne
// l'importe en retour.

import { revalidatePath } from "next/cache";
import { exigerSession } from "./session";
import { executerVeilleComplete } from "./veilleComplete";

/** Ce qu'une veille lancée à la main rapporte à l'écran. */
export type ResultatVeilleManuelle =
  | {
      ok: true;
      trouvees: number;
      nouvelles: number;
      perimees: number;
      enSursis: number;
      doublons: number;
      ecartees: number;
      /**
       * ⚠️ CES DEUX-LÀ MANQUAIENT, ET LES CHIFFRES NE S'ADDITIONNAIENT PAS.
       *
       * Mesuré le 2026-08-17 : « 100 trouvées · 0 nouvelle · 26 déjà connues · 0 sous le
       * plancher ». Soixante-quatorze offres s'évaporaient de l'écran sans motif — elles
       * étaient hors région (la source Dexterra est pancanadienne), mais le compte rendu ne
       * portait pas ce motif. Un total dont les parties ne font pas la somme se lit comme
       * une panne, alors que le tri faisait exactement son travail.
       */
      horsRegion: number;
      lieuInconnu: number;
      /**
       * LES VILLES DERRIÈRE LES DEUX MOTIFS GÉOGRAPHIQUES, groupées et comptées.
       *
       * Le compte rendu du 2026-08-17 disait « 47 lieu inconnu » : un nombre sur lequel on
       * ne peut rien décider. Selon que ces quarante-sept portent « Remote » ou des
       * municipalités québécoises que la liste blanche ignore, le correctif est opposé —
       * et rien à l'écran ne permettait de le savoir. Un motif se nomme AVEC son objet.
       */
      villesInconnues: { ville: string; n: number }[];
      villesHorsRegion: { ville: string; n: number }[];
      /** Une ligne par source interrogée : « 0 au total » ne dit pas laquelle s'est tue. */
      sources: { id: string; ok: boolean; offres: number; erreur?: string }[];
    }
  | { ok: false; erreur: string };

/**
 * Lance la passe de veille complète, depuis l'app.
 *
 * ⚠️ CE BOUTON N'EXISTE QUE PARCE QUE LE COMPTEUR D'ABSENCES A ÉTÉ CORRIGÉ. Tant qu'il
 * comptait par PASSE, relancer la veille vieillissait le stock d'un cran à chaque clic et
 * trois clics le périmaient : le bon geste était alors d'INTERDIRE le bouton, pas de le
 * poser. Depuis que les absences se comptent par JOUR, le balayage est idempotent dans la
 * journée — relançable autant de fois qu'on veut, ce que Marc demandait.
 *
 * La réservation courte reste : elle n'empêche plus de relancer, elle empêche deux passes
 * SIMULTANÉES d'écrire les mêmes offres.
 */
export async function lancerVeille(): Promise<ResultatVeilleManuelle> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  const r = await executerVeilleComplete("bouton-app");
  if (!r.ok) return { ok: false, erreur: r.erreur };

  // ⚠️ LES CLÉS SE LISENT DANS `executerVeilleComplete`, PAS DE MÉMOIRE. Premier jet :
  // `ingerees` (le compte s'appelle `nouvelles`) et `sources` traité comme un nombre alors
  // que c'est un TABLEAU. Les deux rendaient 0 — donc « 0 ingérée sur 100 trouvées · 0
  // source interrogée », un compte rendu qui se contredisait lui-même à l'écran et faisait
  // croire à une panne. Un champ absent d'un `Record<string, unknown>` ne lève pas : il vaut
  // `undefined`, et un défaut à 0 le déguise en mesure.
  const c = r.compte as Record<string, unknown>;
  const nombre = (v: unknown): number => (typeof v === "number" ? v : 0);
  const sources = Array.isArray(c.sources)
    ? (c.sources as { id: string; ok: boolean; offres: number; erreur?: string }[])
    : [];
  // Même prudence que pour `sources` : un champ absent d'un `Record<string, unknown>` ne
  // lève pas, il vaut `undefined` — et un `[]` par défaut le déguiserait en « aucune ville
  // refusée », c'est-à-dire en bonne nouvelle. Ici l'absence est indiscernable du vide, on
  // l'assume, mais elle ne doit surtout pas provoquer un plantage de rendu.
  const villes = (v: unknown): { ville: string; n: number }[] =>
    Array.isArray(v) ? (v as { ville: string; n: number }[]) : [];

  revalidatePath("/");
  revalidatePath("/sources");
  return {
    ok: true,
    trouvees: nombre(c.trouvees),
    nouvelles: nombre(c.nouvelles),
    perimees: nombre(c.perimees),
    enSursis: nombre(c.enSursis),
    doublons: nombre(c.doublons),
    ecartees: nombre(c.ecartees),
    horsRegion: nombre(c.horsRegion),
    lieuInconnu: nombre(c.lieuInconnu),
    villesInconnues: villes(c.villesInconnues),
    villesHorsRegion: villes(c.villesHorsRegion),
    sources,
  };
}
