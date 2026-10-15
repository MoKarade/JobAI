// tests/trajetMatricePur.test.ts — les décisions du remplissage nocturne des durées, sans base
// ni réseau. Les positions sont des repères neutres (0, 1, 2…) : seul compte leur ordre.

import { describe, it, expect } from "vitest";
import {
  choisirDestinations,
  ligneTrajet,
  resumerRemplissage,
} from "@/lib/trajetMatricePur";

const lieu = (nom: string, lat = 0, lon = 0) => ({ nom, lat, lon });
const toutTient = () => true;
const rienNeTient = () => false;

describe("choisirDestinations — ce qu'on paie cette nuit", () => {
  it("ne choisit rien quand il n'y a aucun lieu", () => {
    expect(choisirDestinations([], new Map(), rienNeTient, 5)).toEqual([]);
  });

  it("prend les lieux sans ligne de cache, dans l'ordre", () => {
    const r = choisirDestinations([lieu("a"), lieu("b")], new Map(), toutTient, 5);
    expect(r.map((d) => d.nom)).toEqual(["a", "b"]);
  });

  it("saute un lieu dont le cache tient et garde celui dont le cache a bougé", () => {
    const lignes = new Map([
      ["a", { valide: true }],
      ["b", { valide: false }],
    ]);
    const r = choisirDestinations(
      [lieu("a"), lieu("b"), lieu("c")],
      lignes,
      (ligne) => ligne.valide,
      5,
    );
    expect(r.map((d) => d.nom)).toEqual(["b", "c"]);
  });

  it("s'arrête à la borne, sans lire le reste", () => {
    const lieux = [lieu("a"), lieu("b"), lieu("c")];
    expect(choisirDestinations(lieux, new Map(), toutTient, 2).map((d) => d.nom)).toEqual(["a", "b"]);
    expect(choisirDestinations(lieux, new Map(), toutTient, 3)).toHaveLength(3);
  });

  it("ne dépasse jamais la borne même si tout est à refaire", () => {
    const lieux = Array.from({ length: 10 }, (_, i) => lieu(`l${i}`));
    expect(choisirDestinations(lieux, new Map(), toutTient, 4)).toHaveLength(4);
  });

  it("une borne nulle réserve quand même une destination (comportement d'origine)", () => {
    const lieux = [lieu("a"), lieu("b")];
    expect(choisirDestinations(lieux, new Map(), toutTient, 0).map((d) => d.nom)).toEqual(["a"]);
  });

  it("ne recopie que nom, lat et lon", () => {
    const r = choisirDestinations(
      [{ nom: "a", lat: 1, lon: 2, precision: "exacte" }],
      new Map(),
      toutTient,
      1,
    );
    expect(r).toEqual([{ nom: "a", lat: 1, lon: 2 }]);
  });

  it("transmet la ligne et le lieu au test de cache", () => {
    const vus: string[] = [];
    choisirDestinations([lieu("a", 1, 2)], new Map([["a", "ligne-a"]]), (ligne, l) => {
      vus.push(`${ligne}:${l.nom}:${l.lat}:${l.lon}`);
      return true;
    }, 1);
    expect(vus).toEqual(["ligne-a:a:1:2"]);
  });
});

describe("ligneTrajet — la ligne de cache écrite", () => {
  const maison = { lat: 3, lon: 4 };
  const quand = new Date(0);
  const dests = [lieu("a", 1, 2), lieu("b", 5, 6)];

  it("rattache l'élément à sa destination et à la maison, sans tracé", () => {
    expect(ligneTrajet({ nom: "b", dureeS: 600, distanceM: 7000 }, dests, maison, quand)).toEqual({
      destinationNom: "b",
      lat: 5,
      lon: 6,
      origineLat: 3,
      origineLon: 4,
      dureeS: 600,
      distanceM: 7000,
      polyline: null,
      calculeLe: quand,
    });
  });

  it("garde une durée et une distance nulles telles quelles (pas de zéro remplacé)", () => {
    const l = ligneTrajet({ nom: "a", dureeS: 0, distanceM: 0 }, dests, maison, quand);
    expect(l?.dureeS).toBe(0);
    expect(l?.distanceM).toBe(0);
  });

  it("n'écrit rien pour un élément qu'on n'a pas demandé", () => {
    expect(ligneTrajet({ nom: "z", dureeS: 1, distanceM: 1 }, dests, maison, quand)).toBeUndefined();
    expect(ligneTrajet({ nom: "a", dureeS: 1, distanceM: 1 }, [], maison, quand)).toBeUndefined();
  });
});

describe("resumerRemplissage — la phrase du journal", () => {
  it("dit seulement le compte quand tout est fini", () => {
    expect(resumerRemplissage(3, 0, 3, [])).toBe("3 durée(s) remplie(s)");
  });

  it("nomme les inatteignables", () => {
    expect(resumerRemplissage(1, 0, 1, ["x", "y"])).toBe(
      "1 durée(s) remplie(s) · inatteignables : x, y",
    );
  });

  it("annonce le reliquat quand il est strictement positif", () => {
    expect(resumerRemplissage(10, 2, 3, [])).toBe(
      "3 durée(s) remplie(s) · 5 restante(s) pour les passes suivantes",
    );
  });

  it("ne dit pas de reliquat à zéro ni négatif", () => {
    expect(resumerRemplissage(5, 2, 3, [])).not.toContain("restante");
    expect(resumerRemplissage(4, 2, 3, [])).not.toContain("restante");
  });

  it("garde l'ordre compte · inatteignables · reliquat", () => {
    expect(resumerRemplissage(9, 0, 2, ["x"])).toBe(
      "2 durée(s) remplie(s) · inatteignables : x · 7 restante(s) pour les passes suivantes",
    );
  });
});
