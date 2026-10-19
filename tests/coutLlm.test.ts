// tests/coutLlm.test.ts — la comptabilité des appels de modèle, et sa publication au hub.
//
// CE QUI SE PROTÈGE ICI, PAR ORDRE DE GRAVITÉ
//
// 1. **Zéro appel ⇒ PAS de bloc `usage`.** C'est le garde-fou n°3 appliqué à l'argent :
//    « 0,00 $ » affirme que l'app ne coûte rien, l'absence de bloc admet qu'on ne suit
//    rien. Tant que rien n'a été dépensé, seule la seconde est vraie.
// 2. **Un champ absent vaut 0, jamais `undefined`.** `undefined + nombre` donne `NaN`, et
//    un seul `NaN` empoisonne TOUT le cumul — pas seulement l'appel concerné. C'est le bug
//    exact qu'a eu DriveAI sur un JSON d'avant sa Vague 3.
// 3. **Un cumul est un cumul.** Le second appel s'AJOUTE, il n'écrase pas le premier.
// 4. **Une donnée illisible est comptée, jamais traitée comme zéro.** Un cumul
//    discrètement amputé est pire qu'une erreur visible : il se présente comme une mesure.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validateSummary } from "@mokarade/hub-contract";
import {
  COMPTEUR_VIDE,
  MODELE_HISTORIQUE,
  PRIX_PAR_MODELE,
  ajouterUsageModele,
  coutUsdTotal,
  FACTEUR_ECRITURE_CACHE,
  FACTEUR_LECTURE_CACHE,
  PRIX_USD_PAR_MTOK,
  ajouterUsage,
  arrondirCents,
  coutAPublier,
  coutUsd,
  lireUsage,
  relireCompteur,
  type CompteurTokens,
} from "../lib/coutLlm";
import { blocUsage, construireSummary } from "../lib/hubSummary";
import type { ResumeSuivi } from "../lib/types";

const RESUME: ResumeSuivi = {
  total: 4,
  actives: 3,
  nouvelles: 1,
  noteMoyenneNouvelles: 72,
  notees80Plus: 1,
  cvEnvoyes: 2,
  reponses: 1,
  entrevues: 0,
  meilleure: { entreprise: "Laserax", poste: "Technicien", score: 81 },
};

/** Un relevé d'usage tel que l'API le rend, sans cache (l'état d'aujourd'hui). */
const USAGE_SIMPLE = { input_tokens: 1000, output_tokens: 200 };

describe("lireUsage — ce qui se lit, et ce qui s'avoue illisible", () => {
  it("lit entrée et sortie", () => {
    expect(lireUsage(USAGE_SIMPLE)).toEqual({
      entree: 1000,
      sortie: 200,
      ecritureCache: 0,
      lectureCache: 0,
    });
  });

  it("un champ de cache ABSENT vaut 0 — jamais undefined, sinon NaN", () => {
    // ⚠️ Le prompt caching n'est pas activé ici, donc ces champs sont normalement absents.
    // Sans cette normalisation, chaque appel injecterait un `undefined` dans l'addition et
    // le cumul ENTIER deviendrait NaN — pas seulement cet appel-là.
    const lu = lireUsage(USAGE_SIMPLE);
    expect(lu?.ecritureCache).toBe(0);
    expect(lu?.lectureCache).toBe(0);
    expect(Number.isNaN(coutUsd({ ...COMPTEUR_VIDE, ...lu!, appels: 1 }, MODELE_HISTORIQUE))).toBe(false);
  });

  it("compte les tokens de cache quand ils sont là — ils se PAIENT", () => {
    expect(
      lireUsage({
        ...USAGE_SIMPLE,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 300,
      }),
    ).toEqual({ entree: 1000, sortie: 200, ecritureCache: 500, lectureCache: 300 });
  });

  it("un champ de cache PRÉSENT mais illisible rend le relevé illisible", () => {
    // Le rabattre sur 0 jetterait des tokens réellement facturés : c'est la
    // sous-estimation qu'on corrige, réintroduite par la porte d'à côté.
    expect(lireUsage({ ...USAGE_SIMPLE, cache_read_input_tokens: "beaucoup" })).toBeNull();
  });

  it("avoue son ignorance sur un relevé qu'il ne comprend pas", () => {
    expect(lireUsage(undefined)).toBeNull();
    expect(lireUsage(null)).toBeNull();
    expect(lireUsage({})).toBeNull();
    expect(lireUsage({ input_tokens: 10 })).toBeNull();
    expect(lireUsage({ input_tokens: -1, output_tokens: 5 })).toBeNull();
    expect(lireUsage({ input_tokens: Number.NaN, output_tokens: 5 })).toBeNull();
  });
});

