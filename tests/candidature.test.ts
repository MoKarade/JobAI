// tests/candidature.test.ts — le brouillon de CV et de lettre (JobAI#108).
//
// CE QU'ON ÉPROUVE, ET POURQUOI : le modèle ne doit pas pouvoir fabriquer un employeur, une
// date, une compétence ou un chiffre sans que ça se VOIE. On compare donc ce que le code
// RENDU contient (le brouillon assemblé), jamais seulement que la fonction ne lève pas.
// Toutes les données sont FICTIVES : le dépôt est public (`tests/piiGuard.test.ts`).

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OUTIL_BROUILLON,
  PLAFONDS_BROUILLON,
  ReponseBrouillonSchema,
  assemblerBrouillon,
  bornerBrouillon,
  chiffresNonSources,
  cvEnTexte,
  lettreEnTexte,
  offreEnTexte,
  profilEnTexte,
  profilSuffisant,
  type ReponseBrouillon,
} from "@/lib/candidature";
import { FaitsSchema, type Faits } from "@/lib/profil";
import type { Offre } from "@/lib/types";

const FAITS: Faits = FaitsSchema.parse({
  anneesExperience: 6,
  langues: ["Français", "Anglais"],
  diplomes: ["DEC en électronique industrielle"],
  outils: ["TIA Portal", "SolidWorks"],
  titresOccupes: ["Coordonnateur technique"],
  parcours: [
    {
      titre: "Coordonnateur technique",
      employeur: "Usine Exemple",
      debut: "Avril 2023",
      fin: "Présent",
      faits: ["Planifie les arrêts de ligne", "Encadre une équipe de 8 techniciens"],
    },
    {
      titre: "Technicien",
      employeur: "Atelier Modèle",
      debut: "2019",
      fin: "2023",
      faits: ["Dépanne les automates"],
    },
  ],
});

const OFFRE = {
  id: "exemple-1",
  source: "user",
  dateReperage: "2026-10-01",
  entreprise: "Société Fictive",
  poste: "Superviseur de maintenance",
  salaireAffiche: "28 $/h",
  priorite: "Moyenne",
  statut: "Identifiee",
  dateEnvoi: "",
  score: 70,
  scoreSource: "manuel",
  raisons: [{ ton: "atout", texte: "Poste de supervision" }],
  notes: "Quart de jour",
  userNote: "NOTE PRIVÉE DE MARC",
  histo: false,
  perimeeLe: null,
} as unknown as Offre;

const REPONSE: ReponseBrouillon = {
  accroche: "Coordonnateur technique avec 6 ans d'expérience en maintenance.",
  competences: ["tia portal", "SolidWorks"],
  postes: [
    { indice: 0, puces: ["Planifie les arrêts de ligne", "Encadre 8 techniciens"] },
    { indice: 1, puces: ["Dépanne les automates"] },
  ],
  lettre: {
    objet: "Candidature au poste de superviseur de maintenance",
    paragraphes: ["Premier paragraphe.", "Second paragraphe."],
    formule: "Cordialement,",
  },
};

describe("assemblerBrouillon — le modèle ne choisit ni employeur ni date", () => {
  it("recopie titre, employeur et dates depuis le PROFIL, pas depuis le modèle", () => {
    const b = assemblerBrouillon(REPONSE, FAITS, OFFRE);
    expect(b.cv.postes[0]).toMatchObject({
      titre: "Coordonnateur technique",
      employeur: "Usine Exemple",
      debut: "Avril 2023",
      fin: "Présent",
    });
    expect(b.cv.langues).toEqual(["Français", "Anglais"]);
    expect(b.cv.diplomes).toEqual(["DEC en électronique industrielle"]);
    expect(b.avertissements).toEqual([]);
  });

  it("⚠️ un numéro de poste inexistant est ÉCARTÉ ET DIT", () => {
    const b = assemblerBrouillon(
      { ...REPONSE, postes: [{ indice: 7, puces: ["Invention"] }, { indice: 1, puces: ["Vrai"] }] },
      FAITS,
      OFFRE,
    );
    expect(b.cv.postes.map((p) => p.employeur)).toEqual(["Atelier Modèle"]);
    expect(cvEnTexte(b)).not.toContain("Invention");
    expect(b.avertissements.join(" ")).toContain("n° 7");
  });

  it("un poste cité deux fois n'est gardé qu'une fois, et c'est dit", () => {
    const b = assemblerBrouillon(
      { ...REPONSE, postes: [{ indice: 0, puces: ["A"] }, { indice: 0, puces: ["B"] }] },
      FAITS,
      OFFRE,
    );
    expect(b.cv.postes).toHaveLength(1);
    expect(b.cv.postes[0]!.puces).toEqual(["A"]);
    expect(b.avertissements.join(" ")).toContain("deux fois");
  });

  it("⚠️ une compétence absente du profil est écartée et dite; la casse du profil est rétablie", () => {
    const b = assemblerBrouillon(
      { ...REPONSE, competences: ["tia portal", "Kubernetes", "TIA Portal"] },
      FAITS,
      OFFRE,
    );
    expect(b.cv.competences).toEqual(["TIA Portal"]);
    expect(b.avertissements.join(" ")).toContain("Kubernetes");
  });

  it("aucun poste retenu : le CV le DIT au lieu d'avoir l'air complet", () => {
    const b = assemblerBrouillon({ ...REPONSE, postes: [] }, FAITS, OFFRE);
    expect(b.cv.postes).toEqual([]);
    expect(b.avertissements.join(" ")).toContain("Aucun poste");
  });

  it("les listes coupées par le code sont mentionnées", () => {
    const b = assemblerBrouillon(REPONSE, FAITS, OFFRE, ["competences 20->15"]);
    expect(b.avertissements.join(" ")).toContain("competences 20->15");
  });
});

