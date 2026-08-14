// lib/veilleComplete.ts — la passe de veille entière, appelable par PLUSIEURS déclencheurs.
//
// ⚠️ POURQUOI CE MODULE EXISTE — un défaut MESURÉ, pas une précaution de principe.
//
// Le 2026-08-14, la veille quotidienne ne tournait plus. Constaté dans les journaux Vercel :
// `/api/cron/veille` (planifié à 15:00 UTC) n'apparaît NI le 12, NI le 13, NI le 14, alors
// que `/api/cron/geocodage` (03:00 UTC) y figure chaque jour avec son compte rendu complet.
// Les deux crons sont déclarés côte à côte dans le même `vercel.json`, les deux routes sont
// structurellement identiques (`dynamic`, `maxDuration`, même garde `autoriserCron`). La
// cause exacte est côté Vercel et n'est pas lisible depuis le dépôt.
//
// LE VRAI DÉFAUT N'EST PAS LÀ. Il est qu'une fonction quotidienne dépendait d'un
// déclencheur UNIQUE dont le silence ne se voit pas : les offres cessent simplement de se
// rafraîchir, l'app continue d'afficher les anciennes, la péremption les éteint une par une,
// et rien ne dit pourquoi. Trois jours ont passé sans que personne le sache.
//
// D'où ce module : la passe devient appelable par n'importe quel déclencheur, et le cron de
// géocodage — dont on a la PREUVE qu'il tourne — la reprend quand elle est en retard.
// Le jour où le cron de veille revient, il la reprend naturellement : c'est la RÉSERVATION
// (`CLE_VEILLE`) qui arbitre, pas l'ordre des déclencheurs.
//
// CE QUI A ÉTÉ DÉPLACÉ ICI EST VERBATIM depuis `app/api/cron/veille/route.ts` : mêmes
// écritures, même ordre, mêmes commentaires. Le seul changement est la frontière — la route
// garde l'authentification et la mise en forme HTTP, le module fait le travail.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { entreprisesLieux, offerReasons, offers, syncState } from "./db/schema";
import { lireOffres } from "./donnees";
import { colonnesOffre } from "./persistance";
import { mesurerDistances } from "./actions";
import { EPOQUE_A_RETENTER } from "./travaux";
import { CLE_DISTANCES, DELAI_MESURE_AUTO_MS, reserverPasse } from "./synchro";
import { MAX_SITUATIONS_CRON, BUDGET_GEOCODAGE_CRON_MS } from "./geocodageCron";
import { executerPasse } from "./ingest/passe";
import { recuperer } from "./ingest/sources";
import type { AtsEntreprise } from "./ingest/types";
import type { JournalVeille } from "./veille";

export const CLE_JOURNAL = "veille-journal";
const CLE_ATS = "veille-ats";
const CLE_CURSEUR = "veille-curseur";

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

/** Le compte rendu d'une passe — ou la raison nommée de son refus. */
export type ResultatVeille =
  | { ok: true; declencheur: string; compte: Record<string, unknown> }
  | { ok: false; statut: number; erreur: string };

/**
 * Exécute la passe de veille complète : ingestion, péremption, localisation.
 *
 * `declencheur` n'est pas décoratif : il part dans le compte rendu et dans les journaux.
 * Quand deux chemins peuvent lancer la même passe, savoir LEQUEL l'a lancée est la première
 * question qu'on se pose en cas d'anomalie — et la seule qu'un journal muet ne répond pas.
 */
