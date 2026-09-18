// tests/actionsReglages.test.ts — les trois Server Actions de réglage qui n'avaient aucun
// verrou : le rayon, les métiers du flux, et l'analyse de marché.
//
// POURQUOI CE FICHIER EXISTE (`[ACTIONS-01]`)
//
// Cinq modules `lib/actions*.ts` portent des Server Actions ; DEUX étaient testés
// (`actionsVeille`, `actionsTrajet`) et trois ne l'étaient pas. C'est la signature d'un
// patron appliqué à côté mais pas ici — le risque était connu, traité deux fois, et les
// trois voisins oubliés.
//
// CE QUI EST VERROUILLÉ, ET LA CONSÉQUENCE DE CHAQUE INVARIANT :
//
// 1. **La session est revérifiée, et le refus arrive AVANT toute écriture.** `lib/session.ts`
//    le dit en toutes lettres : « une Server Action n'est pas une route, c'est un point
//    d'entrée POST appelable directement ». C'était une promesse en commentaire. Pour
//    `lancerAnalyseMarche` la conséquence est chiffrable : l'action fait un appel FACTURÉ.
// 2. **L'ordre des deux écritures de `reglerRayon`.** Le rayon d'abord, le registre re-jugé
//    ensuite — le module explique pourquoi sur huit lignes, et rien ne le tenait. Inversé, on
//    laisse un registre jugé sous un rayon jamais écrit : incohérent avec l'écran, et rien ne
//    le rattrape.
// 3. **Un refus de validation n'écrit rien.** Saisie hors bornes, trop de codes : l'action
//    sort avant l'état. Un refus qui arrive APRÈS l'écriture est décoratif.
// 4. **Une saisie partiellement illisible garde sa part valide ET rend ses rejets.** Les deux
//    moitiés sont délibérées et écrites dans le module ; en perdre une trompe Marc dans un
//    sens ou dans l'autre.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CLE_RAYON } from "@/lib/rayon";
import { CLE_METIERS } from "@/lib/metiersRetenus";
import { CLE_HISTORIQUE } from "@/lib/historiqueVeille";
import { CLE_ANALYSE } from "@/lib/analyseConservee";
import { PASSES_MINIMUM } from "@/lib/analyseMarche";
import type { LieuJuge } from "@/lib/ingest/lieux";

// ⚠️ LES CLÉS SE DÉRIVENT DE LEUR CONSTANTE, JAMAIS DE LEUR VALEUR DU JOUR. Premier jet :
// j'avais écrit `"rayon"` et `"metiers"` de mémoire ; les vraies valent `veille-rayon` et
// `veille-metiers`. Un test qui recopie une valeur ment au premier renommage.
const CLE_LIEUX_SIMULEE = "veille-lieux";

/** Ce que la session répond. Basculé par test — c'est le levier de la garde n°1. */
let sessionValide = true;

/** Tout ce qui a été ÉCRIT ou APPELÉ, dans l'ordre. C'est l'observation, pas le retour. */
const appels: string[] = [];

/** L'état simulé, lu par `lireEtat`. */
let etat: Record<string, unknown> = {};

/** Ce que l'appel payant rend, et ce que l'historique contient. */
let reponseLlm: { ok: true; texte: string; tronquee: boolean } | { ok: false; raison: string } = {
  ok: true,
  texte: "Le marché est stable.",
  tronquee: false,
};

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  exigerSession: async () => {
    if (!sessionValide) throw new Error("pas de session");
  },
}));
/** Faire échouer l'écriture d'état, pour un seul cas. */
let ecritureCasse = false;
vi.mock("@/lib/etat", () => ({
  lireEtat: async (cle: string, defaut: unknown) => (cle in etat ? etat[cle] : defaut),
  ecrireEtat: async (cle: string, valeur: unknown) => {
    appels.push(`ecrireEtat(${cle})`);
    if (ecritureCasse) throw new Error("base injoignable");
    etat[cle] = valeur;
  },
}));
// `actionsRayon` n'en tire qu'une CLÉ ; l'importer vraiment chargerait toute la veille.
// Ce que ce fichier teste est l'ORDRE des deux écritures, pas le nom de la seconde clé.
vi.mock("@/lib/veilleComplete", () => ({ CLE_LIEUX: CLE_LIEUX_SIMULEE }));
vi.mock("@/lib/analyseMarcheLlm", () => ({
  analyserMarche: async () => {
    appels.push("analyserMarche(PAYANT)");
    return reponseLlm;
  },
}));

