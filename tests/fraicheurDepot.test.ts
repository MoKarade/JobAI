// tests/fraicheurDepot.test.ts — la fraîcheur du dépôt, et le « 0 » qu'elle qualifie.
//
// Ce que ces tests protègent : qu'un dépôt qui rouille cesse de ressembler à un marché
// calme. Le dépôt lit une fenêtre de sept jours ; le jour où personne ne dépose, il rend
// quand même les lots précédents, tout est compté « déjà connue », et le rapport affiche
// « 0 nouvelle » — mot pour mot ce qu'il afficherait un jour sans embauche. Ce projet a
// déjà payé ce silence : un cron muet trois jours durant, pendant que la péremption
// éteignait les offres une à une, tous les voyants au vert.

import { describe, it, expect } from "vitest";
import {
  RETARD_DEPOT_ALERTE_JOURS,
  construireRapport,
  fraicheurDepot,
  type RapportVeille,
} from "../lib/rapportVeille";
import {
  FENETRE_DEPOT_JOURS,
  dernierJourDepose,
  fichiersDansLaFenetre,
} from "../lib/ingest/depotFichier";
import { ID_SOURCE_DEPOT } from "../lib/ingest/types";
import type { Tri } from "../lib/ingest/pipeline";

const triVide = (): Omit<Tri, "retenues"> => ({
  souslePlancher: 0,
  doublons: 0,
  horsRegion: 0,
  lieuInconnu: 0,
  refusees: [],
});

const rapport = (sources: RapportVeille["sources"], jour = "2026-08-18"): RapportVeille =>
  construireRapport({
    jour,
    fini: `${jour}T15:00:00.000Z`,
    declencheur: "cron-veille",
    trouvees: 0,
    tri: triVide(),
    nouvelles: [],
    perimees: [],
    revenues: [],
    enSursis: 0,
    offres: [],
    sources,
    lieux: { demandes: 0, juges: 0, introuvables: 0 },
    localisation: "non tentée",
    villesCompletees: 0,
    adressesAnnoncees: 0,
  });

describe("dernierJourDepose — dérivée de la fenêtre, jamais d'un second filtre", () => {
  it("rend le lot le plus récent de la fenêtre", () => {
    const noms = ["2026-08-14.json", "2026-08-18.json", "2026-08-16.json"];
    expect(dernierJourDepose(noms, "2026-08-18")).toBe("2026-08-18");
  });

  it("ignore ce que la fenêtre écarte — même liste, même verdict que la passe", () => {
    // Discriminant : le fichier existe, mais il est hors fenêtre. S'il ressortait ici, la
    // fraîcheur affirmerait un lot que la passe n'a jamais lu.
    const vieux = ["2026-01-01.json"];
    expect(fichiersDansLaFenetre(vieux, "2026-08-18")).toEqual([]);
    expect(dernierJourDepose(vieux, "2026-08-18")).toBeNull();
  });

  it("ignore le FUTUR : un lot daté de demain signale une horloge fausse", () => {
    expect(dernierJourDepose(["2026-08-19.json"], "2026-08-18")).toBeNull();
  });

  it("ignore ce qui n'est pas un fichier de dépôt, et rend null sur une fenêtre vide", () => {
    expect(dernierJourDepose(["README.md", ".gitkeep"], "2026-08-18")).toBeNull();
    expect(dernierJourDepose([], "2026-08-18")).toBeNull();
  });

  it("couvre toute la fenêtre — cas dérivés de la constante, jamais écrits en dur", () => {
    // Le dernier jour ENCORE dans la fenêtre, et le premier qui n'y est plus.
    const jour = (recul: number) =>
      new Date(Date.parse("2026-08-18T00:00:00Z") - recul * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const dedans = jour(FENETRE_DEPOT_JOURS - 1);
    const dehors = jour(FENETRE_DEPOT_JOURS);
    expect(dernierJourDepose([`${dedans}.json`], "2026-08-18")).toBe(dedans);
    expect(dernierJourDepose([`${dehors}.json`], "2026-08-18")).toBeNull();
  });
});

describe("le rapport DÉRIVE la fraîcheur de ce que la source a lu", () => {
  it("retard 0 quand le lot du jour est là", () => {
    const r = rapport([{ id: ID_SOURCE_DEPOT, ok: true, offres: 12, dernierJour: "2026-08-18" }]);
    expect(r.depot).toEqual({ dernierJour: "2026-08-18", retardJours: 0 });
  });

  it("compte le retard en jours", () => {
    const r = rapport([{ id: ID_SOURCE_DEPOT, ok: true, offres: 40, dernierJour: "2026-08-15" }]);
    expect(r.depot.retardJours).toBe(3);
  });

  it("rend null — pas zéro — quand le dépôt n'a rien rendu", () => {
    // « 0 » se lirait comme « à jour ». C'est l'inverse : on ne sait rien.
    const r = rapport([{ id: ID_SOURCE_DEPOT, ok: false, offres: 0, erreur: "dossier absent" }]);
    expect(r.depot).toEqual({ dernierJour: null, retardJours: null });
    const vide = rapport([]);
    expect(vide.depot.retardJours).toBeNull();
  });

  it("ne confond pas le dépôt avec une autre source", () => {
    const r = rapport([{ id: "guichet:coordonnateur", ok: true, offres: 5, dernierJour: "2026-08-18" }]);
    expect(r.depot.dernierJour).toBeNull();
  });

  it("ne rend JAMAIS un retard négatif si un lot est daté de demain", () => {
    const r = rapport([{ id: ID_SOURCE_DEPOT, ok: true, offres: 1, dernierJour: "2026-08-19" }]);
    expect(r.depot.retardJours).toBe(0);
  });
});

describe("fraicheurDepot — elle QUALIFIE le « 0 nouvelle », elle ne décore pas", () => {
  it("se tait quand le lot du jour est là", () => {
    expect(fraicheurDepot({ dernierJour: "2026-08-18", retardJours: 0 }).etat).toBe("frais");
  });

  it("signale sans crier au premier jour manqué", () => {
    // Crier dès le premier jour apprendrait à ignorer le voyant — c'est ainsi que la CI de
    // ce dépôt a été ignorée quatre commits d'affilée.
    const f = fraicheurDepot({ dernierJour: "2026-08-17", retardJours: 1 });
    expect(f.etat).toBe("vieillissant");
    expect(f.texte).toContain("2026-08-17");
  });

  it("passe à « rompu » AU SEUIL, dérivé de la constante", () => {
    expect(fraicheurDepot({ dernierJour: "x", retardJours: RETARD_DEPOT_ALERTE_JOURS - 1 }).etat)
      .toBe("vieillissant");
    expect(fraicheurDepot({ dernierJour: "x", retardJours: RETARD_DEPOT_ALERTE_JOURS }).etat)
      .toBe("rompu");
  });

  it("DIT que le « 0 nouvelle » ne vaut rien tant que ça dure", () => {
    // C'est la phrase qui fait tout le travail : sans elle, le liseré serait décoratif.
    for (const d of [
      { dernierJour: "2026-08-10", retardJours: 8 },
      { dernierJour: null, retardJours: null },
    ]) {
      expect(fraicheurDepot(d).etat).toBe("rompu");
      expect(fraicheurDepot(d).texte).toContain("ne dit rien du marché");
    }
  });
});
