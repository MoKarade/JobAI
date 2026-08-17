// app/api/cron/geocodage/route.ts — une SECONDE passe de géocodage, à une autre heure.
//
// [CARTE-03] Marc, 2026-08-12 : « 60 sans adresse, c'est inacceptable ». Mesuré : le débit
// RÉEL d'une passe est plafonné à 8 requêtes Nominatim (`MAX_VILLES_PAR_PASSE`,
// lib/geocodage.ts) — ce n'est pas un oubli, c'est une limite dérivée du mur de 60 s d'une
// fonction Vercel dans le pire cas (voir `lib/geocodageCron.ts`). L'agrandir exigerait de
// re-dériver ce pire cas ; ce n'est pas fait ici.
//
// Le levier qui reste SANS y toucher : une PASSE DE PLUS par jour. Cette route ne fait QUE
// ça — ni ingestion, ni péremption, ni journal de veille — elle appelle exactement le même
// `mesurerDistances` que le cron de veille et que les pages, avec le même budget partagé
// (`lib/geocodageCron.ts`, pour que les deux crons ne divergent jamais), à une heure
// différente (`vercel.json`). Elle passe par le même verrou que les deux autres
// déclencheurs (`reserverPasse`, `CLE_DISTANCES`) : si une page ou l'autre cron vient de
// passer il y a moins de cinq minutes, celle-ci ne fait rien — jamais deux flux Nominatim en
// même temps, quelle que soit la combinaison de déclencheurs qui se chevauche.
//
// AUTHENTIFICATION — même garde-fou échec-fermé que `cron/veille`, factorisé dans
// `lib/cronAuth.ts` pour que les deux routes ne puissent pas diverger.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mesurerDistances } from "@/lib/actions";
import { autoriserCron } from "@/lib/cronAuth";
import { MAX_SITUATIONS_CRON, BUDGET_GEOCODAGE_CRON_MS } from "@/lib/geocodageCron";
import {
  CLE_DISTANCES,
  CLE_VEILLE,
  DELAI_MESURE_AUTO_MS,
  DELAI_VEILLE_MS,
  reserverPasse,
} from "@/lib/synchro";
import { executerVeilleComplete } from "@/lib/veilleComplete";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(requete: Request) {
  const refus = autoriserCron(requete);
  if (refus) return refus;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, erreur: "base non configurée" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ⚠️ FILET DE REPRISE DE LA VEILLE — la raison d'être de ce bloc est écrite dans
  // `lib/veilleComplete.ts`. En deux mots : le cron de veille (15:00 UTC) a cessé d'être
  // appelé par Vercel pendant trois jours pendant que CELUI-CI (03:00) tournait chaque
  // nuit. Un travail quotidien ne doit pas dépendre d'un déclencheur unique dont le silence
  // ne se voit pas.
  //
  // La réservation (`CLE_VEILLE`, 20 h) arbitre : si la veille a tourné dans les vingt
  // dernières heures — donc si son propre cron fonctionne — on ne prend rien et on fait
  // simplement notre travail habituel. Ce filet ne coûte donc rien quand tout va bien.
  //
  // ⚠️ ET ON REND LA MAIN APRÈS. `executerVeilleComplete` fait DÉJÀ la passe de distances
  // à la fin : enchaîner la nôtre dans la même invocation, ce serait deux travaux sous le
  // même mur de 60 s. Un seul travail par invocation, comme avant.
  try {
    if (await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, new Date())) {
      console.warn("[cron/geocodage] veille en retard — reprise depuis ce cron");
      const v = await executerVeilleComplete("cron-geocodage-rattrapage");
      return NextResponse.json(
        v.ok
          ? { ok: true, rattrapageVeille: true, declencheur: v.declencheur, ...v.compte }
          : { ok: false, rattrapageVeille: true, erreur: v.erreur },
        { status: v.ok ? 200 : v.statut, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!(await reserverPasse(db, CLE_DISTANCES, DELAI_MESURE_AUTO_MS, new Date()))) {
      // Même raison que dans le cron de veille : un refus muet rend un déclenchement manuel
      // indéchiffrable. 200 sans trace ne dit pas si le verrou a joué ou si rien n'a démarré.
      console.log("[cron/geocodage] sautée : une passe de localisation vient d'avoir lieu");
      return NextResponse.json(
        { ok: true, localisation: "sautée — une passe vient d'avoir lieu" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const m = await mesurerDistances({
      maxSituations: MAX_SITUATIONS_CRON,
      budgetGeocodageMs: BUDGET_GEOCODAGE_CRON_MS,
    });

    if (!m.ok) {
      console.error("[cron/geocodage] passe refusée :", m.erreur);
      return NextResponse.json(
        { ok: false, erreur: m.erreur },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        localisation:
          `${m.placees} placée(s) au centre-ville, ${m.villesRattrapees} ville(s) rattrapée(s), ` +
          `${m.situees} située(s), ${m.adressesRattrapees} adresse(s) récupérée(s), ` +
          `${m.precisees} précisée(s), ${m.bornesMesurees} borne(s) mesurée(s), ` +
          `${m.detailsEnrichis} fiche(s) enrichie(s), ${m.mesurees} mesurée(s)`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[cron/geocodage] passe impossible", err);
    return NextResponse.json(
      { ok: false, erreur: "passe impossible — voir les journaux du serveur" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