describe("chiffresNonSources — un nombre ne se reformule pas", () => {
  it("laisse passer les nombres du profil et de l'offre", () => {
    const b = assemblerBrouillon(REPONSE, FAITS, OFFRE);
    // 6 (années), 8 (équipe), 2023 : tous dans le profil.
    expect(b.chiffresNonSources).toEqual([]);
  });

  it("⚠️ désigne le pourcentage inventé", () => {
    const b = assemblerBrouillon(
      { ...REPONSE, postes: [{ indice: 0, puces: ["Réduit les arrêts de 30 %"] }] },
      FAITS,
      OFFRE,
    );
    expect(b.chiffresNonSources).toContain("30");
  });

  it("détecte aussi un chiffre inventé dans la lettre", () => {
    const b = assemblerBrouillon(
      { ...REPONSE, lettre: { ...REPONSE.lettre, paragraphes: ["J'ai géré un budget de 450 000 $."] } },
      FAITS,
      OFFRE,
    );
    expect(b.chiffresNonSources).toEqual(expect.arrayContaining(["450", "000"]));
  });

  it("virgule et point décimal se valent", () => {
    expect(chiffresNonSources("taux de 2,5", "taux de 2.5")).toEqual([]);
    expect(chiffresNonSources("taux de 2,5", "taux de 3")).toEqual(["2,5"]);
  });
});

describe("bornerBrouillon — une liste de trop ne perd pas un appel facturé", () => {
  it("coupe les listes de premier niveau ET les puces imbriquées, et le dit", () => {
    const trop = Array.from({ length: 20 }, (_, i) => `x${i}`);
    const { valeur, tronquees } = bornerBrouillon({
      ...REPONSE,
      competences: trop,
      postes: [{ indice: 0, puces: trop }],
      lettre: { ...REPONSE.lettre, paragraphes: trop },
    });
    const v = valeur as ReponseBrouillon;
    expect(v.competences).toHaveLength(PLAFONDS_BROUILLON.competences);
    expect(v.postes[0]!.puces).toHaveLength(PLAFONDS_BROUILLON.puces);
    expect(v.lettre.paragraphes).toHaveLength(PLAFONDS_BROUILLON.paragraphes);
    expect(tronquees).toHaveLength(3);
    expect(ReponseBrouillonSchema.safeParse(valeur).success).toBe(true);
  });

  it("laisse passer tel quel ce qui n'est pas un objet (le schéma refusera)", () => {
    expect(bornerBrouillon("n'importe quoi").valeur).toBe("n'importe quoi");
    expect(ReponseBrouillonSchema.safeParse("n'importe quoi").success).toBe(false);
  });

  it("le schéma d'outil annonce les MÊMES plafonds que Zod", () => {
    const p = OUTIL_BROUILLON.input_schema.properties;
    expect(p.competences.maxItems).toBe(PLAFONDS_BROUILLON.competences);
    expect(p.postes.maxItems).toBe(PLAFONDS_BROUILLON.postes);
    expect(p.postes.items.properties.puces.maxItems).toBe(PLAFONDS_BROUILLON.puces);
    expect(p.lettre.properties.paragraphes.maxItems).toBe(PLAFONDS_BROUILLON.paragraphes);
  });
});

describe("ce qui part au modèle", () => {
  it("le profil numérote les postes, du plus récent au plus ancien", () => {
    const t = profilEnTexte(FAITS);
    expect(t).toContain("[0] Coordonnateur technique — Usine Exemple (Avril 2023 – Présent)");
    expect(t).toContain("[1] Technicien");
  });

  it("⚠️ la note privée de Marc ne part JAMAIS avec l'offre", () => {
    const t = offreEnTexte(OFFRE);
    expect(t).toContain("Superviseur de maintenance");
    expect(t).toContain("Quart de jour");
    expect(t).not.toContain("NOTE PRIVÉE");
  });

  it("un profil sans parcours est insuffisant : on ne paie pas l'appel", () => {
    expect(profilSuffisant(FAITS)).toBe(true);
    expect(profilSuffisant({ ...FAITS, parcours: [] })).toBe(false);
  });
});

