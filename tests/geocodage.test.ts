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
  RAYON_VALIDATION_KM,
  chercherEntreprisesGoogle,
  deciderPrecision,
  detailsEntrepriseGoogle,
  distanceKm,
  entete,
  geocoderEntrepriseGoogle,
  geocoderPlusieurs,
  geocoderVille,
  lireReponse,
  lireReponseAutocomplete,
  lireReponseDetails,
  lireReponseEntreprise,
  lireReponseGoogle,
  nomEchoDansResultat,
  NB_CANDIDATS_ENTREPRISE,
  urlRecherche,
  urlRechercheEntreprise,
  urlRechercheGoogle,
  geocoderEntreprises,
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

/**
 * Un résultat NOMMÉ, comme Nominatim en rend toujours un.
 *
 * Les fixtures d'origine n'avaient ni `name` ni `display_name` — Nominatim, lui, en rend
 * systématiquement. Depuis que le lecteur exige que le candidat PORTE le nom cherché
 * (sans quoi élargir la recherche rouvrirait le trou des homonymes), une fixture anonyme
 * ne représente plus rien de réel : elle testerait un cas que le service ne produit pas.
 */
const okNomme = (lat: number, lon: number, nom: string) => [
  {
    lat: String(lat),
    lon: String(lon),
    class: "building",
    name: nom,
    display_name: `${nom}, Québec, Canada`,
  },
];

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
    expect(lireReponse(ok(46.81, -71.21))).toEqual({ lat: 46.81, lon: -71.21, adresse: null });
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

describe("recherche d'entreprise", () => {
  it("cadre la requête par la ville et la province", () => {
    const url = urlRechercheEntreprise("Laserax", "Québec");
    const q = new URL(url).searchParams.get("q");
    expect(q).toBe("Laserax, Québec, Québec, Canada");
    expect(url).toContain("countrycodes=ca");
  });

  it("trie trouvées et INTROUVABLES — une PME absente d'OpenStreetMap n'est pas une panne", () => {
    const { recuperer } = faussetFetch([okNomme(46.75, -71.29, "Laserax"), []]);
    return geocoderEntreprises(
      [
        { nom: "Laserax", ville: "Québec" },
        { nom: "PME Inconnue", ville: "Lévis" },
      ],
      { recuperer, attendre: async () => {} },
    ).then((r) => {
      expect(r.trouvees.map((t) => t.nom)).toEqual(["Laserax"]);
      expect(r.introuvables).toEqual(["PME Inconnue"]);
      expect(r.panne).toBeNull();
    });
  });

  it("partage la MÊME mécanique que les villes : cadence, bornes, panne conservée", async () => {
    // Une entreprise résolue hors de la région (homonyme d'ailleurs) est REFUSÉE comme
    // pour une ville — même lecteur de réponse, mêmes bornes.
    const { recuperer } = faussetFetch([okNomme(49.26, -123.11, "Labatt")]); // Vancouver
    const r = await geocoderEntreprises([{ nom: "Labatt", ville: "Québec" }], {
      recuperer,
      attendre: async () => {},
    });
    expect(r.trouvees).toEqual([]);
    expect(r.introuvables).toEqual(["Labatt"]);

    const casse = faussetFetch([okNomme(46.75, -71.29, "A-Entreprise"), "HTTP_500"]);
    const r2 = await geocoderEntreprises(
      [
        { nom: "A-Entreprise", ville: "Québec" },
        { nom: "B-Entreprise", ville: "Lévis" },
      ],
      { recuperer: casse.recuperer, attendre: async () => {} },
    );
    expect(r2.trouvees.map((t) => t.nom)).toEqual(["A-Entreprise"]);
    expect(r2.panne).toMatch(/500/);
  });
});

// [CARTE-03], 2026-08-12 : Google Maps Geocoding, en repli de Nominatim.
describe("Google Maps Geocoding — l'URL", () => {
  it("cadre la requête par la ville, restreint DUR au Canada, porte la clé", () => {
    const url = urlRechercheGoogle("Laserax", "Québec", "cle-de-test");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(u.searchParams.get("address")).toBe("Laserax, Québec, Québec, Canada");
    expect(u.searchParams.get("components")).toBe("country:CA");
    expect(u.searchParams.get("key")).toBe("cle-de-test");
  });
});

