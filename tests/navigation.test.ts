import { describe, expect, it } from "vitest";
import { ONGLETS, SECONDAIRES, plusEstActif } from "../lib/navigation";

describe("navigation", () => {
  it("chaque href commence par / et est unique", () => {
    const hrefs = ONGLETS.map((o) => o.href);
    const uniqueHrefs = new Set(hrefs);

    expect(uniqueHrefs.size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href.startsWith("/")).toBe(true);
    }
  });

  it("chaque libellé est non vide et unique", () => {
    const libelles = ONGLETS.map((o) => o.libelle);
    const uniqueLibelles = new Set(libelles);

    expect(uniqueLibelles.size).toBe(libelles.length);
    for (const libelle of libelles) {
      expect(libelle.trim().length).toBeGreaterThan(0);
    }
  });

  it("contient exactement deux onglets principaux (Suivi et Carte) et le premier est /", () => {
    const principaux = ONGLETS.filter((o) => o.principal);

    expect(principaux).toHaveLength(2);
    expect(principaux.map((o) => o.libelle)).toEqual(["Suivi", "Carte"]);
    expect(ONGLETS[0]?.href).toBe("/");
  });

  it("SECONDAIRES contient exactement les onglets non principaux dans le même ordre que ONGLETS", () => {
    const nonPrincipaux = ONGLETS.filter((o) => !o.principal);

    expect(SECONDAIRES).toEqual(nonPrincipaux);
  });

  it("plusEstActif retourne vrai pour /profil, /sources, /archives, /references", () => {
    expect(plusEstActif("/profil")).toBe(true);
    expect(plusEstActif("/sources")).toBe(true);
    expect(plusEstActif("/archives")).toBe(true);
    expect(plusEstActif("/references")).toBe(true);
  });

  it("plusEstActif retourne faux pour /, /carte, null et routes inconnues", () => {
    expect(plusEstActif("/")).toBe(false);
    expect(plusEstActif("/carte")).toBe(false);
    expect(plusEstActif(null)).toBe(false);
    expect(plusEstActif("/inconnue")).toBe(false);
  });
});
