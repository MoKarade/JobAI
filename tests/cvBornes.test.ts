// tests/cvBornes.test.ts — une liste trop longue se TRONQUE, elle ne fait pas tout perdre.
//
// L'INCIDENT QUI A CRÉÉ CE FICHIER (2026-08-14, signalé par Marc)
// « CV enregistré, mais l'analyse a échoué : Réponse hors schéma : forces Array must contain
// at most 8 element(s) ». Le CV était lu, les faits étaient bons — et toute l'analyse est
// partie à la poubelle parce que le modèle avait rendu NEUF forces au lieu de huit.
//
// La cause n'était pas le modèle : le schéma d'outil qu'on lui envoyait ne portait AUCUN
// `maxItems`. On demandait une liste libre, puis on rejetait la réponse au nom d'une limite
// jamais annoncée. Deux écritures de la même règle — le JSON Schema pour le modèle, le
// schéma Zod pour la validation — et c'est la plus permissive qui parlait au modèle.
//
// Ce fichier verrouille les deux moitiés du correctif : les plafonds sont ANNONCÉS, et un
// dépassement TRONQUE au lieu de rejeter.

import { describe, it, expect } from "vitest";
import {
  PLAFONDS,
  ReponseExtractionSchema,
  OUTIL_EXTRACTION,
  bornerListes,
} from "@/lib/cv/extraction";

/** Une réponse de modèle plausible, dont on fait varier la seule longueur des listes. */
function reponse(nbForces: number) {
  return {
    anneesExperience: 8,
    anneesExperienceProvenance: "Expérience listée de 2018 à 2026.",
    langues: ["français", "anglais"],
    diplomes: ["Master en informatique industrielle"],
    outils: ["Python", "C++"],
    titresOccupes: ["Chargé de projet"],
    recherchesSuggerees: ["chargé de projet automatisation"],
    forces: Array.from({ length: nbForces }, (_, i) => `Force numéro ${i + 1}`),
    manques: [],
  };
}

describe("les plafonds sont ANNONCÉS au modèle", () => {
  // ⚠️ LE VERROU CENTRAL. Sans lui, les deux schémas redivergent au premier ajout de champ,
  // et la panne revient sous une autre liste — silencieusement, jusqu'au prochain CV.
  it("chaque liste plafonnée porte le MÊME maxItems dans le schéma d'outil", () => {
    // `as unknown` d'abord : le type littéral du schéma d'outil ne recouvre pas la forme
    // générique qu'on veut interroger, et c'est justement parce qu'il est LITTÉRAL que ce
    // test a de la valeur — il lit les vraies valeurs, pas une déclaration parallèle.
    type Noeud = {
      type?: string;
      maxItems?: number;
      properties?: Record<string, Noeud>;
      items?: Noeud;
    };
    // ⚠️ LE SCAN DESCEND DANS LES SOUS-SCHÉMAS. Il ne regardait que le premier niveau, et
    // ratait donc tout plafond porté par un champ IMBRIQUÉ — `parcours[].faits` en est un.
    // Une garde qui ne voit qu'un étage laisse passer exactement ce qu'elle promet
    // d'attraper dès que la forme des données se complique.
    function aplatir(n: Noeud, dedans: Record<string, Noeud> = {}): Record<string, Noeud> {
      for (const [cle, val] of Object.entries(n.properties ?? {})) {
        dedans[cle] = val;
        aplatir(val, dedans);
        if (val.items) aplatir(val.items, dedans);
      }
      return dedans;
    }
    const proprietes = aplatir(
      OUTIL_EXTRACTION.input_schema as unknown as Noeud,
    ) as unknown as Record<string, { type?: string; maxItems?: number }>;

    // Volume prouvé : un test qui ne trouve aucune liste passerait à vide.
    expect(Object.keys(PLAFONDS).length).toBeGreaterThanOrEqual(7);

    // Le nom du plafond ne coïncide pas toujours avec celui du champ : `faitsParPoste`
    // borne `parcours[].faits`. La correspondance est DÉCLARÉE, jamais devinée.
    const CHAMP_DU_PLAFOND: Readonly<Record<string, string>> = { faitsParPoste: "faits" };

    for (const [champ, plafond] of Object.entries(PLAFONDS)) {
      const nom = CHAMP_DU_PLAFOND[champ] ?? champ;
      const decrit = proprietes[nom];
      expect(decrit, `le schéma d'outil ne décrit pas « ${nom} »`).toBeDefined();
      expect(decrit?.type, `« ${nom} » n'est pas un tableau côté outil`).toBe("array");
      expect(
        decrit?.maxItems,
        `« ${nom} » ne dit pas sa limite au modèle : il ne peut pas la respecter`,
      ).toBe(plafond);
    }
  });
});

