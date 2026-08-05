// tests/registre.test.ts — lire le registre sans décaler une seule colonne.
//
// Les cas ci-dessous viennent du FICHIER RÉEL, inspecté le 2026-08-05. Ce ne sont pas des
// exemples inventés : `"2707, CAZENEUVE"` est une adresse réelle du registre, et c'est
// exactement elle qui casse un `split(",")`.

import { describe, it, expect } from "vitest";
import {
  COLONNES_ETABLISSEMENT,
  adresseLisible,
  choisirEtablissement,
  type Etablissement,
  cleNom,
  decouperCsv,
  indicesColonnes,
  lireEtablissement,
  memeEntreprise,
  motDeRecherche,
  retirerBom,
  villeDeLigneAdresse,
} from "../lib/registre";

/** L'entête EXACTE d'`Etablissements.csv`, relevée dans le fichier téléchargé. */
const ENTETE =
  "﻿NEQ,NO_SUF_ETAB,IND_ETAB_PRINC,IND_SALON_BRONZ,IND_VENTE_TABAC_DETL,IND_DISP," +
  "LIGN1_ADR,LIGN2_ADR,LIGN3_ADR,LIGN4_ADR,COD_ACT_ECON,DESC_ACT_ECON_ETAB,NO_ACT_ECON_ETAB," +
  "COD_ACT_ECON2,DESC_ACT_ECON_ETAB2,NO_ACT_ECON_ETAB2,NOM_ETAB";

const IDX = indicesColonnes(ENTETE)!;

// ⚠️ ADRESSES FACTICES, et le marqueur compte. Le garde-fou n°1 scanne les fichiers
// versionnés à la recherche de la FORME d'une adresse municipale — il a d'ailleurs attrapé
// la première version de ces fixtures, ce qui est exactement son travail. Chaque exemple
// porte donc son marqueur sur SA ligne, et aucune de ces adresses n'existe.
const RUE_1 = "2811 av. Exemple"; // adresse d'exemple, factice
const RUE_2 = "44 boul. Factice"; // adresse d'exemple, factice
const RUE_VIRGULE = "2707, Exemple"; // adresse d'exemple avec virgule, factice
const RUE_HORS_REGION = "9101 boul. Exemple"; // adresse d'exemple hors region, factice

