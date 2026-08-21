// tests/trajetRoutes.test.ts — le cache, le format, et l'appel Routes (fetch INJECTÉ :
// aucun test ne touche le réseau, chaque appel réel étant facturé).

import { describe, it, expect, vi } from "vitest";
import {
  BANDES_DUREE_MIN,
  bandeDuree,
  TOLERANCE_POSITION_DEG,
  appelerMatrice,
  appelerRoutes,
  cacheValide,
  formaterDistance,
  formaterDuree,
} from "@/lib/trajetRoutes";

const P = { lat: 46.8, lon: -71.25 };
const ligne = { lat: P.lat, lon: P.lon, origineLat: 46.81, origineLon: -71.3 };
const maison = { lat: 46.81, lon: -71.3 };

describe("cacheValide — recalculer coûte, la tolérance est dérivée de la constante", () => {
  it("tient quand rien n'a bougé, ou bougé sous la tolérance", () => {
    expect(cacheValide(ligne, P, maison)).toBe(true);
    expect(
      cacheValide(ligne, { lat: P.lat + TOLERANCE_POSITION_DEG / 2, lon: P.lon }, maison),
    ).toBe(true);
  });

  it("tombe quand UNE extrémité a bougé au-delà — l'entreprise OU le domicile", () => {
    const loin = TOLERANCE_POSITION_DEG * 3;
    expect(cacheValide(ligne, { lat: P.lat + loin, lon: P.lon }, maison)).toBe(false);
    // Un déménagement invalide TOUT : un trajet depuis l'ancienne maison est un mensonge.
    expect(cacheValide(ligne, P, { lat: maison.lat + loin, lon: maison.lon })).toBe(false);
  });
});

describe("formats — jamais de fausse précision", () => {
  it("minutes sous l'heure, heures au-delà, jamais de secondes", () => {
    expect(formaterDuree(34 * 60)).toBe("34 min");
    expect(formaterDuree(65 * 60)).toBe("1 h 05");
    expect(formaterDuree(120 * 60)).toBe("2 h");
  });
  it("mètres sous le kilomètre, kilomètres ronds au-delà", () => {
    expect(formaterDistance(850)).toBe("850 m");
    expect(formaterDistance(27_600)).toBe("28 km");
  });
});

describe("appelerRoutes — fetch injecté, échecs NOMMÉS", () => {
  const bonne = () =>
    new Response(
      JSON.stringify({
        routes: [
          { duration: "2040s", distanceMeters: 27600, polyline: { encodedPolyline: "abc" } },
        ],
      }),
    );

  it("parse la durée « 2040s » en nombre — une CHAÎNE avec un s, pas un nombre", async () => {
    const r = await appelerRoutes(maison, P, "cle", vi.fn(async () => bonne()));
    expect(r).toEqual({ ok: true, dureeS: 2040, distanceM: 27600, polyline: "abc" });
  });

  it("nomme le statut HTTP — un 403 (clé) et un 429 (quota) appellent des gestes opposés", async () => {
    const r = await appelerRoutes(maison, P, "cle", vi.fn(async () => new Response("", { status: 403 })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toContain("403");
  });

  it("refuse une réponse hors schéma plutôt que de cacher un NaN", async () => {
    const r = await appelerRoutes(
      maison,
      P,
      "cle",
      vi.fn(async () => new Response(JSON.stringify({ routes: [{ duration: "bientôt" }] }))),
    );
    expect(r.ok).toBe(false);
  });

  it("⚠️ le FieldMask part avec l'appel — c'est une borne de COÛT, pas un détail", async () => {
    const f = vi.fn(async () => bonne());
    await appelerRoutes(maison, P, "cle", f);
    const [, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    const masque = new Headers(init.headers).get("X-Goog-FieldMask");
    expect(masque).toContain("routes.duration");
    expect(masque).not.toContain("*");
    // Et la préférence SANS trafic : c'est ce qui rend la durée cachable.
    expect(String(init.body)).toContain("TRAFFIC_UNAWARE");
  });
});

describe("appelerMatrice — N destinations, les inatteignables NOMMÉES", () => {
  const dests = [
    { nom: "Alpha Industries", lat: 46.8, lon: -71.2 },
    { nom: "Beta Fabrication", lat: 46.9, lon: -71.1 },
  ];
  const reponse = (corps: unknown) => new Response(JSON.stringify(corps));

  it("rattache chaque élément à son nom par l'index", async () => {
    const r = await appelerMatrice(maison, dests, "cle", vi.fn(async () =>
      reponse([
        { originIndex: 0, destinationIndex: 1, condition: "ROUTE_EXISTS", duration: "600s", distanceMeters: 9000 },
        { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "1200s", distanceMeters: 18000 },
      ]),
    ));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // L'ordre de la réponse n'est PAS celui des destinations : c'est l'index qui fait foi.
    expect(r.elements).toContainEqual({ nom: "Alpha Industries", dureeS: 1200, distanceM: 18000 });
    expect(r.elements).toContainEqual({ nom: "Beta Fabrication", dureeS: 600, distanceM: 9000 });
  });

  it("⚠️ un élément sans ROUTE_EXISTS est écarté ET nommé — jamais un zéro plausible", async () => {
    const r = await appelerMatrice(maison, dests, "cle", vi.fn(async () =>
      reponse([
        { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "600s", distanceMeters: 9000 },
        // ⚠️ CAS DÉGÉNÉRÉ FORGÉ, et c'est voulu : une durée PRÉSENTE sous un statut qui la
        // désavoue. Sans lui, ce test ne sépare pas « pas de ROUTE_EXISTS » de « pas de
        // durée » — la première mutation l'a prouvé en passant VERTE : l'élément de test
        // n'avait ni l'un ni l'autre, et les deux gardes se masquaient mutuellement.
        { originIndex: 0, destinationIndex: 1, condition: "ROUTE_NOT_FOUND", duration: "5s", distanceMeters: 10 },
      ]),
    ));
    if (!r.ok) return;
    expect(r.elements).toHaveLength(1);
    expect(r.inatteignables).toEqual(["Beta Fabrication"]);
  });

  it("zéro destination = zéro appel — le fetch n'est jamais touché", async () => {
    const f = vi.fn();
    const r = await appelerMatrice(maison, [], "cle", f as never);
    expect(r).toEqual({ ok: true, elements: [], inatteignables: [] });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("bandeDuree — les bornes sont INCLUSIVES et dérivées des constantes", () => {
  it("classe aux bornes exactes, dérivées de BANDES_DUREE_MIN", () => {
    const [b1, b2, b3] = BANDES_DUREE_MIN;
    expect(bandeDuree(b1 * 60)).toBe(1);
    expect(bandeDuree(b1 * 60 + 1)).toBe(2);
    expect(bandeDuree(b2 * 60)).toBe(2);
    expect(bandeDuree(b3 * 60)).toBe(3);
    expect(bandeDuree(b3 * 60 + 1)).toBe(4);
  });
});
