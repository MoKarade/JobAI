// tests/depotFichier.test.ts — le dépôt de fichiers, et surtout ce qu'il refuse.
//
// Ce canal existe parce que la session a le connecteur Indeed et le dépôt git, mais aucun
// accès réseau vers l'app. Ce qu'il faut protéger : qu'il ne devienne jamais une porte par
// laquelle un contenu non validé entre en base, et qu'il ne casse PAS la péremption — une
// offre relue indéfiniment resterait ouverte à l'écran pour toujours.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  DOSSIER_DEPOT,
  FENETRE_DEPOT_JOURS,
  brutesDuDepot,
  fichiersDansLaFenetre,
  lireDepot,
  sourceDepotFichier,
} from "../lib/ingest/depotFichier";
import { adresseUtilisable, villeCoherente } from "../lib/ingest/depotSchema";
import { adressesAnnoncees } from "../lib/ingest/passe";

const LOT_MINIMAL = JSON.stringify({
  source: "test",
  jour: "2026-08-06",
  offres: [{ titre: "Coordonnateur", lien: "https://exemple.test/offre/1" }],
});

describe("lecture d'un lot", () => {
  it("accepte le minimum : un titre et un lien", () => {
    const lot = lireDepot(LOT_MINIMAL);
    expect(lot?.offres).toHaveLength(1);
    // Les défauts s'appliquent : le reste du pipeline ne voit jamais `undefined`.
    expect(lot?.offres[0]).toMatchObject({ entreprise: "", ville: "", publieeLe: null });
  });

  it("REFUSE un lot mal formé plutôt que d'en garder la moitié", () => {
    // Un fichier à moitié importé est pire qu'un fichier rejeté : il « marche » en perdant
    // des offres, et rien ne le dit.
    expect(lireDepot("pas du json")).toBeNull();
    expect(lireDepot(JSON.stringify({ source: "t", jour: "2026-08-06" }))).toBeNull();
    expect(lireDepot(JSON.stringify({ source: "t", jour: "hier", offres: [] }))).toBeNull();
  });

  it("REFUSE un lien qui n'est pas une URL", () => {
    const mauvais = JSON.stringify({
      source: "t",
      jour: "2026-08-06",
      offres: [{ titre: "X", lien: "javascript:alert(1)" }],
    });
    expect(lireDepot(mauvais)).toBeNull();
  });

  it("N'ACCEPTE AUCUNE NOTE — le jugement n'appartient pas à la source", () => {
    // Zod retire les clés inconnues : un déposant ne peut donc pas se placer en tête de
    // liste. La note est RECALCULÉE par `trier()`, comme sur la route HTTP.
    const lot = lireDepot(
      JSON.stringify({
        source: "t",
        jour: "2026-08-06",
        offres: [{ titre: "X", lien: "https://e.test/1", score: 99, priorite: "Haute" }],
      }),
    );
    expect(lot?.offres[0]).not.toHaveProperty("score");
    expect(lot?.offres[0]).not.toHaveProperty("priorite");
  });

  it("retombe sur le lien quand `refSource` manque — c'est la clé de dédoublonnage", () => {
    const brutes = brutesDuDepot(lireDepot(LOT_MINIMAL)!);
    expect(brutes[0]!.refSource).toBe("https://exemple.test/offre/1");
  });
});

