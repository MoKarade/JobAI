// app/api/cron/veille/route.ts — la passe quotidienne, déclenchée par Vercel.
//
// C'est le seul point de l'app qui déclenche une ingestion. Il ne décide rien lui-même :
// il lit l'état, appelle `executerPasse` (dont toute la logique est pure et testée), écrit
// le résultat, et rend un compte rendu détaillé.
//
// AUTHENTIFICATION — ÉCHEC FERMÉ, comme le endpoint hub
// Vercel signe ses appels de cron avec `CRON_SECRET`. Sans secret configuré, la route
// répond 503 : une route qui écrit dans la base ne doit JAMAIS être ouverte parce qu'on a
// oublié une variable d'environnement. Comparaison en temps constant.
//
// CE QU'ELLE NE FAIT PAS
// Elle ne moissonne aucun site qui l'interdit. Uniquement le flux RSS public du
// Guichet-Emplois et les API que les entreprises publient pour diffuser leurs postes.

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { offerReasons, offers, syncState } from "@/lib/db/schema";
import { lireOffres } from "@/lib/donnees";
import { colonnesOffre } from "@/lib/persistance";
import { executerPasse } from "@/lib/ingest/passe";
import { recuperer } from "@/lib/ingest/sources";
import type { AtsEntreprise } from "@/lib/ingest/types";
import type { JournalVeille } from "@/lib/veille";

export const dynamic = "force-dynamic";
/** La passe interroge une douzaine de sources en parallèle : il lui faut de la marge. */
export const maxDuration = 60;

const CLE_JOURNAL = "veille-journal";
const CLE_ATS = "veille-ats";
const CLE_CURSEUR = "veille-curseur";

/** Comparaison en temps constant, sur des empreintes de longueur fixe. */
function memeSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Le jour courant dans le fuseau de Marc.
 *
 * Vercel tourne en UTC : après 20 h locale, `toISOString()` donnerait DEMAIN, et toutes les
 * dates de repérage seraient décalées d'un jour. Le fuseau est explicite.
 */
function aujourdhuiQuebec(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function lireEtat<T>(cle: string, defaut: T): Promise<T> {
  const [ligne] = await db.select().from(syncState).where(eq(syncState.cle, cle));
  if (!ligne) return defaut;
  try {
    return JSON.parse(ligne.valeur) as T;
  } catch {
    // Un état illisible ne doit pas bloquer la veille à vie : on repart du défaut, et la
    // passe réécrira une valeur saine.
    return defaut;
  }
}

async function ecrireEtat(cle: string, valeur: unknown): Promise<void> {
  const v = JSON.stringify(valeur);
  const maj = await db
    .update(syncState)
    .set({ valeur: v, majLe: new Date() })
    .where(eq(syncState.cle, cle))
    .returning();
  if (maj.length === 0) {
    await db.insert(syncState).values({ cle, valeur: v }).onConflictDoNothing();
  }
}

export async function GET(requete: Request) {
  const attendu = process.env.CRON_SECRET;
  if (!attendu || attendu.trim() === "") {
    return NextResponse.json(
      { ok: false, erreur: "veille désactivée : CRON_SECRET absent" },
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

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, erreur: "base non configurée" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [connues, journal, ats, curseur] = await Promise.all([
      lireOffres(),
      lireEtat<JournalVeille>(CLE_JOURNAL, {}),
      lireEtat<AtsEntreprise[]>(CLE_ATS, []),
      lireEtat<number>(CLE_CURSEUR, 0),
    ]);

    if (connues === null) {
      return NextResponse.json(
        { ok: false, erreur: "offres illisibles" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const jour = aujourdhuiQuebec();
    const rapport = await executerPasse(connues, journal, ats, curseur, jour, recuperer);

    // Les nouvelles offres d'abord : si l'écriture du journal échoue ensuite, on aura
    // gagné des offres et rejoué une passe, pas perdu du travail.
    const nouvelles = rapport.offres.filter((o) => rapport.nouvelles.includes(o.id));
    for (const o of nouvelles) {
      await db.insert(offers).values({ ...colonnesOffre(o), majLe: new Date() });
      if (o.raisons.length > 0) {
        await db.insert(offerReasons).values(
          o.raisons.map((r, i) => ({ offerId: o.id, ton: r.ton, texte: r.texte, ordre: i })),
        );
      }
    }

    // Les péremptions : une DATE de constat, jamais un drapeau. Le suivi de Marc n'est pas
    // touché — la veille n'écrit que `perimeeLe` (garde-fou n°2).
    for (const id of rapport.perimees) {
      const o = rapport.offres.find((x) => x.id === id);
      if (o?.perimeeLe) {
        await db.update(offers).set({ perimeeLe: new Date(o.perimeeLe) }).where(eq(offers.id, id));
      }
    }
    for (const id of rapport.revenues) {
      await db.update(offers).set({ perimeeLe: null }).where(eq(offers.id, id));
    }

    await ecrireEtat(CLE_JOURNAL, rapport.journal);
    await ecrireEtat(CLE_CURSEUR, curseur + rapport.sources.length);

    return NextResponse.json(
      {
        ok: true,
        jour,
        resume: rapport.resume,
        trouvees: rapport.trouvees,
        nouvelles: rapport.nouvelles.length,
        perimees: rapport.perimees.length,
        revenues: rapport.revenues.length,
        enSursis: rapport.enSursis,
        ecartees: rapport.tri.souslePlancher,
        horsRegion: rapport.tri.horsRegion,
        lieuInconnu: rapport.tri.lieuInconnu,
        doublons: rapport.tri.doublons,
        // Le détail par source : sans lui, un total de zéro ne dit pas si le marché est
        // calme ou si les six sources sont muettes.
        sources: rapport.sources,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[cron/veille] passe impossible", err);
    return NextResponse.json(
      { ok: false, erreur: "passe impossible — voir les journaux du serveur" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