describe("textes copiables", () => {
  it("la lettre porte le « Madame, Monsieur » placé par le code, et AUCUNE signature", () => {
    const t = lettreEnTexte(assemblerBrouillon(REPONSE, FAITS, OFFRE));
    expect(t).toContain("Objet : Candidature au poste");
    expect(t).toContain("Madame, Monsieur,");
    expect(t.trimEnd().endsWith("Cordialement,")).toBe(true);
  });

  it("le CV groupe compétences, langues, formation et expérience", () => {
    const t = cvEnTexte(assemblerBrouillon(REPONSE, FAITS, OFFRE));
    expect(t).toContain("Compétences : TIA Portal, SolidWorks");
    expect(t).toContain("Langues : Français, Anglais");
    expect(t).toContain("Formation : DEC en électronique industrielle");
    expect(t).toContain("Atelier Modèle (2019 – 2023)");
    expect(t).toContain("- Dépanne les automates");
  });
});

// ── L'appel lui-même, avec un faux SDK ────────────────────────────────────────────────

let usageRendu: unknown = { input_tokens: 1500, output_tokens: 600 };
let contenuRendu: unknown[] = [];
let arretRendu = "tool_use";
let appels = 0;
let dernierPrompt = "";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (args: { messages: { content: string }[] }) => {
        appels += 1;
        dernierPrompt = args.messages[0]!.content;
        return { stop_reason: arretRendu, content: contenuRendu, usage: usageRendu };
      },
    };
  },
}));

const comptabilise = vi.fn(async (_usage: unknown) => {});
vi.mock("@/lib/coutLlmStore", () => ({
  enregistrerUsageLlm: (usage: unknown) => comptabilise(usage),
}));

const { redigerCandidature } = await import("@/lib/candidatureLlm");

describe("redigerCandidature — la comptabilité vit au site d'appel", () => {
  beforeEach(() => {
    appels = 0;
    dernierPrompt = "";
    arretRendu = "tool_use";
    usageRendu = { input_tokens: 1500, output_tokens: 600 };
    contenuRendu = [{ type: "tool_use", name: "rendre_brouillon", input: REPONSE }];
    comptabilise.mockClear();
    comptabilise.mockImplementation(async () => {});
  });

  it("refuse SANS APPELER quand la clé est absente, et nomme la cause", async () => {
    const r = await redigerCandidature(OFFRE, FAITS, { cle: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain("ANTHROPIC_API_KEY");
    expect(appels).toBe(0);
    expect(comptabilise).not.toHaveBeenCalled();
  });

  it("refuse SANS APPELER un profil sans parcours", async () => {
    const r = await redigerCandidature(OFFRE, { ...FAITS, parcours: [] }, { cle: "k" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain("aucun poste");
    expect(appels).toBe(0);
  });

  it("succès : l'usage est compté, le brouillon porte les faits du profil", async () => {
    const r = await redigerCandidature(OFFRE, FAITS, { cle: "k" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(comptabilise).toHaveBeenCalledTimes(1);
    expect(comptabilise).toHaveBeenCalledWith(usageRendu);
    expect(r.brouillon.cv.postes[0]!.employeur).toBe("Usine Exemple");
    // Profil et offre partent en blocs de DONNÉES; la note privée reste ici.
    expect(dernierPrompt).toContain('<donnees nom="profil">');
    expect(dernierPrompt).toContain('<donnees nom="offre">');
    expect(dernierPrompt).not.toContain("NOTE PRIVÉE");
  });

  it("⚠️ une réponse hors schéma est refusée MAIS l'appel facturé est compté", async () => {
    contenuRendu = [{ type: "tool_use", name: "rendre_brouillon", input: { accroche: 3 } }];
    const r = await redigerCandidature(OFFRE, FAITS, { cle: "k" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain("hors schéma");
    expect(comptabilise).toHaveBeenCalledTimes(1);
  });

  it("pas de bloc d'outil : échec nommé, appel compté", async () => {
    contenuRendu = [{ type: "text", text: "désolé" }];
    arretRendu = "end_turn";
    const r = await redigerCandidature(OFFRE, FAITS, { cle: "k" });
    expect(r.ok).toBe(false);
    expect(comptabilise).toHaveBeenCalledTimes(1);
  });

  it("une réponse coupée (max_tokens) se DIT, elle ne passe pas pour un brouillon", async () => {
    arretRendu = "max_tokens";
    const r = await redigerCandidature(OFFRE, FAITS, { cle: "k" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain("coupé");
  });

  it("⚠️ une comptabilité qui LÈVE ne coûte pas le brouillon", async () => {
    comptabilise.mockImplementation(async () => {
      throw new Error("compteur en panne");
    });
    const r = await redigerCandidature(OFFRE, FAITS, { cle: "k" });
    expect(r.ok).toBe(true);
  });

  it("les coordonnées glissées par le modèle sont retirées de tous les champs", async () => {
    const courriel = ["marc.exemple", "courriel.com"].join("@");
    contenuRendu = [
      {
        type: "tool_use",
        name: "rendre_brouillon",
        input: {
          ...REPONSE,
          accroche: `Écris-moi à ${courriel}`,
          lettre: { ...REPONSE.lettre, paragraphes: [`Contact : ${courriel}`] },
        },
      },
    ];
    const r = await redigerCandidature(OFFRE, FAITS, { cle: "k" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.brouillon)).not.toContain("courriel.com");
  });
});
