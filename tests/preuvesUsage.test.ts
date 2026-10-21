// tests/preuvesUsage.test.ts — le bloc `usage` de preuves_ecrans, éprouvé sans base ni serveur (JobAI#198).
//
// `resumerUsage` est la moitié PURE : elle reçoit le compteur déjà relu et rend des nombres, jamais du texte libre.
// Données fictives seulement : aucun CV, aucune clé.

import { describe, it, expect } from "vitest";
import { resumerUsage } from "../lib/mcp/preuvesEcrans.spec";
import { COMPTEUR_VIDE, MODELE_HISTORIQUE, type CompteurTokens } from "../lib/coutLlm";

const compteur = (p: Partial<CompteurTokens>): CompteurTokens => ({ ...COMPTEUR_VIDE, ...p });

describe("resumerUsage", () => {
  it("aucun compteur écrit : « aucun-appel », pas un 0 $", () => {
    expect(resumerUsage({ etat: "absent" })).toEqual({ etat: "aucun-appel" });
  });

  it("un compteur illisible ou une base muette : « illisible », jamais « aucun-appel »", () => {
    expect(resumerUsage({ etat: "illisible" }).etat).toBe("illisible");
    expect(resumerUsage(null).etat).toBe("illisible");
  });

  it("chiffre chaque modèle à son propre prix et trie les modèles par nom", () => {
    const r = resumerUsage({
      etat: "compteur",
      parModele: {
        "claude-sonnet-5-5": compteur({ appels: 1, entree: 1_500, sortie: 500 }),
        [MODELE_HISTORIQUE]: compteur({ appels: 2, entree: 1_000, sortie: 1_000 }),
      },
    });
    if (r.etat !== "compteur") throw new Error("compteur attendu");
    expect(r.modeles.map((m) => m.modele)).toEqual([MODELE_HISTORIQUE, "claude-sonnet-5-5"]);
    // Haiku 4.5 : (1 000 × 1 + 1 000 × 5) / 1e6 = 0,006 $ ; Sonnet 5.5 : (1 500 × 2 + 500 × 10) / 1e6 = 0,008 $.
    expect(r.modeles.map((m) => m.cout)).toEqual([0.006, 0.008]);
    // Quatre décimales : un arrondi au cent ferait afficher 0,01 $ pour une analyse à 0,008 $.
    expect(r.coutTotal).toBe(0.014);
  });

  it("un modèle sans prix est « non mesuré », ses appels ignorés restent visibles, et il n'entre pas au total", () => {
    const r = resumerUsage({
      etat: "compteur",
      parModele: {
        "claude-haiku-5-5": compteur({ appels: 1, entree: 10_000, sortie: 2_000 }),
        "modele-futur": compteur({ ignores: 3 }),
      },
    });
    if (r.etat !== "compteur") throw new Error("compteur attendu");
    const futur = r.modeles.find((m) => m.modele === "modele-futur");
    expect(futur?.cout).toBe("non mesuré");
    expect(futur?.ignores).toBe(3);
    // Haiku 5.5 : (10 000 × 0,1 + 2 000 × 0,5) / 1e6 = 0,002 $ ; le modèle sans prix ne s'y ajoute pas.
    expect(r.coutTotal).toBe(0.002);
  });

  it("ne rend que des nombres et des noms de modèles : aucun champ de texte libre", () => {
    const r = resumerUsage({
      etat: "compteur",
      parModele: { "claude-sonnet-5-5": compteur({ appels: 1, entree: 1, sortie: 1 }) },
    });
    if (r.etat !== "compteur") throw new Error("compteur attendu");
    for (const m of r.modeles) {
      expect(Object.keys(m).sort()).toEqual(
        ["appels", "cout", "ecritureCache", "entree", "ignores", "lectureCache", "modele", "sortie"].sort(),
      );
    }
  });
});
