// tests/actionsCandidature.test.ts — tests de l'action serveur preparerBrouillon.
//
// VÉRIFICATIONS :
// 1. Authentification requise (sans session, refus immédiat sans I/O).
// 2. Bornes de l'identifiant (vide, > 80 caractères, non-chaîne).
// 3. Gestion des erreurs de la base de données (lireOffre qui lève).
// 4. Offre introuvable (lireOffre rend null).
// 5. Profil illisible (profilActif qui lève, sans basculer sur le profil par défaut).
// 6. Échec de rédaction LLM (redigerCandidature rend { ok: false, raison }).
// 7. Cas nominal (succès avec retransmission de l'offre et des faits au rédacteur LLM).

import { describe, it, expect, vi, beforeEach } from "vitest";

let sessionOk = true;
const lireOffreMock = vi.fn();
const profilActifMock = vi.fn();
const redigerCandidatureMock = vi.fn();

vi.mock("../lib/session", () => ({
  exigerSession: async () => {
    if (!sessionOk) throw new Error("Authentification requise.");
  },
}));

vi.mock("../lib/donnees", () => ({
  lireOffre: async (id: string) => lireOffreMock(id),
}));

vi.mock("../lib/cv/depot", () => ({
  profilActif: async () => profilActifMock(),
}));

vi.mock("../lib/candidatureLlm", () => ({
  redigerCandidature: async (offre: unknown, faits: unknown) => redigerCandidatureMock(offre, faits),
}));

const { preparerBrouillon } = await import("../lib/actionsCandidature");

const OFFRE_FICTIVE = {
  id: "offre-fictive-1",
  poste: "Développeur TypeScript",
  entreprise: "Entreprise Exemple",
  raisons: [],
};

const FAITS_FICTIFS = {
  anneesExperience: 5,
  langues: ["Français"],
  diplomes: ["BAC"],
  outils: ["TypeScript"],
  parcours: [
    {
      titre: "Développeur",
      employeur: "Employeur Factice",
      debut: "2020",
      fin: "2023",
      faits: ["Développement d'applications"],
    },
  ],
};

const BROUILLON_FICTIF = {
  cv: {
    accroche: "Développeur passionné",
    competences: ["TypeScript"],
    langues: ["Français"],
    diplomes: ["BAC"],
    postes: [
      {
        titre: "Développeur",
        employeur: "Employeur Factice",
        debut: "2020",
        fin: "2023",
        puces: ["Développement d'applications"],
      },
    ],
  },
  lettre: {
    objet: "Candidature au poste de Développeur",
    paragraphes: ["Madame, Monsieur,", "Voici ma candidature."],
    formule: "Cordialement",
  },
  avertissements: [],
  chiffresNonSources: [],
};

beforeEach(() => {
  sessionOk = true;
  lireOffreMock.mockReset();
  profilActifMock.mockReset();
  redigerCandidatureMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("preparerBrouillon", () => {
  it("sans session (exigerSession lève) : refuse et ne lit pas l'offre", async () => {
    sessionOk = false;
    const res = await preparerBrouillon("offre-fictive-1");
    expect(res).toEqual({ ok: false, erreur: "Authentification requise." });
    expect(lireOffreMock).not.toHaveBeenCalled();
  });

  it.each([
    ["vide", ""],
    ["plus de 80 caractères", "x".repeat(81)],
    ["pas une chaîne (nombre)", 123 as unknown as string],
    ["pas une chaîne (null)", null as unknown as string],
    ["pas une chaîne (undefined)", undefined as unknown as string],
  ])("identifiant invalide (%s) : refuse et ne lit pas l'offre", async (_libelle, id) => {
    const res = await preparerBrouillon(id);
    expect(res).toEqual({ ok: false, erreur: "Offre introuvable." });
    expect(lireOffreMock).not.toHaveBeenCalled();
  });

  it("lireOffre lève : signale une erreur de base de données", async () => {
    lireOffreMock.mockRejectedValueOnce(new Error("Erreur base de données"));
    const res = await preparerBrouillon("offre-fictive-1");
    expect(res).toEqual({ ok: false, erreur: "La base n'a pas répondu. Voir les journaux." });
    expect(lireOffreMock).toHaveBeenCalledWith("offre-fictive-1");
  });

  it("lireOffre rend null : retourne Offre introuvable", async () => {
    lireOffreMock.mockResolvedValueOnce(null);
    const res = await preparerBrouillon("offre-fictive-1");
    expect(res).toEqual({ ok: false, erreur: "Offre introuvable." });
    expect(lireOffreMock).toHaveBeenCalledWith("offre-fictive-1");
  });

  it("profilActif lève : signale que le profil est illisible et n'appelle pas redigerCandidature", async () => {
    lireOffreMock.mockResolvedValueOnce(OFFRE_FICTIVE);
    profilActifMock.mockRejectedValueOnce(new Error("Profil illisible"));

    const res = await preparerBrouillon("offre-fictive-1");
    expect(res).toEqual({ ok: false, erreur: "Le profil n'a pas pu être lu. Voir les journaux." });
    expect(lireOffreMock).toHaveBeenCalledWith("offre-fictive-1");
    expect(profilActifMock).toHaveBeenCalled();
    expect(redigerCandidatureMock).not.toHaveBeenCalled();
  });

  it("redigerCandidature rend { ok: false, raison } : transmet la raison comme erreur", async () => {
    lireOffreMock.mockResolvedValueOnce(OFFRE_FICTIVE);
    profilActifMock.mockResolvedValueOnce({ faits: FAITS_FICTIFS });
    redigerCandidatureMock.mockResolvedValueOnce({
      ok: false,
      raison: "ANTHROPIC_API_KEY absente : le brouillon est désactivé.",
    });

    const res = await preparerBrouillon("offre-fictive-1");
    expect(res).toEqual({
      ok: false,
      erreur: "ANTHROPIC_API_KEY absente : le brouillon est désactivé.",
    });
    expect(redigerCandidatureMock).toHaveBeenCalledWith(OFFRE_FICTIVE, FAITS_FICTIFS);
  });

  it("cas nominal : retourne ok: true avec le brouillon issu de redigerCandidature", async () => {
    lireOffreMock.mockResolvedValueOnce(OFFRE_FICTIVE);
    profilActifMock.mockResolvedValueOnce({ faits: FAITS_FICTIFS });
    redigerCandidatureMock.mockResolvedValueOnce({
      ok: true,
      brouillon: BROUILLON_FICTIF,
    });

    const res = await preparerBrouillon("offre-fictive-1");
    expect(res).toEqual({
      ok: true,
      brouillon: BROUILLON_FICTIF,
    });
    expect(redigerCandidatureMock).toHaveBeenCalledWith(OFFRE_FICTIVE, FAITS_FICTIFS);
  });
});
