// tests/cvDepot.test.ts — la lecture des CV : trois issues qui ne se confondent pas, et un
// `null` qui n'est pas une liste vide.
//
// CE QUE CES TESTS PROTÈGENT (`[CV-09]`)
//
// `lib/cv/depot.ts` porte deux invariants écrits en toutes lettres dans son code, et aucun
// test ne les tenait :
//
// 1. **`propositionDe` a TROIS issues.** « Ce CV n'a pas de proposition » et « la
//    proposition enregistrée est devenue illisible » sont deux situations opposées — la
//    seconde arrive pour de vrai dès qu'une évolution resserre le schéma, et la première
//    version les mettait toutes deux à `null`. L'écran affichait alors un CV parfaitement
//    propre, sans erreur, qui n'avait simplement plus rien à valider.
// 2. **`null` veut dire « base non configurée », jamais « aucun CV ».** Les rabattre sur une
//    liste vide ferait dire à l'écran « tu n'as téléversé aucun CV » à quelqu'un dont la
//    base est simplement absente.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Les lignes que la fausse base rend au bout de la chaîne. Réglées par test. */
let lignesRendues: unknown[] = [];

/**
 * Une fausse base DRIZZLE — thenable, comme le vrai constructeur de requête.
 *
 * ⚠️ Elle ne VALIDE pas le SQL, et ce test ne prétend pas le contraire : ce qui est éprouvé
 * ici est la LOGIQUE DE DÉCISION du module — que fait-il de ce que la base lui rend. Le SQL
 * réel est couvert ailleurs (`tests/oauthStore.test.ts`, sur une vraie Postgres).
 */
vi.mock("@/lib/db", () => {
  const chaine: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy"]) chaine[m] = () => chaine;
  chaine.then = (resoudre: (v: unknown[]) => unknown) => resoudre(lignesRendues);
  return { db: { select: () => chaine } };
});
vi.mock("@/lib/migrations", () => ({ assurerMigrations: async () => {} }));

const { listerCvs, profilActif, propositionDe } = await import("@/lib/cv/depot");
const { PROFIL_DEFAUT } = await import("@/lib/profil");

/**
 * Rend la base « configurée » ou non, aux yeux des gardes `if (!process.env.DATABASE_URL)`.
 *
 * ⚠️ `vi.stubEnv` PLUTÔT QU'UNE AFFECTATION, ET CE N'EST PAS UNE ASTUCE POUR CONTOURNER UN
 * SCAN. Mon premier jet affectait à la variable d'environnement une chaîne en FORME de
 * connexion Postgres, et le garde-fou n°5 a tiré — à raison : il cherche une variable de
 * secret affectée à une valeur, et il ne peut pas distinguer une fausse d'une vraie. Écrire
 * une chaîne en forme de credential dans le dépôt est exactement le vecteur qu'il surveille
 * (« juste pour tester »). Le second jet raccourcissait la valeur : ça passait le scan sans
 * rien régler, et la restauration depuis la valeur capturée le rallumait aussitôt.
 *
 * ⚠️ ET LE TROISIÈME JET A ÉCHOUÉ SUR SA PROPRE EXPLICATION : ce commentaire CITAIT la ligne
 * fautive, donc le scan la retrouvait dans la prose. Une garde d'absence sur du source
 * contredit mécaniquement une bonne explication — deuxième fois en une soirée. La phrase
 * décrit désormais la forme sans la reproduire.
 *
 * `vi.stubEnv` est l'outil PRÉVU pour ça : il pose, il restaure tout seul
 * (`unstubAllEnvs`), et il n'écrit aucune valeur à côté du nom de la variable. Ces tests
 * n'ont besoin de rien de plausible — la garde testée lit la vérité du booléen, pas l'URL.
 */
function baseConfiguree(oui: boolean): void {
  if (oui) vi.stubEnv("DATABASE_URL", "x");
  else vi.stubEnv("DATABASE_URL", "");
}

beforeEach(() => {
  baseConfiguree(true);
  lignesRendues = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("base non configurée — un aveu, pas un vide", () => {
  it("`listerCvs` rend `null`, JAMAIS une liste vide", async () => {
    // ⚠️ Le contrôle NÉGATIF est la moitié qui compte : avec une base configurée et zéro
    // ligne, la même fonction rend `[]`. Sans ce second cas, un `null` rendu dans les deux
    // situations passerait le premier test en supprimant la distinction.
    baseConfiguree(false);
    expect(await listerCvs()).toBeNull();

    baseConfiguree(true);
    expect(await listerCvs()).toEqual([]);
  });

  it("`profilActif` retombe sur le profil du CODE, pour que l'app marche avant tout CV", async () => {
    baseConfiguree(false);
    expect(await profilActif()).toEqual(PROFIL_DEFAUT);
  });
});

describe("profilActif — aucun CV validé n'est pas une panne", () => {
  it("aucune ligne active → le profil du code", async () => {
    lignesRendues = [];
    expect(await profilActif()).toEqual(PROFIL_DEFAUT);
  });

  it("une ligne active sans profil validé → le profil du code", async () => {
    // Le cas d'un CV téléversé mais jamais validé : l'app doit noter comme avant.
    lignesRendues = [{ profilValide: null }];
    expect(await profilActif()).toEqual(PROFIL_DEFAUT);
  });
});

describe("propositionDe — TROIS issues, et c'est tout l'intérêt", () => {
  it("ABSENTE : aucune proposition enregistrée → `null`", async () => {
    lignesRendues = [{ profilPropose: null, nomFichier: "cv.pdf" }];
    expect(await propositionDe(1)).toBeNull();
  });

  it("ILLISIBLE (JSON cassé) : un refus NOMMÉ, pas un `null`", async () => {
    // Les confondre rendait l'écran muet : un CV propre, sans erreur, sans rien à valider.
    lignesRendues = [{ profilPropose: "{ pas du json", nomFichier: "cv.pdf" }];
    const r = await propositionDe(1);
    expect(r).not.toBeNull();
    expect(r && "ok" in r && r.ok).toBe(false);
    if (r && "raison" in r) expect(r.raison).toContain("corrompue");
  });

  it("ILLISIBLE (hors schéma) : le refus DIT ce qui cloche, champ par champ", async () => {
    // C'est le cas RÉEL annoncé par le module : il suffit qu'une évolution resserre le
    // schéma pour qu'une proposition écrite hier cesse de se relire. Un message générique
    // laisserait chercher ; les chemins de champs désignent.
    lignesRendues = [{ profilPropose: JSON.stringify({ nimporte: "quoi" }), nomFichier: "cv.pdf" }];
    const r = await propositionDe(1);
    expect(r && "ok" in r && r.ok).toBe(false);
    if (r && "raison" in r) {
      expect(r.raison).toContain("n'est plus lisible");
      // Non-vacuité : le message doit porter un DÉTAIL, sinon il ne vaut pas mieux qu'un `null`.
      expect(r.raison.length).toBeGreaterThan("La proposition enregistrée n'est plus lisible : ".length);
    }
  });

  it("base non configurée → `null`, sans interroger quoi que ce soit", async () => {
    baseConfiguree(false);
    lignesRendues = [{ profilPropose: "{}", nomFichier: "cv.pdf" }];
    expect(await propositionDe(1)).toBeNull();
  });
});