describe("Google Maps Geocoding — lecture de la réponse", () => {
  const okGoogle = (lat: number, lon: number, adresse = "123 rue Factice, Lévis, QC") => ({
    status: "OK",
    results: [{ geometry: { location: { lat, lng: lon } }, formatted_address: adresse }],
  });

  it("ZERO_RESULTS n'est PAS une panne — une PME absente de Google, ça arrive", () => {
    expect(lireReponseGoogle({ status: "ZERO_RESULTS", results: [] })).toBeNull();
  });

  it("OK rend les coordonnées et l'adresse formatée", () => {
    expect(lireReponseGoogle(okGoogle(46.75, -71.29))).toMatchObject({
      lat: 46.75,
      lon: -71.29,
      adresse: "123 rue Factice, Lévis, QC",
    });
  });

  it("un résultat hors des bornes régionales est refusé — même garde que Nominatim", () => {
    expect(lireReponseGoogle(okGoogle(49.28, -123.12))).toBeNull(); // Vancouver
  });

  it("tout statut AUTRE que OK/ZERO_RESULTS est une PANNE, pas une absence", () => {
    expect(() => lireReponseGoogle({ status: "OVER_QUERY_LIMIT" })).toThrow(/OVER_QUERY_LIMIT/);
    expect(() => lireReponseGoogle({ status: "REQUEST_DENIED" })).toThrow(/REQUEST_DENIED/);
    expect(() =>
      lireReponseGoogle({ status: "REQUEST_DENIED", error_message: "clé invalide" }),
    ).toThrow(/clé invalide/);
  });
});

describe("Google Maps Geocoding — géocoder UNE entreprise", () => {
  function faussetFetchGoogle(reponse: unknown) {
    const recuperer = (async () => ({
      ok: true,
      status: 200,
      json: async () => reponse,
    })) as unknown as typeof fetch;
    return { recuperer };
  }

  it("accepte un résultat qui PORTE le nom cherché", async () => {
    const { recuperer } = faussetFetchGoogle({
      status: "OK",
      results: [
        {
          geometry: { location: { lat: 46.75, lng: -71.29 } },
          formatted_address: "Laserax, 123 rue Factice, Lévis, QC",
        },
      ],
    });
    const c = await geocoderEntrepriseGoogle("Laserax", "Lévis", "cle", { recuperer });
    expect(c).toMatchObject({ lat: 46.75, lon: -71.29 });
  });

  it("REJETTE un résultat dont l'adresse ne porte pas le nom — même garde que Nominatim", async () => {
    // Google a répondu, mais pas avec l'entreprise cherchée : un homonyme ou une approximation
    // qu'il ne faut pas accepter sous silence (garde-fou n°3).
    const { recuperer } = faussetFetchGoogle({
      status: "OK",
      results: [
        {
          geometry: { location: { lat: 46.75, lng: -71.29 } },
          formatted_address: "456 boulevard Factice, Lévis, QC",
        },
      ],
    });
    const c = await geocoderEntrepriseGoogle("Laserax", "Lévis", "cle", { recuperer });
    expect(c).toBeNull();
  });

  it("ZERO_RESULTS rend null, pas une erreur", async () => {
    const { recuperer } = faussetFetchGoogle({ status: "ZERO_RESULTS", results: [] });
    const c = await geocoderEntrepriseGoogle("PME Inconnue", "Lévis", "cle", { recuperer });
    expect(c).toBeNull();
  });

  it("un HTTP non-ok est une panne", async () => {
    const recuperer = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(
      geocoderEntrepriseGoogle("Laserax", "Lévis", "cle", { recuperer }),
    ).rejects.toThrow(/500/);
  });

  it("capture le `place_id` — [CARTE-03-PLACES] : c'est lui qui permettra l'enrichissement", () => {
    expect(
      lireReponseGoogle({
        status: "OK",
        results: [
          {
            geometry: { location: { lat: 46.75, lng: -71.29 } },
            formatted_address: "123 rue Factice, Lévis, QC",
            place_id: "ChIJ-exemple",
          },
        ],
      }),
    ).toMatchObject({ placeId: "ChIJ-exemple" });
  });

  it("`placeId` est `null` quand Google ne le publie pas", () => {
    expect(
      lireReponseGoogle({
        status: "OK",
        results: [
          {
            geometry: { location: { lat: 46.75, lng: -71.29 } },
            formatted_address: "123 rue Factice, Lévis, QC",
          },
        ],
      }),
    ).toMatchObject({ placeId: null });
  });
});

