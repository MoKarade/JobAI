// tests/cvProposition.test.ts — ce qu'un CV a le droit de changer, et ce qu'il ne peut pas.
//
// C'est la mécanique la plus délicate du chantier : elle décide de ce qui bouge dans l'app
// quand Marc téléverse un document. Elle est PURE, donc éprouvable sans base ni modèle —
// et c'est précisément pour ça qu'elle a été écrite pure.
//
// Trois invariants s'y jouent, et chacun protège d'une manière différente de perdre du
// travail :
//
//   1. un écart NON coché ne s'applique pas — sinon la validation est un accusé de réception ;
//   2. une liste vide proposée n'EFFACE rien — le modèle qui n'a rien trouvé ne prouve pas
//      que Marc n'a rien ;
//   3. une note MANUELLE survit à toute re-notation — c'est la règle du barème, et un
//      recalcul de masse est l'occasion rêvée de la perdre sans le voir.

import { describe, it, expect } from "vitest";
import { PROFIL_DEFAUT, ProfilSchema, type Profil } from "@/lib/profil";
import {
  calculerEcarts,
  appliquerEcarts,
  profilCourantOuDefaut,
} from "@/lib/cv/proposition";
import { planifierRenotation, resumerPlan } from "@/lib/cv/renotation";
import type { ReponseExtraction } from "@/lib/cv/extraction";
import type { Offre } from "@/lib/types";

const EXTRACTION_VIDE: ReponseExtraction = {
  anneesExperience: null,
  anneesExperienceProvenance: "",
  langues: [],
  diplomes: [],
  outils: [],
  titresOccupes: [],
  recherchesSuggerees: [],
  forces: [],
  manques: [],
};

function extraction(patch: Partial<ReponseExtraction>): ReponseExtraction {
  return { ...EXTRACTION_VIDE, ...patch };
}

