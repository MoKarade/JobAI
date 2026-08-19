// tests/nocProfession.test.ts — lire un code de profession sans rien décider.
//
// Ce que ces tests protègent : la distinction entre « je ne sais pas lire ce code » et « ce
// métier ne concerne pas Marc ». Les confondre ferait disparaître en silence les offres que
// le Guichet code mal — et un tri qui écarte sans le dire est indiscernable d'une source qui
// ne rend rien. C'est la même faute que « lieu inconnu » ≠ « hors région », transposée au
// métier.

import { describe, it, expect } from "vitest";
import { codeRetenu, jugerProfession, lireCodeNoc } from "../lib/nocProfession";

describe("lireCodeNoc — lire, et avouer quand on ne peut pas", () => {
  it("lit un code de cinq chiffres et en tire sa structure", () => {
    expect(lireCodeNoc("21301")).toEqual({ code: "21301", domaine: 2, niveau: 1 });
    expect(lireCodeNoc("63200")).toEqual({ code: "63200", domaine: 6, niveau: 3 });
  });

  it("tolère les espaces autour, parce qu'un flux en met", () => {
    expect(lireCodeNoc(" 21301 ")?.code).toBe("21301");
  });

  it("REFUSE un code à QUATRE chiffres — c'est l'ancien format, pas un code court", () => {
    // Le format 2016 en avait quatre. Le lire chiffre par chiffre comme un code 2021
    // donnerait un domaine et un niveau faux, sans erreur — donc un tri faux, en silence.
    expect(lireCodeNoc("2131")).toBeNull();
    expect(lireCodeNoc("213011")).toBeNull();
  });

  it("REFUSE ce qui n'est pas un code, sans jamais lever", () => {
    // Un flux mal formé ne doit pas faire tomber une passe entière.
    for (const brut of ["", "  ", "abcde", "2130a", null, undefined, "21-301"]) {
      expect(lireCodeNoc(brut), String(brut)).toBeNull();
    }
  });
});

describe("codeRetenu — deux granularités, aucune sur-portée", () => {
  it("retient par PRÉFIXE de deux chiffres — domaine et niveau", () => {
    // L'unité utile : « sciences et génie, niveau universitaire » sans énumérer les quarante
    // codes qui s'y rangent.
    const code = lireCodeNoc("21301")!;
    expect(codeRetenu(code, ["21"])).toBe(true);
    expect(codeRetenu(code, ["22"])).toBe(false);
  });

  it("retient par CODE COMPLET — l'exception ciblée", () => {
    const code = lireCodeNoc("21301")!;
    expect(codeRetenu(code, ["21301"])).toBe(true);
    expect(codeRetenu(code, ["21302"])).toBe(false);
  });

  it("⚠️ un préfixe d'UN chiffre n'avale PAS tout un domaine", () => {
    // La sur-portée que ce dépôt a déjà payée sur les listes de villes : ajouter
    // « saint-laurent » aurait exclu « saint-laurent-de-l-ile-d-orleans ». Ici, retenir « 2 »
    // ferait entrer les niveaux 4 et 5 du même domaine — des postes sans qualification —
    // alors qu'on croyait viser les ingénieurs. Une entrée mal écrite ne retient RIEN, et le
    // compte des écartées le rend visible.
    const ingenieur = lireCodeNoc("21301")!;
    const manoeuvre = lireCodeNoc("25400")!;
    expect(codeRetenu(ingenieur, ["2"])).toBe(false);
    expect(codeRetenu(manoeuvre, ["2"])).toBe(false);
  });

  it("ne retient rien sur une liste vide", () => {
    expect(codeRetenu(lireCodeNoc("21301")!, [])).toBe(false);
  });
});

describe("jugerProfession — TROIS réponses, pas deux", () => {
  const retenus = ["21", "22"];

  it("distingue « retenue » de « écartée »", () => {
    expect(jugerProfession("21301", retenus)).toBe("retenue");
    expect(jugerProfession("63200", retenus)).toBe("ecartee");
  });

  it("⚠️ « code illisible » n'est PAS « écartée » — un aveu n'est pas une décision", () => {
    // Les compter ensemble ferait passer un défaut de la SOURCE (un flux qui cesse de coder
    // ses offres) pour un tri qui fonctionne, et personne ne le verrait. C'est la faute
    // « lieu inconnu ≠ hors région », transposée au métier.
    expect(jugerProfession("", retenus)).toBe("code-illisible");
    expect(jugerProfession(null, retenus)).toBe("code-illisible");
    expect(jugerProfession("2131", retenus)).toBe("code-illisible");
  });

  it("un code illisible reste illisible même quand la liste est vide", () => {
    // Sinon « on ne retient rien » et « on ne sait pas lire » se confondraient au pire
    // moment : celui où la liste n'est pas encore configurée.
    expect(jugerProfession("abcde", [])).toBe("code-illisible");
    expect(jugerProfession("21301", [])).toBe("ecartee");
  });
});
