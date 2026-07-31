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
import { mesurerDistances } from "@/lib/actions";
import { CLE_DISTANCES, DELAI_MESURE_AUTO_MS, reserverPasse } from "@/lib/synchro";
import { executerPasse } from "@/lib/ingest/passe";
import { recuperer } from "@/lib/ingest/sources";
import type { AtsEntreprise } from "@/lib/ingest/types";
import type { JournalVeille } from "@/lib/veille";

export const dynamic = "force-dynamic";
/** La passe interroge une douzaine de sources en parallèle : il lui faut de la marge. */
export const maxDuration = 60;

const CLE_JOURNAL = "veille-journal";

/**
 * Employeurs situés par passage du cron.
 *
 * Douze : à 1,1 s entre deux requêtes Nominatim, une passe complète (villes + entreprises)
 * tient largement sous les 60 s de la fonction, ingestion comprise. C'est aussi ce qui fait
 * converger un stock de quarante employeurs en quelques nuits sans que Marc ouvre l'app —
 * les passes déclenchées par un affichage restent volontairement plus discrètes.
 */
const MAX_SITUATIONS_CRON = 8;

/**
 * Temps accordé au géocodage du cron, villes et entreprises confondues.
 *
 * Le plafond en NOMBRE ne borne pas la DURÉE — une revue l'a mesuré : deux séries de huit
 * requêtes valent ~80 s dans le pire cas (chacune peut aller jusqu'à `DELAI_MAX_REQUETE_MS`),
 * bien au-delà des 60 s de la fonction. Un mur atteint tue le processus sans exécuter le
 * moindre `catch` : ni trace, ni acquis enregistré. Vingt-cinq secondes laissent de la marge
 * à l'ingestion, qui passe AVANT et qui est l'essentiel.
 */
const BUDGET_GEOCODAGE_CRON_MS = 25_000;
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

    // Le rattrapage des villes manquantes : une offre déjà suivie que la source republie
    // apporte parfois la ville qu'elle n'avait pas. Sans elle, son employeur n'est pas
    // géocodable — donc sans distance et hors de la carte. La décision est prise par
    // `villesACompleter` (pure, testée), qui n'écrase jamais une ville connue.
    for (const { id, ville } of rapport.villesACompleter) {
      await db.update(offers).set({ ville, majLe: new Date() }).where(eq(offers.id, id));
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

    // LOCALISER ET MESURER, ICI AUSSI — sans quoi « toujours à jour » dépendrait de Marc.
    //
    // Les passes de géocodage et de mesure ne tournaient qu'APRÈS l'affichage d'une page :
    // une carte jamais ouverte ne se complétait jamais. Le cron, lui, passe chaque nuit
    // sans personne devant l'écran — c'est le seul endroit d'où le rattrapage avance tout
    // seul. Le débit y est plus large qu'après un affichage (personne n'attend la réponse),
    // mais la cadence vers Nominatim reste la même : 1,1 s entre deux requêtes.
    //
    // ⚠️ APRÈS l'ingestion et APRÈS l'écriture du journal, et dans son propre `try` : une
    // panne de géocodage ne doit jamais faire perdre les offres que la passe vient de
    // trouver. C'est du confort ; l'ingestion est l'essentiel.
    let localisation = "non tentée";
    try {
      // ⚠️ LA MÊME RÉSERVATION QUE LES PAGES, ET POUR LA MÊME RAISON.
      //
      // Le cron est un TROISIÈME déclencheur de la même action. Sans passer par
      // `reserverPasse`, une nuit où Marc consulte l'app ferait tourner deux flux
      // simultanés vers Nominatim — exactement la classe de bug corrigée le jour même sur
      // les deux `after()` de la carte, réintroduite par un chemin qui n'avait pas hérité
      // du verrou. Sauter une nuit est sans conséquence : la passe suivante reprend.
      if (await reserverPasse(db, CLE_DISTANCES, DELAI_MESURE_AUTO_MS, new Date())) {
        const m = await mesurerDistances({
          maxSituations: MAX_SITUATIONS_CRON,
          budgetGeocodageMs: BUDGET_GEOCODAGE_CRON_MS,
        });
        localisation = m.ok
          ? `${m.villesRattrapees} ville(s) rattrapée(s), ${m.situees} située(s), ${m.adressesRattrapees} adresse(s) récupérée(s), ${m.mesurees} mesurée(s)`
          : `refusée : ${m.erreur}`;
        if (!m.ok) console.error("[cron] localisation refusée :", m.erreur);
      } else {
        localisation = "sautée — une passe vient d'avoir lieu";
      }
    } catch (err) {
      console.error("[cron] localisation impossible", err);
      localisation = "échec — voir les journaux";
    }
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
        villesCompletees: rapport.villesACompleter.length,
        // Ce que la passe de localisation a fait — compté et dit : une carte qui ne se
        // remplit pas doit pouvoir se diagnostiquer sans ouvrir la base.
        localisation,
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
