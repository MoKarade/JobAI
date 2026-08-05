// tests/bornes.test.ts — « y a-t-il une borne à cinq minutes ? »
//
// Ce que ces tests protègent avant tout : l'HONNÊTETÉ de la réponse. « Aucune borne » et
// « pas encore mesuré » ne sont pas la même chose, et un temps de marche annoncé sans
// avoir calculé de trajet est un chiffre plausible et faux.

import { describe, it, expect } from "vitest";
import {
  RAYON_5_MIN_M,
  VITESSE_MARCHE_KMH,
  boiteAutour,
  boiteEnglobante,
  distanceM,
  minutesAPied,
  proximiteBorne,
  type Borne,
} from "../lib/bornes";

/** Un point de référence dans la région, sans rapport avec un lieu personnel. */
const LIEU = { lat: 46.81, lon: -71.21 };

function borne(id: number, lat: number, lon: number, nom: string | null = null): Borne {
  return { id, lat, lon, nom };
}

describe("distance en mètres", () => {
  it("rend zéro sur le même point", () => {
    expect(distanceM(LIEU, LIEU)).toBe(0);
  });

  it("mesure une distance connue", () => {
    // Un centième de degré de latitude ≈ 1,11 km, partout sur le globe.
    const d = distanceM(LIEU, { lat: LIEU.lat + 0.01, lon: LIEU.lon });
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1160);
  });

  it("tient compte du rétrécissement des longitudes", () => {
    // À la latitude de Québec, un degré de longitude est nettement plus court qu'un degré
    // de latitude. Les confondre gonflerait les distances est-ouest d'un tiers.
    const nord = distanceM(LIEU, { lat: LIEU.lat + 0.01, lon: LIEU.lon });
    const est = distanceM(LIEU, { lat: LIEU.lat, lon: LIEU.lon + 0.01 });
    expect(est).toBeLessThan(nord * 0.8);
  });
});

describe("la borne la plus proche", () => {
  it("trouve celle qui est dans le rayon, et la plus proche d'abord", () => {
    const r = proximiteBorne(LIEU, [
      borne(1, 46.8125, -71.21, "Circuit électrique"),
      borne(2, 46.8115, -71.21, "Flo"),
    ]);
    expect(r.nombre).toBe(2);
    expect(r.nom).toBe("Flo"); // la plus proche
    expect(r.plusProcheM).toBeLessThan(RAYON_5_MIN_M);
  });

  it("IGNORE ce qui est hors du rayon", () => {
    // ~1,1 km : bien au-delà de cinq minutes à pied.
    const r = proximiteBorne(LIEU, [borne(1, 46.82, -71.21, "Trop loin")]);
    expect(r.nombre).toBe(0);
    expect(r.plusProcheM).toBeNull();
    expect(r.nom).toBeNull();
  });

  it("répond « aucune » plutôt que rien du tout", () => {
    // La distinction qui compte : « zéro borne » est une RÉPONSE. « Pas mesuré » est une
    // absence. L'interface ne doit jamais présenter la seconde comme la première.
    const r = proximiteBorne(LIEU, []);
    expect(r).toEqual({ nombre: 0, plusProcheM: null, nom: null });
  });

  it("accepte une borne sans nom — OpenStreetMap n'en donne pas toujours", () => {
    // ⚠️ Position DÉRIVÉE du point de référence, jamais écrite en dur : le garde-fou n°1
    // interdit toute paire de coordonnées à quatre décimales dans un fichier versionné,
    // et il a raison — c'est la FORME qui reconstituerait un domicile, pas l'intention.
    const r = proximiteBorne(LIEU, [borne(1, LIEU.lat + 0.0002, LIEU.lon + 0.0001, null)]);
    expect(r.nombre).toBe(1);
    expect(r.nom).toBeNull();
    expect(r.plusProcheM).not.toBeNull();
  });

  it("le rayon est un PARAMÈTRE : un autre seuil donne un autre compte", () => {
    // Discrimination : sans ce cas, un rayon codé en dur passerait les tests précédents.
    const loin = [borne(1, 46.8150, -71.21)];
    expect(proximiteBorne(LIEU, loin, RAYON_5_MIN_M).nombre).toBe(0);
    expect(proximiteBorne(LIEU, loin, 1000).nombre).toBe(1);
  });
});

