// tests/overpass.test.ts — interroger OpenStreetMap sans jamais mentir sur le résultat.
//
// Le point le plus important tient en une phrase : un ÉCHEC n'est pas « aucune borne ».
// Mesuré le 2026-08-05, l'instance publique a répondu HTTP 504 — service bénévole saturé.
// Si ce cas rendait une liste vide, l'écran afficherait « aucune borne à proximité » pour
// un lieu qu'on n'a jamais pu interroger.

import { describe, it, expect } from "vitest";
import {
  DELAI_MAX_MS,
  DELAI_SERVEUR_S,
  chercherBornes,
  chercherBornesBoite,
  lireBornes,
  remarqueOverpass,
  requeteBornes,
} from "../lib/overpass";
import { RAYON_5_MIN_M } from "../lib/bornes";

/** Une boîte régionale plausible, pour les tests qui n'en font pas leur sujet. */
const BOITE = { latMin: 46.7, lonMin: -71.4, latMax: 46.9, lonMax: -71.1 };

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

describe("un HTTP 200 ne prouve rien : lire le CORPS", () => {
  // ⚠️ CE BLOC PROTÈGE LA PANNE QUI A GELÉ TOUTE LA FONCTIONNALITÉ.
  //
  // Quand sa requête dépasse le temps imparti, Overpass ne répond pas par une erreur HTTP :
  // il rend 200, un JSON valide, `elements: []`, et un champ `remark`. Lu naïvement, ça dit
  // « aucune borne de recharge » — et comme l'app inscrit alors la date de mesure, les
  // entreprises ne sont PLUS JAMAIS réinterrogées. Un incident transitoire devient un fait
  // permanent, sans qu'aucune erreur ne soit levée nulle part.

  it("reconnaît le signal d'abandon dans un corps par ailleurs valide", () => {
    expect(
      remarqueOverpass({
        version: 0.6,
        remark: "runtime error: Query timed out in 'query' at line 1 after 7 seconds.",
        elements: [],
      }),
    ).toContain("timed out");
    // Une réponse normale n'en porte pas : le garde ne doit pas crier sur du succès.
    expect(remarqueOverpass({ version: 0.6, elements: [] })).toBeNull();
    expect(remarqueOverpass({ remark: "   " })).toBeNull();
    expect(remarqueOverpass(null)).toBeNull();
  });

  it("un 200 PORTEUR d'un remark est un ÉCHEC, pas un lot vide", async () => {
    // Le test qui compte : `ok: false` fait repasser les lignes, `ok: true` les fige.
    const recuperer = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ remark: "runtime error: Query timed out", elements: [] }),
    })) as unknown as typeof fetch;

    const r = await chercherBornesBoite(BOITE, { recuperer, instances: ["https://un.test/"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toContain("timed out");
  });

  it("un vrai lot vide reste un lot vide", async () => {
    // L'inverse doit rester vrai : sans remark, zéro borne est une RÉPONSE — et c'est ce
    // qui distingue « on a cherché, il n'y a rien » de « on n'a pas pu chercher ».
    const recuperer = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: 0.6, elements: [] }),
    })) as unknown as typeof fetch;

    const r = await chercherBornesBoite(BOITE, { recuperer, instances: ["https://un.test/"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bornes).toEqual([]);
  });
});

describe("le délai accordé au serveur", () => {
  it("reste SOUS celui au bout duquel on raccroche", () => {
    // ⚠️ Il était à 12 s alors qu'on abandonne à 8 : toute requête prenant entre les deux
    // était jetée par nous pendant que le serveur la traitait encore, et comptée comme un
    // échec d'instance. Donner à un service plus de temps qu'on n'est prêt à en attendre,
    // c'est fabriquer des échecs qui n'en sont pas. La borne est DÉRIVÉE des deux
    // constantes, jamais recopiée.
    expect(DELAI_SERVEUR_S * 1000).toBeLessThan(DELAI_MAX_MS);
  });

  it("la requête annonce bien ce délai-là", () => {
    expect(requeteBornes(BOITE)).toContain(`[timeout:${DELAI_SERVEUR_S}]`);
  });

  it("interroge les points ET les surfaces", () => {
    // Une borne est parfois cartographiée comme un point, parfois comme la surface d'une
    // station. N'interroger que les points ferait dire « aucune borne » à tort.
    const q = requeteBornes(BOITE);
    expect(q).toContain('node["amenity"="charging_station"]');
    expect(q).toContain('way["amenity"="charging_station"]');
  });
});