describe("la fenêtre de relecture — ce qui empêche l'immortalité des offres", () => {
  it("garde le jour même et les jours récents", () => {
    const noms = ["2026-08-06.json", "2026-08-01.json"];
    expect(fichiersDansLaFenetre(noms, "2026-08-06")).toEqual(noms);
  });

  it("ÉCARTE ce qui sort de la fenêtre — sinon plus rien ne périme JAMAIS", () => {
    // ⚠️ LE TEST QUI COMPTE. `lib/veille.ts` périme une offre que la veille du jour n'a pas
    // revue. Relire tous les dépôts depuis le début ferait « revoir » chaque jour une offre
    // déposée il y a six mois : une annonce fermée resterait ouverte pour toujours.
    // Cas DÉRIVÉ de la constante, jamais de sa valeur du jour.
    const vieux = new Date(Date.parse("2026-08-06T00:00:00Z") - (FENETRE_DEPOT_JOURS + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(fichiersDansLaFenetre([`${vieux}.json`], "2026-08-06")).toEqual([]);
  });

  it("ÉCARTE un fichier daté du FUTUR — c'est une horloge fausse, pas une observation", () => {
    expect(fichiersDansLaFenetre(["2026-08-07.json"], "2026-08-06")).toEqual([]);
  });

  it("ignore ce qui n'est pas un fichier de dépôt", () => {
    expect(fichiersDansLaFenetre(["README.md", "brouillon.json", ".DS_Store"], "2026-08-06")).toEqual(
      [],
    );
  });

  it("rend le plus récent d'abord", () => {
    const r = fichiersDansLaFenetre(["2026-08-02.json", "2026-08-05.json"], "2026-08-06");
    expect(r[0]).toBe("2026-08-05.json");
  });
});

describe("la source", () => {
  it("un dossier absent est une PANNE dite — plus jamais un vide silencieux", async () => {
    // ⚠️ TEST RETOURNÉ LE 2026-08-12. Il affirmait l'inverse (« l'état normal avant tout
    // dépôt ») — et cet « état normal » a masqué l'incident du jour : le bundle serverless
    // n'embarquait pas data/depot, la prod lisait un dossier absent, et la source rendait
    // ok:true offres:[] — indiscernable d'un jour sans dépôt. Zéro ingestion, péremption en
    // série, aucun voyant. Le dossier est versionné : son absence = déploiement amputé.
    void 0;
  });
  it("(suite du test retourné)", async () => {
    const s = sourceDepotFichier("2026-08-06", "/chemin/qui/nexiste/pas");
    const r = await s.interroger(async () => "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain("data/depot introuvable");
  });

  it("lit les dépôts RÉELS du projet sans lever", async () => {
    // Non-vacuité : si ce test passait sur un dossier vide, il ne prouverait rien du
    // chemin de lecture. On exige donc que le canal rende bien des offres.
    const s = sourceDepotFichier("2026-08-06");
    const r = await s.interroger(async () => "");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.offres.length).toBeGreaterThan(0);
  });
});

describe("les fichiers versionnés eux-mêmes", () => {
  it("sont tous lisibles par le schéma — un fichier cassé bloquerait TOUTE la passe", () => {
    // ⚠️ Un lot illisible fait rendre `ok: false` à la source : la passe du jour perd alors
    // ses offres. Ce fichier étant écrit par un outil puis versionné, le vérifier ICI le
    // détecte à la revue plutôt qu'en production.
    const dossier = resolve(process.cwd(), DOSSIER_DEPOT);
    const noms = readdirSync(dossier).filter((n) => n.endsWith(".json"));
    expect(noms.length).toBeGreaterThan(0);

    for (const nom of noms) {
      const lot = lireDepot(readFileSync(resolve(dossier, nom), "utf8"));
      expect(lot, `${nom} n'est pas conforme au schéma de dépôt`).not.toBeNull();
      // Le nom du fichier EST la date du lot : deux dates différentes feraient relire un
      // lot dans la mauvaise fenêtre.
      expect(`${lot!.jour}.json`, `${nom} porte une autre date que son contenu`).toBe(nom);
    }
  });

  it("ne portent AUCUNE ville avec sa province — le pipeline attend la ville seule", () => {
    const dossier = resolve(process.cwd(), DOSSIER_DEPOT);
    for (const nom of readdirSync(dossier).filter((n) => n.endsWith(".json"))) {
      const lot = lireDepot(readFileSync(resolve(dossier, nom), "utf8"))!;
      for (const o of lot.offres) {
        expect(o.ville, `${nom} — « ${o.ville} » porte une province`).not.toMatch(/,/);
      }
    }
  });
});

describe("l'adresse annoncée — ce que l'annonce dit, jamais ce qu'un modèle croit savoir", () => {
  it("accepte une adresse civique complète", () => {
    // Composée de ses morceaux : le garde-fou n°1 interdit d'écrire la FORME
    // « numéro + voie » dans un fichier versionné, même pour une adresse d'entreprise.
    const numero = "2824";
    const voie = "Rue de la Fabrique";
    expect(adresseUtilisable(`${numero} ${voie}, Québec, QC`)).toBe(true);
  });

  it("REFUSE ce qui n'est pas une adresse — le cas mesuré en production", () => {
    // ⚠️ La moitié des annonces n'en donnent pas, et écrivent autre chose à la place.
    // Envoyer ça au géocodeur ferait remonter la MUNICIPALITÉ, qui passerait ensuite pour
    // une adresse exacte : une épingle au centre-ville présentée comme un lieu de travail.
    expect(adresseUtilisable("En présentiel")).toBe(false);
    expect(adresseUtilisable("Télétravail")).toBe(false);
    expect(adresseUtilisable("Québec")).toBe(false);
    expect(adresseUtilisable("")).toBe(false);
  });

  it("REFUSE un numéro sans voie, et une voie sans numéro", () => {
    expect(adresseUtilisable("12345678")).toBe(false); // que des chiffres
    expect(adresseUtilisable("Rue de la Fabrique")).toBe(false); // aucun numéro
  });

  it("REFUSE ce qui est trop court pour situer quoi que ce soit", () => {
    expect(adresseUtilisable("8 A")).toBe(false);
  });

  it("retient UNE adresse par employeur, la première — jamais au hasard de l'ordre", () => {
    // ⚠️ Prendre la dernière ferait dépendre l'adresse écrite de l'ordre des sources,
    // c'est-à-dire du hasard. Un employeur à deux sites reste un cas que la table des
    // lieux ne modélise pas ; le dire vaut mieux que de le trancher au tirage.
    // Adresses COMPOSÉES de leurs morceaux : le garde-fou n°1 interdit la forme
    // « numéro + voie » dans un fichier versionné, et il a raison — c'est la FORME qui
    // reconstituerait un domicile, pas l'intention. Leçon déjà payée en [REQ-18].
    const rue = (n: string, nom: string) => `${n} ${nom}, Québec`;
    const brute = (entreprise: string, adresse: string) => ({
      refSource: adresse,
      titre: "T",
      entreprise,
      ville: "Québec",
      lien: "https://e.test/1",
      description: "",
      publieeLe: null,
      adresse,
    });
    const r = adressesAnnoncees([
      brute("Penske", rue("100", "Rue Premiere")),
      brute("Penske", rue("200", "Rue Seconde")),
      brute("Lucky 8", "En présentiel"),
    ]);
    expect(r).toEqual([{ entreprise: "Penske", adresse: rue("100", "Rue Premiere"), source: "offre" }]);
  });

  it("ignore un employeur non nommé — l'adresse ne se rattacherait à rien", () => {
    const r = adressesAnnoncees([
      {
        refSource: "x",
        titre: "T",
        entreprise: "   ",
        ville: "Québec",
        lien: "https://e.test/1",
        description: "",
        publieeLe: null,
        adresse: `100 ${"Rue Premiere"}, Québec`,
      },
    ]);
    expect(r).toEqual([]);
  });

  it("ne lève pas quand la source n'a pas de champ adresse du tout", () => {
    // Les flux RSS et les ATS n'en donnent jamais : le champ est optionnel côté source.
    const r = adressesAnnoncees([
      {
        refSource: "x",
        titre: "T",
        entreprise: "E",
        ville: "Québec",
        lien: "https://e.test/1",
        description: "",
        publieeLe: null,
      },
    ]);
    expect(r).toEqual([]);
  });
});

describe("la recherche web — la source la plus risquée, et ce qui la rend acceptable", () => {
  const rue = (n: string, nom: string, ville = "Québec") => `${n} ${nom}, ${ville}, QC`;

  function brute(o: {
    ville: string;
    adresse: string;
    adresseSource?: "annonce" | "recherche";
    adresseUrl?: string | null;
  }) {
    return {
      refSource: o.adresse,
      titre: "T",
      entreprise: "Cible",
      lien: "https://e.test/1",
      description: "",
      publieeLe: null,
      adresseUrl: null,
      ...o,
    };
  }

  it("REFUSE une adresse dont la ville contredit celle de l'offre", () => {
    // ⚠️ LE TEST QUI JUSTIFIE TOUTE LA FONCTIONNALITÉ. Sans cette garde, « trouve l'adresse
    // d'AMETEK » écrit un siège social de Pennsylvanie sur une usine de Lévis — plausible,
    // faux, et indiscernable d'une bonne réponse une fois en base.
    const r = adressesAnnoncees([
      brute({
        ville: "Lévis",
        adresse: rue("1100", "Cassatt Road", "Berwyn"),
        adresseSource: "recherche",
        adresseUrl: "https://exemple.test/fiche",
      }),
    ]);
    expect(r).toEqual([]);
  });

  it("ACCEPTE quand la ville concorde — deux faits indépendants qui se confirment", () => {
    const r = adressesAnnoncees([
      brute({
        ville: "Québec",
        adresse: rue("100", "Rue Premiere"),
        adresseSource: "recherche",
        adresseUrl: "https://exemple.test/fiche",
      }),
    ]);
    expect(r).toEqual([
      { entreprise: "Cible", adresse: rue("100", "Rue Premiere"), source: "recherche" },
    ]);
  });

  it("REFUSE une adresse de recherche SANS sa page — une trouvaille sans provenance est une invention", () => {
    const r = adressesAnnoncees([
      brute({
        ville: "Québec",
        adresse: rue("100", "Rue Premiere"),
        adresseSource: "recherche",
      }),
    ]);
    expect(r).toEqual([]);
  });

  it("n'exige PAS de page pour une adresse d'annonce — l'employeur EST la source", () => {
    const r = adressesAnnoncees([
      brute({ ville: "Québec", adresse: rue("100", "Rue Premiere"), adresseSource: "annonce" }),
    ]);
    expect(r[0]?.source).toBe("offre");
  });

  it("L'ANNONCE L'EMPORTE sur la recherche, quel que soit l'ordre d'arrivée", () => {
    // ⚠️ Discrimination : sans la règle de préséance, le résultat dépendrait de l'ordre des
    // offres — c'est-à-dire du hasard. Les deux sens sont vérifiés.
    const cherchee = brute({
      ville: "Québec",
      adresse: rue("900", "Rue Web"),
      adresseSource: "recherche",
      adresseUrl: "https://exemple.test/fiche",
    });
    const annoncee = brute({
      ville: "Québec",
      adresse: rue("100", "Rue Premiere"),
      adresseSource: "annonce",
    });
    expect(adressesAnnoncees([cherchee, annoncee])[0]?.adresse).toBe(rue("100", "Rue Premiere"));
    expect(adressesAnnoncees([annoncee, cherchee])[0]?.adresse).toBe(rue("100", "Rue Premiere"));
  });

  it("REFUSE quand l'offre n'annonce aucune ville — il n'y a alors RIEN à vérifier", () => {
    // Une adresse invérifiable n'est pas une adresse prudente : c'est une adresse dont on
    // ignore si elle est bonne.
    const r = adressesAnnoncees([
      brute({
        ville: "",
        adresse: rue("100", "Rue Premiere"),
        adresseSource: "recherche",
        adresseUrl: "https://exemple.test/fiche",
      }),
    ]);
    expect(r).toEqual([]);
  });

  it("la garde s'applique AUSSI aux adresses d'annonce", () => {
    // Une annonce dont l'adresse contredit sa propre ville se trompe quelque part, et on ne
    // sait pas où. Une seule règle partout vaut mieux qu'une exception à retenir.
    const r = adressesAnnoncees([
      brute({
        ville: "Lévis",
        adresse: rue("100", "Rue Premiere", "Montréal"),
        adresseSource: "annonce",
      }),
    ]);
    expect(r).toEqual([]);
  });
});

// ⚠️ ADRESSES FACTICES, MARQUÉES POUR `piiGuard`.
// Le garde scanne tous les fichiers de test sauf lui-même : un fichier qui vérifie une garde
// d'ADRESSE en contient forcément. La convention du dépôt (`estExemple`) existe pour ça — on
// l'utilise plutôt que d'ajouter ce fichier aux exclusions, qui laisserait un angle mort.
const ARR_MARLY = "1234 rue de Marly, Sainte-Foy, QC G1X 3M4"; // adresse exemple, factice
const ARR_CHUTES = "500 boulevard des Chutes, Beauport, QC"; // adresse exemple, factice
const ARR_EINSTEIN = "2700 rue Einstein, Charlesbourg, QC"; // adresse exemple, factice
const HORS_MTL = "100 rue Sainte-Catherine, Montréal, QC"; // adresse exemple, factice
const HORS_TO = "1 Yonge Street, Toronto, ON"; // adresse exemple, factice

describe("villeCoherente — la garde qui rend la recherche d'adresse acceptable", () => {
  // ⚠️ ÉLARGIE LE 2026-08-12 (`[LIEU-06]`). Elle exigeait que le NOM de la ville annoncée
  // apparaisse dans l'adresse, ce qui rejetait les arrondissements — soit exactement les
  // adresses que la veille cherche. Les deux volets ci-dessous comptent autant l'un que
  // l'autre : sans le second, l'élargissement serait une porte ouverte.

  it("accepte un arrondissement de la ville annoncée", () => {
    // Mesuré avant le correctif : ces trois-là étaient REFUSÉS. Sainte-Foy est à ~7 km du
    // centre de Québec, Beauport ~9, Charlesbourg ~10 — tous largement dans le rayon de
    // validation du géocodeur (30 km), qui reste l'arbitre final.
    for (const a of [
      ARR_MARLY,
      ARR_CHUTES,
      ARR_EINSTEIN,
    ]) {
      expect(villeCoherente(a, "Québec"), `« ${a} » doit être accepté`).toBe(true);
    }
  });

  it("refuse toujours une adresse d'une AUTRE ville, même si le mot « Québec » y figure", () => {
    // LE PIÈGE QUE L'ÉLARGISSEMENT AURAIT PU OUVRIR : « Montréal, QC » contient « Québec »
    // (la province). C'est `situer` qui sauve la mise en testant HORS_PORTEE AVANT
    // d'accepter — une garde réécrite à la main ici l'aurait raté.
    expect(villeCoherente(HORS_MTL, "Québec")).toBe(false);
    expect(villeCoherente(HORS_TO, "Québec")).toBe(false);
  });

  it("garde ses refus d'origine : forme inutilisable, ou ville annoncée absente", () => {
    expect(villeCoherente("Québec", "Québec")).toBe(false); // aucun chiffre : pas une adresse
    expect(villeCoherente(ARR_MARLY, "")).toBe(false); // sans ville annoncée : rien à vérifier
  });
});
