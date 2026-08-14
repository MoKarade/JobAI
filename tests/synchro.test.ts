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
import { appliquerSeed,
  CLE_SEED,
  DELAI_PASSE_AUTO_MS,
  PREFIXE_EN_COURS,
  empreinteSeed,
  reserverPasse,
  CLE_VEILLE,
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

  it("le délai tient entre les deux crons — ni double passe, ni jour sauté", () => {
    // Les deux crons sont à 12 h d'écart (veille 15:00 UTC, géocodage 03:00). Le délai est
    // contraint des DEUX côtés, et ces bornes sont la seule raison de sa valeur :
    //   · > 12 h, sinon le géocodage relancerait une passe une demi-journée après la veille ;
    //   · < 24 h, sinon la passe quotidienne se ferait refuser d'un cheveu.
    // Dérivé de l'écart réel, jamais recopié depuis la valeur du jour.
    const ECART_ENTRE_CRONS = 12 * H;
    expect(DELAI_VEILLE_MS).toBeGreaterThan(ECART_ENTRE_CRONS);
    expect(DELAI_VEILLE_MS).toBeLessThan(24 * H);
  });

  it("QUAND LE CRON DE VEILLE MARCHE : le géocodage ne reprend rien", async () => {
    const veille = new Date("2026-08-14T15:00:00Z");
    const { db } = baseSimulee({ cle: CLE_VEILLE, valeur: String(veille.getTime()) });

    // Le géocodage passe 12 h plus tard. La veille a eu lieu : il ne doit PAS la refaire.
    const geocodage = new Date(veille.getTime() + 12 * H);
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, geocodage)).toBe(false);

    // Et le lendemain, la veille reprend la main normalement (24 h après la précédente).
    const lendemain = new Date(veille.getTime() + 24 * H);
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, lendemain)).toBe(true);
  });

  it("QUAND LE CRON DE VEILLE EST MORT : le géocodage la reprend, chaque jour", async () => {
    // Le cas vécu. Dernière passe il y a trois jours, plus rien depuis.
    const derniere = new Date("2026-08-11T15:00:00Z");
    const { db } = baseSimulee({ cle: CLE_VEILLE, valeur: String(derniere.getTime()) });

    const nuit1 = new Date("2026-08-14T03:00:00Z");
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, nuit1)).toBe(true);

    // Et le régime est STABLE : 24 h plus tard, il reprend encore. Un délai mal choisi
    // (25 h par exemple) donnerait une passe tous les deux jours, sans que rien ne le dise.
    const nuit2 = new Date(nuit1.getTime() + 24 * H);
    expect(await reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, nuit2)).toBe(true);
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