describe("les écarts proposés", () => {
  it("un CV qui n'apprend rien ne propose rien", () => {
    // Un écran de quarante lignes dont trente-huit identiques se coche « tout » sans être
    // lu : ce serait la validation en apparence et l'acceptation aveugle en pratique.
    expect(calculerEcarts(PROFIL_DEFAUT, EXTRACTION_VIDE)).toEqual([]);
  });

  it("les années d'expérience arrivent AVEC leur provenance", () => {
    const e = calculerEcarts(
      PROFIL_DEFAUT,
      extraction({
        anneesExperience: 5,
        anneesExperienceProvenance: "§Expérience, 2021-2026",
      }),
    );
    const annees = e.find((x) => x.cle === "faits.anneesExperience");
    expect(annees).toBeDefined();
    expect(annees?.nature).toBe("fait");
    expect(annees?.avant).toBe("non établi");
    expect(annees?.apres).toBe("5");
    expect(annees?.provenance).toBe("§Expérience, 2021-2026");
  });

  it("un fait SANS provenance reste distinguable d'un fait vérifié", () => {
    // La provenance vide est le signal « le modèle a supposé ». L'écran s'en sert pour
    // le dire ; l'effacer ici rendrait les deux cas indiscernables.
    const e = calculerEcarts(PROFIL_DEFAUT, extraction({ anneesExperience: 5 }));
    expect(e.find((x) => x.cle === "faits.anneesExperience")?.provenance).toBe("");
  });

  it("le barème de séniorité est une CONSÉQUENCE, pas un fait du CV", () => {
    const e = calculerEcarts(PROFIL_DEFAUT, extraction({ anneesExperience: 5 }));
    const bareme = e.find((x) => x.cle === "paliersSeniorite");
    expect(bareme?.nature).toBe("consequence");
    // Marc doit pouvoir retenir « j'ai 5 ans » sans retenir « donc le barème glisse ».
    expect(e.find((x) => x.cle === "faits.anneesExperience")?.nature).toBe("fait");
  });

  it("une liste vide proposée n'EFFACE pas une liste existante", () => {
    const avecLangues = ProfilSchema.parse({
      ...PROFIL_DEFAUT,
      faits: { ...PROFIL_DEFAUT.faits, langues: ["Français", "Anglais"] },
    });
    // Le modèle qui n'a rien trouvé ne prouve pas que Marc n'a rien : effacer sur une
    // absence, c'est décider à sa place sur du vide.
    const e = calculerEcarts(avecLangues, EXTRACTION_VIDE);
    expect(e.find((x) => x.cle === "faits.langues")).toBeUndefined();
  });

  it("les termes de veille s'AJOUTENT, ils ne remplacent pas", () => {
    const e = calculerEcarts(
      PROFIL_DEFAUT,
      extraction({ recherchesSuggerees: ["ingénieur de fabrication"] }),
    );
    const rech = e.find((x) => x.cle === "recherches");
    expect(rech?.valeur).toEqual([...PROFIL_DEFAUT.recherches, "ingénieur de fabrication"]);
    // Une recherche qui marche depuis des semaines ne disparaît pas parce qu'un CV
    // ne l'évoque pas.
    for (const r of PROFIL_DEFAUT.recherches) {
      expect(rech?.valeur as string[]).toContain(r);
    }
  });

  it("un terme de veille déjà présent ne crée pas d'écart", () => {
    const e = calculerEcarts(
      PROFIL_DEFAUT,
      // Casse différente : c'est le même terme.
      extraction({ recherchesSuggerees: ["Chargé de projet"] }),
    );
    expect(e.find((x) => x.cle === "recherches")).toBeUndefined();
  });

  it("le SWOT s'ENRICHIT du CV, il ne se régénère pas", () => {
    const e = calculerEcarts(
      PROFIL_DEFAUT,
      extraction({
        forces: ["Mise en service d'automates Siemens sur trois sites"],
        manques: ["Aucune certification en santé-sécurité"],
      }),
    );
    const swot = e.find((x) => x.cle === "swot")?.valeur as typeof PROFIL_DEFAUT.swot;
    const forces = swot.find((q) => q.cle === "forces")!;
    const faiblesses = swot.find((q) => q.cle === "faiblesses")!;

    // ⚠️ CE QUI A ÉTÉ PENSÉ SURVIT. « Mobilité limitée avant la résidence permanente
    // (permis lié à l'employeur actuel) » ne sort d'aucun CV : si un téléversement pouvait
    // l'effacer, le SWOT perdrait exactement ce qui fait sa valeur.
    for (const q of PROFIL_DEFAUT.swot) {
      const apres = swot.find((x) => x.cle === q.cle)!;
      for (const p of q.points) expect(apres.points).toContain(p);
    }
    // Et ce qui vient du document est MARQUÉ : dans six mois, on doit pouvoir distinguer
    // un constat pensé d'un constat lu.
    expect(forces.points.some((p) => p.includes("Siemens") && p.endsWith("(CV)"))).toBe(true);
    expect(faiblesses.points.some((p) => p.endsWith("(CV)"))).toBe(true);
    // Les quadrants que le CV ne peut pas établir ne bougent pas.
    expect(swot.find((q) => q.cle === "opportunites")?.points).toEqual(
      PROFIL_DEFAUT.swot.find((q) => q.cle === "opportunites")?.points,
    );
  });

  it("un CV sans force ni manque ne propose aucun écart de SWOT", () => {
    expect(calculerEcarts(PROFIL_DEFAUT, EXTRACTION_VIDE).find((x) => x.cle === "swot"))
      .toBeUndefined();
  });

  it("les outils du CV enrichissent le vocabulaire technique, sans le remplacer", () => {
    const e = calculerEcarts(PROFIL_DEFAUT, extraction({ outils: ["TIA Portal", "SolidWorks"] }));
    const mots = e.find((x) => x.cle === "motsTechnique");
    expect(mots?.valeur).toContain("tia portal");
    for (const m of PROFIL_DEFAUT.motsTechnique) expect(mots?.valeur as string[]).toContain(m);
  });
});

