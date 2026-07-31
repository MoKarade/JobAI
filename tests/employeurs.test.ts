// tests/employeurs.test.ts — le même employeur sous deux noms.
//
// La règle vivait dans `lib/carte.ts` et n'était appliquée QUE par la carte : la mesure des
// distances comparait les noms littéralement. Une entreprise déjà située sous « Laserax »
// était donc re-géocodée sous « Laserax inc. » — un appel de plus à un service bénévole, et
// une ligne en double. Ces tests verrouillent la règle partagée.

import { describe, it, expect } from "vitest";
import { LONGUEUR_MIN_APPARIEMENT, apparier, positionDe } from "../lib/employeurs";

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
