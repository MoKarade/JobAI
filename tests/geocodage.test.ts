// tests/geocodage.test.ts — le géocodage des municipalités.
//
// La session de développement n'a PAS accès à Nominatim (le proxy réseau le refuse). Si le
// `fetch` n'était pas injecté, tout ce module partirait en ligne sans qu'une seule ligne
// n'ait été vérifiée. Il l'est, donc tout se teste ici SAUF l'appel réel — ce que le
// HANDOVER dit explicitement plutôt que de le laisser croire.

import { describe, it, expect, vi } from "vitest";
import {
  BORNES,
  DELAI_ENTRE_REQUETES_MS,
  MAX_VILLES_PAR_PASSE,
  entete,
  geocoderPlusieurs,
  geocoderVille,
  lireReponse,
  urlRecherche,
  villeGeocodable,
} from "../lib/geocodage";

/** Un `fetch` de test qui répond ce qu'on lui dit, et compte ses appels. */
function faussetFetch(reponses: (unknown | Error)[]) {
  const appels: string[] = [];
  let i = 0;
  const recuperer = (async (url: string | URL) => {
    appels.push(String(url));
    const r = reponses[Math.min(i, reponses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    if (r === "HTTP_500") return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  }) as unknown as typeof fetch;
  return { recuperer, appels };
}

const ok = (lat: number, lon: number) => [{ lat: String(lat), lon: String(lon) }];

describe("nom géocodable", () => {
  it("retire la précision entre parenthèses", () => {
    // `ENTREPRISES_CIBLES` écrit « Québec (Beauport) » : la parenthèse désigne parfois un
    // secteur, parfois un lieu-dit qu'aucun géocodeur ne connaît.
    expect(villeGeocodable("Québec (Beauport)")).toBe("Québec");
    expect(villeGeocodable("Québec (parc technologique)")).toBe("Québec");
  });

  it("laisse intact un nom déjà simple, y compris à traits d'union", () => {
    expect(villeGeocodable("Lévis")).toBe("Lévis");
    expect(villeGeocodable("Saint-Augustin-de-Desmaures")).toBe("Saint-Augustin-de-Desmaures");
  });

  it("rend null plutôt qu'une chaîne vide", () => {
    // Une chaîne vide produirait la requête « , Québec, Canada » : un résultat au hasard.
    expect(villeGeocodable("")).toBeNull();
    expect(villeGeocodable("   ")).toBeNull();
    expect(villeGeocodable("(secteur inconnu)")).toBeNull();
  });
});

describe("requête", () => {
  it("encode les accents et cadre la recherche sur le Québec", () => {
    const url = urlRecherche("Lévis");
    expect(url).toContain("L%C3%A9vis");
    expect(url).toContain("Qu%C3%A9bec%2C+Canada");
    expect(url).toContain("countrycodes=ca");
    expect(url).toContain("limit=1");
  });

  it("s'identifie, comme Nominatim l'exige", () => {
    // Sans en-tête d'identification, le service refuse la requête et peut bannir l'appelant.
    expect(entete(undefined)["User-Agent"]).toContain("JobAI");
  });

  it("n'invente pas de contact quand la variable est absente ou vide", () => {
    for (const vide of [undefined, "", "   "]) {
      expect(entete(vide)["User-Agent"]).not.toContain("undefined");
      expect(entete(vide)["User-Agent"]).not.toContain("@");
    }
  });
});

describe("lecture de la réponse", () => {
  it("lit une coordonnée de la région", () => {
    expect(lireReponse(ok(46.81, -71.21))).toEqual({ lat: 46.81, lon: -71.21 });
  });

  it("refuse une réponse vide ou malformée", () => {
    for (const charge of [[], null, undefined, {}, "texte", [{}], [{ lat: "abc", lon: "x" }]]) {
      expect(lireReponse(charge), JSON.stringify(charge)).toBeNull();
    }
  });

  it("REFUSE une coordonnée hors de la région, même parfaitement formée", () => {
    // « Québec » existe aussi en Colombie-Britannique. Une épingle à 4 000 km ne se lit pas
    // comme une erreur de géocodage : elle se lit comme une carte cassée.
    expect(lireReponse(ok(49.26, -123.11))).toBeNull(); // Vancouver
    expect(lireReponse(ok(46.81, 71.21))).toBeNull(); // signe de longitude inversé
    expect(lireReponse(ok(-46.81, -71.21))).toBeNull(); // signe de latitude inversé
  });

  it("accepte les bornes exactes, refuse juste au-delà", () => {
    // Les cas sont DÉRIVÉS de la constante : codés en dur, ils mentiraient au premier ajustement.
    expect(lireReponse(ok(BORNES.latMin, BORNES.lonMin))).not.toBeNull();
    expect(lireReponse(ok(BORNES.latMax, BORNES.lonMax))).not.toBeNull();
    expect(lireReponse(ok(BORNES.latMin - 0.01, BORNES.lonMin))).toBeNull();
    expect(lireReponse(ok(BORNES.latMax + 0.01, BORNES.lonMax))).toBeNull();
  });
});

describe("une ville", () => {
  it("rend les coordonnées trouvées", async () => {
    const { recuperer, appels } = faussetFetch([ok(46.81, -71.21)]);
    await expect(geocoderVille("Québec", { recuperer })).resolves.toEqual({
      lat: 46.81,
      lon: -71.21,
    });
    expect(appels[0]).toContain("nominatim.openstreetmap.org");
  });

  it("rend null quand la ville est INTROUVABLE", async () => {
    const { recuperer } = faussetFetch([[]]);
    await expect(geocoderVille("Villeinexistante", { recuperer })).resolves.toBeNull();
  });

  it("LÈVE quand c'est le SERVICE qui est en panne", async () => {
    // La distinction est tout le contrat : introuvable est un fait définitif qu'on
    // enregistre, une panne est transitoire et se réessaie. Les confondre, c'est soit
    // marteler le service, soit condamner une ville à vie.
    const { recuperer } = faussetFetch(["HTTP_500"]);
    await expect(geocoderVille("Québec", { recuperer })).rejects.toThrow(/500/);
  });
});

describe("une passe complète", () => {
  const sansAttente = { attendre: async () => {} };

  it("trie les trouvées et les introuvables", async () => {
    const { recuperer } = faussetFetch([ok(46.81, -71.21), [], ok(46.73, -71.18)]);
    const r = await geocoderPlusieurs(["Québec", "Nulle part", "Lévis"], {
      recuperer,
      ...sansAttente,
    });
    expect(r.trouvees.map((v) => v.nom)).toEqual(["Québec", "Lévis"]);
    expect(r.introuvables).toEqual(["Nulle part"]);
    expect(r.panne).toBeNull();
  });

  it("respecte la cadence exigée par Nominatim", async () => {
    const attendre = vi.fn(async () => {});
    const { recuperer } = faussetFetch([ok(46.81, -71.21)]);
    await geocoderPlusieurs(["A", "B", "C"], { recuperer, attendre });
    // Trois requêtes, deux attentes : on n'attend jamais AVANT la première.
    expect(attendre).toHaveBeenCalledTimes(2);
    expect(attendre).toHaveBeenCalledWith(DELAI_ENTRE_REQUETES_MS);
  });

  it("plafonne le nombre de villes par passe", async () => {
    const { recuperer, appels } = faussetFetch([ok(46.81, -71.21)]);
    const beaucoup = Array.from({ length: MAX_VILLES_PAR_PASSE + 5 }, (_, i) => `V${i}`);
    await geocoderPlusieurs(beaucoup, { recuperer, ...sansAttente });
    expect(appels).toHaveLength(MAX_VILLES_PAR_PASSE);
  });

  it("GARDE ce qui a déjà été trouvé quand une panne survient", async () => {
    // Un traitement de fond qui jette son travail à la première erreur ne finit jamais :
    // chaque passe recommencerait de zéro et buterait au même endroit.
    const { recuperer } = faussetFetch([ok(46.81, -71.21), "HTTP_500"]);
    const r = await geocoderPlusieurs(["Québec", "Lévis", "Saint-Nicolas"], {
      recuperer,
      ...sansAttente,
    });
    expect(r.trouvees.map((v) => v.nom)).toEqual(["Québec"]);
    expect(r.panne).toMatch(/500/);
  });

  it("ne fait aucune requête sans ville à traiter", async () => {
    const { recuperer, appels } = faussetFetch([ok(46.81, -71.21)]);
    const r = await geocoderPlusieurs([], { recuperer, ...sansAttente });
    expect(appels).toHaveLength(0);
    expect(r).toEqual({ trouvees: [], introuvables: [], panne: null });
  });
});
