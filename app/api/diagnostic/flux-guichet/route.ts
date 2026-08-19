// app/api/diagnostic/flux-guichet/route.ts — LIRE le flux du Guichet une fois, pour de vrai.
//
// ⚠️ CETTE ROUTE EST DEVENUE MINCE, ET C'EST LE POINT. Toute la mesure vit dans
// `lib/ingest/diagnosticFlux.ts`, parce qu'un SECOND appelant existe : l'outil MCP
// `diagnostic_flux`. Deux copies de la liste des champs inventoriés répondraient
// différemment à la même question, et le jour où l'une ajouterait un champ, l'autre
// mesurerait autre chose sans que rien ne le signale. Une règle, un exemplaire.
//
// ⚠️ ELLE MESURE, ELLE N'INGÈRE RIEN. Aucune offre n'entre en base par ce chemin. C'est une
// lecture bornée (budget, plafond, tampon) suivie d'un compte rendu.
//
// GARDÉE, ET DEUX FOIS — la middleware, puis la session revérifiée ici. Un point d'entrée qui
// déclenche la lecture de plus de cent mégaoctets n'a rien à faire au bout d'une route
// anonyme.

import { NextResponse } from "next/server";
import { exigerSession } from "@/lib/session";
import { diagnostiquerFlux } from "@/lib/ingest/diagnosticFlux";

export const dynamic = "force-dynamic";
/** Une lecture longue d'un flux de ~130 Mo. Le budget interne borne, ceci est le mur. */
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

  try {
    return NextResponse.json(
      { ok: true, ...(await diagnostiquerFlux()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Une source injoignable ne se déguise pas en journée calme : le module LÈVE, et l'échec
    // porte son nom jusqu'ici.
    return NextResponse.json(
      { ok: false, erreur: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
