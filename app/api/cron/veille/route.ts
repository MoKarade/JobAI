// app/api/cron/veille/route.ts — la passe quotidienne, déclenchée par Vercel.
//
// ⚠️ CETTE ROUTE N'EST PLUS LE SEUL CHEMIN VERS LA PASSE (2026-08-14). Le travail vit dans
// `lib/veilleComplete.ts` et le cron de géocodage le reprend quand il est en retard — parce
// que ce cron-ci a cessé d'être appelé par Vercel pendant trois jours sans que rien ne le
// dise. La raison complète est dans l'en-tête du module.
//
// Ce qui reste ici est ce qui appartient à une route HTTP : l'authentification, la
// réservation, et la mise en forme de la réponse.
//
// AUTHENTIFICATION — ÉCHEC FERMÉ, comme le endpoint hub
// Vercel signe ses appels de cron avec `CRON_SECRET`. Sans secret configuré, la route
// répond 503 : une route qui écrit dans la base ne doit JAMAIS être ouverte parce qu'on a
// oublié une variable d'environnement. Comparaison en temps constant.
//
// CE QU'ELLE NE FAIT PAS
// Elle ne moissonne aucun site qui l'interdit. Uniquement le flux RSS public du
// Guichet-Emplois et les API que les entreprises publient pour diffuser leurs postes.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CLE_VEILLE, DELAI_VEILLE_MS, reserverPasse } from "@/lib/synchro";
import { autoriserCron } from "@/lib/cronAuth";
import { executerVeilleComplete } from "@/lib/veilleComplete";

export const dynamic = "force-dynamic";
/** La passe interroge une douzaine de sources en parallèle : il lui faut de la marge. */
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

  // ⚠️ LA RÉSERVATION EST PRISE ICI AUSSI, et c'est ce qui rend la reprise sûre.
  //
  // Sans elle, le cron de géocodage — qui reprend la passe quand elle est en retard — ne
  // saurait pas que celle-ci vient d'avoir lieu, et les deux tourneraient le même jour.
  // Avec elle, le premier des deux qui arrive fait le travail et l'autre s'efface, quel que
  // soit l'ordre. Un refus n'est donc PAS une erreur : c'est le verrou qui fonctionne.
  if (!(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, new Date()))) {
    // ⚠️ UN REFUS SE DIT, LUI AUSSI. Sans cette ligne, un déclenchement manuel rend 200 et
    // laisse les journaux MUETS : « la passe s'est effacée » devient indiscernable de « la
    // passe n'a jamais démarré », qui sont les deux hypothèses opposées qu'on cherche
    // justement à départager. Vécu le 2026-08-17 : Marc lance la passe à la main, obtient
    // deux 200, et aucune trace — le verrou fonctionnait, mais rien ne le disait.
    console.log("[veille] cron-veille — sautée : une passe a déjà eu lieu dans les 20 h");
    return NextResponse.json(
      { ok: true, saute: "une passe de veille a déjà eu lieu récemment" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const r = await executerVeilleComplete("cron-veille");
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, erreur: r.erreur },
      { status: r.statut, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, declencheur: r.declencheur, ...r.compte },
    { headers: { "Cache-Control": "no-store" } },
  );
}
