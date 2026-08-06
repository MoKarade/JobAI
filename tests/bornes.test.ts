// tests/bornes.test.ts — « où est la borne la plus proche ? »
//
// Ce que ces tests protègent avant tout : l'HONNÊTETÉ de la réponse. « Aucune borne » et
// « pas encore mesuré » ne sont pas la même chose ; « on ignore la puissance » n'est pas
// « c'est une borne standard » ; et un temps de marche annoncé sans avoir calculé de trajet
// est un chiffre plausible et faux.
//
// ⚠️ LE PLAFOND DE 350 m A DISPARU (2026-08-06). Les tests qui le vérifiaient ont été
// REMPLACÉS, pas assouplis : ils garantissaient exactement le comportement qui rendait la
// fonctionnalité inutile en production — « aucune borne » pour la quasi-totalité des
// employeurs. Un test qui verrouille un défaut doit tomber avec lui.

import { describe, it, expect } from "vitest";
import {
  MARCHE_PLAUSIBLE_M,
  PORTEE_RECHERCHE_M,
  VITESSE_MARCHE_KMH,
  boiteAutour,
  boiteEnglobante,
  distanceM,
  libelleBorne,
  libelleDistanceBorne,
  minutesAPied,
  proximiteBorne,
  type Borne,
} from "../lib/bornes";
import { ETENDUE_MAX_DEG } from "../lib/overpass";

/** Un point de référence dans la région, sans rapport avec un lieu personnel. */
const LIEU = { lat: 46.81, lon: -71.21 };

function borne(
  id: number,
  lat: number,
  lon: number,
  reste: Partial<Omit<Borne, "id" | "lat" | "lon">> = {},
): Borne {
  return { id, lat, lon, nom: null, rapide: null, tarif: null, ...reste };
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
  it("retient la plus proche, et rapporte SES attributs", () => {
    const r = proximiteBorne(LIEU, [
      borne(1, 46.8125, -71.21, { nom: "Circuit électrique", rapide: true }),
      borne(2, 46.8115, -71.21, { nom: "Flo", rapide: false, tarif: "gratuite" }),
    ]);
    expect(r.nom).toBe("Flo"); // la plus proche
    // ⚠️ Discrimination : les attributs viennent de la borne RETENUE, pas d'un mélange des
    // deux. Sans ce cas, un code qui garderait le premier `rapide` non nul passerait.
    expect(r.rapide).toBe(false);
    expect(r.tarif).toBe("gratuite");
  });

  it("N'IGNORE PLUS ce qui est loin — c'est tout le correctif", () => {
    // ~1,1 km : au-delà de l'ancien plafond de cinq minutes, qui rendait `null` ici.
    // En production, cette règle affichait « aucune borne » pour presque tous les
    // employeurs — une réponse exacte dont on ne pouvait rien faire.
    const r = proximiteBorne(LIEU, [borne(1, 46.82, -71.21, { nom: "Loin mais réelle" })]);
    expect(r.plusProcheM).toBeGreaterThan(1000);
    expect(r.nom).toBe("Loin mais réelle");
  });

  it("répond « aucune » plutôt que rien du tout", () => {
    // La distinction qui compte : « rien trouvé » est une RÉPONSE. « Pas mesuré » est une
    // absence. L'interface ne doit jamais présenter la seconde comme la première.
    const r = proximiteBorne(LIEU, []);
    expect(r).toEqual({ plusProcheM: null, nom: null, rapide: null, tarif: null });
  });

  it("accepte une borne sans marque — OpenStreetMap n'en donne pas toujours", () => {
    // ⚠️ Position DÉRIVÉE du point de référence, jamais écrite en dur : le garde-fou n°1
    // interdit toute paire de coordonnées à quatre décimales dans un fichier versionné,
    // et il a raison — c'est la FORME qui reconstituerait un domicile, pas l'intention.
    const r = proximiteBorne(LIEU, [borne(1, LIEU.lat + 0.0002, LIEU.lon + 0.0001)]);
    expect(r.nom).toBeNull();
    expect(r.rapide).toBeNull();
    expect(r.plusProcheM).not.toBeNull();
  });

  it("arrondit la distance au mètre — un décimètre n'apprend rien", () => {
    const r = proximiteBorne(LIEU, [borne(1, LIEU.lat + 0.003, LIEU.lon)]);
    expect(Number.isInteger(r.plusProcheM)).toBe(true);
  });
});

describe("temps de marche — approximatif, et il le dit", () => {
  it("majore la distance à vol d'oiseau : aucune rue ne va tout droit", () => {
    // 350 m en ligne droite ≈ 437 m de parcours ≈ 5,5 min → 6 min arrondies au-dessus.
    // Le point : ce n'est PAS 4 min, ce que donnerait un calcul naïf.
    const naif = (350 / 1000 / VITESSE_MARCHE_KMH) * 60;
    expect(minutesAPied(350)).toBeGreaterThan(naif);
  });

  it("arrondit vers le HAUT : mieux vaut annoncer trop que trop peu", () => {
    expect(minutesAPied(1)).toBe(1);
    expect(Number.isInteger(minutesAPied(300))).toBe(true);
  });

  it("croît avec la distance", () => {
    expect(minutesAPied(600)).toBeGreaterThan(minutesAPied(200));
  });
});

