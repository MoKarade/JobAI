// tests/trajetRoutes.test.ts — le cache, le format, et l'appel Routes (fetch INJECTÉ :
// aucun test ne touche le réseau, chaque appel réel étant facturé).

import { describe, it, expect, vi } from "vitest";
import {
  TOLERANCE_POSITION_DEG,
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
