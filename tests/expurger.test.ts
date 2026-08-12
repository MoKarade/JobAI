// tests/expurger.test.ts — le verrou de `lib/ingest/expurger.ts`.
//
// Un expurgeur qui ne retire rien passe tous ses tests si on ne teste que « ça ne plante pas ».
// Chaque motif est donc prouvé DEUX FOIS : il attrape la forme visée, ET il laisse intacte la
// formulation légitime la plus proche. Sans le second volet, un motif trop large ferait échouer
// le gate sur des annonces normales — et on prendrait l'habitude de le contourner, ce qui est la
// façon dont meurent les garde-fous.

import { describe, expect, it } from "vitest";
import { expurgerLot, expurgerPII } from "../lib/ingest/expurger";

// ⚠️ LES VALEURS FACTICES VIVENT ICI, ET ELLES PORTENT LEUR MARQUEUR.
// `piiGuard` scanne TOUS les fichiers de test sauf lui-même — délibérément : rien ne garantit
// qu'une vraie valeur ne se glisse pas un jour dans une fixture. Un fichier qui vérifie des
// formes de PII contient donc forcément ces formes, et ferait échouer le garde. La convention
// du dépôt existe déjà pour ça : tout exemple porte un marqueur reconnu par `estExemple`. On
// l'utilise plutôt que d'ajouter ce fichier aux exclusions — exclure est le réflexe facile, et
// il laisse un angle mort permanent que plus rien ne signale.
const TEL = "418 555-0142"; // exemple factice, jamais un vrai numero
const TEL_INDICATIF = "+1 (418) 555-0142"; // exemple factice, jamais un vrai numero
const ADRESSE_PROSE = "1629, Avenue des Affaires Quebec, QC G3J 1Y7"; // exemple factice
const VOIE_PROSE = "Avenue des Affaires"; // exemple factice, fragment de l'adresse ci-dessus

describe("courriel nominatif", () => {
  it("retire une adresse « prenom.nom@ »", () => {
    const r = expurgerPII("Envoyez votre CV à anthony.lefebvre@randstad.ca dès aujourd'hui.");
    expect(r.texte).not.toContain("anthony.lefebvre");
    expect(r.texte).toContain("[courriel nominatif retiré]");
    expect(r.retires).toContain("courriel nominatif");
  });

  it("retire aussi une adresse nominative accentuée", () => {
    const r = expurgerPII("Écrire à josée.tremblay@exemple.qc.ca");
    expect(r.texte).not.toContain("josée.tremblay");
  });

  // LE CAS QUI DOIT SURVIVRE : la boîte de rôle est l'adresse à laquelle Marc POSTULE.
  // La retirer ne protégerait personne et lui coûterait la candidature.
  it("laisse intacte une boîte de rôle sans point dans la partie locale", () => {
    const r = expurgerPII("Faites parvenir votre CV à carriere@normand.ca.");
    expect(r.texte).toContain("carriere@normand.ca");
    expect(r.retires).toEqual([]);
  });

  it("laisse intactes les autres boîtes de rôle usuelles", () => {
    for (const boite of ["rh@exemple.ca", "emplois@exemple.ca", "info@exemple.ca"]) {
      expect(expurgerPII(`Écrire à ${boite}`).texte).toContain(boite);
    }
  });
});

describe("profil personnel", () => {
  it("retire un profil LinkedIn personnel", () => {
    const r = expurgerPII("Rejoignez-moi : https://www.linkedin.com/in/anthony-lefebvre-83814632/");
    expect(r.texte).not.toContain("anthony-lefebvre");
    expect(r.retires).toContain("profil personnel");
  });

  // Une page d'ENTREPRISE est publique et renseigne sur l'employeur : elle reste.
  it("laisse intacte une page d'entreprise", () => {
    const url = "https://www.linkedin.com/company/solotech";
    expect(expurgerPII(`Suivez-nous : ${url}`).texte).toContain(url);
  });
});

