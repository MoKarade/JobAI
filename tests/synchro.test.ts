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
import {
  CLE_SEED,
  DELAI_PASSE_AUTO_MS,
  PREFIXE_EN_COURS,
  empreinteSeed,
  reserverPasse,
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
