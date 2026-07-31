// tests/employeurs.test.ts — le même employeur sous deux noms.
//
// DEUX règles, et c'est la frontière entre elles qui compte le plus ici.
//
// `apparier` (sous-chaîne) GROUPE un affichage : elle vivait dans `lib/carte.ts` et n'était
// appliquée que par la carte, si bien que la mesure des distances comparait les noms
// littéralement et re-géocodait « Laserax inc. » alors que « Laserax » était déjà situé.
//
// `memeEmployeur` (égalité après normalisation) décide de DONNÉES : quelle position sert à
// écrire une distance et une note. La première version de ce module laissait `positionDe`
// employer la règle floue — mesuré : une offre de « Robert » aurait pris la position de
// « Groupe Robert ». Les tests du bas verrouillent cette séparation.

import { describe, it, expect } from "vitest";
import {
  LONGUEUR_MIN_APPARIEMENT,
  apparier,
  memeEmployeur,
  normaliserNomEmployeur,
  positionDe,
} from "../lib/employeurs";
import { ENTREPRISES_CIBLES } from "../lib/reference";

describe("appariement des noms", () => {
  it("apparie une désignation plus longue à sa forme courte", () => {
    expect(apparier("Groupe Leclerc", "Leclerc")).toBe(true);
    expect(apparier("Laserax", "Laserax inc.")).toBe(true);
    expect(apparier("STERIS Canada", "STERIS")).toBe(true);
  });

  it("n'apparie PAS deux employeurs distincts", () => {
    expect(apparier("Canam Ponts", "Robotiq")).toBe(false);
  });

  it("ignore la casse et les espaces de bord", () => {
    expect(apparier("  LASERAX  ", "laserax")).toBe(true);
  });

  it("exige l'égalité stricte sous la longueur minimale", () => {
    // Sans plancher, un sigle apparierait la moitié de la liste par sous-chaîne. La
    // contrepartie est assumée : « ISS » et « ISS Facility Services » restent distincts.
    const court = "A".repeat(LONGUEUR_MIN_APPARIEMENT - 1);
    expect(apparier(court, `${court}METEK`)).toBe(false);
    expect(apparier(court, court)).toBe(true);
    expect(apparier("ISS", "ISS Facility Services")).toBe(false);
    expect(apparier("", "")).toBe(false);
  });
});

describe("retrouver une position sous n'importe lequel des deux noms", () => {
  const positions = new Map([
    ["Laserax", { lat: 46.75, lon: -71.29 }],
    ["Chantier Davie", { lat: 46.73, lon: -71.18 }],
  ]);

  it("rend la position quand le nom coïncide", () => {
    expect(positionDe("Laserax", positions)).toEqual({ lat: 46.75, lon: -71.29 });
  });

  it("rend la position quand le nom DIFFÈRE mais désigne le même employeur", () => {
    // C'est tout l'objet du module : la passe de la carte inscrit `cible.nom`, la mesure
    // des distances inscrit `offre.entreprise`. Les deux doivent se retrouver.
    expect(positionDe("Laserax inc.", positions)).toEqual({ lat: 46.75, lon: -71.29 });
  });

  it("rend null — et pas undefined — quand l'employeur est inconnu", () => {
    expect(positionDe("Employeur Jamais Vu", positions)).toBeNull();
  });

  it("préfère l'égalité stricte à l'heuristique", () => {
    // Quand les deux noms coïncident, aucune heuristique n'a à se prononcer : sinon
    // l'ordre d'insertion de la table déciderait à sa place.
    const ambigu = new Map([
      ["Groupe Test Canada", { lat: 1, lon: 1 }],
      ["Groupe Test", { lat: 2, lon: 2 }],
    ]);
    expect(positionDe("Groupe Test", ambigu)).toEqual({ lat: 2, lon: 2 });
  });

  it("ne trouve rien dans une table vide, sans lever", () => {
    expect(positionDe("Laserax", new Map())).toBeNull();
  });
});

describe("l'égalité STRICTE, celle qui décide des données", () => {
  // `apparier` groupe un affichage ; `memeEmployeur` décide quelle position sert à écrire
  // une distance et une note. Confondre les deux a un coût mesuré, verrouillé plus bas.

  it("ignore la forme juridique, la casse et la ponctuation", () => {
    expect(memeEmployeur("Laserax", "Laserax inc.")).toBe(true);
    expect(memeEmployeur("LASERAX INC", "laserax")).toBe(true);
    expect(memeEmployeur("Machin ltée", "Machin")).toBe(true);
    expect(memeEmployeur("Truc Corp.", "truc")).toBe(true);
  });

  it("retire les formes juridiques EMPILÉES", () => {
    expect(normaliserNomEmployeur("Machin inc. ltée")).toBe("machin");
  });

  it("ne rapproche PAS deux employeurs qu'une sous-chaîne suffirait à confondre", () => {
    // LE cas qui a motivé la séparation des deux règles. Mesuré avant correction :
    // `apparier` rendait `true`, donc une offre de « Robert » recevait la position, la
    // distance et la note de « Groupe Robert » — sans un mot dans les journaux.
    expect(apparier("Robert", "Groupe Robert")).toBe(true);
    expect(memeEmployeur("Robert", "Groupe Robert")).toBe(false);
    expect(memeEmployeur("Leclerc", "Groupe Leclerc")).toBe(false);
    expect(memeEmployeur("Boulangerie Leclerc", "Groupe Leclerc")).toBe(false);
  });

  it("un nom vide n'apparie rien, pas même un autre nom vide", () => {
    expect(memeEmployeur("", "")).toBe(false);
    expect(memeEmployeur("  inc.  ", "")).toBe(false);
  });

  it("aucune entreprise cible n'en confond une autre", () => {
    // Volume prouvé : sans cette borne, une liste vidée ferait passer le test à vide.
    expect(ENTREPRISES_CIBLES.length).toBeGreaterThan(20);
    const confusions: string[] = [];
    for (const a of ENTREPRISES_CIBLES) {
      for (const b of ENTREPRISES_CIBLES) {
        if (a.nom !== b.nom && memeEmployeur(a.nom, b.nom)) confusions.push(`${a.nom} ~ ${b.nom}`);
      }
    }
    expect(confusions).toEqual([]);
  });
});

describe("positionDe ne décide jamais au hasard", () => {
  it("n'utilise PAS la règle floue : un homonyme partiel n'a pas de position", () => {
    const positions = new Map([["Groupe Robert", { lat: 46.7, lon: -71.15 }]]);
    expect(positionDe("Robert", positions)).toBeNull();
  });

  it("rend le MÊME résultat quel que soit l'ordre de la table", () => {
    // `db.select()` sans `ORDER BY` ne garantit aucun ordre. Sans tri, le gagnant d'une
    // ambiguïté changerait d'une requête à l'autre — puis serait figé en base par la
    // première mesure de distance, donc indébogable après coup.
    const entrees: [string, { lat: number; lon: number }][] = [
      ["Machin ltée", { lat: 1, lon: 1 }],
      ["Machin inc.", { lat: 2, lon: 2 }],
    ];
    const a = positionDe("Machin", new Map(entrees));
    const b = positionDe("Machin", new Map([...entrees].reverse()));
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
});
