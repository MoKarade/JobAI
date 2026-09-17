// tests/synchro.test.ts — la synchronisation qui se déclenche sans qu'on la demande.
//
// Ce code écrit dans la base SANS que personne ne lance de commande. Deux conséquences :
//   - une erreur de fusion ne se verrait plus au moment d'un `npm run db:seed` qu'on
//     regarde, mais s'appliquerait toute seule, sur toutes les offres. D'où le test qui
//     prouve que l'empreinte ignore les champs de Marc : c'est lui qui garantit qu'un
//     changement de statut ne déclenche pas de réécriture ;
//   - une temporisation ratée ne se verrait pas non plus — elle se traduirait par un
//     martèlement de Nominatim, et par un bannissement qui tuerait la carte.
//
// La base est simulée : ces tests vérifient la DÉCISION (faut-il écrire ? a-t-on le droit
// de lancer une passe ?), pas le dialecte SQL.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Le source d'un fichier du dépôt — pour les gardes de câblage. */
function lire(chemin: string): string {
  return readFileSync(resolve(process.cwd(), chemin), "utf8");
}
import { appliquerSeed,
  CLE_SEED,
  DELAI_PASSE_AUTO_MS,
  PREFIXE_EN_COURS,
  empreinteSeed,
  reserverPasse,
  CLE_VEILLE,
  DELAI_RATTRAPAGE_VEILLE_MS,
  DELAI_VEILLE_MS,
} from "../lib/synchro";
import { SEED } from "../lib/seed";
import type { Offre } from "../lib/types";

describe("empreinte du jeu de départ", () => {
  it("est stable d'un appel à l'autre", () => {
    expect(empreinteSeed(SEED)).toBe(empreinteSeed(SEED));
  });

  it("change quand une offre est ajoutée", () => {
    const avant = empreinteSeed(SEED);
    const apres = empreinteSeed([...SEED, { ...SEED[0]!, id: "nouvelle-offre" }]);
    expect(apres).not.toBe(avant);
  });

  it("change quand une NOTE change — le compte d'offres, lui, ne bougerait pas", () => {
    // C'est la raison d'être de l'empreinte plutôt que d'un simple compte : une note
    // corrigée doit se propager, sinon la base sert l'ancienne version en silence.
    const modifie = [...SEED];
    modifie[0] = { ...modifie[0]!, score: (modifie[0]!.score ?? 0) + 1 };
    expect(empreinteSeed(modifie)).not.toBe(empreinteSeed(SEED));
    expect(modifie).toHaveLength(SEED.length);
  });

  it("change quand une justification est réécrite", () => {
    const modifie = [...SEED];
    modifie[0] = {
      ...modifie[0]!,
      raisons: [{ ton: "atout", texte: "texte réécrit après relecture" }],
    };
    expect(empreinteSeed(modifie)).not.toBe(empreinteSeed(SEED));
  });

  it("change quand une VILLE change", () => {
    // Le champ avait été oublié de l'empreinte — cinquième liste de champs recopiée à la
    // main dans ce dépôt, cinquième occasion d'en perdre un. Sans ce test, corriger la
    // ville d'une offre du jeu de départ laisserait l'empreinte identique : la synchro
    // répondrait « à jour » et la correction ne partirait jamais en base. Mesuré avant le
    // correctif : les deux empreintes étaient rigoureusement égales.
    const modifie = [...SEED];
    modifie[0] = { ...modifie[0]!, ville: "Ville Différente" };
    expect(empreinteSeed(modifie)).not.toBe(empreinteSeed(SEED));
  });

  it("IGNORE les champs de Marc : son suivi ne déclenche jamais de réécriture", () => {
    // Garde-fou n°2 vu sous l'angle du déclenchement. Si l'empreinte prenait `statut`,
    // cocher « CV envoyé » ferait croire à un jeu de départ modifié et relancerait une
    // écriture complète — à chaque geste de Marc.
    const suivi: Offre[] = SEED.map((o) => ({
      ...o,
      statut: "CVenvoye",
      priorite: "Haute",
      dateEnvoi: "2026-07-30",
      userNote: "relancé",
    }));
    expect(empreinteSeed(suivi)).toBe(empreinteSeed(SEED));
  });

  it("distingue le verrou de l'empreinte elle-même", () => {
    // Le verrou vaut `en-cours:<empreinte>` : il ne doit jamais être confondu avec la
    // valeur finale, sinon une application interrompue passerait pour terminée.
    const e = empreinteSeed(SEED);
    expect(`${PREFIXE_EN_COURS}${e}`).not.toBe(e);
    expect(CLE_SEED).toBe("seed");
  });
});

