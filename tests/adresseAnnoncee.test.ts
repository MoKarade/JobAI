// tests/adresseAnnoncee.test.ts — une adresse d'annonce est-elle exploitable, et cohérente
// avec la ville annoncée ? (lib/ingest/adresseAnnoncee.ts)
//
// Les deux fonctions sont PURES et décident ce qui part vers le géocodeur : une adresse
// laissée passer à tort devient une épingle au mauvais endroit, une adresse refusée à tort
// fait perdre une épingle. Les deux erreurs ne se valent pas, d'où les cas de refus.

import { describe, expect, it } from "vitest";
import { adresseUtilisable, villeCoherente } from "../lib/ingest/adresseAnnoncee";

describe("adresseUtilisable", () => {
  it("accepte une adresse civique : chiffre, lettres, longueur suffisante", () => {
    expect(adresseUtilisable("12 rue de Marly")).toBe(true);
    expect(adresseUtilisable("  55 boulevard Charest Est  ")).toBe(true);
  });

  it.each([
    ["En présentiel", "aucun chiffre"],
    ["Télétravail", "aucun chiffre"],
    ["Québec", "aucun chiffre"],
    ["G1K 3H4", "un code postal ne situe rien (pas trois lettres consécutives)"],
    ["12 A", "trop court"],
    ["8", "trop court"],
    ["1234 5678 9012", "des chiffres sans nom de voie"],
    ["", "vide"],
  ])("refuse %j (%s)", (adresse) => {
    expect(adresseUtilisable(adresse)).toBe(false);
  });

  it("refuse une adresse démesurée (plus de 200 caractères)", () => {
    expect(adresseUtilisable(`12 ${"rue ".repeat(60)}`)).toBe(false);
  });

  it("la longueur se mesure après rognage des espaces", () => {
    expect(adresseUtilisable("          12 A          ")).toBe(false);
  });
});

describe("villeCoherente", () => {
  it("accepte une adresse qui nomme la ville annoncée, accents et casse compris", () => {
    expect(villeCoherente("12 rue de Marly, Québec", "QUEBEC")).toBe(true);
    expect(villeCoherente("10 rue des Forges, Trois-Rivières", "Trois-Rivieres")).toBe(true);
  });

  it("accepte un arrondissement de la région pour une annonce à Québec (Sainte-Foy est Québec)", () => {
    expect(villeCoherente("12 rue de Marly, Sainte-Foy", "Québec")).toBe(true);
  });

  it("refuse l'adresse d'une ville hors région, même quand elle contient « Québec » (la province)", () => {
    // L'annonce dit Lévis ; l'adresse nomme Montréal et la province. Une garde de chaînes
    // laisserait passer « Québec » : c'est le référentiel de la région qui tranche.
    expect(villeCoherente("10 rue Sainte-Catherine, Montréal, QC, Québec", "Lévis")).toBe(false);
  });

  it("refuse quand l'annonce ne dit pas la ville : rien à vérifier n'est pas une garantie", () => {
    expect(villeCoherente("12 rue de Marly, Québec", "")).toBe(false);
    expect(villeCoherente("12 rue de Marly, Québec", "   ")).toBe(false);
  });

  it("refuse une adresse inutilisable avant même de regarder la ville", () => {
    expect(villeCoherente("Québec", "Québec")).toBe(false);
    expect(villeCoherente("Télétravail", "Québec")).toBe(false);
  });
});
