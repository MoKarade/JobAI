// tests/competences.test.ts — la fiche de compétences prouvées (ADR-0033, JobAI#155).
//
// Ce que ce fichier tient : (1) aucune ligne de fiche sans preuve retrouvée dans le CV ;
// (2) un terme venu d'un CV ne se compare plus par morceaux de mots — le cas qui a fait
// monter un laboratoire dentaire en tête de liste parce que « prosthesis » contient « ros » ;
// (3) le vocabulaire d'origine du barème note exactement comme avant.

import { describe, it, expect } from "vitest";
import {
  COMPETENCES_MAX,
  IDS_COMPETENCES,
  VOCABULAIRE_COMPETENCES,
  expressionsDeNotation,
  fichePourLecture,
  replier,
  resumeDesRefus,
  verifierCompetences,
  type CompetenceProuvee,
} from "@/lib/competences";
import { PROFIL_DEFAUT, ProfilSchema, type Profil } from "@/lib/profil";
import { contientMot, motsTechniqueDe, normaliserTitre, scoreFitRole } from "@/lib/scoring";
import { SEED } from "@/lib/seed";

// Un CV FICTIF. Aucune donnée réelle : ce dépôt est public.
const CV = `
Technicien en automatisation, Usine Exemple — Janvier 2021 à Présent
• Programmation d'automates programmables et mise en
  service de lignes d'emballage
• Intégration d'un robot industriel et de sa vision industrielle
Coordonnateur de projets, Atelier Fictif — 2018 à 2020
• Suivi du budget avec Trello et diagrammes de Gantt
`;
const POSTES = ["Technicien en automatisation", "Coordonnateur de projets"];

describe("le vocabulaire fermé", () => {
  it("les identifiants sont uniques et la taille tient dans le plafond", () => {
    expect(new Set(IDS_COMPETENCES).size).toBe(IDS_COMPETENCES.length);
    expect(IDS_COMPETENCES.length).toBeLessThanOrEqual(COMPETENCES_MAX);
  });

  it("une compétence qui règle la note a des expressions, une compétence de fiche seule n'en a pas", () => {
    for (const c of VOCABULAIRE_COMPETENCES) {
      if (c.reglaNote) expect(c.expressions.length, c.id).toBeGreaterThan(0);
      else expect(c.expressions, c.id).toEqual([]);
    }
  });

  it("les langages et la bureautique ne règlent PAS la note", () => {
    const regle = new Set(VOCABULAIRE_COMPETENCES.filter((c) => c.reglaNote).map((c) => c.id));
    for (const id of ["python", "java", "cpp", "unity", "bureautique", "soudure"]) {
      expect(regle.has(id), id).toBe(false);
    }
  });

  it("chaque expression est déjà repliée (minuscules, sans accent) : elle se compare telle quelle", () => {
    for (const c of VOCABULAIRE_COMPETENCES) {
      for (const e of c.expressions) expect(normaliserTitre(e), `${c.id}: ${e}`).toBe(e);
    }
  });
});

describe("verifierCompetences — aucune ligne sans source", () => {
  const base = {
    id: "automates-programmables",
    niveau: "maitrise",
    phrase: "Programmation d'automates programmables et mise en service de lignes d'emballage",
    poste: "Technicien en automatisation",
  };

  it("retient une ligne dont la phrase se lit dans le CV, coupures de ligne et accents ignorés", () => {
    const r = verifierCompetences([base], CV, POSTES);
    expect(r.rejetees).toEqual([]);
    expect(r.retenues).toHaveLength(1);
    expect(r.retenues[0]).toMatchObject({ id: "automates-programmables", niveau: "maitrise" });
  });

  it("rejette une phrase que le CV ne contient pas", () => {
    const r = verifierCompetences([{ ...base, phrase: "Expert reconnu en programmation d'automates" }], CV, POSTES);
    expect(r.retenues).toEqual([]);
    expect(r.rejetees).toEqual([{ id: "automates-programmables", raison: "phrase introuvable dans le CV" }]);
  });

  it("rejette un poste qui n'est pas dans le parcours", () => {
    const r = verifierCompetences([{ ...base, poste: "Directeur général" }], CV, POSTES);
    expect(r.rejetees[0]?.raison).toBe("poste absent du parcours");
  });

  it("rejette un poste vide", () => {
    expect(verifierCompetences([{ ...base, poste: "  " }], CV, POSTES).retenues).toEqual([]);
  });

  it("rejette un identifiant hors vocabulaire et un niveau inconnu", () => {
    const r = verifierCompetences(
      [{ ...base, id: "magie-noire" }, { ...base, niveau: "expert" }],
      CV,
      POSTES,
    );
    expect(r.retenues).toEqual([]);
    expect(r.rejetees.map((x) => x.raison)).toEqual(["hors vocabulaire", "niveau inconnu"]);
  });

  it("rejette une phrase d'un seul mot : elle ne prouve rien", () => {
    const r = verifierCompetences([{ ...base, phrase: "Gantt" }], CV, POSTES);
    expect(r.rejetees[0]?.raison).toBe("phrase absente ou hors longueur");
  });

  it("ne plante pas sur du n'importe quoi rendu par le modèle", () => {
    const r = verifierCompetences([null, 42, "x", {}, { id: 3 }], CV, POSTES);
    expect(r.retenues).toEqual([]);
    expect(r.rejetees).toHaveLength(5);
  });

  it("une compétence citée deux fois garde le niveau le plus haut", () => {
    const r = verifierCompetences(
      [
        { ...base, niveau: "notions" },
        { ...base, niveau: "maitrise" },
        { ...base, niveau: "pratique" },
      ],
      CV,
      POSTES,
    );
    expect(r.retenues).toHaveLength(1);
    expect(r.retenues[0]?.niveau).toBe("maitrise");
  });

  it("la phrase doit être faite de mots contigus : deux fragments éloignés ne comptent pas", () => {
    const r = verifierCompetences(
      [{ ...base, phrase: "Programmation d'automates et diagrammes de Gantt" }],
      CV,
      POSTES,
    );
    expect(r.retenues).toEqual([]);
  });

  it("replier ignore la casse, les accents et la ponctuation, pas les mots", () => {
    expect(replier("Mise-en  SERVICE,\nélectrique")).toBe(" mise en service electrique ");
  });
});

