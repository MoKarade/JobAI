// tests/indexEmployeurs.test.ts — le même regroupement, sans le gaspillage.
//
// `indexEmployeurs` remplace `[...map.keys()].find((c) => apparier(nom, c))` dans les deux
// endroits qui assemblent un écran. Ce n'est PAS une amélioration de la règle : c'est la
// même règle, débarrassée de deux coûts qui ne se voyaient pas à deux cents offres — la
// liste des clés ré-allouée par offre, et `apparier` qui re-normalise les deux côtés à
// chaque comparaison. Ces tests figent l'ÉQUIVALENCE, pas la vitesse : un test de
// chronomètre serait instable en CI, alors que l'équivalence, elle, est binaire.

import { describe, it, expect } from "vitest";
import { apparier, indexEmployeurs } from "../lib/employeurs";

/** L'ancienne écriture, gardée ICI comme référence de comparaison. */
const ancienne = (nom: string, connus: readonly string[]): string | null =>
  connus.find((c) => apparier(nom, c)) ?? null;

const NOMS = [
  "Laserax",
  "Groupe Robert",
  "Robert",
  "ISS",
  "ISS Facility Services",
  "Coffrages Synergy",
  "  Cuisi Moderne  ",
  "JP METAL",
];

describe("indexEmployeurs rend EXACTEMENT ce que rendait `find(apparier)`", () => {
  const cherches = [
    ...NOMS,
    "laserax",
    "Laserax inc.",
    "ROBERT",
    "Rob",
    "ISS",
    "iss facility services",
    "Cuisi Moderne",
    "Inconnue SARL",
    "",
    "   ",
  ];

  it("sur chaque nom cherché, et pour chaque préfixe de la liste connue", () => {
    // Chaque préfixe : l'ordre d'insertion décide du résultat (`find` rend le PREMIER qui
    // apparie, pas le meilleur), donc l'équivalence doit tenir à chaque étape du remplissage.
    for (let n = 0; n <= NOMS.length; n++) {
      const connus = NOMS.slice(0, n);
      const index = indexEmployeurs(connus);
      for (const q of cherches) {
        expect(index.trouver(q), `${q} / ${n} connus`).toBe(ancienne(q, connus));
      }
    }
  });

  it("le cas qui PROUVE que l'ordre compte : « Robert » tombe sur « Groupe Robert »", () => {
    // Si l'index avait pris un raccourci par égalité exacte, il rendrait « Robert ». C'est le
    // témoin qui distingue « même règle » de « règle améliorée » — et l'améliorer serait une
    // décision de produit, pas une optimisation.
    expect(indexEmployeurs(NOMS).trouver("Robert")).toBe("Groupe Robert");
  });

  it("le plancher de longueur tient : un sigle court n'apparie que par égalité", () => {
    const index = indexEmployeurs(["ISS Facility Services", "ISS"]);
    expect(index.trouver("ISS")).toBe("ISS");
    expect(index.trouver("IS")).toBeNull();
  });

  it("`ajouter` construit le même index que le constructeur", () => {
    const a = indexEmployeurs(NOMS);
    const b = indexEmployeurs();
    for (const n of NOMS) b.ajouter(n);
    for (const q of cherches) expect(b.trouver(q)).toBe(a.trouver(q));
  });

  it("un index vide ne trouve rien, et ne lève pas", () => {
    expect(indexEmployeurs().trouver("Laserax")).toBeNull();
  });
});