beforeEach(() => {
  sessionValide = true;
  ecritureCasse = false;
  appels.length = 0;
  etat = {};
  reponseLlm = { ok: true, texte: "Le marché est stable.", tronquee: false };
});

describe("reglerRayon", () => {
  it("⚠️ sans session : refuse, et n'a RIEN écrit", async () => {
    sessionValide = false;
    const { reglerRayon } = await import("@/lib/actionsRayon");
    const r = await reglerRayon("40");
    expect(r).toEqual({ ok: false, erreur: "Authentification requise." });
    // Le point du cas : un refus qui arriverait APRÈS l'écriture serait décoratif.
    expect(appels).toEqual([]);
  });

  it("une saisie hors bornes refuse SANS écrire", async () => {
    const { reglerRayon } = await import("@/lib/actionsRayon");
    const r = await reglerRayon("9999");
    expect(r.ok).toBe(false);
    expect(appels).toEqual([]);
  });

  it("⚠️ écrit le RAYON d'abord, le registre re-jugé ensuite", async () => {
    // Un lieu dont le verdict bascule quand le rayon s'élargit : sans lui, la seconde
    // écriture n'a pas lieu et l'ordre ne s'observe pas.
    // ⚠️ AUX BONS NOMS DE CHAMPS. Mon premier jet écrivait `{ km, dansLeRayon }` — des noms
    // inventés : `verdict` valait alors `undefined`, ce qui comptait une bascule PARTOUT et
    // rendait le contrôle négatif ci-dessous vert par accident.
    // 60 km, rayon 80 : `deciderLieu` ajoute `MARGE_LIEU_KM` (15), donc 60 ≤ 95 ⇒ bascule.
    const baieComeau: LieuJuge = { verdict: "hors-region", km: 60, le: "2026-09-01", essais: 1 };
    etat[CLE_LIEUX_SIMULEE] = { "baie-comeau": baieComeau };
    const { reglerRayon } = await import("@/lib/actionsRayon");
    const r = await reglerRayon("80");

    expect(r.ok).toBe(true);
    // L'ORDRE est l'assertion. Inversé, on laisse un registre jugé sous un rayon jamais
    // écrit — ce que le module explique sur huit lignes et que rien ne tenait.
    expect(appels).toEqual([`ecrireEtat(${CLE_RAYON})`, `ecrireEtat(${CLE_LIEUX_SIMULEE})`]);
  });

  it("aucune bascule : le registre n'est PAS réécrit", async () => {
    // Le contrôle négatif du cas précédent. Sans lui, « le registre est écrit » pourrait
    // être vrai par construction et l'assertion d'ordre ne prouverait rien de conditionnel.
    const quebec: LieuJuge = { verdict: "dans-la-region", km: 5, le: "2026-09-01", essais: 1 };
    etat[CLE_LIEUX_SIMULEE] = { quebec };
    const { reglerRayon } = await import("@/lib/actionsRayon");
    const r = await reglerRayon("80");
    expect(r.ok).toBe(true);
    expect(appels).toEqual([`ecrireEtat(${CLE_RAYON})`]);
  });
});

describe("reglerMetiers", () => {
  it("⚠️ sans session : refuse, et n'a RIEN écrit", async () => {
    sessionValide = false;
    const { reglerMetiers } = await import("@/lib/actionsMetiers");
    const r = await reglerMetiers("72, 73");
    expect(r).toEqual({ ok: false, erreur: "Authentification requise." });
    expect(appels).toEqual([]);
  });

  it("enregistre la part VALIDE et rend les rejets — jamais l'un sans l'autre", async () => {
    const { reglerMetiers } = await import("@/lib/actionsMetiers");
    const r = await reglerMetiers("72, pas-un-code, 73");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Les deux moitiés sont délibérées : tout refuser ferait perdre la sélection, accepter
    // en silence ferait croire à un métier que la source ne verra jamais.
    expect(r.codes.length).toBeGreaterThan(0);
    expect(r.rejets).toContain("pas-un-code");
    expect(appels).toEqual([`ecrireEtat(${CLE_METIERS})`]);
  });

  it("⚠️ une liste VIDE éteint la source, et le dit", async () => {
    const { reglerMetiers } = await import("@/lib/actionsMetiers");
    const r = await reglerMetiers("");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Ce drapeau commande l'interrogation d'un flux de ~130 Mo : l'écran doit le dire avant
    // que Marc le découvre au lendemain matin.
    expect(r.active).toBe(false);
    expect(r.codes).toEqual([]);
  });
});