export async function executerVeilleComplete(declencheur: string): Promise<ResultatVeille> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, statut: 503, erreur: "base non configurée" };
  }

  try {
    const [connues, journal, ats, curseur] = await Promise.all([
      lireOffres(),
      lireEtat<JournalVeille>(CLE_JOURNAL, {}),
      lireEtat<AtsEntreprise[]>(CLE_ATS, []),
      lireEtat<number>(CLE_CURSEUR, 0),
    ]);

    if (connues === null) {
      return { ok: false, statut: 503, erreur: "offres illisibles" };
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
    // ⚠️ L'ADRESSE ANNONCÉE, ÉCRITE LÀ OÙ ELLE SERT, ET JAMAIS PAR-DESSUS UNE AUTRE.
    //
    // Mesuré le 2026-08-06 sur deux annonces Indeed réelles : l'une porte un numéro
    // civique, une voie et un code postal complets (elle les répète même deux fois),
    // l'autre n'écrit que « Lieu du poste : En présentiel ». Le canal existe sans être
    // garanti — d'où un rattrapage strictement additif, sur les seules lignes dont
    // `adresse` est NULLE. Écraser une adresse d'OpenStreetMap (un objet cartographié à sa
    // position) par un texte d'annonce serait un recul de qualité déguisé en mise à jour.
    //
    // `geocodeLe` remis à l'époque de retente pour la même raison que le registre : la
    // question « OSM connaît-il cette entreprise ? » vient de changer — on tient désormais
    // une adresse civique, et le raffinage la posera à la place du nom. Sans ça,
    // l'information resterait inutilisée sept jours.
    let adressesAnnoncees = 0;
    for (const { entreprise, adresse, source } of rapport.adresses) {
      const maj = await db
        .update(entreprisesLieux)
        .set({ adresse, adresseSource: source, geocodeLe: EPOQUE_A_RETENTER })
        .where(and(eq(entreprisesLieux.nom, entreprise), isNull(entreprisesLieux.adresse)))
        .returning({ nom: entreprisesLieux.nom });
      adressesAnnoncees += maj.length;
    }

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

    // ⚠️ CETTE LIGNE EXISTE PARCE QU'UN « −2 » A COÛTÉ UNE ENQUÊTE (2026-08-14).
    //
    // Tous ces nombres étaient DÉJÀ calculés — ils partaient dans la réponse JSON, que
    // personne ne lit quand la passe est déclenchée par le planificateur ou par un bouton
    // du tableau de bord. Marc a vu son compte d'offres BAISSER après une veille, et il a
    // fallu remonter le code et les logs de localisation pour établir ce que la ligne
    // ci-dessous dit en un coup d'œil : la passe INGÈRE et PÉRIME dans le même run, et
    // seul l'écart des deux explique le solde.
    //
    // Elle est émise à CHAQUE passe, même vide, parce que « 0/0 » et « 0/31 » disent des
    // choses OPPOSÉES : la première qu'il n'y avait rien à faire, la seconde que tout a
    // été écarté. Un travail de fond qui ne journalise que ses échecs est indiagnosticable.
    console.log(
      `[veille] ${declencheur} — ingérées=${rapport.nouvelles.length}/${rapport.trouvees}` +
        ` périmées=${rapport.perimees.length} revenues=${rapport.revenues.length}` +
        ` doublons=${rapport.tri.doublons} hors-région=${rapport.tri.horsRegion}` +
        ` sous-plancher=${rapport.tri.souslePlancher} lieu-inconnu=${rapport.tri.lieuInconnu}` +
        ` en-sursis=${rapport.enSursis} sources=${rapport.sources.length}`,
    );

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
          ? `${m.placees} placée(s) au centre-ville, ${m.villesRattrapees} ville(s) rattrapée(s), ${m.situees} située(s), ${m.adressesRattrapees} adresse(s) récupérée(s), ${m.precisees} précisée(s), ${m.bornesMesurees} borne(s) mesurée(s), ${m.detailsEnrichis} fiche(s) enrichie(s), ${m.mesurees} mesurée(s)`
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

    return {
      ok: true,
      declencheur,
      compte: {
        jour,
        resume: rapport.resume,
        trouvees: rapport.trouvees,
        adressesAnnoncees,
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
    };
  } catch (err) {
    console.error(`[veille:${declencheur}] passe impossible`, err);
    return { ok: false, statut: 500, erreur: "passe impossible — voir les journaux du serveur" };
  }
}