describe("Google Places Autocomplete — lecture de la réponse", () => {
  it("extrait le texte de chaque suggestion", () => {
    expect(
      lireReponseAutocomplete({
        suggestions: [
          { placePrediction: { text: { text: "Laserax, Lévis, QC" } } },
          { placePrediction: { text: { text: "Laserax inc, Lévis, QC" } } },
        ],
      }),
    ).toEqual([{ texte: "Laserax, Lévis, QC" }, { texte: "Laserax inc, Lévis, QC" }]);
  });

  it("ignore les doublons et les entrées sans texte exploitable", () => {
    expect(
      lireReponseAutocomplete({
        suggestions: [
          { placePrediction: { text: { text: "Laserax, Lévis, QC" } } },
          { placePrediction: { text: { text: "Laserax, Lévis, QC" } } },
          { placePrediction: {} },
          {},
        ],
      }),
    ).toEqual([{ texte: "Laserax, Lévis, QC" }]);
  });

  it("une réponse sans `suggestions` (aucun résultat) rend une liste vide", () => {
    expect(lireReponseAutocomplete({})).toEqual([]);
    expect(lireReponseAutocomplete(null)).toEqual([]);
  });
});

describe("Google Places Autocomplete — chercher des entreprises", () => {
  it("porte la clé en en-tête, cadre sur le Canada et la région de Québec", async () => {
    let capture: { url: string; init: RequestInit } | null = null;
    const recuperer = (async (url: string, init: RequestInit) => {
      capture = { url: String(url), init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ suggestions: [{ placePrediction: { text: { text: "Laserax" } } }] }),
      };
    }) as unknown as typeof fetch;

    const r = await chercherEntreprisesGoogle("Laser", "cle-de-test", { recuperer });

    expect(r).toEqual([{ texte: "Laserax" }]);
    expect(capture).not.toBeNull();
    expect(capture!.url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    const headers = capture!.init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("cle-de-test");
    const corps = JSON.parse(String(capture!.init.body));
    expect(corps.input).toBe("Laser");
    expect(corps.includedRegionCodes).toEqual(["ca"]);
  });

  it("un HTTP non-ok est une panne", async () => {
    const recuperer = (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch;
    await expect(chercherEntreprisesGoogle("Laser", "cle", { recuperer })).rejects.toThrow(/429/);
  });
});

describe("Google Place Details — lecture de la réponse", () => {
  it("lit site, téléphone et horaires quand Google les publie", () => {
    expect(
      lireReponseDetails({
        websiteUri: "https://laserax.example",
        internationalPhoneNumber: "+1 418-555-0100", // factice
        regularOpeningHours: { weekdayDescriptions: ["lundi: 8h-17h", "mardi: 8h-17h"] },
      }),
    ).toEqual({
      siteWeb: "https://laserax.example",
      telephone: "+1 418-555-0100", // factice
      horaires: ["lundi: 8h-17h", "mardi: 8h-17h"],
    });
  });

  it("rend `null` par champ quand Google ne le publie pas — jamais une chaîne vide", () => {
    expect(lireReponseDetails({})).toEqual({ siteWeb: null, telephone: null, horaires: null });
  });
});

describe("Google Place Details — récupérer les détails d'un lieu", () => {
  it("porte la clé en en-tête et interroge le bon `place_id`", async () => {
    let capture: { url: string; init: RequestInit } | null = null;
    const recuperer = (async (url: string, init: RequestInit) => {
      capture = { url: String(url), init };
      return { ok: true, status: 200, json: async () => ({ websiteUri: "https://ex.example" }) };
    }) as unknown as typeof fetch;

    const d = await detailsEntrepriseGoogle("ChIJ-exemple", "cle-de-test", { recuperer });

    expect(d.siteWeb).toBe("https://ex.example");
    expect(capture).not.toBeNull();
    expect(capture!.url).toBe("https://places.googleapis.com/v1/places/ChIJ-exemple");
    const headers = capture!.init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("cle-de-test");
  });

  it("un HTTP non-ok est une panne", async () => {
    const recuperer = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(
      detailsEntrepriseGoogle("ChIJ-inconnu", "cle", { recuperer }),
    ).rejects.toThrow(/404/);
  });
});

