// tests/doublonsAnnonce.test.ts — reconnaître la même annonce sous deux noms d'employeur, et mesurer l'ampleur (JobAI#195).
//
// Données FICTIVES : aucun vrai employeur, aucun vrai numéro d'annonce.

import { describe, it, expect } from "vitest";
import { numeroAnnonce } from "../lib/annonce";
import { cleEnseigne } from "../lib/enseigne";
import { cleGroupement } from "../lib/employeurs";
import { mesurerDoublonsAnnonce } from "../lib/doublonsAnnonce";
import type { Offre } from "../lib/types";

const GUICHET = "https://www.qc.guichetemplois.gc.ca/jobsearch/jobposting";

function offre(id: string, entreprise: string, poste: string, lien: string, histo = false): Offre {
  return {
    id,
    source: "Guichet",
    dateReperage: "2026-10-01",
    entreprise,
    poste,
    lien,
    km: null,
    perimeeLe: null,
    histo,
  } as unknown as Offre;
}

describe("numeroAnnonce", () => {
  it("lit le numéro d'une annonce du Guichet, en français comme en anglais", () => {
    expect(numeroAnnonce(`${GUICHET}/50217959`)).toBe("50217959");
    expect(numeroAnnonce("https://www.jobbank.gc.ca/jobsearch/jobposting/50217959")).toBe("50217959");
  });

  it("ignore les paramètres, le fragment et la session", () => {
    expect(numeroAnnonce(`${GUICHET}/50217959?source=searchresults#top`)).toBe("50217959");
    expect(numeroAnnonce(`${GUICHET}/50217959;jsessionid=ABC123.jobsearch75`)).toBe("50217959");
  });

  it("rend null pour un autre site, un lien vide, un lien illisible ou sans numéro", () => {
    expect(numeroAnnonce("https://exemple.test/jobsearch/jobposting/50217959")).toBeNull();
    expect(numeroAnnonce("https://guichetemplois.gc.ca.exemple.test/jobsearch/jobposting/50217959")).toBeNull();
    expect(numeroAnnonce("")).toBeNull();
    expect(numeroAnnonce(null)).toBeNull();
    expect(numeroAnnonce("pas un lien")).toBeNull();
    expect(numeroAnnonce(`${GUICHET}/abc`)).toBeNull();
    expect(numeroAnnonce("javascript:alert(1)")).toBeNull();
  });
});

describe("cleEnseigne — un numéro de succursale ne fait pas une autre enseigne", () => {
  it("réunit les succursales d'une enseigne", () => {
    const base = cleEnseigne("Enseigne Fictive", "x");
    expect(cleEnseigne("Enseigne Fictive 2538", "x")).toBe(base);
    expect(cleEnseigne("ENSEIGNE FICTIVE #2789", "x")).toBe(base);
    // Prudence : une forme juridique AVANT le numéro reste dans la clé (la règle ne réunit pas trop).
    expect(cleEnseigne("Enseigne Fictive inc. 12345", "x")).toBe("enseigne fictive inc");
  });

  it("ne touche pas à un nom qui n'a pas de numéro de succursale", () => {
    expect(cleEnseigne("Enseigne Fictive", "x")).toBe(cleGroupement("Enseigne Fictive", "x"));
    // Deux chiffres : pas une succursale.
    expect(cleEnseigne("Studio 54", "x")).toBe(cleGroupement("Studio 54", "x"));
  });

  it("garde une société à numéro entière : son nom EST le numéro", () => {
    expect(cleEnseigne("9123-4567 Québec inc.", "x")).toBe(cleGroupement("9123-4567 Québec inc.", "x"));
    expect(cleEnseigne("1234 Entreprises", "x")).toBe(cleGroupement("1234 Entreprises", "x"));
  });

  it("ne réduit pas un nom à rien ni à un chiffre", () => {
    expect(cleEnseigne("AB 1234", "x")).toBe(cleGroupement("AB 1234", "x"));
    expect(cleEnseigne("   ", "secours-1")).toBe(cleGroupement("   ", "secours-1"));
  });

  it("deux enseignes différentes restent différentes", () => {
    expect(cleEnseigne("Enseigne Fictive 2538", "x")).not.toBe(cleEnseigne("Autre Enseigne 2538", "x"));
  });
});

describe("mesurerDoublonsAnnonce", () => {
  const offres = [
    // La même annonce sous deux noms (le renommage constaté sur « Harvey's », nom remplacé ici).
    offre("fictive-aide", "Enseigne Fictive", "aide de cuisine", `${GUICHET}/10000001`),
    offre("fictive-2538-aide", "Enseigne Fictive 2538", "aide de cuisine", `${GUICHET}/10000001`),
    // Une succursale de plus, annonce différente.
    offre("fictive-2789-gerant", "Enseigne Fictive 2789", "gérant", `${GUICHET}/10000002`),
    // Deux offres sous le même nom et la même annonce (doublon sans renommage).
    offre("autre-a", "Autre Employeur", "poste a", `${GUICHET}/10000003`),
    offre("autre-b", "Autre Employeur", "poste b", `${GUICHET}/10000003`),
    // Sans numéro d'annonce : jamais comptée comme doublon.
    offre("ailleurs-1", "Ailleurs", "poste", "https://exemple.test/emploi/1"),
    offre("ailleurs-2", "Ailleurs", "poste bis", "https://exemple.test/emploi/1"),
    // Historique 2025 : hors mesure.
    offre("histo-1", "Enseigne Fictive", "ancien", `${GUICHET}/10000001`, true),
  ];

  it("compte les annonces en double, les offres en trop et les renommages", () => {
    const m = mesurerDoublonsAnnonce(offres);
    expect(m.offres).toBe(7);
    expect(m.avecNumeroAnnonce).toBe(5);
    expect(m.annoncesDistinctes).toBe(3);
    expect(m.annoncesEnDouble).toBe(2);
    expect(m.offresEnTrop).toBe(2);
    // Seule la première (10000001) porte deux noms d'employeur différents.
    expect(m.annoncesRenommees).toBe(1);
  });

  it("compte les enseignes éclatées sur plusieurs noms", () => {
    const m = mesurerDoublonsAnnonce(offres);
    expect(m.enseignesEclatees).toBe(1);
    expect(m.nomsDansLesEnseignesEclatees).toBe(3);
    expect(m.exemples).toEqual([{ enseigne: cleEnseigne("Enseigne Fictive", "x"), noms: 3, offres: 3 }]);
  });

  it("ne rend que des nombres et des clés d'enseigne : ni lien, ni intitulé, ni identifiant", () => {
    const texte = JSON.stringify(mesurerDoublonsAnnonce(offres));
    expect(texte).not.toContain("guichetemplois");
    expect(texte).not.toContain("aide de cuisine");
    expect(texte).not.toContain("fictive-aide");
  });

  it("sur un suivi vide, rend des zéros", () => {
    const m = mesurerDoublonsAnnonce([]);
    expect(m.offres).toBe(0);
    expect(m.annoncesEnDouble).toBe(0);
    expect(m.exemples).toEqual([]);
  });
});