describe("ajouterUsage — un cumul est un cumul", () => {
  it("le second appel S'AJOUTE au premier", () => {
    const un = ajouterUsage(COMPTEUR_VIDE, USAGE_SIMPLE);
    const deux = ajouterUsage(un, { input_tokens: 500, output_tokens: 100 });
    expect(deux.appels).toBe(2);
    expect(deux.entree).toBe(1500);
    expect(deux.sortie).toBe(300);
  });

  it("aucun NaN ne peut entrer, même sur une longue série", () => {
    let c = COMPTEUR_VIDE;
    for (let i = 0; i < 20; i++) c = ajouterUsage(c, USAGE_SIMPLE);
    expect(Number.isFinite(coutUsd(c, MODELE_HISTORIQUE))).toBe(true);
    expect(c.appels).toBe(20);
  });

  it("un relevé illisible est COMPTÉ et ne touche à rien d'autre", () => {
    const un = ajouterUsage(COMPTEUR_VIDE, USAGE_SIMPLE);
    const apres = ajouterUsage(un, { erreur: "?" });
    expect(apres.ignores).toBe(1);
    expect(apres.appels).toBe(1);
    expect(apres.entree).toBe(un.entree);
    expect(coutUsd(apres, MODELE_HISTORIQUE)).toBe(coutUsd(un, MODELE_HISTORIQUE));
  });

  it("ne mute pas le compteur qu'on lui donne", () => {
    const avant = { ...COMPTEUR_VIDE };
    ajouterUsage(avant, USAGE_SIMPLE);
    expect(avant).toEqual(COMPTEUR_VIDE);
  });
});

describe("coutUsd — les prix, et d'où ils viennent", () => {
  it("entrée et sortie, aux prix repris de DriveAI/src/Config.gs", () => {
    // 1 M de tokens d'entrée = 1 $, 1 M de sortie = 5 $.
    expect(coutUsd({ ...COMPTEUR_VIDE, entree: 1e6 }, MODELE_HISTORIQUE)).toBeCloseTo(PRIX_USD_PAR_MTOK.entree, 10);
    expect(coutUsd({ ...COMPTEUR_VIDE, sortie: 1e6 }, MODELE_HISTORIQUE)).toBeCloseTo(PRIX_USD_PAR_MTOK.sortie, 10);
  });

  it("les prix de cache sont DÉRIVÉS du prix d'entrée, pas recopiés", () => {
    // Le test se dérive des mêmes constantes que le code : codé « 1,25 $ », il mentirait
    // au premier rajustement du prix d'entrée — et un prix recopié finit toujours par
    // diverger de celui dont il dépend.
    expect(coutUsd({ ...COMPTEUR_VIDE, ecritureCache: 1e6 }, MODELE_HISTORIQUE)).toBeCloseTo(
      PRIX_USD_PAR_MTOK.entree * FACTEUR_ECRITURE_CACHE,
      10,
    );
    expect(coutUsd({ ...COMPTEUR_VIDE, lectureCache: 1e6 }, MODELE_HISTORIQUE)).toBeCloseTo(
      PRIX_USD_PAR_MTOK.entree * FACTEUR_LECTURE_CACHE,
      10,
    );
  });

  it("arrondit au cent", () => {
    expect(arrondirCents(0.12345)).toBe(0.12);
    expect(arrondirCents(0.125)).toBe(0.13);
    expect(arrondirCents(0)).toBe(0);
  });
});