describe("lecture d'une réponse d'ENTREPRISE", () => {
  /** Un candidat Nominatim tel qu'il arrive vraiment : avec sa classe ET son nom. */
  const cand = (classe: string, nom: string, lat = 46.75, lon = -71.29) => ({
    lat: String(lat),
    lon: String(lon),
    class: classe,
    name: nom,
    display_name: `${nom}, Québec, Capitale-Nationale, Québec, Canada`,
  });

  it("accepte un lieu ponctuel plausible qui porte le nom cherché", () => {
    expect(lireReponseEntreprise([cand("building", "Laserax")], "Laserax")).toMatchObject({
      lat: 46.75,
      lon: -71.29,
    });
    expect(lireReponseEntreprise([cand("amenity", "Laserax")], "Laserax")).not.toBeNull();
  });

  it("REFUSE une municipalité, une frontière administrative ou une rue", () => {
    // La sonde de la revue : « Labatt, Québec » peut résoudre une RUE Labatt ou la ville
    // elle-même — DANS les bornes régionales, donc inscrite « exacte » à vie sans ce rejet.
    // Une ville se résout légitimement en `place`/`boundary` ; une entreprise, jamais.
    for (const classe of ["place", "boundary", "highway"]) {
      expect(lireReponseEntreprise([cand(classe, "Labatt")], "Labatt"), classe).toBeNull();
    }
  });

  it("garde les bornes régionales du lecteur de base", () => {
    expect(
      lireReponseEntreprise([cand("office", "Laserax", 49.26, -123.11)], "Laserax"),
    ).toBeNull();
  });

  // ⚠️ LE DÉFAUT QUE CE LOT CORRIGE — mesuré à l'écran : « 8 à leur adresse, 44 au
  // centre-ville ». Avec un seul candidat, la municipalité arrivée en tête faisait perdre
  // l'entreprise qui suivait, et 85 % des épingles tombaient au centre-ville.
  it("passe la MUNICIPALITÉ en tête et prend l'entreprise qui suit", () => {
    const charge = [
      cand("place", "Québec", 46.81, -71.21),
      cand("building", "Laserax", 46.75, -71.29),
    ];
    expect(lireReponseEntreprise(charge, "Laserax")).toMatchObject({ lat: 46.75 });
  });

  it("REFUSE un candidat qui ne porte pas le nom cherché, même bien classé et proche", () => {
    // Sans ce contrôle, regarder plus de candidats rouvrirait le trou des homonymes DANS
    // la ville — là où la validation par la distance ne voit rien.
    const charge = [
      cand("place", "Québec", 46.81, -71.21),
      cand("shop", "Boulangerie Dupont", 46.8, -71.22),
    ];
    expect(lireReponseEntreprise(charge, "Laserax")).toBeNull();
  });

  it("ne regarde jamais plus de candidats que la limite demandée", () => {
    // Le bon candidat au-delà de la limite ne doit pas être trouvé : sinon le test ne
    // prouverait pas que la borne est appliquée.
    const bourrage = Array.from({ length: NB_CANDIDATS_ENTREPRISE }, (_, i) =>
      cand("place", `Bourrage ${i}`, 46.81, -71.21),
    );
    const charge = [...bourrage, cand("building", "Laserax")];
    expect(lireReponseEntreprise(charge, "Laserax")).toBeNull();
  });
});

