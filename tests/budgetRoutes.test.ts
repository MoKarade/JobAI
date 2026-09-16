// tests/budgetRoutes.test.ts — ce qui se paie, et ce qui ne se paie pas.
//
// POURQUOI CE FICHIER EXISTE
// Marc, 2026-09-15 : « budget épuisé mais j'ai juste fait 2 recherches, pourquoi ». Mesuré
// dans les journaux : 48 des 50 éléments du jour avaient été brûlés par QUATRE passes de
// matrice refusées en 403 (12 éléments réservés chacune), sans qu'un seul trajet n'existe.
// Ses deux clics ont coûté 2 éléments ; les 48 autres n'ont rien coûté à personne — Google
// refuse une clé non autorisée À LA PORTE et ne facture rien.
//
// Le frein posé pour protéger l'argent a donc fini par bloquer la VÉRIFICATION du correctif
// qui venait de régler ce même 403. Un compteur qui compte ce que personne n'a dépensé ne
// protège pas, il enferme.
//
// ⚠️ CE QUE CE FICHIER NE PEUT PAS FAIRE : éprouver le compteur lui-même. `lib/budgetRoutes.ts`
// lit et écrit par `lib/etat.ts`, qui importe la connexion Neon directement (convention du
// dépôt) — on ne peut pas lui brancher une base d'essai sans le refactorer. Ce qui est
// éprouvé ici : la DÉCISION (« cet appel a-t-il été facturé ? »), sur le vrai module et avec
// un `fetch` injecté ; et le BRANCHEMENT (les deux appelants rendent bien ce qu'ils ont
// réservé). Les deux ensemble couvrent l'affirmation ; l'un des deux seul ne suffirait pas.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appelerMatrice, appelerRoutes } from "@/lib/trajetRoutes";
import { MARGE_CLICS_PAR_JOUR, ROUTES_ELEMENTS_MAX_PAR_JOUR } from "@/lib/budgetRoutes";
import { MATRICE_MAX_PAR_PASSE } from "@/lib/trajetMatrice";

const maison = { lat: 46.81, lon: -71.3 };
const P = { lat: 46.8, lon: -71.25 };
const DESTS = [{ nom: "Alpha", lat: 46.8, lon: -71.2 }];

/** Un refus Google « moderne », tel qu'il arrive : la cause vit dans `details[].reason`. */
const refusGoogle = (reason: string, statut = 403) =>
  new Response(
    JSON.stringify({
      error: {
        code: statut,
        message: "Une phrase de Google.",
        status: "PERMISSION_DENIED",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }],
      },
    }),
    { status: statut },
  );

describe("ce que Google N'A PAS facturé est marqué `nonFacture`", () => {
  it("⚠️ un 403 de clé — le cas du 2026-09-15, 48 éléments brûlés pour rien", async () => {
    const r = await appelerRoutes(maison, P, "cle", vi.fn(async () => refusGoogle("API_KEY_SERVICE_BLOCKED")));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.nonFacture).toBe(true);
  });

  it("un 401 aussi — refusé à la porte, aucune route calculée", async () => {
    const r = await appelerMatrice(maison, DESTS, "cle", vi.fn(async () => refusGoogle("API_KEY_INVALID", 401)));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.nonFacture).toBe(true);
  });

  it("un appel qui n'est JAMAIS parti non plus", async () => {
    const r = await appelerRoutes(
      maison,
      P,
      "cle",
      vi.fn(async () => {
        throw new Error("réseau coupé");
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.nonFacture).toBe(true);
  });

  it("la matrice marque les DEUX mêmes cas que le trajet simple", async () => {
    const refus = await appelerMatrice(maison, DESTS, "cle", vi.fn(async () => refusGoogle("SERVICE_DISABLED")));
    const coupe = await appelerMatrice(
      maison,
      DESTS,
      "cle",
      vi.fn(async () => {
        throw new Error("réseau coupé");
      }),
    );
    expect(refus.ok === false && refus.nonFacture).toBe(true);
    expect(coupe.ok === false && coupe.nonFacture).toBe(true);
  });
});

describe("⚠️ ce dont on n'est PAS sûr reste DÉPENSÉ — le sens conservateur", () => {
  it("un 429 ne se rend pas : le quota est justement ce qu'on protège", async () => {
    const r = await appelerRoutes(maison, P, "cle", vi.fn(async () => new Response("", { status: 429 })));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.nonFacture).toBeUndefined();
  });

  it("un 500 ne se rend pas : on ne sait pas si la route a été calculée", async () => {
    const r = await appelerMatrice(maison, DESTS, "cle", vi.fn(async () => new Response("", { status: 500 })));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.nonFacture).toBeUndefined();
  });

  it("⚠️ une réponse ILLISIBLE d'un appel ACCEPTÉ reste dépensée — elle a été facturée", async () => {
    // C'est la justification d'origine de la réservation AVANT l'appel, et elle tient
    // toujours : un appel parti se paie, même si on ne sait pas lire ce qu'il a rendu.
    const r = await appelerRoutes(
      maison,
      P,
      "cle",
      vi.fn(async () => new Response(JSON.stringify({ routes: [{ duration: "bientôt" }] }))),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.nonFacture).toBeUndefined();
  });
});