describe("ce que la fiche règle dans la note", () => {
  const ligne = (id: string, niveau: CompetenceProuvee["niveau"]): CompetenceProuvee => ({
    id,
    niveau,
    phrase: "une phrase de preuve",
    poste: "un poste",
  });

  it("pratique et maitrise règlent la note, notions non", () => {
    expect(expressionsDeNotation([ligne("scada", "notions")])).toEqual([]);
    expect(expressionsDeNotation([ligne("scada", "pratique")])).toEqual(["scada"]);
    expect(expressionsDeNotation([ligne("scada", "maitrise")])).toEqual(["scada"]);
  });

  it("une compétence de fiche seule ne règle rien, quel que soit son niveau", () => {
    expect(expressionsDeNotation([ligne("python", "maitrise"), ligne("bureautique", "maitrise")])).toEqual([]);
  });

  it("la fiche se lit avec sa preuve", () => {
    const [l] = fichePourLecture([ligne("scada", "pratique")]);
    expect(l).toContain("SCADA");
    expect(l).toContain("pratique");
    expect(l).toContain("une phrase de preuve");
    expect(l).toContain("un poste");
  });
});

describe("contientMot — des mots entiers, pas des morceaux", () => {
  it("« ros » n'est pas dans « prosthesis », « unity » n'est pas dans « community »", () => {
    expect(contientMot("dental prosthesis maker", "ros")).toBe(false);
    expect(contientMot("community services director", "unity")).toBe(false);
    expect(contientMot("process engineer across the plant", "ros")).toBe(false);
  });

  it("mais le mot seul, ou son pluriel simple, passe", () => {
    expect(contientMot("ros developer", "ros")).toBe(true);
    expect(contientMot("experience with ros 2 and gazebo", "ros")).toBe(true);
    expect(contientMot("integration de robot mobiles", "robot mobile")).toBe(true);
    expect(contientMot("flotte de mobile robots", "mobile robot")).toBe(true);
    expect(contientMot("des plcs siemens", "plc")).toBe(true);
  });

  it("un chiffre ou une lettre collés ne comptent pas comme une frontière", () => {
    expect(contientMot("ros2", "ros")).toBe(false);
    expect(contientMot("c++ developer", "c++")).toBe(true);
  });
});

