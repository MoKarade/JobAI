// app/api/ingest/depot/route.ts — recevoir un lot d'offres, le trier, l'écrire.
//
// POURQUOI CETTE ROUTE EXISTE
// Une Routine claude.ai a le connecteur Indeed mais AUCUN accès au dépôt GitHub : son jeton
// est celui de la session, pas le compte de Marc (mesuré le 2026-07-31 — « Invalid username
// or token »). Ma session de développement, elle, a le dépôt mais aucun accès réseau
// sortant. Chacune détient la moitié de ce qu'il faut.
//
// Cette route règle le problème sans donner à personne ce qu'il n'a pas : la Routine ENVOIE
// ce qu'elle a trouvé, l'app fait le tri. Les offres vont en BASE, pas dans un commit — il
// n'y a donc plus rien à cloner ni à pousser.
//
// ⚠️ CE N'EST PAS UNE ENTORSE AU GARDE-FOU N°4
// Ce garde-fou interdit à l'app d'aller CHERCHER des offres ailleurs que par `lib/ingest/`.
// Ici l'app ne fait aucun `fetch` sortant : elle REÇOIT. La frontière réseau est inchangée,
// et le tri appliqué est exactement celui du cron — même filtre de région, même plancher,
// même dédoublonnage, même péremption.
//
// CE QU'ON NE FAIT JAMAIS CONFIANCE
// Le corps est écrit par un appelant automatique, sur des données venues d'un site tiers.
// Rien n'est repris tel quel : validation Zod stricte, bornes de taille, et la note est
// RECALCULÉE ici — jamais celle que l'appelant prétend. Un déposant compromis ne peut donc
// pas fabriquer une offre en tête de liste.

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { offerReasons, offers, syncState } from "@/lib/db/schema";
import { lireOffres } from "@/lib/donnees";
import { colonnesOffre } from "@/lib/persistance";
import { cleCanonique, trier, villesACompleter } from "@/lib/ingest/pipeline";
import { LotDeposeSchema } from "@/lib/ingest/depotSchema";
import { appliquerBalayage, type JournalVeille } from "@/lib/veille";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLE_JOURNAL = "veille-journal";

/**
 * Ce qu'un déposant a le droit d'envoyer — le MÊME schéma que le dépôt par fichier.
 *
 * ⚠️ IL VIVAIT ICI EN DOUBLE. Les deux canaux portent exactement le même contenu ; deux
 * définitions auraient dérivé, et c'est le canal le moins relu qui aurait gardé la version
 * la plus permissive. Le détail qui le prouve : `z.string().url()` acceptait
 * `javascript:…` des DEUX côtés — corrigé une fois, dans `lib/ingest/depotSchema.ts`.
 */
const LotSchema = LotDeposeSchema;

/** Comparaison à temps constant : un `===` sur un secret fuit sa longueur commune. */
function memeSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function lireJournal(): Promise<JournalVeille> {
  const [ligne] = await db.select().from(syncState).where(eq(syncState.cle, CLE_JOURNAL));
  if (!ligne) return {};
  try {
    return JSON.parse(ligne.valeur) as JournalVeille;
  } catch {
    return {};
  }
}

async function ecrireJournal(journal: JournalVeille): Promise<void> {
  const v = JSON.stringify(journal);
  const maj = await db
    .update(syncState)
    .set({ valeur: v, majLe: new Date() })
    .where(eq(syncState.cle, CLE_JOURNAL))
    .returning();
  if (maj.length === 0) {
    await db.insert(syncState).values({ cle: CLE_JOURNAL, valeur: v }).onConflictDoNothing();
  }
}

