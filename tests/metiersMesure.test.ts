// tests/metiersMesure.test.ts — le tableau sur lequel Marc choisit ses métiers.
//
// CE QUI SE PROTÈGE ICI
// 1. **Une lecture partielle ne décide rien.** Si le flux s'est arrêté sur son budget ou son
//    plafond, les comptes sont le DÉBUT d'une mesure. Les présenter comme une mesure ferait
//    conclure sur un préfixe — faute déjà payée trois fois en une journée sur ce dépôt.
// 2. **Un compte sans titres ne se tranche pas.** « 63200 : 123 » ne dit pas si le métier
//    concerne Marc ; « 63200 : 123 — Cook, Kitchen helper » se tranche d'un coup d'œil.
// 3. **« Je n'ai pas su lire » ≠ « le flux ne porte aucun métier ».** Un tableau vide rendu
//    sur une réponse incompréhensible ferait conclure que la source ne vaut rien.

import { describe, it, expect } from "vitest";
import { lireMesureMetiers } from "../lib/metiersMesure";
import { codeRetenu, lireCodeNoc } from "../lib/nocProfession";
import { normaliserMetiers } from "../lib/metiersRetenus";

/** Une réponse du diagnostic, à la forme que `diagnostiquerFlux` rend vraiment. */
function rapport(sur: Record<string, unknown> = {}) {
  return {
    ok: true,
    fin: "flux-termine",
    retenues: 1300,
    inventaireRetenues: {
      "noc2021-niveau": {
        distinctes: 3,
        top: [
          { nom: "65", n: 402 },
          { nom: "22", n: 118 },
          { nom: "21", n: 44 },
        ],
      },
      noc2021: {
        distinctes: 2,
        top: [
          { nom: "65200", n: 402 },
          { nom: "22301", n: 60 },
        ],
      },
    },
    exemplesRetenues: {
      "noc2021-niveau": {
        "65": ["Cook", "Kitchen helper", "Car washer"],
        "22": ["Technicien en génie mécanique"],
      },
      noc2021: { "65200": ["Cook", "Kitchen helper"] },
    },
    ...sur,
  };
}

describe("lireMesureMetiers — ce qui rend un code décidable", () => {
  it("rend le compte ET les titres réels, par granularité", () => {
    const m = lireMesureMetiers(rapport());
    expect(m).not.toBeNull();
    expect(m?.niveaux).toEqual([
      { code: "65", offres: 402, titres: ["Cook", "Kitchen helper", "Car washer"] },
      { code: "22", offres: 118, titres: ["Technicien en génie mécanique"] },
      { code: "21", offres: 44, titres: [] },
    ]);
    expect(m?.metiers[0]).toEqual({ code: "65200", offres: 402, titres: ["Cook", "Kitchen helper"] });
  });

  it("garde l'ordre de l'inventaire — il est déjà trié par fréquence", () => {
    const m = lireMesureMetiers(rapport());
    expect(m?.niveaux.map((l) => l.offres)).toEqual([402, 118, 44]);
  });

  it("un code sans titres est rendu quand même, titres vides — jamais omis", () => {
    // L'omettre le rendrait inchoisissable ; le rendre sans titres laisse Marc voir qu'il
    // existe et que la mesure n'a pas gardé d'exemple pour lui.
    const m = lireMesureMetiers(rapport());
    expect(m?.niveaux.find((l) => l.code === "21")?.titres).toEqual([]);
  });
});

describe("lireMesureMetiers — une lecture partielle se DIT", () => {
  it("concluante seulement sur flux-termine", () => {
    expect(lireMesureMetiers(rapport())?.concluante).toBe(true);
    for (const fin of ["budget-depasse", "plafond-retenues", "tampon-deborde"]) {
      const m = lireMesureMetiers(rapport({ fin }));
      // ⚠️ Les comptes sont quand même rendus — une mesure partielle vaut mieux que rien —
      // mais `concluante: false` est ce qui empêche l'écran de les présenter comme une mesure.
      expect(m?.concluante, fin).toBe(false);
      expect(m?.fin, fin).toBe(fin);
      expect(m?.niveaux.length, fin).toBeGreaterThan(0);
    }
  });
});

describe("lireMesureMetiers — l'aveu et le vide ne se confondent pas", () => {
  it("rend null sur une réponse qu'il ne sait pas lire", () => {
    expect(lireMesureMetiers(null)).toBeNull();
    expect(lireMesureMetiers("nope")).toBeNull();
    expect(lireMesureMetiers({})).toBeNull();
    expect(lireMesureMetiers({ ok: false, erreur: "HTTP 502" })).toBeNull();
    expect(lireMesureMetiers(rapport({ fin: 42 }))).toBeNull();
  });

  it("rend null quand le rapport existe mais ne porte AUCUN code", () => {
    // Deux tableaux vides se liraient « le flux ne classe rien ». C'est faux : c'est le
    // rapport qui ne porte pas ce qu'on est venu chercher.
    expect(lireMesureMetiers(rapport({ inventaireRetenues: {}, exemplesRetenues: {} }))).toBeNull();
  });

  it("ignore une ligne malformée sans jeter les autres", () => {
    const m = lireMesureMetiers(
      rapport({
        inventaireRetenues: {
          "noc2021-niveau": {
            top: [{ nom: "65", n: 402 }, { nom: 22, n: 5 }, { nom: "21", n: "beaucoup" }, null],
          },
        },
      }),
    );
    expect(m?.niveaux).toEqual([{ code: "65", offres: 402, titres: ["Cook", "Kitchen helper", "Car washer"] }]);
  });
});

describe("le tableau et le filtre parlent la même langue", () => {
  it("tout code du tableau est saisissable ET comparable par le filtre", () => {
    // ⚠️ L'INVARIANT QUI RELIE LES DEUX MODULES. Un tableau qui proposerait des codes que
    // `normaliserMetiers` refuse, ou que `codeRetenu` ne sait pas comparer, produirait une
    // sélection inerte : Marc coche, rien n'entre, et rien ne le signale.
    const m = lireMesureMetiers(rapport());
    const tous = [...(m?.niveaux ?? []), ...(m?.metiers ?? [])].map((l) => l.code);
    expect(tous.length).toBeGreaterThan(0);
    expect(normaliserMetiers(tous.join(" ")).rejets).toEqual([]);

    const code = lireCodeNoc("65200");
    expect(code).not.toBeNull();
    expect(codeRetenu(code!, ["65"])).toBe(true);
    expect(codeRetenu(code!, ["65200"])).toBe(true);
    expect(codeRetenu(code!, ["22"])).toBe(false);
  });
});
