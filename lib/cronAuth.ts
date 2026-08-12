// lib/cronAuth.ts — l'authentification partagée des routes cron.
//
// Deux routes (`cron/veille`, `cron/geocodage`) doivent vérifier EXACTEMENT la même chose :
// `CRON_SECRET` configuré, comparé en temps constant, échec fermé. Une copie par route est la
// classe de bug que ce dépôt a déjà payée le jour même (`idsStockesVus`, ADR-0006) : deux
// copies d'une même vérification dérivent tôt ou tard — l'une reçoit un correctif, l'autre
// l'oublie. Une seule fonction, un seul endroit à vérifier, testée une fois pour toutes.

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/** Comparaison en temps constant, sur des empreintes de longueur fixe. */
export function memeSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Vérifie qu'un appel porte le bon `CRON_SECRET`.
 *
 * Rend la réponse à renvoyer TELLE QUELLE si l'appel est refusé (503 sans secret configuré,
 * 401 si le secret fourni est faux), ou `null` si l'appel est autorisé — c'est l'appelant qui
 * décide de la suite, cette fonction ne fait que refuser ou laisser passer.
 *
 * Ne vérifie PAS `DATABASE_URL` : les deux routes cron actuelles en ont besoin, mais une
 * future route cron pourrait ne pas toucher la base — ce n'est pas de l'authentification, à
 * l'appelant de le vérifier lui-même s'il en a besoin.
 */
export function autoriserCron(requete: Request): NextResponse | null {
  const attendu = process.env.CRON_SECRET;
  if (!attendu || attendu.trim() === "") {
    return NextResponse.json(
      { ok: false, erreur: "cron désactivé : CRON_SECRET absent" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const fourni = requete.headers.get("authorization") ?? "";
  if (!memeSecret(fourni, `Bearer ${attendu}`)) {
    return NextResponse.json(
      { ok: false, erreur: "non autorisé" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return null;
}
