// tests/overpass.test.ts — interroger OpenStreetMap sans jamais mentir sur le résultat.
//
// Le point le plus important tient en une phrase : un ÉCHEC n'est pas « aucune borne ».
// Mesuré le 2026-08-05, l'instance publique a répondu HTTP 504 — service bénévole saturé.
// Si ce cas rendait une liste vide, l'écran afficherait « aucune borne à proximité » pour
// un lieu qu'on n'a jamais pu interroger.

import { describe, it, expect } from "vitest";
import { chercherBornes, lireBornes, requeteBornes } from "../lib/overpass";
import { RAYON_5_MIN_M } from "../lib/bornes";

const LIEU = { lat: 46.81, lon: -71.21 };

/** Un faux `fetch` qui rend ce qu'on lui dit, et compte les appels. */
function faussetFetch(reponses: (Response | Error)[]) {
  const appels: string[] = [];
  const recuperer = (async (url: string | URL) => {
    appels.push(String(url));
    const r = reponses[appels.length - 1];
    if (r === undefined) throw new Error("appel inattendu");
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { recuperer, appels };
}

const ok = (elements: unknown[]) =>
  new Response(JSON.stringify({ elements }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("la requête", () => {
  it("demande les points ET les surfaces", () => {
    // Une borne est parfois un point, parfois la surface d'une station. N'interroger que
    // les points en manquerait — et « aucune borne » serait alors faux.
    const q = requeteBornes({ latMin: 46.8, lonMin: -71.22, latMax: 46.82, lonMax: -71.2 });
    expect(q).toContain("node[");
    expect(q).toContain("way[");
    expect(q).toContain("charging_station");
    expect(q).not.toContain("placeholder");
  });

  it("porte les bornes du rectangle demandé", () => {
    const q = requeteBornes({ latMin: 1, lonMin: 2, latMax: 3, lonMax: 4 });
    expect(q).toContain("1,2,3,4");
  });
});

describe("lecture de la réponse", () => {
  it("lit un point", () => {
    const b = lireBornes({ elements: [{ id: 7, lat: 46.81, lon: -71.21, tags: { name: "Flo" } }] });
    expect(b).toEqual([{ id: 7, lat: 46.81, lon: -71.21, nom: "Flo" }]);
  });

  it("lit une surface par son centre", () => {
    const b = lireBornes({ elements: [{ id: 9, center: { lat: 46.8, lon: -71.2 }, tags: {} }] });
    expect(b[0]).toMatchObject({ lat: 46.8, lon: -71.2, nom: null });
  });

  it("retient l'exploitant à défaut de nom", () => {
    const b = lireBornes({ elements: [{ id: 1, lat: 46.8, lon: -71.2, tags: { operator: "Hydro-Québec" } }] });
    expect(b[0]!.nom).toBe("Hydro-Québec");
  });

  it("ignore une entrée sans coordonnées plutôt que d'inventer un point", () => {
    const b = lireBornes({ elements: [{ id: 1, tags: {} }, { id: 2, lat: 46.8, lon: -71.2 }] });
    expect(b).toHaveLength(1);
    expect(b[0]!.id).toBe(2);
  });

  it("ne lève pas sur une réponse difforme", () => {
    expect(lireBornes(null)).toEqual([]);
    expect(lireBornes({})).toEqual([]);
    expect(lireBornes({ elements: "pas un tableau" })).toEqual([]);
  });
});

describe("un ÉCHEC n'est jamais « aucune borne »", () => {
  it("passe à l'instance suivante sur un 504", () => {
    // LE cas mesuré en vrai. Une seule instance serait un point unique de panne.
    const { recuperer, appels } = faussetFetch([
      new Response("saturé", { status: 504 }),
      ok([{ id: 1, lat: 46.8102, lon: -71.2101, tags: { name: "Circuit" } }]),
    ]);
    return chercherBornes(LIEU, RAYON_5_MIN_M, { recuperer, instances: ["https://a/x", "https://b/x"] }).then(
      (r) => {
        expect(appels).toHaveLength(2);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.bornes[0]!.nom).toBe("Circuit");
      },
    );
  });

  it("rend un ÉCHEC nommé quand TOUTES les instances tombent", async () => {
    const { recuperer } = faussetFetch([
      new Response("", { status: 504 }),
      new Error("réseau coupé"),
    ]);
    const r = await chercherBornes(LIEU, RAYON_5_MIN_M, {
      recuperer,
      instances: ["https://a/x", "https://b/x"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // La raison NOMME ce qui a échoué : un « ça n'a pas marché » ne se débogue pas.
      expect(r.raison).toContain("504");
      expect(r.raison).toContain("réseau coupé");
    }
  });

  it("une réponse VIDE est un succès à zéro borne — pas un échec", () => {
    // L'autre moitié de la distinction : « il n'y a vraiment rien ici » est une réponse
    // utile, et elle ne doit pas être traitée comme une panne.
    const { recuperer } = faussetFetch([ok([])]);
    return chercherBornes(LIEU, RAYON_5_MIN_M, { recuperer, instances: ["https://a/x"] }).then((r) => {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.bornes).toEqual([]);
    });
  });
});