describe("le nom du résultat répond-il au nom cherché", () => {
  it("reconnaît le nom, quels que soient accents, casse et ponctuation", () => {
    expect(nomEchoDansResultat("Laserax", "LASERAX inc.")).toBe(true);
    expect(nomEchoDansResultat("Créaform", "Creaform, Lévis")).toBe(true);
    expect(nomEchoDansResultat("Sani-Tech", "Groupe Sani Tech")).toBe(true);
  });

  it("N'apparie PAS sur un mot qui ne désigne rien", () => {
    // « Groupe » est dans un nom sur deux : apparier dessus reviendrait à accepter
    // n'importe quelle entreprise de la ville.
    expect(nomEchoDansResultat("Groupe Robert", "Groupe Sani-Tech")).toBe(false);
    expect(nomEchoDansResultat("Les Industries Québec", "Industries Bombardier")).toBe(false);
  });

  it("exige le nom ENTIER quand aucun mot n'est assez long pour discriminer", () => {
    // « ACE » en sous-chaîne attraperait « place », « surface », « Boniface »…
    expect(nomEchoDansResultat("ACE", "Place Sainte-Foy")).toBe(false);
    expect(nomEchoDansResultat("ACE", "Surface Concept")).toBe(false);
    expect(nomEchoDansResultat("ACE", "ACE Aviation, Québec")).toBe(true);
  });

  it("refuse un résultat sans libellé — on ne valide pas contre du vide", () => {
    expect(nomEchoDansResultat("Laserax", "")).toBe(false);
    expect(nomEchoDansResultat("", "Laserax")).toBe(false);
  });
});

describe("validation d'une résolution par la DISTANCE au centre-ville", () => {
  // Le centre de la ville de Québec, tel que `situerEntreprises` le fournit en référent.
  const quebec = { lat: 46.813, lon: -71.208 };
  // ~1° de latitude = 111,2 km : les décalages sont DÉRIVÉS du rayon, jamais codés en dur.
  const decalageLat = (km: number) => ({ lat: quebec.lat + km / 111.2, lon: quebec.lon });

  it("mesure une distance connue, symétriquement, zéro sur soi-même", () => {
    const montreal = { lat: 45.502, lon: -73.567 };
    const d = distanceKm(quebec, montreal);
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(260);
    expect(distanceKm(montreal, quebec)).toBeCloseTo(d, 6);
    expect(distanceKm(quebec, quebec)).toBe(0);
  });

  it("une résolution PROCHE de sa ville est exacte, aux coordonnées résolues", () => {
    const proche = decalageLat(RAYON_VALIDATION_KM - 5);
    expect(deciderPrecision(proche, quebec)).toEqual({
      ...proche,
      precision: "exacte",
      adresse: null,
      adresseSource: null,
    });
  });

  it("une adresse gardée porte TOUJOURS sa source", () => {
    // ⚠️ C'est ici que se joue « et l'indiquer » : la base refuse une adresse sans source,
    // et cette fonction est la SEULE qui décide qu'une adresse est gardée. Si elle oubliait
    // la source, tous les chemins d'écriture échoueraient — ou pire, l'écran afficherait
    // une rue sans pouvoir dire si c'est le lieu ou un domicile légal.
    const proche = { ...decalageLat(RAYON_VALIDATION_KM - 5), adresse: "1 rue Exemple" };
    expect(deciderPrecision(proche, quebec)).toMatchObject({
      precision: "exacte",
      adresse: "1 rue Exemple",
      adresseSource: "osm",
    });
  });

  it("REJETTE un homonyme d'ailleurs : repli au centre-ville, et le DIT", () => {
    // Le cas de la revue : la brasserie Labatt de MONTRÉAL est dans les bornes régionales
    // mais à ~230 km du centre de Québec — un homonyme, pas l'entreprise cherchée.
    const labattMontreal = { lat: 45.502, lon: -73.567 };
    expect(deciderPrecision(labattMontreal, quebec)).toEqual({
      ...quebec,
      precision: "ville",
      adresse: null,
      adresseSource: null,
    });
    expect(deciderPrecision(decalageLat(RAYON_VALIDATION_KM + 5), quebec)).toEqual({
      ...quebec,
      precision: "ville",
      adresse: null,
      adresseSource: null,
    });
  });

  it("sans résolution : repli au centre-ville", () => {
    expect(deciderPrecision(null, quebec)).toEqual({
      ...quebec,
      precision: "ville",
      adresse: null,
      adresseSource: null,
    });
  });
});