describe("temps de marche — approximatif, et il le dit", () => {
  it("majore la distance à vol d'oiseau : aucune rue ne va tout droit", () => {
    // 350 m en ligne droite ≈ 437 m de parcours ≈ 5,5 min → 6 min arrondies au-dessus.
    // Le point : ce n'est PAS 4 min, ce que donnerait un calcul naïf.
    const naif = (RAYON_5_MIN_M / 1000 / VITESSE_MARCHE_KMH) * 60;
    expect(minutesAPied(RAYON_5_MIN_M)).toBeGreaterThan(naif);
  });

  it("arrondit vers le HAUT : mieux vaut annoncer trop que trop peu", () => {
    expect(minutesAPied(1)).toBe(1);
    expect(Number.isInteger(minutesAPied(300))).toBe(true);
  });

  it("croît avec la distance", () => {
    expect(minutesAPied(600)).toBeGreaterThan(minutesAPied(200));
  });
});

describe("boîte d'interrogation", () => {
  it("entoure le point", () => {
    const b = boiteAutour(LIEU);
    expect(b.latMin).toBeLessThan(LIEU.lat);
    expect(b.latMax).toBeGreaterThan(LIEU.lat);
    expect(b.lonMin).toBeLessThan(LIEU.lon);
    expect(b.lonMax).toBeGreaterThan(LIEU.lon);
  });

  it("est plus large en longitude qu'en latitude, sous nos latitudes", () => {
    // Un degré de longitude vaut ~76 km à Québec contre ~111 km pour la latitude : pour
    // couvrir la même distance au sol, il en faut PLUS. Ignorer ce facteur donnerait une
    // boîte trop étroite d'est en ouest, et des bornes manquées d'un seul côté.
    const b = boiteAutour(LIEU);
    expect(b.lonMax - b.lonMin).toBeGreaterThan(b.latMax - b.latMin);
  });

  it("contient bien tout le rayon demandé", () => {
    // Non-vacuité : une boîte trop petite laisserait des bornes hors du champ interrogé,
    // et la réponse « aucune borne » serait alors fausse.
    const b = boiteAutour(LIEU, RAYON_5_MIN_M);
    const bordNord = { lat: b.latMax, lon: LIEU.lon };
    const bordEst = { lat: LIEU.lat, lon: b.lonMax };
    expect(distanceM(LIEU, bordNord)).toBeGreaterThanOrEqual(RAYON_5_MIN_M - 5);
    expect(distanceM(LIEU, bordEst)).toBeGreaterThanOrEqual(RAYON_5_MIN_M - 5);
  });
});

describe("boîte englobante — une requête au lieu de six", () => {
  it("englobe tous les lieux donnés", () => {
    const b = boiteEnglobante([
      { lat: 46.8, lon: -71.2 },
      { lat: 46.9, lon: -71.0 },
    ])!;
    expect(b.latMin).toBeLessThan(46.8);
    expect(b.latMax).toBeGreaterThan(46.9);
    expect(b.lonMin).toBeLessThan(-71.2);
    expect(b.lonMax).toBeGreaterThan(-71.0);
  });

  it("rend null sur une liste vide — il n'y a rien à interroger", () => {
    expect(boiteEnglobante([])).toBeNull();
  });

  it("garde la MARGE du rayon cherché", () => {
    // Sans marge, une borne située juste au-delà du dernier employeur du lot sortirait de
    // la boîte, et « aucune borne » serait faux pour lui.
    const seul = { lat: 46.8, lon: -71.2 };
    const b = boiteEnglobante([seul])!;
    const bordNord = { lat: b.latMax, lon: seul.lon };
    expect(distanceM(seul, bordNord)).toBeGreaterThanOrEqual(RAYON_5_MIN_M - 5);
  });

  it("un seul lieu donne la même boîte que la recherche ponctuelle", () => {
    // La cohérence qui compte : passer de « une requête par lieu » à « une requête pour
    // tous » ne doit rien changer au périmètre couvert pour un lieu isolé.
    const l = { lat: 46.81, lon: -71.21 };
    const englobante = boiteEnglobante([l])!;
    const ponctuelle = boiteAutour(l, RAYON_5_MIN_M);
    expect(englobante.latMin).toBeCloseTo(ponctuelle.latMin, 6);
    expect(englobante.latMax).toBeCloseTo(ponctuelle.latMax, 6);
    expect(englobante.lonMin).toBeCloseTo(ponctuelle.lonMin, 6);
    expect(englobante.lonMax).toBeCloseTo(ponctuelle.lonMax, 6);
  });
});