export async function POST(requete: Request) {
  // Échec fermé, comme le hub et le cron : une route qui ÉCRIT ne s'ouvre jamais parce
  // qu'une variable a été oubliée.
  const attendu = process.env.INGEST_TOKEN;
  if (!attendu || attendu.trim() === "") {
    return NextResponse.json(
      { ok: false, erreur: "dépôt désactivé : INGEST_TOKEN absent" },
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

  let lot: z.infer<typeof LotSchema>;
  try {
    lot = LotSchema.parse(await requete.json());
  } catch (err) {
    // Le détail des erreurs Zod est rendu : le déposant est un outil, pas un visiteur, et
    // « corps invalide » sans plus ne se débogue pas à distance.
    return NextResponse.json(
      {
        ok: false,
        erreur: "lot invalide",
        details: err instanceof z.ZodError ? err.issues.slice(0, 10) : undefined,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const connues = await lireOffres();
    if (connues === null) {
      return NextResponse.json(
        { ok: false, erreur: "offres illisibles" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const brutes = lot.offres.map((o) => ({ ...o, refSource: o.refSource || o.lien }));
    // ⚠️ DEUX CLÉS PAR OFFRE CONNUE (ADR-0006). L'`id` est l'identité écrite en base ; la clé
    // canonique reconnaît le même employeur écrit autrement par une AUTRE source. Elle se
    // dérive des champs stockés (`entreprise`, `poste`), jamais de l'`id` — sans quoi il
    // faudrait migrer la clé primaire de toutes les offres, et le rattachement des champs qui
    // appartiennent à Marc (garde-fou n°2) se perdrait au premier balayage.
    const dejaSuivies = new Set([
      ...connues.map((x) => x.id),
      ...connues.map((x) => cleCanonique(x.entreprise, x.poste)),
    ]);

    // EXACTEMENT le tri du cron : région d'abord, puis plancher d'adéquation, puis
    // dédoublonnage. Une seconde implémentation divergerait, et c'est le jeu de données
    // qui en paierait le prix.
    const tri = trier(brutes, dejaSuivies, lot.jour);

    for (const o of tri.retenues) {
      await db.insert(offers).values({ ...colonnesOffre(o), majLe: new Date() });
      if (o.raisons.length > 0) {
        await db.insert(offerReasons).values(
          o.raisons.map((r, i) => ({ offerId: o.id, ton: r.ton, texte: r.texte, ordre: i })),
        );
      }
    }

    // RATTRAPAGE DE LA VILLE SUR LES OFFRES DÉJÀ SUIVIES.
    //
    // La DÉCISION vit dans `villesACompleter` (pure, testée) : ce qu'on complète, ce qu'on
    // n'écrase jamais, et pourquoi un employeur non nommé n'y a pas droit. Ici il ne reste
    // que l'écriture. `ville` n'est pas un champ de Marc (garde-fou n°2), mais l'opération
    // reste la plus étroite possible : un seul champ, et seulement quand il est vide.
    const aCompleter = villesACompleter(brutes, connues);
    for (const { id, ville } of aCompleter) {
      await db.update(offers).set({ ville, majLe: new Date() }).where(eq(offers.id, id));
    }

    // La péremption réutilise `lib/veille.ts` sans rien réécrire : une offre déjà suivie que
    // ce dépôt vient de revoir voit son compteur d'absences remis à zéro, et une offre que
    // la veille n'a jamais vue n'est JAMAIS périmée.
    const journal = await lireJournal();
    const apresAjout = [...connues, ...tri.retenues];
    const idsDeposes = new Set(tri.retenues.map((o) => o.id));
    for (const b of brutes) {
      const proche = apresAjout.find(
        (o) =>
          o.entreprise.toLowerCase() === (b.entreprise || "").toLowerCase() &&
          o.poste.toLowerCase() === b.titre.toLowerCase(),
      );
      if (proche) idsDeposes.add(proche.id);
    }
    const vues = apresAjout.filter((o) => idsDeposes.has(o.id));
    const balayage = appliquerBalayage(apresAjout, vues, journal, lot.jour);

    for (const id of balayage.perimees) {
      const o = balayage.offres.find((x) => x.id === id);
      if (o?.perimeeLe) {
        await db.update(offers).set({ perimeeLe: new Date(o.perimeeLe) }).where(eq(offers.id, id));
      }
    }
    for (const id of balayage.revenues) {
      await db.update(offers).set({ perimeeLe: null }).where(eq(offers.id, id));
    }

    await ecrireJournal(balayage.journal);

    return NextResponse.json(
      {
        ok: true,
        source: lot.source,
        jour: lot.jour,
        recues: lot.offres.length,
        ajoutees: tri.retenues.length,
        // Chaque motif de refus est compté SÉPARÉMENT : « 40 reçues, 0 ajoutées » sans
        // détail ne dit pas si le filtre est trop strict ou si le lot était mauvais.
        horsRegion: tri.horsRegion,
        lieuInconnu: tri.lieuInconnu,
        sousLePlancher: tri.souslePlancher,
        doublons: tri.doublons,
        // Combien d'offres DÉJÀ suivies ont gagné leur ville grâce à ce dépôt. Compté et
        // rendu : un rattrapage muet ne se vérifierait pas, et c'est précisément ce qui a
        // permis à 40 offres de rester sans ville sans que rien ne le signale.
        villesCompletees: aCompleter.length,
        perimees: balayage.perimees.length,
        revenues: balayage.revenues.length,
        titres: tri.retenues.map((o) => `${o.score} — ${o.entreprise} — ${o.poste}`),
        // Chaque refus NOMMÉ avec son motif : un compte seul ne se vérifie pas, et il
        // faut pouvoir constater que le filtre n'a pas jeté la meilleure offre du jour.
        refusees: tri.refusees.map((r) => `${r.motif} — ${r.entreprise} — ${r.titre}`),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[ingest/depot] dépôt impossible", err);
    return NextResponse.json(
      { ok: false, erreur: "dépôt impossible — voir les journaux du serveur" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