/** Une base simulée réduite à ce que `reserverPasse` utilise. */
function baseSimulee(depart: { cle: string; valeur: string } | null) {
  const etat = depart ? { ...depart } : null;
  let courant = etat;
  const journal: string[] = [];

  const db = {
    select: () => ({
      from: () => ({
        where: async () => (courant ? [courant] : []),
      }),
    }),
    insert: () => ({
      values: (v: { cle: string; valeur: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (courant) return [];
            courant = { cle: v.cle, valeur: v.valeur };
            journal.push(`insert:${v.valeur}`);
            return [courant];
          },
        }),
      }),
    }),
    update: () => ({
      set: (v: { valeur: string }) => ({
        where: () => ({
          returning: async () => {
            courant = { cle: courant!.cle, valeur: v.valeur };
            journal.push(`update:${v.valeur}`);
            return [courant];
          },
        }),
      }),
    }),
  };

  return { db: db as never, journal, lire: () => courant };
}

describe("temporisation des passes automatiques", () => {
  const CLE = "geocodage-auto";
  const t0 = new Date("2026-07-30T12:00:00Z");

  it("accorde la toute première passe", async () => {
    const { db, lire } = baseSimulee(null);
    expect(await reserverPasse(db, CLE, DELAI_PASSE_AUTO_MS, t0)).toBe(true);
    expect(lire()?.valeur).toBe(String(t0.getTime()));
  });

  it("REFUSE une seconde passe trop rapprochée", async () => {
    // Le cas réel : Marc recharge la carte trois fois de suite. Sans ce refus, chaque
    // rechargement enverrait une salve à Nominatim.
    const { db } = baseSimulee({ cle: CLE, valeur: String(t0.getTime()) });
    const uneMinutePlusTard = new Date(t0.getTime() + 60_000);
    expect(await reserverPasse(db, CLE, DELAI_PASSE_AUTO_MS, uneMinutePlusTard)).toBe(false);
  });

  it("accorde de nouveau une fois le délai écoulé", async () => {
    const { db } = baseSimulee({ cle: CLE, valeur: String(t0.getTime()) });
    const apres = new Date(t0.getTime() + DELAI_PASSE_AUTO_MS + 1);
    expect(await reserverPasse(db, CLE, DELAI_PASSE_AUTO_MS, apres)).toBe(true);
  });

  it("juste avant l'échéance, refuse encore", async () => {
    // Cas DÉRIVÉ de la constante, jamais d'une valeur du jour : codé « 5 minutes », il
    // mentirait au premier ajustement du délai.
    const { db } = baseSimulee({ cle: CLE, valeur: String(t0.getTime()) });
    const juste = new Date(t0.getTime() + DELAI_PASSE_AUTO_MS - 1);
    expect(await reserverPasse(db, CLE, DELAI_PASSE_AUTO_MS, juste)).toBe(false);
  });

  it("une valeur illisible ne bloque pas la veille à vie", async () => {
    const { db } = baseSimulee({ cle: CLE, valeur: "corrompu" });
    expect(await reserverPasse(db, CLE, DELAI_PASSE_AUTO_MS, t0)).toBe(true);
  });

  it("sans base, aucune passe — jamais un défaut permissif", async () => {
    expect(await reserverPasse(null, CLE, DELAI_PASSE_AUTO_MS, t0)).toBe(false);
  });

  it("si la base refuse la réservation, la passe n'a PAS lieu", async () => {
    // Le défaut sûr est l'inaction : un échec de la borne ne doit pas ouvrir la porte au
    // martèlement que la borne existe pour empêcher.
    const dbCasse = {
      select: () => ({
        from: () => ({
          where: async () => {
            throw new Error("base injoignable");
          },
        }),
      }),
    } as never;
    expect(await reserverPasse(dbCasse, CLE, DELAI_PASSE_AUTO_MS, t0)).toBe(false);
  });
});