describe("relireCompteur — absent, mesure et illisible ne se confondent pas", () => {
  const COMPLET: CompteurTokens = {
    appels: 2,
    entree: 1500,
    sortie: 300,
    ecritureCache: 0,
    lectureCache: 0,
    ignores: 0,
  };

  it("absent = rien n'a jamais été écrit", () => {
    expect(relireCompteur(null)).toEqual({ etat: "absent" });
  });

  it("relit un compteur écrit", () => {
    expect(relireCompteur(JSON.stringify({ parModele: { "claude-sonnet-5-5": COMPLET } }))).toEqual({
      etat: "compteur",
      parModele: { "claude-sonnet-5-5": COMPLET },
    });
  });

  it("relit l'ancien format à plat comme celui de Haiku 4.5, le seul modèle d'avant JobAI#158", () => {
    // ⚠️ Le compteur en production est à plat : le perdre ou le prendre pour illisible amputerait le cumul.
    expect(relireCompteur(JSON.stringify(COMPLET))).toEqual({
      etat: "compteur",
      parModele: { [MODELE_HISTORIQUE]: COMPLET },
    });
  });

  it("un compteur par modèle dont une entrée est illisible rend tout ILLISIBLE", () => {
    expect(
      relireCompteur(JSON.stringify({ parModele: { "claude-sonnet-5-5": COMPLET, autre: { appels: "x" } } })),
    ).toEqual({ etat: "illisible" });
    expect(relireCompteur(JSON.stringify({ parModele: 3 }))).toEqual({ etat: "illisible" });
  });

  it("un JSON corrompu est ILLISIBLE, pas un compteur à zéro", () => {
    // ⚠️ Le cœur de la règle : repartir de zéro publierait un cumul amputé avec l'autorité
    // d'une mesure. Un cumul discrètement amputé est pire qu'une erreur visible.
    expect(relireCompteur("{pas du json")).toEqual({ etat: "illisible" });
    expect(relireCompteur("null")).toEqual({ etat: "illisible" });
    expect(relireCompteur("42")).toEqual({ etat: "illisible" });
  });

  it("un compteur à qui il manque un champ est ILLISIBLE", () => {
    const { ignores: _ignores, ...ampute } = COMPLET;
    expect(relireCompteur(JSON.stringify(ampute))).toEqual({ etat: "illisible" });
    expect(relireCompteur(JSON.stringify({ ...COMPLET, entree: "beaucoup" }))).toEqual({
      etat: "illisible",
    });
  });
});

describe("coutAPublier — ce que le hub voit", () => {
  it("aucun appel ⇒ rien à publier", () => {
    expect(coutAPublier({ etat: "absent" })).toEqual({ etat: "aucun-appel" });
    expect(coutAPublier({ etat: "compteur", parModele: { [MODELE_HISTORIQUE]: COMPTEUR_VIDE } })).toEqual({
      etat: "aucun-appel",
    });
  });

  it("des appels, aucun mesuré ⇒ pas de montant, mais on le DIT", () => {
    expect(
      coutAPublier({ etat: "compteur", parModele: { [MODELE_HISTORIQUE]: { ...COMPTEUR_VIDE, ignores: 3 } } }),
    ).toEqual({ etat: "non-mesure", appelsNonMesures: 3 });
  });

  it("une mesure dont l'arrondi tombe à 0 reste une MESURE", () => {
    // ⚠️ La distinction qui compte : « zéro appel » est une absence de mesure, « des appels
    // dont le coût arrondi tombe à 0,00 $ » est une mesure. Un tout petit appel coûte
    // ~0,0002 $ : le bloc existe, le montant vaut 0.
    const r = coutAPublier({
      etat: "compteur",
      parModele: { [MODELE_HISTORIQUE]: { ...COMPTEUR_VIDE, appels: 1, entree: 100, sortie: 20 } },
    });
    expect(r).toEqual({ etat: "mesure", montantUsd: 0, appelsNonMesures: 0 });
  });

  it("un compteur illisible se publie comme illisible", () => {
    expect(coutAPublier({ etat: "illisible" })).toEqual({ etat: "illisible" });
  });
});