describe("l'application des écarts", () => {
  const ext = extraction({
    anneesExperience: 5,
    anneesExperienceProvenance: "§Expérience",
    langues: ["Français", "Anglais"],
    recherchesSuggerees: ["ingénieur de fabrication"],
  });
  const ecarts = calculerEcarts(PROFIL_DEFAUT, ext);

  it("un écart NON coché ne s'applique pas", () => {
    // ⚠️ L'INVARIANT CENTRAL DU CHOIX DE MARC (« rien sans ma validation »). S'il tombe,
    // l'écran de revue devient un accusé de réception : on affiche, et on applique quand même.
    const rien = appliquerEcarts(PROFIL_DEFAUT, ecarts, [], "2026-08-13");
    expect(rien.faits.anneesExperience).toBeNull();
    expect(rien.faits.langues).toEqual([]);
    expect(rien.recherches).toEqual(PROFIL_DEFAUT.recherches);
  });

  it("seuls les écarts cochés s'appliquent", () => {
    const p = appliquerEcarts(PROFIL_DEFAUT, ecarts, ["faits.anneesExperience"], "2026-08-13");
    expect(p.faits.anneesExperience).toBe(5);
    // La conséquence n'était pas cochée : le barème ne bouge pas.
    expect(p.paliersSeniorite).toEqual(PROFIL_DEFAUT.paliersSeniorite);
    expect(p.faits.langues).toEqual([]);
  });

  it("on peut retenir le FAIT sans retenir sa CONSÉQUENCE, et l'inverse", () => {
    const faitSeul = appliquerEcarts(
      PROFIL_DEFAUT,
      ecarts,
      ["faits.anneesExperience"],
      "2026-08-13",
    );
    expect(faitSeul.faits.anneesExperience).toBe(5);
    expect(faitSeul.paliersSeniorite).toEqual(PROFIL_DEFAUT.paliersSeniorite);

    const lesDeux = appliquerEcarts(
      PROFIL_DEFAUT,
      ecarts,
      ["faits.anneesExperience", "paliersSeniorite"],
      "2026-08-13",
    );
    expect(lesDeux.paliersSeniorite).not.toEqual(PROFIL_DEFAUT.paliersSeniorite);
  });

  it("la version est incrémentée, et l'origine devient « cv »", () => {
    const p = appliquerEcarts(PROFIL_DEFAUT, ecarts, ["faits.anneesExperience"], "2026-08-13");
    expect(p.version).toBe(PROFIL_DEFAUT.version + 1);
    expect(p.origine).toBe("cv");
    expect(p.etabliLe).toBe("2026-08-13");
  });

  it("même sans aucun écart coché, la version avance", () => {
    // Une validation est un ÉVÉNEMENT : elle date le constat, même quand elle ne retient
    // rien. Sans ça, deux profils différents pourraient porter le même numéro et une
    // note deviendrait inexplicable.
    expect(appliquerEcarts(PROFIL_DEFAUT, ecarts, [], "2026-08-13").version).toBe(
      PROFIL_DEFAUT.version + 1,
    );
  });

  it("le profil produit reste valide au schéma", () => {
    const p = appliquerEcarts(PROFIL_DEFAUT, ecarts, ecarts.map((e) => e.cle), "2026-08-13");
    expect(() => ProfilSchema.parse(p)).not.toThrow();
  });
});