/** Même découpage que `tests/liensOffreCables.test.ts` : par ligne, suffisant ici. */
function sansCommentaires(source: string): string {
  return source
    .split("\n")
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

describe("le branchement — qui RÉSERVE doit RENDRE", () => {
  const APPELANTS = ["lib/trajetMatrice.ts", "lib/actionsTrajet.ts"] as const;

  for (const f of APPELANTS) {
    it(`${f} rend ce qu'il a réservé quand l'appel n'a pas été facturé`, () => {
      const src = sansCommentaires(readFileSync(resolve(process.cwd(), f), "utf8"));
      // Le marqueur doit être LU, et le rendu appelé — un `nonFacture` produit mais jamais
      // consulté serait exactement le trou que ce lot ferme.
      expect(src).toContain("nonFacture");
      expect(src).toMatch(/rendreBudgetRoutes\(/);
      // Et il rend la MÊME quantité que celle réservée, rattachée au jour de la réservation
      // (une passe à cheval sur minuit ne doit pas créditer le jour neuf).
      expect(src).toContain("jourBudgetRoutes()");
      expect(src).toMatch(/rendreBudgetRoutes\([^)]*jourReserve\)/);
    });
  }

  it("⚠️ le rendu est SOUS la condition, jamais inconditionnel", () => {
    // Rendre à chaque échec créditerait aussi les 429 et les 5xx : le frein cesserait de
    // freiner exactement quand il sert.
    for (const f of APPELANTS) {
      const src = sansCommentaires(readFileSync(resolve(process.cwd(), f), "utf8"));
      const rendu = src.indexOf("rendreBudgetRoutes(");
      const ligne = src.slice(src.lastIndexOf("\n", rendu) + 1, rendu);
      expect(ligne).toMatch(/if \(.*nonFacture.*\)\s*(await\s*)?$/);
    }
  });
});

describe("la passe et le clic se partagent UN budget — trois façons de tout casser", () => {
  // Marc, 2026-09-16 : « accélère les trajets ». La borne par passe est passée de 12 à
  // tout le budget du jour moins une marge. Ces trois assertions verrouillent ce que
  // l'accélération pourrait casser, et AUCUNE ne dépend des valeurs du jour : elles se
  // dérivent des constantes, comme l'exige la règle « un test d'un comportement PARAMÉTRÉ
  // par une config dérive ses cas de la constante, jamais de sa valeur du jour ».

  it("⚠️ une passe ne peut JAMAIS demander plus que le budget du jour", () => {
    // Le mode de panne : `consommerBudgetRoutes` refuse la réservation ENTIÈRE dès que
    // `n + elements` dépasse le plafond. Une borne par passe au-dessus du plafond ne
    // remplit donc plus JAMAIS une seule durée — et la seule trace est « Budget Routes du
    // jour épuisé », qui se lit exactement comme un frein qui fonctionne.
    expect(MATRICE_MAX_PAR_PASSE).toBeLessThanOrEqual(ROUTES_ELEMENTS_MAX_PAR_JOUR);
  });

  it("⚠️ elle laisse de quoi CLIQUER le même jour", () => {
    // La matrice ne remplit qu'une durée ; le tracé vient du clic, qui coûte un élément de
    // plus sur le même compteur. Marge à zéro = « tracer » refusé tous les jours où la
    // passe a du travail, sans qu'il y ait de panne.
    expect(ROUTES_ELEMENTS_MAX_PAR_JOUR - MATRICE_MAX_PAR_PASSE).toBeGreaterThanOrEqual(1);
    expect(MARGE_CLICS_PAR_JOUR).toBeGreaterThanOrEqual(1);
  });

  it("⚠️ et elle remplit encore quelque chose — la marge ne peut pas tout prendre", () => {
    // Le symétrique du précédent : une marge égale au plafond rendrait la borne nulle, et
    // la passe s'arrêterait sur « à jour » sans avoir rien fait. Silencieux dans les deux
    // sens, d'où les deux assertions.
    expect(MATRICE_MAX_PAR_PASSE).toBeGreaterThanOrEqual(1);
  });
});
