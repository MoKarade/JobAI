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
import { idOffre, trier } from "@/lib/ingest/pipeline";
import { appliquerBalayage, type JournalVeille } from "@/lib/veille";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLE_JOURNAL = "veille-journal";

/**
 * Ce qu'un déposant a le droit d'envoyer.
 *
 * Volontairement PAUVRE : ni note, ni priorité, ni statut. Ce sont des jugements, et ils se
 * calculent ici à partir de ce que le barème sait faire — pas à partir de ce qu'un appelant
 * affirme. Les bornes de taille évitent qu'un lot malformé fasse tomber la route.
 */
const OffreDeposeeSchema = z.object({
  titre: z.string().min(1).max(200),
  entreprise: z.string().max(120).default(""),
  ville: z.string().max(120).default(""),
  lien: z.string().url().max(500),
  description: z.string().max(20_000).default(""),
  publieeLe: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  refSource: z.string().max(200).default(""),
});

const LotSchema = z.object({
  /** D'où vient ce lot. Apparaît dans le rapport : un dépôt anonyme ne se débogue pas. */
  source: z.string().min(1).max(60),
  /** Date du balayage (AAAA-MM-JJ), dans le fuseau de Marc. */
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  offres: z.array(OffreDeposeeSchema).max(300),
});

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
    const dejaSuivies = new Set(connues.map((x) => x.id));

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
    // Une offre déjà en base est comptée « doublon » et le lot n'en fait plus rien — ce qui
    // était juste tant que le dépôt n'apportait aucune information nouvelle. Ce n'est plus
    // vrai : les 40 premières offres déposées ont été écrites AVANT que la colonne `ville`
    // soit remplie, et sans ville un employeur hors des entreprises cibles ne peut pas être
    // géocodé — il reste sans distance et absent de la carte, à vie. Le même dépôt rejoué
    // porte pourtant la ville manquante.
    //
    // ON COMPLÈTE, ON N'ÉCRASE JAMAIS : seule une ville ABSENTE est écrite. Une ville déjà
    // connue vient d'une source antérieure et n'a pas à être remplacée par un lot plus
    // récent — et `ville` n'est pas un champ de Marc (garde-fou n°2), mais l'opération
    // reste volontairement la plus étroite possible : un seul champ, et seulement quand il
    // est vide.
    const parId = new Map(connues.map((o) => [o.id, o]));
    const villesEcrites = new Set<string>();

    for (const b of brutes) {
      const ville = b.ville.trim();
      if (ville === "") continue;

      const id = idOffre(b.entreprise.trim() || "Employeur non nommé", b.titre);
      const existante = parId.get(id);
      if (!existante || existante.ville !== null || villesEcrites.has(id)) continue;

      await db.update(offers).set({ ville, majLe: new Date() }).where(eq(offers.id, id));
      villesEcrites.add(id);
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
        villesCompletees: villesEcrites.size,
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
