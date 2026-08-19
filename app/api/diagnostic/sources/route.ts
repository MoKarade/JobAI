// app/api/diagnostic/sources/route.ts — ce que l'APP peut réellement joindre.
//
// POURQUOI CETTE ROUTE EXISTE
// La liste des sources accessibles ne peut PAS s'écrire depuis une session Claude : sa
// passerelle refuse tout hors allowlist, onze fois sur onze le 2026-08-19. Un refus là-bas
// ne dit rien du monde — c'est la leçon qui avait déjà produit un « 0/180 » trompeur. La
// seule mesure qui vaille se fait ICI, depuis Vercel, dans les conditions où le code tourne.
//
// ⚠️ ELLE MESURE, ELLE N'INGÈRE RIEN. Une requête par candidat, aucune écriture en base,
// aucune offre collectée. C'est la différence entre « puis-je joindre ce service ? » et
// « je moissonne ce service ».
//
// GARDÉE, ET DEUX FOIS. La middleware couvre déjà tout (une route inexistante rend 401, pas
// 404 — vérifié). On revérifie quand même la session ici : c'est la défense en profondeur
// que `routesGardees.test.ts` attend de chaque route, et une sonde qui sort vers quinze
// hôtes tiers n'a rien à faire au bout d'un point d'entrée anonyme.

import { NextResponse } from "next/server";
import { exigerSession } from "@/lib/session";
import { CANDIDATS, sonder, verdictDe, type Mesure } from "@/lib/ingest/sondeSources";

export const dynamic = "force-dynamic";
/** Quinze candidats, une pause de 1,1 s entre chacun, jusqu'à 10 s par requête. */
export const maxDuration = 300;

export async function GET() {
  try {
    await exigerSession();
  } catch {
    return NextResponse.json(
      { ok: false, erreur: "non autorisé" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const mesures = await sonder();
  const lignes = mesures.map((m: Mesure) => ({
    ...m,
    verdict: verdictDe(m),
    // La réserve suit la mesure : un 200 de SmartRecruiters sans elle se lirait comme une
    // bonne nouvelle, et un robots.txt d'Indeed comme une autorisation.
    reserve: CANDIDATS.find((c) => c.id === m.id)?.reserve ?? null,
    voieLegale: CANDIDATS.find((c) => c.id === m.id)?.voie ?? null,
  }));

  return NextResponse.json(
    {
      ok: true,
      // Le compte de CE QUI A ÉTÉ TENTÉ, pas seulement de ce qui a marché : « 0 exploitable
      // sur 15 tentés » et « sonde jamais exécutée » sont deux situations opposées, et un
      // outil de diagnostic muet ne diagnostique rien.
      tentes: mesures.length,
      resume: lignes.reduce<Record<string, number>>((acc, l) => {
        acc[l.verdict] = (acc[l.verdict] ?? 0) + 1;
        return acc;
      }, {}),
      mesures: lignes,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
