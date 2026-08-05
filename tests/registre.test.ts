// tests/registre.test.ts — lire le registre sans décaler une seule colonne.
//
// Les cas ci-dessous viennent du FICHIER RÉEL, inspecté le 2026-08-05. Ce ne sont pas des
// exemples inventés : `"2707, CAZENEUVE"` est une adresse réelle du registre, et c'est
// exactement elle qui casse un `split(",")`.

import { describe, it, expect } from "vitest";
import {
  COLONNES_ETABLISSEMENT,
  cleNom,
  decouperCsv,
  indicesColonnes,
  lireEtablissement,
  memeEntreprise,
  retirerBom,
  villeDeLigneAdresse,
} from "../lib/registre";

/** L'entête EXACTE d'`Etablissements.csv`, relevée dans le fichier téléchargé. */
const ENTETE =
  "﻿NEQ,NO_SUF_ETAB,IND_ETAB_PRINC,IND_SALON_BRONZ,IND_VENTE_TABAC_DETL,IND_DISP," +
  "LIGN1_ADR,LIGN2_ADR,LIGN3_ADR,LIGN4_ADR,COD_ACT_ECON,DESC_ACT_ECON_ETAB,NO_ACT_ECON_ETAB," +
  "COD_ACT_ECON2,DESC_ACT_ECON_ETAB2,NO_ACT_ECON_ETAB2,NOM_ETAB";

const IDX = indicesColonnes(ENTETE)!;

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
    expect(decouperCsv('1,"2707, CAZENEUVE",Montréal')).toEqual([
      "1",
      "2707, CAZENEUVE",
      "Montréal",
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
        LIGN1_ADR: "2811 av. Watt",
        LIGN2_ADR: "Québec (Québec)",
        LIGN4_ADR: "G1X 4S8",
        IND_ETAB_PRINC: "O",
      }),
      IDX,
    );
    expect(r).toEqual({
      neq: "1140030363",
      nom: "LASERAX INC.",
      adresse: "2811 av. Watt",
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
        LIGN1_ADR: "9101 boul. Louis-H.-La Fontaine",
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
        LIGN1_ADR: "2707, Cazeneuve",
        LIGN2_ADR: "Lévis (Québec)",
        LIGN4_ADR: "G6X3C7",
      }),
      IDX,
    );
    expect(r?.adresse).toBe("2707, Cazeneuve");
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