describe("appliquerSeed n'écrit QUE le jeu de départ (fix du 2026-08-12)", () => {
  // ⚠️ LE BUG QUE CE TEST FERME, trouvé par revue adversariale : l'ancien code mappait
  // TOUTES les lignes de la base et fabriquait un stub `{} as Offre` pour une offre
  // INGÉRÉE PAR LA VEILLE (hors seed) — sans `raisons`. La boucle d'écriture faisait
  // `db.delete(offerReasons)` PUIS `o.raisons.length` → TypeError : la synchro crashait
  // au premier changement d'empreinte dès qu'une offre ingérée existait, après avoir
  // écrit une partie du lot. Le fake db ci-dessous journalise chaque opération : on prouve
  // à la fois l'absence de crash ET que l'offre ingérée n'est jamais touchée.
  function fakeDb(lignesExistantes: { id: string }[]) {
    const operations: string[] = [];
    const thenable = (nom: string) => ({
      set: (_v: unknown) => ({ where: (_c: unknown) => { operations.push(nom); return Promise.resolve(); } }),
      values: (_v: unknown) => { operations.push(nom); return Promise.resolve(); },
      where: (_c: unknown) => { operations.push(nom); return Promise.resolve(); },
    });
    const db = {
      select: () => ({ from: () => Promise.resolve(lignesExistantes) }),
      update: (_t: unknown) => thenable("update"),
      insert: (_t: unknown) => thenable("insert"),
      delete: (_t: unknown) => thenable("delete"),
    };
    return { db: db as never, operations };
  }

  it("une offre ingérée par la veille (hors seed) ne crashe plus la synchro, et n'est pas réécrite", async () => {
    const duSeed = SEED[0]!;
    const ingeree = {
      id: "qualtech-technicien-automatisation",
      statut: "reperee", priorite: null, dateEnvoi: null, userNote: null,
    };
    const { db, operations } = fakeDb([
      { id: duSeed.id, statut: duSeed.statut, priorite: null, dateEnvoi: null, userNote: null } as never,
      ingeree as never,
    ]);
    // L'ancien code levait TypeError ici. Le nouveau doit finir, et n'écrire que le seed.
    const r = await appliquerSeed(db);
    expect(r.majs + r.crees).toBe(SEED.length);
    // Chaque offre écrite = 1 update/insert + 1 delete (raisons) [+ 1 insert raisons] :
    // si l'ingérée était traitée, on verrait AU MOINS une opération de plus que le seed
    // n'en justifie. Borne : ≤ 3 opérations par offre du SEED, aucune pour l'ingérée.
    expect(operations.length).toBeLessThanOrEqual(SEED.length * 3);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REPRISE DE LA VEILLE — le filet posé le 2026-08-14.
 *
 * ⚠️ CE N'EST PAS UN TEST DE PRINCIPE : il verrouille la correction d'une panne RÉELLE.
 * Le cron Vercel `/api/cron/veille` (15:00 UTC) a cessé d'être appelé pendant au moins
 * trois jours — absent des journaux les 12, 13 et 14 août — pendant que celui de géocodage
 * (03:00) tournait chaque nuit avec son compte rendu. Personne ne pouvait le savoir : les
 * offres cessent simplement de se rafraîchir.
 *
 * Depuis, le cron de géocodage REPREND la passe quand elle est en retard, et c'est la
 * réservation qui empêche les deux de la faire le même jour. Les deux tests ci-dessous
 * couvrent les deux régimes — celui où le cron de veille marche, et celui où il est mort.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("reprise de la veille par le cron de géocodage", () => {
  const H = 60 * 60 * 1000;

  // ⚠️ CES DEUX TESTS ONT CHANGÉ D'OBJET LE 2026-08-17, ET C'EST UNE DÉCISION, PAS UNE
  // CONCESSION. Ils encodaient une politique — « les deux crons ne doivent pas tous les deux
  // lancer la passe » — dont la seule justification était que `appliquerBalayage` comptait
  // les absences PAR PASSE : deux passes par jour vieillissaient le stock deux fois.
  //
  // Le compteur compte désormais des JOURS (`SuiviVeille.derniereAbsence`, verrouillé par
  // tests/veille.test.ts). Une deuxième passe le même jour ne vieillit plus rien : elle est
  // au pire inutile, jamais nuisible. La politique n'a donc plus de raison d'être, et le
  // délai de vingt heures n'avait plus qu'un effet observable — empêcher Marc de relancer sa
  // propre veille depuis l'app.
  //
  // Ce qui RESTE à protéger est plus étroit et n'a pas bougé : deux invocations SIMULTANÉES
  // écriraient les mêmes offres en même temps. C'est ce que les tests ci-dessous éprouvent.
  it("le délai couvre une passe entière, sans jamais se faire sentir à l'usage", () => {
    // Une passe dure quelques secondes (mesuré). Le délai doit la couvrir largement pour
    // qu'une seconde invocation tombe pendant la première, et rester assez court pour qu'un
    // clic volontaire de Marc ne soit jamais refusé. Bornes dérivées de ces deux exigences,
    // jamais recopiées depuis la valeur du jour.
    const DUREE_PASSE_OBSERVEE = 10 * 1000;
    expect(DELAI_VEILLE_MS).toBeGreaterThan(DUREE_PASSE_OBSERVEE);
    expect(DELAI_VEILLE_MS).toBeLessThan(2 * 60 * 1000);
  });

  it("RELANÇABLE À VOLONTÉ : une passe d'il y a une minute ne bloque plus rien", async () => {
    const passe = new Date("2026-08-14T15:00:00Z");
    const { db } = baseSimulee({ cle: CLE_VEILLE, valeur: String(passe.getTime()) });

    // Le geste que le verrou de vingt heures refusait : Marc relance sa veille peu après.
    const relance = new Date(passe.getTime() + 60 * 1000);
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, relance)).toBe(true);
  });

  it("mais deux invocations dans la même seconde ne passent pas toutes les deux", async () => {
    const passe = new Date("2026-08-14T15:00:00Z");
    const { db } = baseSimulee({ cle: CLE_VEILLE, valeur: String(passe.getTime()) });
    const aussitot = new Date(passe.getTime() + 1000);
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, aussitot)).toBe(false);
  });

  it("QUAND LE CRON DE VEILLE EST MORT : le géocodage la reprend dès la nuit suivante", async () => {
    // Le cas vécu. Dernière passe il y a trois jours, plus rien depuis.
    const derniere = new Date("2026-08-11T15:00:00Z");
    const { db } = baseSimulee({ cle: CLE_VEILLE, valeur: String(derniere.getTime()) });

    const nuit1 = new Date("2026-08-14T03:00:00Z");
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_RATTRAPAGE_VEILLE_MS, nuit1)).toBe(true);
  });

  it("⚠️ QUAND TOUT VA BIEN : le filet ne part PAS, et c'est ce qu'il avait cessé de faire", () => {
    // ⚠️ CE TEST A CHANGÉ DE CONCEPTION LE 2026-09-17, ET CE N'EST PAS UN RE-BASEMENT
    // (`[VEILLE-13]`). Il affirmait « le géocodage la reprend CHAQUE JOUR », et son propre
    // commentaire l'avouait : « ce test ne vérifie plus un arbitrage entre crons ». C'était
    // la description d'un défaut, pas d'une intention : le filet employait
    // `DELAI_VEILLE_MS`, qui valait 20 h quand il a été écrit et qui est passé à 45 s pour
    // une raison SANS RAPPORT (l'anti-rafale du bouton). Sa condition est devenue toujours
    // vraie — « veille en retard » écrit chaque nuit alors que rien ne l'était, et le chemin
    // de géocodage dédié jamais emprunté.
    //
    // La forme est déclarative, pas une simulation de base : c'est l'ARITHMÉTIQUE du seuil
    // qui décide, et elle se lit mieux que trois `reserverPasse` enchaînés.
    const ECART_CRONS_H = 16; // 11:00 → 03:00, cf. `vercel.json`
    const AGE_APRES_UN_TOUR_MANQUE_H = ECART_CRONS_H + 24;

    // Une nuit normale : la veille d'hier a 16 h, le filet doit se taire.
    expect(DELAI_RATTRAPAGE_VEILLE_MS).toBeGreaterThan(ECART_CRONS_H * H);
    // Un tour manqué : à la nuit SUIVANTE la veille a 40 h, le filet doit partir.
    expect(DELAI_RATTRAPAGE_VEILLE_MS).toBeLessThan(AGE_APRES_UN_TOUR_MANQUE_H * H);
    // Et il reste une vraie marge au-dessus du plancher : le plan hobby fait partir le cron
    // DANS L'HEURE (mesuré à 11:31), ce qui raccourcit l'écart — un seuil collé à 16 h
    // repartirait chaque nuit au premier cron un peu tardif.
    expect(DELAI_RATTRAPAGE_VEILLE_MS - ECART_CRONS_H * H).toBeGreaterThanOrEqual(2 * H);
  });

  it("⚠️ les deux questions ne partagent plus une constante", () => {
    // La cause racine, verrouillée : `DELAI_VEILLE_MS` répond à « une passe tourne-t-elle
    // en ce moment ? », le filet à « la veille a-t-elle manqué son tour ? ». Un seul nombre
    // pour deux questions, et la seconde se casse quand on règle la première.
    expect(DELAI_RATTRAPAGE_VEILLE_MS).not.toBe(DELAI_VEILLE_MS);
    // Et la route du géocodage emploie bien le SECOND : sans ça, la constante existerait
    // sans que rien ne la lise — un correctif vert et mort à l'arrivée.
    //
    // ⚠️ ANCRÉE SUR L'APPEL, PAS SUR L'ABSENCE DU NOM DANS LE FICHIER. Mon premier jet
    // écrivait `not.toContain("DELAI_VEILLE_MS")` et rougissait sur MON PROPRE COMMENTAIRE,
    // qui raconte le défaut et doit donc nommer l'ancienne constante. Une garde d'absence
    // sur du source contredit mécaniquement une bonne explication : ce qui se vérifie, c'est
    // ce que le code APPELLE.
    const route = lire("app/api/cron/geocodage/route.ts");
    expect(route).toMatch(/reserverPasse\(\s*db,\s*CLE_VEILLE,\s*DELAI_RATTRAPAGE_VEILLE_MS/);
    expect(route).not.toMatch(/reserverPasse\([^)]*\bDELAI_VEILLE_MS\b/);
  });

  it("deux déclencheurs simultanés : un seul passe", async () => {
    // Le jour où le cron de veille revient, les deux chemins existent. La réservation est
    // conditionnelle sur la valeur lue : c'est elle, et non l'ordre d'arrivée, qui tranche.
    const { db } = baseSimulee(null);
    const t = new Date("2026-08-15T03:00:00Z");
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, t)).toBe(true);
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, t)).toBe(false);
  });
});