describe("un dépassement TRONQUE, il ne rejette pas", () => {
  // Le cas EXACT signalé par Marc, rejoué à la borne dérivée de la constante — pas de « 9 »
  // codé en dur, sinon le test mentira le jour où le plafond bougera.
  it("neuf forces pour un plafond de huit : l'analyse PASSE", () => {
    const trop = reponse(PLAFONDS.forces + 1);

    // Discrimination : SANS la troncature, c'est bien l'échec qu'a vu Marc.
    expect(ReponseExtractionSchema.safeParse(trop).success).toBe(false);

    const { valeur, tronquees } = bornerListes(trop);
    const analyse = ReponseExtractionSchema.safeParse(valeur);
    expect(analyse.success).toBe(true);
    if (analyse.success) expect(analyse.data.forces).toHaveLength(PLAFONDS.forces);

    // ⚠️ Et la coupe se DIT : un filtre qui peut perdre des résultats annonce quand il mord.
    expect(tronquees.join(" ")).toContain("forces");
  });

  it("ne touche à rien quand tout tient dans les bornes", () => {
    const juste = reponse(PLAFONDS.forces);
    const { valeur, tronquees } = bornerListes(juste);
    expect(tronquees).toEqual([]);
    expect(valeur).toEqual(juste);
  });

  it("laisse passer intact ce qui n'est pas un tableau — ce n'est pas son rôle", () => {
    // La LONGUEUR est un choix d'affichage ; le TYPE est une question de correction, et
    // c'est au schéma Zod de la trancher juste après. Corriger les deux ici masquerait
    // une réponse réellement malformée.
    const malforme = { ...reponse(2), forces: "pas un tableau" };
    const { valeur, tronquees } = bornerListes(malforme);
    expect(tronquees).toEqual([]);
    expect(ReponseExtractionSchema.safeParse(valeur).success).toBe(false);
  });

  it("survit à une réponse qui n'est pas un objet", () => {
    for (const brut of [null, undefined, 42, "texte", [1, 2, 3]]) {
      expect(() => bornerListes(brut)).not.toThrow();
      expect(bornerListes(brut).tronquees).toEqual([]);
    }
  });
});

describe("la borne TRONQUE, elle ne rejette pas — y compris imbriquée", () => {
  it("⚠️ le cas réel du 2026-08-20 : onze réalisations sur un poste", () => {
    // Ce CV a été REJETÉ en production, avec « parcours.1.faits Array must contain at most
    // 10 element(s) ». Le CV était valide ; le modèle avait juste été bavard sur un poste.
    const trop = Array.from({ length: PLAFONDS.faitsParPoste + 1 }, (_, i) => `Réalisation ${i}`);
    const { valeur, tronquees } = bornerListes({
      anneesExperience: 3,
      parcours: [
        { titre: "Chargé de projet", faits: ["Un seul fait"] },
        { titre: "Responsable technique", faits: trop },
      ],
    });

    // Tronqué, pas rejeté.
    const p = (valeur as { parcours: { faits: string[] }[] }).parcours;
    expect(p[1]!.faits).toHaveLength(PLAFONDS.faitsParPoste);
    expect(p[0]!.faits).toHaveLength(1);

    // ⚠️ ET DIT. Une analyse amputée qui se présenterait comme complète serait pire que
    // l'échec qu'on vient de retirer.
    expect(tronquees.some((t) => t.includes("Responsable technique"))).toBe(true);

    // Et surtout : le schéma ACCEPTE le résultat, là où il refusait tout.
    expect(ReponseExtractionSchema.safeParse(valeur).success).toBe(true);
  });

  it("⚠️ le schéma reste STRICT : c'est lui qui signale ce que la troncature a manqué", () => {
    // Ne PAS assouplir cette borne. C'est elle qui a nommé `parcours.1.faits` en production
    // au lieu de laisser passer une liste trop longue en silence. La troncature évite
    // l'échec ; la stricture le rend diagnosticable quand la troncature est incomplète.
    const faits = (n: number) => Array.from({ length: n }, (_, i) => `Fait ${i}`);
    const brut = { anneesExperience: null, forces: faits(PLAFONDS.forces + 1) };
    expect(ReponseExtractionSchema.safeParse(brut).success).toBe(false);
    expect(ReponseExtractionSchema.safeParse(bornerListes(brut).valeur).success).toBe(true);
  });

  it("un poste sans faits, ou mal formé, traverse sans casser", () => {
    const { valeur, tronquees } = bornerListes({
      anneesExperience: null,
      parcours: [{ titre: "Sans faits" }, null, "pas un objet"],
    });
    expect(tronquees).toEqual([]);
    expect((valeur as { parcours: unknown[] }).parcours).toHaveLength(3);
  });
});