describe("découpage CSV", () => {
  it("découpe une ligne simple", () => {
    expect(decouperCsv("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("⚠️ NE COUPE PAS un champ cité qui contient une virgule", () => {
    // Le cas qui décide de tout : cette adresse existe dans le registre. Sans respect des
    // guillemets, elle devient deux champs et TOUTES les colonnes suivantes se décalent —
    // le code postal atterrit dans la ville, la ville dans l'adresse. Aucune erreur ne se
    // déclenche : l'import écrirait des adresses fausses en silence, ce qui est pire que
    // pas d'adresse du tout.
    expect(decouperCsv(`1,"${RUE_VIRGULE}",Ville`)).toEqual([
      "1",
      RUE_VIRGULE,
      "Ville",
    ]);
  });

  it("rend un guillemet littéral sur une paire doublée", () => {
    expect(decouperCsv('a,"dit ""Le Grand""",b')).toEqual(["a", 'dit "Le Grand"', "b"]);
  });

  it("garde les champs vides — ils portent l'information « absent »", () => {
    expect(decouperCsv("a,,c")).toEqual(["a", "", "c"]);
    expect(decouperCsv("a,b,")).toEqual(["a", "b", ""]);
  });
});

describe("marque d'ordre des octets", () => {
  it("la retire quand elle est là", () => {
    expect(retirerBom("﻿NEQ")).toBe("NEQ");
  });

  it("ne touche à rien quand elle n'y est pas", () => {
    expect(retirerBom("NEQ")).toBe("NEQ");
  });

  it("sans ce retrait, la première colonne est introuvable", () => {
    // La démonstration du piège : l'entête PARAÎT juste, et la recherche échoue.
    expect(decouperCsv("﻿NEQ,X").indexOf("NEQ")).toBe(-1);
    expect(decouperCsv(retirerBom("﻿NEQ,X")).indexOf("NEQ")).toBe(0);
  });
});

describe("colonnes lues par NOM", () => {
  it("trouve chaque colonne attendue dans l'entête réelle", () => {
    expect(IDX).not.toBeNull();
    for (const col of COLONNES_ETABLISSEMENT) {
      expect(IDX[col], col).toBeGreaterThanOrEqual(0);
    }
    // Les positions relevées dans le vrai fichier — si elles changent, c'est la lecture par
    // NOM qui absorbe le choc, pas nous.
    expect(IDX.NEQ).toBe(0);
    expect(IDX.NOM_ETAB).toBe(16);
  });

  it("rend null si une colonne attendue manque — on ne devine pas", () => {
    // Le registre est republié deux fois par mois. Une colonne retirée doit ARRÊTER
    // l'import, pas le laisser lire à côté.
    expect(indicesColonnes("NEQ,LIGN1_ADR")).toBeNull();
  });
});

describe("ville d'une ligne d'adresse", () => {
  it("retire la province entre parenthèses", () => {
    expect(villeDeLigneAdresse("Lévis (Québec)")).toBe("Lévis");
    expect(villeDeLigneAdresse("SAINT-LAURENT (QUÉBEC)")).toBe("SAINT-LAURENT");
  });

  it("laisse intacte une ligne sans parenthèse", () => {
    expect(villeDeLigneAdresse("Québec")).toBe("Québec");
  });
});

describe("lecture d'un établissement", () => {
  /** Construit une ligne complète à partir des seuls champs qui nous intéressent. */
  function ligne(champs: Partial<Record<string, string>>): string {
    const n = 17;
    const cols = Array.from({ length: n }, () => "");
    for (const [nom, valeur] of Object.entries(champs)) {
      cols[IDX[nom] ?? 0] = (valeur ?? "").includes(",") ? `"${valeur}"` : (valeur ?? "");
    }
    return cols.join(",");
  }

  it("retient un établissement de la région, avec son adresse", () => {
    const r = lireEtablissement(
      ligne({
        NEQ: "1140030363",
        NOM_ETAB: "LASERAX INC.",
        LIGN1_ADR: RUE_1,
        LIGN2_ADR: "Québec (Québec)",
        LIGN4_ADR: "G1X 4S8",
        IND_ETAB_PRINC: "O",
      }),
      IDX,
    );
    expect(r).toEqual({
      neq: "1140030363",
      nom: "LASERAX INC.",
      adresse: RUE_1,
      ville: "Québec",
      codePostal: "G1X4S8",
      principal: true,
    });
  });

  it("ÉCARTE ce qui est hors de la région — c'est ce qui rend l'import possible", () => {
    // Le registre couvre tout le Québec. Sans ce filtre, la base devrait héberger des
    // centaines de milliers d'établissements dont aucun ne concerne Marc.
    const r = lireEtablissement(
      ligne({
        NEQ: "1",
        NOM_ETAB: "Quelque chose",
        LIGN1_ADR: RUE_HORS_REGION,
        LIGN2_ADR: "Montréal (Québec)",
      }),
      IDX,
    );
    expect(r).toBeNull();
  });

  it("écarte une ligne sans adresse ou sans nom", () => {
    expect(
      lireEtablissement(ligne({ NEQ: "1", LIGN2_ADR: "Québec (Québec)" }), IDX),
    ).toBeNull();
    expect(
      lireEtablissement(ligne({ NEQ: "1", NOM_ETAB: "X", LIGN2_ADR: "Québec (Québec)" }), IDX),
    ).toBeNull();
  });

  it("⚠️ lit la BONNE colonne quand l'adresse contient une virgule", () => {
    // Le test qui prouve que le découpage sert à quelque chose de concret : sans lui, la
    // ville lue serait « CAZENEUVE » et la ligne partirait en « hors région ».
    const r = lireEtablissement(
      ligne({
        NEQ: "1",
        NOM_ETAB: "Test",
        LIGN1_ADR: RUE_VIRGULE,
        LIGN2_ADR: "Lévis (Québec)",
        LIGN4_ADR: "G6X3C7",
      }),
      IDX,
    );
    expect(r?.adresse).toBe(RUE_VIRGULE);
    expect(r?.ville).toBe("Lévis");
  });
});

describe("rapprochement des noms", () => {
  it("ignore la forme juridique, les accents et la casse", () => {
    expect(memeEntreprise("Laserax", "LASERAX INC.")).toBe(true);
    expect(memeEntreprise("Créaform", "CREAFORM LTEE")).toBe(true);
  });

  it("ne confond PAS deux entreprises différentes", () => {
    expect(memeEntreprise("Robert", "Groupe Robert")).toBe(false);
    expect(memeEntreprise("Laserax", "Laser Ax Machinerie")).toBe(false);
  });

  it("une clé vide n'apparie rien — sinon tout s'apparierait", () => {
    // « Inc. » seul se réduit à la chaîne vide ; sans cette garde, il apparierait tout
    // autre nom qui se réduit à rien.
    expect(cleNom("Inc.")).toBe("");
    expect(memeEntreprise("Inc.", "Ltée")).toBe(false);
  });
});

describe("choix de l'établissement parmi plusieurs", () => {
  function etab(p: Partial<Etablissement> = {}): Etablissement {
    return {
      neq: "1",
      nom: "Test",
      adresse: RUE_1,
      ville: "Québec",
      codePostal: "G1A1A1",
      principal: false,
      ...p,
    };
  }

  it("prend l'unique candidat sans se poser de question", () => {
    const e = etab();
    expect(choisirEtablissement([e], null)).toBe(e);
  });

  it("rend null quand il n'y a rien", () => {
    expect(choisirEtablissement([], "Québec")).toBeNull();
  });

  it("la VILLE tranche entre deux établissements du même nom", () => {
    // Le cas réel : une entreprise a un établissement à Québec et un à Lévis. L'offre dit
    // laquelle, et c'est le discriminant le plus fort dont on dispose.
    const aQuebec = etab({ ville: "Québec", adresse: RUE_1 });
    const aLevis = etab({ ville: "Lévis", adresse: RUE_2 });
    expect(choisirEtablissement([aQuebec, aLevis], "Lévis")).toBe(aLevis);
    expect(choisirEtablissement([aQuebec, aLevis], "Québec")).toBe(aQuebec);
  });

  it("à défaut de ville, l'établissement PRINCIPAL que le registre désigne", () => {
    const secondaire = etab({ adresse: RUE_1, principal: false });
    const principal = etab({ adresse: RUE_2, principal: true });
    expect(choisirEtablissement([secondaire, principal], null)).toBe(principal);
  });

  it("⚠️ REFUSE de choisir entre deux adresses également plausibles", () => {
    // Le point qui compte. Deux établissements dans la même ville, aucun déclaré principal :
    // prendre le premier serait un tirage au sort inscrit en base, et une adresse plausible
    // mais fausse envoie Marc à la mauvaise porte. Le silence est la bonne réponse.
    const a = etab({ adresse: RUE_1 });
    const b = etab({ adresse: RUE_2 });
    expect(choisirEtablissement([a, b], "Québec")).toBeNull();
  });

  it("refuse aussi quand DEUX établissements se disent principaux", () => {
    const a = etab({ adresse: RUE_1, principal: true });
    const b = etab({ adresse: RUE_2, principal: true });
    expect(choisirEtablissement([a, b], null)).toBeNull();
  });

  it("la ville l'emporte même si l'autre est principal — l'offre sait où elle est", () => {
    const bonneVille = etab({ ville: "Lévis", adresse: RUE_1, principal: false });
    const principalAilleurs = etab({ ville: "Québec", adresse: RUE_2, principal: true });
    expect(choisirEtablissement([bonneVille, principalAilleurs], "Lévis")).toBe(bonneVille);
  });
});

describe("adresse lisible", () => {
  it("assemble rue, ville et code postal", () => {
    expect(
      adresseLisible({
        neq: "1",
        nom: "X",
        adresse: RUE_1,
        ville: "Québec",
        codePostal: "G1X4S8",
        principal: true,
      }),
    ).toBe(`${RUE_1}, Québec, G1X4S8`);
  });

  it("n'écrit pas de virgule pour un code postal absent", () => {
    expect(
      adresseLisible({
        neq: "1",
        nom: "X",
        adresse: RUE_1,
        ville: "Québec",
        codePostal: "",
        principal: false,
      }),
    ).toBe(`${RUE_1}, Québec`);
  });
});

describe("par quel mot chercher dans le registre", () => {
  // ⚠️ POUR DIAGNOSTIQUER, JAMAIS POUR DÉCIDER. Rien de ce que ce choix ramène n'est écrit
  // en base : il sert à répondre à « que contient le registre sous ce nom ? » quand la
  // comparaison de clés exactes n'a rien donné. La règle du dépôt tient : une heuristique
  // peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.

  it("prend le terme PROPRE, pas le terme de métier", () => {
    // Le cas qui a motivé la fonction : chercher « construction » remonterait la moitié du
    // registre et n'apprendrait rien. Prendre le plus LONG donnerait précisément ça.
    expect(motDeRecherche(cleNom("Garoy Construction inc."))).toBe("garoy");
    expect(motDeRecherche(cleNom("Dracon Automatisation"))).toBe("dracon");
  });

  it("saute les mots qui figurent dans un nom sur deux", () => {
    // « Groupe Mundial » ne se relie à « MUNDIAL » ni par préfixe ni par suffixe : c'est
    // exactement le lien qu'un préfixe ne pouvait pas voir, et le mot porteur, si.
    expect(motDeRecherche(cleNom("Groupe Mundial"))).toBe("mundial");
    expect(motDeRecherche(cleNom("Les Aliments Lucky 8"))).toBe("aliments");
  });

  it("ignore les mots trop courts pour discriminer", () => {
    // Un mot de trois lettres apparié n'importe où dans 59 194 dénominations ne dit rien.
    expect(motDeRecherche(cleNom("S Huot Inc"))).toBe("huot");
  });

  it("se rabat sur le premier mot quand TOUS sont génériques", () => {
    // Mieux vaut une recherche bruyante qu'aucune recherche : c'est un diagnostic, et un
    // diagnostic muet est ce qu'on vient de corriger.
    expect(motDeRecherche(cleNom("Groupe Construction"))).toBe("groupe");
  });

  it("rend null quand il n'y a rien à chercher", () => {
    expect(motDeRecherche("")).toBeNull();
    expect(motDeRecherche("s a")).toBeNull();
  });
});