describe("le bloc usage du summary — la règle du zéro", () => {
  it("ZÉRO APPEL ⇒ summary.usage est undefined", () => {
    // ⚠️ LE TEST QUI GARDE LA RÈGLE. « 0,00 $ » se lit « JobAI ne coûte rien » ; l'absence
    // se lit « non suivie », ce qui est vrai tant que rien n'a été dépensé.
    expect(construireSummary(RESUME, "2026-08-19T12:00:00.000Z").usage).toBeUndefined();
    expect(
      construireSummary(RESUME, "2026-08-19T12:00:00.000Z", { etat: "aucun-appel" }).usage,
    ).toBeUndefined();
    expect(blocUsage({ etat: "aucun-appel" })).toEqual({});
  });

  it("ni un compteur illisible, ni des appels non mesurés ne publient un montant", () => {
    expect(construireSummary(RESUME, "2026-08-19T12:00:00.000Z", { etat: "illisible" }).usage)
      .toBeUndefined();
    expect(
      construireSummary(RESUME, "2026-08-19T12:00:00.000Z", {
        etat: "non-mesure",
        appelsNonMesures: 2,
      }).usage,
    ).toBeUndefined();
  });

  it("après des appels : total, USD, montant arrondi au cent", () => {
    const s = construireSummary(RESUME, "2026-08-19T12:00:00.000Z", {
      etat: "mesure",
      montantUsd: 0.03,
      appelsNonMesures: 0,
    });
    expect(s.usage?.cost).toEqual({ amount: 0.03, currency: "USD", period: "total" });
  });

  it("le hub SOMME PAR PÉRIODE : « mois » isolerait JobAI dans sa colonne", () => {
    // Le hub refuse de fusionner « cumulé » et « ce mois-ci » — additionner les deux donne
    // un montant qui n'existe pas. FinanceAI, BatchChef et DriveAI publient tous un cumul.
    const s = construireSummary(RESUME, "2026-08-19T12:00:00.000Z", {
      etat: "mesure",
      montantUsd: 1.5,
      appelsNonMesures: 0,
    });
    expect(s.usage?.cost?.period).toBe("total");
  });

  it("un montant mesuré qui SOUS-ESTIME le dit en alerte", () => {
    const s = construireSummary(RESUME, "2026-08-19T12:00:00.000Z", {
      etat: "mesure",
      montantUsd: 0.03,
      appelsNonMesures: 2,
    });
    expect(s.usage?.cost?.amount).toBe(0.03);
    expect(s.alerts.some((a) => a.label.includes("sous-estimé"))).toBe(true);
  });

  it("un compteur illisible se DIT, sinon il se confond avec « jamais appelé »", () => {
    const s = construireSummary(RESUME, "2026-08-19T12:00:00.000Z", { etat: "illisible" });
    expect(s.alerts.some((a) => a.label.includes("illisible"))).toBe(true);
  });

  it("le summary reste valide contre le VRAI schéma du contrat, avec et sans usage", () => {
    // ⚠️ ON VÉRIFIE CE QUE LE SCHÉMA REND, PAS SEULEMENT QU'IL NE LÈVE PAS. Zod STRIPPE les
    // clés inconnues : si le contrat épinglé ne portait pas `usage`, `validateSummary`
    // passerait sans broncher en jetant le bloc en silence — et le hub afficherait « non
    // suivie » pendant que les tests seraient verts. C'est la leçon déjà payée sur un test
    // qui croyait éprouver un rejet alors qu'il éprouvait un stripping.
    for (const cout of [
      { etat: "aucun-appel" } as const,
      { etat: "illisible" } as const,
      { etat: "non-mesure", appelsNonMesures: 2 } as const,
      { etat: "mesure", montantUsd: 0, appelsNonMesures: 0 } as const,
      { etat: "mesure", montantUsd: 12.34, appelsNonMesures: 3 } as const,
    ]) {
      const construit = construireSummary(RESUME, "2026-08-19T12:00:00.000Z", cout);
      const valide = validateSummary(construit);
      expect(valide.usage?.cost, cout.etat).toEqual(construit.usage?.cost);
    }
  });
});

describe("bout en bout : d'un relevé d'API au montant publié", () => {
  it("deux appels réels donnent un montant reconstructible à la main", () => {
    // 2 000 tokens d'entrée à 1 $/MTok + 400 de sortie à 5 $/MTok = 0,002 + 0,002 = 0,004 $
    // → arrondi au cent : 0,00 $. C'est une MESURE (le bloc existe), pas une absence.
    let c = ajouterUsage(COMPTEUR_VIDE, { input_tokens: 1000, output_tokens: 200 });
    c = ajouterUsage(c, { input_tokens: 1000, output_tokens: 200 });
    expect(coutUsd(c, MODELE_HISTORIQUE)).toBeCloseTo(0.004, 10);

    const publie = coutAPublier({ etat: "compteur", parModele: { [MODELE_HISTORIQUE]: c } });
    expect(publie).toEqual({ etat: "mesure", montantUsd: 0, appelsNonMesures: 0 });
    expect(construireSummary(RESUME, "2026-08-19T12:00:00.000Z", publie).usage?.cost).toEqual({
      amount: 0,
      currency: "USD",
      period: "total",
    });
  });
});