describe("le cas du laboratoire dentaire ne remonte plus (JobAI#155)", () => {
  // Le profil réel de Marc (v7) portait « ros » et « unity », ajoutés tels quels depuis son CV.
  const profilV7: Profil = ProfilSchema.parse({
    ...structuredClone(PROFIL_DEFAUT),
    motsTechnique: [...PROFIL_DEFAUT.motsTechnique, "ros", "unity", "python", "agv", "robotiques"],
  });
  const horsSujet = PROFIL_DEFAUT.pointsRole.horsSujet;

  it("avant : par morceaux de mots, l'ancienne comparaison classait ces offres « technique »", () => {
    const ancien = (t: string) => profilV7.motsTechnique.some((m) => normaliserTitre(t).includes(normaliserTitre(m)));
    expect(ancien("dental prosthesis maker")).toBe(true);
    expect(ancien("community services director")).toBe(true);
  });

  it("après : le laboratoire dentaire et la direction de services communautaires restent hors sujet", () => {
    expect(scoreFitRole("Dental prosthesis maker", "", profilV7)).toBe(horsSujet);
    expect(scoreFitRole("Community services director", "", profilV7)).toBe(
      scoreFitRole("Community services director", "", PROFIL_DEFAUT),
    );
    expect(motsTechniqueDe("dental prosthesis maker", profilV7)).toEqual([]);
  });

  it("les vrais termes, eux, passent encore à mots entiers", () => {
    expect(motsTechniqueDe("ROS developer for AGV fleets", profilV7)).toEqual(["ros", "agv"]);
    expect(scoreFitRole("ROS developer", "", profilV7)).toBe(profilV7.pointsRole.technique);
  });

  it("le vocabulaire d'origine garde sa comparaison : « robotic » trouve toujours « robotics »", () => {
    expect(scoreFitRole("Robotics engineer", "", PROFIL_DEFAUT)).toBe(PROFIL_DEFAUT.pointsRole.technique);
  });
});

describe("la fiche règle la note, à mots entiers", () => {
  const avecFiche = (lignes: CompetenceProuvee[]): Profil =>
    ProfilSchema.parse({
      ...structuredClone(PROFIL_DEFAUT),
      faits: { ...PROFIL_DEFAUT.faits, competences: lignes },
    });
  const ligne = (id: string, niveau: CompetenceProuvee["niveau"]): CompetenceProuvee => ({
    id,
    niveau,
    phrase: "une phrase de preuve",
    poste: "un poste",
  });

  it("une compétence prouvée en pratique rend technique une offre qui la demande", () => {
    const p = avecFiche([ligne("ros", "pratique")]);
    expect(scoreFitRole("Integrator", "Robot Operating System (ROS) experience", p)).toBe(p.pointsRole.technique);
    expect(scoreFitRole("Integrator", "Robot Operating System (ROS) experience", PROFIL_DEFAUT)).toBe(
      PROFIL_DEFAUT.pointsRole.horsSujet,
    );
  });

  it("la même compétence en « notions », ou une compétence de fiche seule, ne change rien", () => {
    const notions = avecFiche([ligne("ros", "notions")]);
    const python = avecFiche([ligne("python", "maitrise")]);
    const offre = "Integrator";
    const desc = "ROS and Python scripting";
    expect(scoreFitRole(offre, desc, notions)).toBe(PROFIL_DEFAUT.pointsRole.horsSujet);
    expect(scoreFitRole(offre, desc, python)).toBe(PROFIL_DEFAUT.pointsRole.horsSujet);
  });

  it("le laboratoire dentaire ne remonte pas non plus avec « ros » prouvé", () => {
    const p = avecFiche([ligne("ros", "maitrise")]);
    expect(scoreFitRole("Dental prosthesis maker", "", p)).toBe(p.pointsRole.horsSujet);
  });
});

describe("non-régression sur le seed", () => {
  it("le profil par défaut note le rôle de chacune des offres comme avant (comparaison par sous-chaîne)", () => {
    const ancien = (titre: string, description: string) => {
      const t = normaliserTitre(`${titre} ${description}`);
      const coord = PROFIL_DEFAUT.motsCoordination.some((m) => t.includes(normaliserTitre(m)));
      const tech = PROFIL_DEFAUT.motsTechnique.some((m) => t.includes(normaliserTitre(m)));
      const technicien = /\btechnicien/.test(t) && !coord;
      const p = PROFIL_DEFAUT.pointsRole;
      if (coord && tech) return p.combinaison;
      if (coord) return p.coordination;
      if (tech && !technicien) return p.technique;
      if (technicien) return p.technicien;
      return p.horsSujet;
    };
    expect(SEED.length).toBeGreaterThan(0);
    for (const o of SEED) {
      expect(scoreFitRole(o.poste, o.notes, PROFIL_DEFAUT), `${o.id}`).toBe(ancien(o.poste, o.notes));
    }
  });
});

describe("ce que l'écran dit des refus", () => {
  it("rien quand tout est prouvé, une phrase au singulier et au pluriel sinon", () => {
    expect(resumeDesRefus([])).toBe("");
    expect(resumeDesRefus([{ id: "scada", raison: "x" }])).toBe(
      " 1 compétence proposée par le modèle a été écartée faute de preuve dans le CV.",
    );
    expect(
      resumeDesRefus([
        { id: "scada", raison: "x" },
        { id: "ros", raison: "y" },
      ]),
    ).toBe(" 2 compétences proposées par le modèle ont été écartées faute de preuve dans le CV.");
  });
});