describe("une ville", () => {
  it("rend les coordonnées trouvées", async () => {
    const { recuperer, appels } = faussetFetch([ok(46.81, -71.21)]);
    await expect(geocoderVille("Québec", { recuperer })).resolves.toEqual({
      lat: 46.81,
      lon: -71.21,
      adresse: null,
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

  it("borne CHAQUE requête par un signal d'abandon", async () => {
    // Sans lui, une requête qui pend suspend la passe jusqu'au mur de la Server Action
    // (30 s), qui tue le processus AVANT l'enregistrement de l'acquis — perte silencieuse.
    const inits: (RequestInit | undefined)[] = [];
    const recuperer = (async (_url: string | URL, init?: RequestInit) => {
      inits.push(init);
      return { ok: true, status: 200, json: async () => ok(46.81, -71.21) };
    }) as unknown as typeof fetch;
    await geocoderPlusieurs(["Québec", "Lévis"], { recuperer, ...sansAttente });
    expect(inits).toHaveLength(2);
    for (const init of inits) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("traite un abandon par délai comme une PANNE : l'acquis est gardé", async () => {
    // C'est le rejet du fetch (TimeoutError) qui matérialise le délai : même chemin que
    // toute panne — la passe s'interrompt, ce qui est trouvé est rendu, rien n'est inscrit
    // pour la requête interrompue.
    const { recuperer } = faussetFetch([ok(46.81, -71.21), new Error("Requête interrompue")]);
    const r = await geocoderPlusieurs(["Québec", "Lévis", "Saint-Nicolas"], {
      recuperer,
      ...sansAttente,
    });
    expect(r.trouvees.map((v) => v.nom)).toEqual(["Québec"]);
    expect(r.introuvables).toEqual([]);
    expect(r.panne).toMatch(/interrompue/);
  });

  it("ne fait aucune requête sans ville à traiter", async () => {
    const { recuperer, appels } = faussetFetch([ok(46.81, -71.21)]);
    const r = await geocoderPlusieurs([], { recuperer, ...sansAttente });
    expect(appels).toHaveLength(0);
    expect(r).toEqual({ trouvees: [], introuvables: [], panne: null });
  });
});

describe("garde-temps : la série s'arrête avant le mur de l'appelant", () => {
  // Le plafond en NOMBRE ne borne pas la DURÉE — une revue l'a mesuré : chaque requête peut
  // aller jusqu'à `DELAI_MAX_REQUETE_MS`, donc deux séries de huit valent ~80 s dans le pire
  // cas, au-delà des 60 s d'une fonction Vercel. Un mur atteint tue le processus sans
  // exécuter le moindre `catch` : ni trace, ni acquis enregistré.

  it("cesse d'interroger quand le budget est consommé", async () => {
    // Horloge simulée : chaque lecture avance de 10 s. Le budget de 25 s laisse donc passer
    // les premières requêtes, puis coupe — sans attendre le mur.
    let t = 0;
    const maintenant = () => (t += 10_000);
    const { recuperer, appels } = faussetFetch([
      ok(46.81, -71.21),
      ok(46.82, -71.22),
      ok(46.83, -71.23),
      ok(46.84, -71.24),
    ]);

    const r = await geocoderPlusieurs(
      ["Québec", "Lévis", "Beauport", "Charlesbourg"],
      { recuperer, attendre: async () => {}, maintenant },
      25_000,
    );

    // Le point qui compte : la série s'est ARRÊTÉE, elle n'a pas tout parcouru.
    expect(appels.length).toBeLessThan(4);
    expect(appels.length).toBeGreaterThan(0);
    // Ce qui n'a pas été traité n'est NI trouvé NI introuvable : il reste simplement à
    // situer, et la passe suivante le reprendra. Le confondre avec « introuvable » le
    // condamnerait à ne jamais être retenté.
    expect(r.trouvees.length + r.introuvables.length).toBe(appels.length);
    expect(r.panne).toBeNull();
  });

  it("sans budget, parcourt toute la série", async () => {
    // Non-vacuité du test précédent : sans ce cas, une fonction qui ne ferait plus RIEN
    // passerait les deux.
    const { recuperer, appels } = faussetFetch([ok(46.81, -71.21), ok(46.82, -71.22)]);
    await geocoderPlusieurs(["Québec", "Lévis"], { recuperer, attendre: async () => {} });
    expect(appels).toHaveLength(2);
  });
});
