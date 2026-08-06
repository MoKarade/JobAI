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
  it("un dossier absent n'est PAS une erreur — c'est l'état normal avant tout dépôt", async () => {
    const s = sourceDepotFichier("2026-08-06", "/chemin/qui/nexiste/pas");
    const r = await s.interroger(async () => "");
    expect(r).toEqual({ ok: true, source: "depot-fichier", offres: [] });
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
