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
  SEUIL_RAPIDE_KW,
  estRapide,
  lireBornes,
  puissanceKw,
  remarqueOverpass,
  requeteBornes,
  tarifPublie,
} from "../lib/overpass";
import { PORTEE_RECHERCHE_M } from "../lib/bornes";

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
    expect(b).toEqual([
      { id: 7, lat: 46.81, lon: -71.21, nom: "Flo", rapide: null, tarif: null },
    ]);
  });

  it("lit une surface par son centre", () => {
    const b = lireBornes({ elements: [{ id: 9, center: { lat: 46.8, lon: -71.2 }, tags: {} }] });
    expect(b[0]).toMatchObject({ lat: 46.8, lon: -71.2, nom: null });
  });

  it("retient l'exploitant à défaut de nom", () => {
    const b = lireBornes({ elements: [{ id: 1, lat: 46.8, lon: -71.2, tags: { operator: "Hydro-Québec" } }] });
    expect(b[0]!.nom).toBe("Hydro-Québec");
  });

  it("PRÉFÈRE LE RÉSEAU AU NOM — c'est la marque qu'on cherche, pas le lieu d'accueil", () => {
    // ⚠️ Discrimination du correctif. `name` porte souvent le stationnement qui héberge la
    // borne (« Stationnement Place Fleur de Lys ») ; `network` porte l'enseigne. Lire le nom
    // d'abord répondait à une autre question que celle de Marc (« quelle marque »).
    const b = lireBornes({
      elements: [
        {
          id: 1,
          lat: 46.8,
          lon: -71.2,
          tags: { name: "Stationnement du Centre", network: "Circuit électrique" },
        },
      ],
    });
    expect(b[0]!.nom).toBe("Circuit électrique");
  });

  it("rapporte la vitesse et le tarif quand OpenStreetMap les publie", () => {
    const b = lireBornes({
      elements: [
        {
          id: 1,
          lat: 46.8,
          lon: -71.2,
          tags: { network: "Circuit électrique", "socket:chademo": "2", fee: "yes" },
        },
      ],
    });
    expect(b[0]).toMatchObject({ rapide: true, tarif: "payante, tarif non publié" });
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

describe("puissance annoncée", () => {
  it("lit les formes que les contributeurs écrivent vraiment", () => {
    expect(puissanceKw("50 kW")).toBe(50);
    expect(puissanceKw("62.5 kW")).toBe(62.5);
    expect(puissanceKw("7,2 kW")).toBe(7.2);
    expect(puissanceKw("50")).toBe(50);
  });

  it("comprend les watts, explicites ou déduits", () => {
    // ⚠️ Sans cette règle, « 50000 » (watts, tag `maxpower` sans unité) serait lu 50 000 kW
    // et toute borne ainsi taguée passerait pour rapide — vrai par accident ici, faux dès
    // qu'un « 7200 » (7,2 kW en watts) apparaît.
    expect(puissanceKw("50000 W")).toBe(50);
    expect(puissanceKw("7200")).toBe(7.2);
  });

  it("rend null sur ce qui n'est pas une puissance", () => {
    expect(puissanceKw("inconnu")).toBeNull();
    expect(puissanceKw("")).toBeNull();
    expect(puissanceKw(undefined)).toBeNull();
    expect(puissanceKw("0 kW")).toBeNull();
  });
});

describe("rapide ou non — et « on ne sait pas » est une troisième réponse", () => {
  it("rend NULL quand rien ne permet de trancher", () => {
    // ⚠️ LE CŒUR DU GARDE-FOU N°3 ICI. Beaucoup de bornes n'ont ni prise ni puissance
    // déclarée. Un `false` par défaut afficherait « standard » sur une borne dont on ne sait
    // rien — un fait inventé, présenté avec l'aplomb d'une mesure.
    expect(estRapide({})).toBeNull();
    expect(estRapide({ name: "Une borne", fee: "yes" })).toBeNull();
  });

  it("croit une déclaration explicite avant tout le reste", () => {
    expect(estRapide({ fast_charge: "yes", "socket:type2": "2" })).toBe(true);
    expect(estRapide({ fast_charge: "no", "socket:chademo": "1" })).toBe(false);
  });

  it("reconnaît une prise à courant continu", () => {
    expect(estRapide({ "socket:chademo": "1" })).toBe(true);
    expect(estRapide({ "socket:type2_combo": "2" })).toBe(true);
    expect(estRapide({ "socket:tesla_supercharger": "8" })).toBe(true);
  });

  it("ne se laisse pas prendre par une prise déclarée ABSENTE", () => {
    // `socket:chademo=no` dit qu'il n'y en a pas. Le lire comme une présence rendrait
    // rapide exactement les bornes qui déclarent ne pas l'être.
    expect(estRapide({ "socket:chademo": "no", "socket:type2": "2" })).toBe(false);
    expect(estRapide({ "socket:chademo": "0", "socket:type2": "1" })).toBe(false);
  });

  it("tranche par la puissance, des deux côtés du seuil", () => {
    // Cas DÉRIVÉS du seuil, jamais de sa valeur du jour : le rehausser ne doit pas
    // transformer ce test en mensonge.
    expect(estRapide({ "charging_station:output": `${SEUIL_RAPIDE_KW} kW` })).toBe(true);
    expect(estRapide({ maxpower: `${SEUIL_RAPIDE_KW - 1} kW` })).toBe(false);
  });

  it("retient la puissance MAXIMALE quand plusieurs sont annoncées", () => {
    // Une station mixte porte souvent une prise lente et une rapide. Prendre la première
    // trouvée la classerait selon l'ordre des tags — c'est-à-dire au hasard.
    expect(
      estRapide({ "socket:type2:output": "7 kW", "socket:type2_combo:output": "100 kW" }),
    ).toBe(true);
  });

  it("conclut « standard » quand seules des prises alternatives sont déclarées", () => {
    expect(estRapide({ "socket:type2": "2" })).toBe(false);
    expect(estRapide({ "socket:type1": "1", "socket:schuko": "1" })).toBe(false);
  });
});

describe("tarif — ce qui est publié, jamais une moyenne fabriquée", () => {
  it("rend le tarif relevé sur la borne quand il existe", () => {
    expect(tarifPublie({ charge: "0.35 CAD/kWh" })).toBe("0.35 CAD/kWh");
  });

  it("dit « gratuite » sur fee=no", () => {
    expect(tarifPublie({ fee: "no" })).toBe("gratuite");
  });

  it("dit qu'elle est payante SANS inventer le prix", () => {
    // ⚠️ Marc a demandé « quel prix moyen ». OpenStreetMap ne porte pas ça. Reprendre un
    // tarif de catalogue trouvé ailleurs donnerait un chiffre crédible que personne n'a
    // relevé à cet endroit — exactement ce qu'interdit le garde-fou n°3.
    const t = tarifPublie({ fee: "yes" });
    expect(t).toBe("payante, tarif non publié");
    expect(t).not.toMatch(/\d/);
  });

  it("préfère le tarif affiché au simple « payante »", () => {
    expect(tarifPublie({ fee: "yes", charge: "0,35 $/kWh" })).toBe("0,35 $/kWh");
  });

  it("rend null quand rien n'est publié", () => {
    expect(tarifPublie({})).toBeNull();
    expect(tarifPublie({ fee: "unknown" })).toBeNull();
  });
});

describe("un ÉCHEC n'est jamais « aucune borne »", () => {
  it("passe à l'instance suivante sur un 504", () => {
    // LE cas mesuré en vrai. Une seule instance serait un point unique de panne.
    const { recuperer, appels } = faussetFetch([
      new Response("saturé", { status: 504 }),
      ok([{ id: 1, lat: 46.8102, lon: -71.2101, tags: { name: "Circuit" } }]),
    ]);
    return chercherBornes(LIEU, PORTEE_RECHERCHE_M, { recuperer, instances: ["https://a/x", "https://b/x"] }).then(
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
    const r = await chercherBornes(LIEU, PORTEE_RECHERCHE_M, {
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
    return chercherBornes(LIEU, PORTEE_RECHERCHE_M, { recuperer, instances: ["https://a/x"] }).then((r) => {
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