describe("lancerAnalyseMarche", () => {
  /**
   * Assez de passes pour que `calculerTendances` accepte — sinon le refus vient d'AILLEURS
   * et le cas de session devient vacueux : `appels` serait vide dans les deux mondes.
   *
   * ⚠️ Le nombre est DÉRIVÉ de `PASSES_MINIMUM`, pas écrit en dur : relever le seuil ne doit
   * pas rendre ce test vacueux en silence. Et la forme est celle que `lireHistorique` EXIGE
   * (`jour` en AAAA-MM-JJ) — une entrée à côté est jetée sans bruit.
   */
  function historiqueSuffisant() {
    return Array.from({ length: PASSES_MINIMUM + 2 }, (_, i) => ({
      jour: `2026-09-${String(i + 1).padStart(2, "0")}`,
      fini: "flux-termine",
      declencheur: "cron-veille",
      trouvees: 100 + i,
      nouvelles: 10 + i,
      perimees: 2,
      revenues: 0,
      enSursis: 30,
      noteMoyenneNouvelles: 70 + i,
    }));
  }

  it("⚠️ sans session : refuse, et n'a PAS passé l'appel facturé", async () => {
    sessionValide = false;
    etat[CLE_HISTORIQUE] = historiqueSuffisant();
    const { lancerAnalyseMarche } = await import("@/lib/actionsAnalyse");
    const r = await lancerAnalyseMarche();
    expect(r).toEqual({ ok: false, erreur: "Authentification requise." });
    // C'est l'invariant le plus concret du fichier : la garde protège une DÉPENSE.
    expect(appels).toEqual([]);
  });

  it("⚠️ pas assez de données : refuse AVANT l'appel facturé", async () => {
    etat[CLE_HISTORIQUE] = [];
    const { lancerAnalyseMarche } = await import("@/lib/actionsAnalyse");
    const r = await lancerAnalyseMarche();
    expect(r.ok).toBe(false);
    // Payer un appel pour s'entendre dire « pas assez de données » serait absurde — le
    // module le dit, et c'est maintenant tenu.
    expect(appels).toEqual([]);
  });

  it("⚠️ CONTRÔLE D'ANTI-VACUITÉ : avec session et données, l'appel facturé A LIEU", async () => {
    // Sans ce cas, les deux précédents sont satisfaits par un espion jamais câblé : « aucun
    // appel » ne prouve rien tant qu'on n'a pas montré que cet espion sait en VOIR un.
    etat[CLE_HISTORIQUE] = historiqueSuffisant();
    const { lancerAnalyseMarche } = await import("@/lib/actionsAnalyse");
    const r = await lancerAnalyseMarche();
    expect(r.ok).toBe(true);
    expect(appels[0]).toBe("analyserMarche(PAYANT)");
    expect(appels).toContain(`ecrireEtat(${CLE_ANALYSE})`);
  });

  it("⚠️ une analyse PAYÉE n'est pas perdue parce qu'on n'a pas su la conserver", async () => {
    // Le module le dit : « la perdre EN PLUS de l'avoir payée serait le pire des deux
    // mondes ». L'écriture échoue, l'action rend quand même l'analyse.
    etat[CLE_HISTORIQUE] = historiqueSuffisant();
    ecritureCasse = true;
    const { lancerAnalyseMarche } = await import("@/lib/actionsAnalyse");
    const r = await lancerAnalyseMarche();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.analyse.texte).toBe("Le marché est stable.");
  });
});
