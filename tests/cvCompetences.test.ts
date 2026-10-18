// tests/cvCompetences.test.ts — la fiche de compétences à la sortie de l'extraction (JobAI#155).
//
// Le modèle propose, le CODE vérifie : une compétence dont la phrase ne se lit pas dans le CV
// n'entre jamais dans `brut`, ce qui part en base et à l'écran. Même exigence que
// `cvExtraction.test.ts` : on éprouve le champ réellement persisté.

import { describe, it, expect, vi, beforeEach } from "vitest";

const TEL = ["514", "555", "1234"].join("-");

const CV_TEXTE = [
  "Technicien en automatisation, Usine Exemple, Janvier 2021 à Présent.",
  `Programmation d'automates programmables et mise en service de lignes, joignable au ${TEL}.`,
  "Intégration d'un robot industriel avec vision industrielle.",
  "Suivi de projet avec Trello pour l'équipe de l'usine, incluant la planification des arrêts.",
].join("\n");

const REPONSE = {
  parcours: [
    { titre: "Technicien en automatisation", employeur: "Usine Exemple", debut: "Janvier 2021", fin: "Présent" },
  ],
  competences: [
    {
      id: "automates-programmables",
      niveau: "maitrise",
      phrase: `Programmation d'automates programmables et mise en service de lignes, joignable au ${TEL}`,
      poste: "Technicien en automatisation",
    },
    {
      id: "vision-industrielle",
      niveau: "pratique",
      phrase: "Intégration d'un robot industriel avec vision industrielle",
      poste: "Technicien en automatisation",
    },
    // Inventée : le CV ne dit rien de SCADA.
    {
      id: "scada",
      niveau: "maitrise",
      phrase: "Supervision SCADA de toute l'usine pendant trois ans",
      poste: "Technicien en automatisation",
    },
    // Hors vocabulaire.
    {
      id: "hypnose",
      niveau: "maitrise",
      phrase: "Suivi de projet avec Trello pour l'équipe de l'usine",
      poste: "Technicien en automatisation",
    },
  ],
};

let contenu: unknown[] = [{ type: "tool_use", name: "rendre_profil", input: REPONSE }];

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({
        stop_reason: "tool_use",
        content: contenu,
        usage: { input_tokens: 1000, output_tokens: 200 },
      }),
    };
  },
}));
vi.mock("@/lib/coutLlmStore", () => ({ enregistrerUsageLlm: async () => {} }));

const { extraireFaits, OUTIL_EXTRACTION, PLAFONDS } = await import("@/lib/cv/extraction");

describe("l'extraction rend une fiche prouvée", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "cle-de-test");
    contenu = [{ type: "tool_use", name: "rendre_profil", input: REPONSE }];
  });

  it("ne garde que les lignes dont la phrase se lit dans le CV, et DIT les autres", async () => {
    const r = await extraireFaits(CV_TEXTE, { aujourdhui: new Date(Date.UTC(2026, 5, 15)) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.brut.competences.map((c) => c.id)).toEqual(["automates-programmables", "vision-industrielle"]);
    expect(r.competencesRejetees).toEqual([
      { id: "scada", raison: "phrase introuvable dans le CV" },
      { id: "hypnose", raison: "hors vocabulaire" },
    ]);
    expect(r.faits.competences).toEqual(r.brut.competences);
  });

  it("le numéro de téléphone d'une phrase de preuve est retiré avant stockage", async () => {
    const r = await extraireFaits(CV_TEXTE, { aujourdhui: new Date(Date.UTC(2026, 5, 15)) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.brut)).not.toContain(TEL);
    expect(r.brut.competences[0]?.phrase).toContain("[retiré]");
  });

  it("un modèle qui ne rend aucune compétence ne fait pas échouer l'analyse", async () => {
    contenu = [{ type: "tool_use", name: "rendre_profil", input: { parcours: REPONSE.parcours } }];
    const r = await extraireFaits(CV_TEXTE, { aujourdhui: new Date(Date.UTC(2026, 5, 15)) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.brut.competences).toEqual([]);
  });

  it("le schéma d'outil force le vocabulaire fermé et le plafond", () => {
    const props = OUTIL_EXTRACTION.input_schema.properties as unknown as Record<
      string,
      { maxItems?: number; items?: { properties?: { id?: { enum?: string[] } }; required?: string[] } }
    >;
    expect(props.competences?.maxItems).toBe(PLAFONDS.competences);
    expect(props.competences?.items?.properties?.id?.enum).toContain("automates-programmables");
    expect(props.competences?.items?.required).toEqual(["id", "niveau", "phrase", "poste"]);
  });
});