describe("comment se dit une distance de borne", () => {
  it("donne la DURÉE tant que la marche est plausible", () => {
    const s = libelleDistanceBorne(MARCHE_PLAUSIBLE_M - 1);
    expect(s).toContain("min à pied");
    expect(s.startsWith("~")).toBe(true); // la mesure est à vol d'oiseau, et ça se dit
  });

  it("bascule en KILOMÈTRES au-delà : « ~63 min à pied » n'aide personne", () => {
    // Cas dérivé du SEUIL, jamais de sa valeur du jour : rehausser `MARCHE_PLAUSIBLE_M`
    // ne doit pas transformer ce test en mensonge.
    const s = libelleDistanceBorne(MARCHE_PLAUSIBLE_M);
    expect(s).toContain("km");
    expect(s).not.toContain("min");
  });

  it("écrit les décimales à la française, et les abandonne au-delà de 10 km", () => {
    expect(libelleDistanceBorne(4200)).toBe("4,2 km");
    expect(libelleDistanceBorne(23_400)).toBe("23 km");
  });
});

describe("ce qu'on dit de la borne — rien de plus que ce qui est publié", () => {
  it("assemble vitesse, marque et tarif quand ils sont connus", () => {
    expect(
      libelleBorne({ nom: "Circuit électrique", rapide: true, tarif: "0,35 $/kWh" }),
    ).toBe("rapide · Circuit électrique · 0,35 $/kWh");
  });

  it("N'ÉCRIT RIEN sur ce qu'il ignore — pas de « standard » par défaut", () => {
    // ⚠️ Le cœur du garde-fou n°3 appliqué à un booléen : une borne dont OpenStreetMap ne
    // déclare pas la puissance ne doit pas s'afficher « standard ». Trois états, pas deux.
    expect(libelleBorne({ nom: null, rapide: null, tarif: null })).toBe("");
    expect(libelleBorne({ nom: "Flo", rapide: null, tarif: null })).toBe("Flo");
  });

  it("distingue « standard » de « on ne sait pas »", () => {
    expect(libelleBorne({ nom: null, rapide: false, tarif: null })).toBe("standard");
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

  it("contient bien toute la portée demandée", () => {
    // Non-vacuité : une boîte trop petite laisserait des bornes hors du champ interrogé,
    // et la réponse « aucune borne » serait alors fausse.
    const b = boiteAutour(LIEU, PORTEE_RECHERCHE_M);
    const bordNord = { lat: b.latMax, lon: LIEU.lon };
    const bordEst = { lat: LIEU.lat, lon: b.lonMax };
    expect(distanceM(LIEU, bordNord)).toBeGreaterThanOrEqual(PORTEE_RECHERCHE_M - 5);
    expect(distanceM(LIEU, bordEst)).toBeGreaterThanOrEqual(PORTEE_RECHERCHE_M - 5);
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

  it("garde la MARGE de la portée cherchée", () => {
    // Sans marge, une borne située juste au-delà du dernier employeur du lot sortirait de
    // la boîte, et « aucune borne » serait faux pour lui. La marge suit `PORTEE_RECHERCHE_M`
    // — le test la dérive de la constante plutôt que de recopier sa valeur du jour.
    const seul = { lat: 46.8, lon: -71.2 };
    const b = boiteEnglobante([seul])!;
    const bordNord = { lat: b.latMax, lon: seul.lon };
    expect(distanceM(seul, bordNord)).toBeGreaterThanOrEqual(PORTEE_RECHERCHE_M - 5);
  });

  it("reste sous la garde d'étendue pour un lot étalé sur toute la région", () => {
    // ⚠️ LE POINT DE CONTRÔLE DU PASSAGE DE 350 m À 15 km DE MARGE. `chercherLesBornes`
    // (lib/actions.ts) refuse une boîte plus large que `ETENDUE_MAX_DEG` : si la marge
    // faisait dépasser ce seuil, la mesure ne se ferait JAMAIS, et rien à l'écran ne le
    // dirait — juste « non mesuré » à perpétuité. Ce cas fait passer le lot de Portneuf à
    // Charlevoix, l'étalement réel d'un employeur de la région à l'autre.
    const region = [
      { lat: 46.4, lon: -71.9 },
      { lat: 47.4, lon: -70.3 },
    ];
    const b = boiteEnglobante(region)!;
    expect(b.latMax - b.latMin).toBeLessThan(ETENDUE_MAX_DEG);
    expect(b.lonMax - b.lonMin).toBeLessThan(ETENDUE_MAX_DEG);
    // Non-vacuité : sans ça, un `ETENDUE_MAX_DEG` monté à 50 rendrait le test toujours vert.
    // Le seuil doit rester SERRÉ autour du besoin réel, pas devenir un blanc-seing.
    expect(b.lonMax - b.lonMin).toBeGreaterThan(1.5);
  });

  it("un seul lieu donne la même boîte que la recherche ponctuelle", () => {
    // La cohérence qui compte : passer de « une requête par lieu » à « une requête pour
    // tous » ne doit rien changer au périmètre couvert pour un lieu isolé.
    const l = { lat: 46.81, lon: -71.21 };
    const englobante = boiteEnglobante([l])!;
    const ponctuelle = boiteAutour(l, PORTEE_RECHERCHE_M);
    expect(englobante.latMin).toBeCloseTo(ponctuelle.latMin, 6);
    expect(englobante.latMax).toBeCloseTo(ponctuelle.latMax, 6);
    expect(englobante.lonMin).toBeCloseTo(ponctuelle.lonMin, 6);
    expect(englobante.lonMax).toBeCloseTo(ponctuelle.lonMax, 6);
  });
});