describe("le profil enregistré", () => {
  it("absent : on retombe sur celui du code", () => {
    expect(profilCourantOuDefaut(null)).toEqual(PROFIL_DEFAUT);
  });

  it("valide : on le rend", () => {
    const p: Profil = { ...PROFIL_DEFAUT, version: 4, origine: "cv" };
    expect(profilCourantOuDefaut(JSON.stringify(p)).version).toBe(4);
  });

  it("illisible : on LÈVE, on ne retombe pas en silence sur le défaut", () => {
    // Retomber sur le défaut ferait changer toutes les notes sans que rien ne l'explique :
    // l'app aurait l'air de marcher, avec le mauvais barème.
    expect(() => profilCourantOuDefaut('{"version":"pas un nombre"}')).toThrow(/illisible/);
  });
});

function offre(patch: Partial<Offre>): Offre {
  return {
    id: "x",
    source: "user",
    dateReperage: "2026-08-01",
    entreprise: "Entreprise",
    poste: "Coordonnateur automatisation",
    lien: "",
    km: 10,
    ville: "Québec",
    salaireAffiche: null,
    priorite: null,
    statut: "Identifiee",
    dateEnvoi: null,
    // ⚠️ 85 N'EST PAS UN NOMBRE AU HASARD : c'est ce que `PROFIL_DEFAUT` calcule pour cette
    // offre (« Coordonnateur automatisation » à 10 km → 40+18+11+9+10 = 88, écrêté à 85).
    // Une note de départ inventée rendrait le cas « la note ne bouge pas » impossible à
    // écrire — et c'est justement ce cas qui prouve qu'on ne réécrit pas tout à l'aveugle.
    score: 85,
    scoreSource: "calcule",
    raisons: [],
    notes: null,
    userNote: null,
    histo: false,
    perimeeLe: null,
    ...patch,
  } as Offre;
}

describe("la re-notation", () => {
  const large = ProfilSchema.parse({
    ...PROFIL_DEFAUT,
    version: 2,
    paliersDistanceKm: [{ max: 5, points: 20 }],
  });

  it("UNE NOTE MANUELLE N'EST JAMAIS RECALCULÉE", () => {
    // ⚠️ LE TEST QUI COMPTE LE PLUS DE CE FICHIER. Marc a demandé « oui, tout de suite » ;
    // cette règle-là n'était pas dans la question, parce qu'elle n'est pas négociable.
    // Un recalcul de masse est l'occasion exacte de perdre une note posée à la main après
    // lecture d'une annonce : cinquante lignes bougent, personne ne relit.
    const offres = [
      offre({ id: "manuelle", score: 95, scoreSource: "manuel" }),
      offre({ id: "calculee", score: 70, scoreSource: "calcule" }),
    ];
    const plan = planifierRenotation(offres, large);
    expect(plan.changements.map((c) => c.id)).not.toContain("manuelle");
    expect(plan.manuellesPreservees).toBe(1);
  });

  it("les offres dont la note ne bouge pas sont comptées, pas listées", () => {
    const plan = planifierRenotation([offre({ id: "a" })], PROFIL_DEFAUT);
    expect(plan.changements).toEqual([]);
    expect(plan.inchangees).toBe(1);
  });

  it("le plan est trié du plus gros mouvement au plus petit", () => {
    const offres = [
      offre({ id: "petit", km: 4, score: 78 }),
      offre({ id: "gros", km: 30, score: 78 }),
    ];
    const plan = planifierRenotation(offres, large);
    const deltas = plan.changements.map((c) => Math.abs(c.delta));
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
  });

  it("le total se réconcilie : tout est changé, inchangé ou préservé", () => {
    const offres = [
      offre({ id: "a", km: 30 }),
      offre({ id: "b", scoreSource: "manuel" }),
      offre({ id: "c" }),
    ];
    const plan = planifierRenotation(offres, large);
    expect(plan.changements.length + plan.inchangees + plan.manuellesPreservees).toBe(
      offres.length,
    );
  });

  it("le résumé dit ce qui a été préservé", () => {
    const plan = planifierRenotation([offre({ scoreSource: "manuel" })], large);
    expect(resumerPlan(plan)).toMatch(/manuelle préservée/);
  });
});