describe("prix par modèle (JobAI#158) — un token de Sonnet 5.5 ne se facture pas au prix de Haiku", () => {
  const SONNET = "claude-sonnet-5-5";

  it("Sonnet 5.5 : 2 $ en entrée, 10 $ en sortie, lecture de cache ×0,05", () => {
    expect(coutUsd({ ...COMPTEUR_VIDE, entree: 1e6 }, SONNET)).toBeCloseTo(2, 10);
    expect(coutUsd({ ...COMPTEUR_VIDE, sortie: 1e6 }, SONNET)).toBeCloseTo(10, 10);
    expect(coutUsd({ ...COMPTEUR_VIDE, ecritureCache: 1e6 }, SONNET)).toBeCloseTo(2.5, 10);
    expect(coutUsd({ ...COMPTEUR_VIDE, lectureCache: 1e6 }, SONNET)).toBeCloseTo(0.1, 10);
  });

  it("les mêmes tokens coûtent plus cher chez Sonnet que chez Haiku", () => {
    const c = { ...COMPTEUR_VIDE, appels: 1, entree: 10_000, sortie: 3_000 };
    // Haiku : 0,01 + 0,015 = 0,025 $ ; Sonnet : 0,02 + 0,03 = 0,05 $.
    expect(coutUsd(c, MODELE_HISTORIQUE)).toBeCloseTo(0.025, 10);
    expect(coutUsd(c, SONNET)).toBeCloseTo(0.05, 10);
  });

  it("un modèle sans prix connu ne se chiffre pas : il est compté NON MESURÉ, jamais au prix d'un autre", () => {
    expect(coutUsd({ ...COMPTEUR_VIDE, entree: 1e6 }, "claude-inconnu-9")).toBeNull();
    const p = ajouterUsageModele({}, "claude-inconnu-9", { input_tokens: 1000, output_tokens: 100 });
    expect(p["claude-inconnu-9"]).toEqual({ ...COMPTEUR_VIDE, ignores: 1 });
    expect(coutAPublier({ etat: "compteur", parModele: p })).toEqual({ etat: "non-mesure", appelsNonMesures: 1 });
  });

  it("le total est la SOMME des modèles, chacun à son prix", () => {
    let p = ajouterUsageModele({}, MODELE_HISTORIQUE, { input_tokens: 10_000, output_tokens: 3_000 });
    p = ajouterUsageModele(p, SONNET, { input_tokens: 10_000, output_tokens: 3_000 });
    expect(coutUsdTotal(p)).toBeCloseTo(0.075, 10);
    expect(coutAPublier({ etat: "compteur", parModele: p })).toEqual({
      etat: "mesure",
      montantUsd: 0.08,
      appelsNonMesures: 0,
    });
  });

  it("un appel de Sonnet s'ajoute au compteur d'avant sans le toucher", () => {
    const avant = { [MODELE_HISTORIQUE]: { ...COMPTEUR_VIDE, appels: 4, entree: 4000, sortie: 800 } };
    const apres = ajouterUsageModele(avant, SONNET, { input_tokens: 5000, output_tokens: 1000 });
    expect(apres[MODELE_HISTORIQUE]).toEqual(avant[MODELE_HISTORIQUE]);
    expect(apres[SONNET]).toMatchObject({ appels: 1, entree: 5000, sortie: 1000 });
  });
});

describe("chaque modèle appelé par le dépôt a un prix", () => {
  function sources(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      return statSync(chemin).isDirectory() ? sources(chemin) : chemin.endsWith(".ts") ? [chemin] : [];
    });
  }

  it("tout identifiant « claude-… » écrit dans lib/ est chiffrable, sinon son coût ne se publierait jamais", () => {
    // ⚠️ Un nouveau modèle sans prix serait compté « non mesuré » en silence : le montant du hub sous-estimerait.
    const trouves = new Set<string>();
    for (const f of sources(join(process.cwd(), "lib"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/"(claude-(?:haiku|sonnet|opus|fable|mythos)-[0-9][0-9a-z-]*)"/g)) {
        if (m[1] !== undefined) trouves.add(m[1]);
      }
    }
    expect(trouves.size).toBeGreaterThan(0);
    for (const modele of trouves) expect(PRIX_PAR_MODELE[modele], modele).toBeDefined();
  });

  it("des jetons déjà en base sous un modèle SANS prix ne se publient jamais comme un coût nul", () => {
    // ⚠️ Le prix a pu être retiré ou renommé depuis l'écriture : relire ne doit pas rabattre ces appels sur 0 $.
    const inconnu = { ...COMPTEUR_VIDE, appels: 2, entree: 1000, sortie: 200 };
    expect(coutAPublier({ etat: "compteur", parModele: { "claude-inconnu-9": inconnu } })).toEqual({
      etat: "non-mesure",
      appelsNonMesures: 2,
    });
    const mixte = coutAPublier({
      etat: "compteur",
      parModele: {
        "claude-inconnu-9": inconnu,
        [MODELE_HISTORIQUE]: { ...COMPTEUR_VIDE, appels: 1, entree: 1_000_000 },
      },
    });
    expect(mixte).toEqual({ etat: "mesure", montantUsd: 1, appelsNonMesures: 2 });
  });

  it("une clé héritée de l'objet (« constructor ») n'est pas un modèle chiffrable", () => {
    expect(coutUsd({ ...COMPTEUR_VIDE, entree: 1 }, "constructor")).toBeNull();
  });
});
