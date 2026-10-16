// tests/mesureLieux.test.ts — juger un nom de lieu par la MESURE (lib/mesureLieux.ts).
//
// Ce fichier branche le géocodeur et le domicile à la décision pure de `lib/ingest/lieux.ts`.
// Les tests exécutent la VRAIE jonction : le domicile vient de l'environnement (coordonnées
// fictives, le centre-ville de Québec), le géocodeur lit de vraies réponses Nominatim, seul
// `fetch` — la frontière réseau — est remplacé. Un test qui simulerait le géocodeur validerait
// mes suppositions sur la jonction, pas la jonction.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUDGET_LIEUX_MS, mesurerLieuxInconnus } from "../lib/mesureLieux";
import type { RegistreLieux } from "../lib/ingest/lieux";

// Un point de référence public (centre de Québec), pas un domicile.
const REFERENCE = { lat: "46.8139", lon: "-71.2080" };
const RAYON_KM = 50;
const JOUR = "2026-10-16";

/** Une réponse Nominatim : une municipalité à (lat, lon). */
const municipalite = (lat: number, lon: number) =>
  new Response(JSON.stringify([{ lat: String(lat), lon: String(lon), class: "place" }]), {
    status: 200,
  });

const nominatimPar = (parNom: Record<string, Response | "introuvable">) =>
  vi.fn(async (url: string | URL | Request) => {
    const q = new URL(String(url)).searchParams.get("q") ?? "";
    const r = parNom[q];
    if (r === undefined) throw new Error(`requête inattendue : ${q}`);
    return r === "introuvable" ? new Response("[]", { status: 200 }) : r.clone();
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DOMICILE_LAT", REFERENCE.lat);
  vi.stubEnv("DOMICILE_LON", REFERENCE.lon);
  vi.stubEnv("DOMICILE_ADRESSE", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Lance la mesure et laisse passer la cadence de 1,1 s entre deux requêtes. */
async function mesurer(noms: string[], registre: RegistreLieux = {}) {
  const promesse = mesurerLieuxInconnus(noms, registre, JOUR, RAYON_KM);
  await vi.advanceTimersByTimeAsync(10_000);
  return promesse;
}

describe("mesurerLieuxInconnus", () => {
  it("n'a pas de budget plus long que ce que l'ingestion peut absorber", () => {
    expect(BUDGET_LIEUX_MS).toBe(12_000);
  });

  it("sans nom à juger, ne touche à rien et n'appelle personne", async () => {
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);
    const registre: RegistreLieux = { levis: { verdict: "dans-la-region", km: 12, le: "2026-10-01", essais: 1 } };

    const r = await mesurerLieuxInconnus([], registre, JOUR, RAYON_KM);

    expect(r).toEqual({ registre, juges: 0, introuvables: 0 });
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("juge chaque nom par sa distance au domicile : dans la région, hors région, introuvable", async () => {
    vi.stubGlobal(
      "fetch",
      nominatimPar({
        // ~12 km du point de référence
        "Ville Proche": municipalite(46.92, -71.2),
        // ~230 km : une autre région
        "Ville Lointaine": municipalite(45.5, -73.57),
        "Lieu Imaginaire": "introuvable",
      }),
    );

    const r = await mesurer(["Ville Proche", "Ville Lointaine", "Lieu Imaginaire"]);

    expect(r.juges).toBe(2);
    expect(r.introuvables).toBe(1);
    expect(r.registre["Ville Proche"]).toMatchObject({ verdict: "dans-la-region", le: JOUR, essais: 1 });
    expect(r.registre["Ville Proche"]?.km).toBeGreaterThan(5);
    expect(r.registre["Ville Proche"]?.km).toBeLessThan(25);
    expect(r.registre["Ville Lointaine"]).toMatchObject({ verdict: "hors-region", le: JOUR, essais: 1 });
    expect(r.registre["Ville Lointaine"]?.km).toBeGreaterThan(150);
    expect(r.registre["Lieu Imaginaire"]).toEqual({ verdict: "introuvable", km: null, le: JOUR, essais: 1 });
  });

  it("le domicile ne se retrouve dans aucun résultat", async () => {
    vi.stubGlobal("fetch", nominatimPar({ "Ville Proche": municipalite(46.92, -71.2) }));
    const r = await mesurer(["Ville Proche"]);
    const texte = JSON.stringify(r);
    expect(texte).not.toContain(REFERENCE.lat);
    expect(texte).not.toContain(REFERENCE.lon);
  });

  it("compte les essais précédents d'un nom déjà jugé, sans toucher aux autres entrées", async () => {
    vi.stubGlobal("fetch", nominatimPar({ "Lieu Imaginaire": "introuvable" }));
    const autre = { verdict: "hors-region", km: 300, le: "2026-09-01", essais: 2 } as const;
    const r = await mesurer(["Lieu Imaginaire"], {
      "Lieu Imaginaire": { verdict: "introuvable", km: null, le: "2026-09-20", essais: 1 },
      "Autre Ville": autre,
    });
    expect(r.registre["Lieu Imaginaire"]?.essais).toBe(2);
    expect(r.registre["Autre Ville"]).toEqual(autre);
  });

  it("sans domicile configuré, ne juge rien et ne contacte pas le géocodeur", async () => {
    vi.stubEnv("DOMICILE_LAT", "");
    vi.stubEnv("DOMICILE_LON", "");
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registre: RegistreLieux = {};

    const r = await mesurerLieuxInconnus(["Ville Proche"], registre, JOUR, RAYON_KM);

    expect(r).toEqual({ registre, juges: 0, introuvables: 0 });
    expect(fetchSimule).not.toHaveBeenCalled();
    expect(avertir).toHaveBeenCalledWith(expect.stringContaining("domicile non configuré"));
  });

  it("une panne du géocodeur est DITE et n'inscrit aucun verdict pour les noms non traités", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("trop de requêtes", { status: 429 })),
    );
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await mesurer(["Ville Proche", "Ville Lointaine"]);

    expect(r).toEqual({ registre: {}, juges: 0, introuvables: 0 });
    expect(avertir).toHaveBeenCalledWith("[lieux] géocodeur en panne :", expect.stringContaining("429"));
  });

  it("garde ce qui a été jugé avant une panne en cours de route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const q = new URL(String(url)).searchParams.get("q");
        if (q === "Ville Proche") return municipalite(46.92, -71.2);
        return new Response("indisponible", { status: 503 });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await mesurer(["Ville Proche", "Ville Lointaine"]);

    expect(r.juges).toBe(1);
    expect(r.registre["Ville Proche"]?.verdict).toBe("dans-la-region");
    expect(r.registre["Ville Lointaine"]).toBeUndefined();
  });
});