describe("téléphone", () => {
  it("retire un numéro nord-américain", () => {
    const r = expurgerPII(`Informations : ${TEL}.`);
    expect(r.texte).not.toContain(TEL);
    expect(r.retires).toContain("téléphone");
  });

  it("retire aussi la forme avec indicatif et parenthèses", () => {
    expect(expurgerPII(TEL_INDICATIF).texte).not.toContain(TEL_INDICATIF);
  });

  // LES CAS QUI DOIVENT SURVIVRE : une annonce est PLEINE de nombres, et ce sont eux qui
  // portent la valeur pour Marc (salaire, superficie, effectif).
  it("laisse intacts les montants, superficies et effectifs", () => {
    const legitimes = [
      "Rémunération : 100 000,00 $ à 150 000,00 $ par an",
      "1 200 000 pieds carrés d'espaces commerciaux",
      "près de 5 000 appartements résidentiels",
      "plus de 250 000 tonnes métriques de papier par année",
      "38,72 $ à 43,85 $/h",
      "entreprise fondée en 1992, 90 000 collaborateurs",
    ];
    for (const l of legitimes) {
      const r = expurgerPII(l);
      expect(r.texte, `« ${l} » ne doit pas être touché`).toBe(l);
      expect(r.retires).toEqual([]);
    }
  });
});

describe("adresse civique en prose", () => {
  // Elle n'est pas secrète — elle est INTERDITE ICI : l'exemption de `piiGuard` ne couvre que
  // la clé `adresse`. Le gate a réellement bloqué un commit là-dessus le 2026-08-12.
  it("retire une adresse civique du corps du texte", () => {
    const r = expurgerPII(`LIEU : ${ADRESSE_PROSE}. Quart de soir.`);
    expect(r.texte).not.toContain(VOIE_PROSE);
    expect(r.texte).toContain("[adresse en prose retirée");
    expect(r.retires).toContain("adresse civique en prose");
  });

  it("ne mord pas sur une ville seule ni sur un nombre suivi d'un mot ordinaire", () => {
    for (const l of ["Lieu du poste : Québec, en présentiel.", "5 semaines de vacances par année"]) {
      expect(expurgerPII(l).texte).toBe(l);
    }
  });
});

describe("le rapport dit ce qui a été retiré, jamais la valeur", () => {
  it("nomme les catégories, dédoublonnées et triées", () => {
    const r = expurgerPII(`a.b@x.ca, ${TEL}, et c.d@y.ca`);
    expect(r.retires).toEqual(["courriel nominatif", "téléphone"]);
  });

  it("ne rapporte rien sur un texte propre", () => {
    const propre = "Chargé de projets, 5 ans d'expérience, 85 000 $ par an. Lieu : Québec.";
    const r = expurgerPII(propre);
    expect(r.texte).toBe(propre);
    expect(r.retires).toEqual([]);
  });
});

describe("la fonction est PURE", () => {
  // Un motif global porte un `lastIndex` : réutilisé tel quel, il rendrait un résultat
  // DIFFÉRENT au deuxième appel. C'est le genre de bug qui ne se voit qu'en production, sur la
  // deuxième annonce du lot.
  it("rend le même résultat sur deux appels successifs", () => {
    const entree = `Écrire à jean.dupont@exemple.ca ou au ${TEL}.`;
    expect(expurgerPII(entree)).toEqual(expurgerPII(entree));
  });

  it("ne modifie pas son entrée", () => {
    const entree = "Contact : jean.dupont@exemple.ca";
    expurgerPII(entree);
    expect(entree).toBe("Contact : jean.dupont@exemple.ca");
  });
});

describe("expurgerLot", () => {
  it("expurge les descriptions, compte les offres touchées et laisse `adresse` intacte", () => {
    const lot = [
      { description: "Contact : jean.dupont@exemple.ca", adresse: "395 Faraday à Québec" },
      { description: "Chargé de projets, 85 000 $ par an.", adresse: "" },
      { description: `Appelez le ${TEL}.`, adresse: "" },
    ];
    const r = expurgerLot(lot);

    expect(r.touchees).toBe(2);
    expect(r.retires).toEqual(["courriel nominatif", "téléphone"]);
    expect(r.offres[1]?.description).toBe("Chargé de projets, 85 000 $ par an.");
    // ⚠️ Le champ `adresse` est le SEUL endroit où une adresse civique a le droit d'exister.
    // L'expurger ici détruirait la donnée même que la veille cherche.
    expect(r.offres[0]?.adresse).toBe("395 Faraday à Québec");
  });

  it("ne touche pas un lot déjà propre", () => {
    const lot = [{ description: "Superviseur de production, 3 à 5 ans d'expérience." }];
    const r = expurgerLot(lot);
    expect(r.touchees).toBe(0);
    expect(r.retires).toEqual([]);
    expect(r.offres[0]?.description).toBe(lot[0]?.description);
  });
});
