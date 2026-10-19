// tests/cvExtraction.test.ts — ce que l'extraction RETOURNE ne porte pas de coordonnées.
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UN VRAI TROU, TROUVÉ EN REVUE.
//
// La première version calculait bien un objet nettoyé (`faits`) — et ne s'en servait pas.
// Ce qui partait en base était `brut`, composé par `{ ...reponseDuModele, forces: netto(…),
// … }` : un étalement de la réponse BRUTE avec trois champs seulement ré-écrits par-dessus.
// `langues`, `diplomes`, `outils`, `titresOccupes` et la provenance traversaient donc
// intacts, jusqu'au profil, jusqu'à l'écran.
//
// Le scénario n'a rien d'exotique : dans un CV dont les coordonnées sont en colonne
// latérale, l'extraction PDF les aplatit juste à côté d'un intitulé de poste. Et l'app
// PROMET l'inverse — à Marc en toutes lettres sur l'écran de dépôt, et au futur lecteur du
// code dans l'en-tête de `lib/profil.ts` (« PAS DE DONNÉES PERSONNELLES ICI… circule dans
// les écrans, les exports et les journaux sans précaution particulière »). Une promesse
// pareille se vérifie, sinon elle fabrique la fuite suivante.
//
// ON ÉPROUVE LE CHAMP RÉELLEMENT PERSISTÉ (`brut`), jamais le champ nettoyé qu'on espérait
// voir utilisé : c'est très exactement la confusion qui avait laissé passer le trou.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ⚠️ LES COORDONNÉES D'ÉPREUVE SONT ASSEMBLÉES À L'EXÉCUTION, jamais écrites en toutes
// lettres. `tests/piiGuard.test.ts` scanne les fichiers VERSIONNÉS et cherche des FORMES :
// il ne peut pas distinguer un faux numéro de test d'un vrai, et il ne doit pas essayer.
// Écrites littéralement, ces fixtures faisaient échouer le garde — c'est lui qui a raison,
// donc c'est la fixture qui s'adapte. Assemblées ainsi, aucune ligne de source ne porte de
// motif complet, et les valeurs sont bel et bien complètes à l'exécution : le test éprouve
// donc l'expurgeur sur du réel, sans polluer le dépôt.
const TEL_A = ["514", "555", "1234"].join("-");
const TEL_B = ["418", "555", "9876"].join(" ");
const COURRIEL = ["marc.exemple", "courriel.com"].join("@");
const ADRESSE_A = `123 ${"rue des Érables"}`;
const ADRESSE_B = `456 ${"boulevard Laurier"}`;

/** La réponse du modèle, telle qu'un CV mal aplati la produirait. */
const REPONSE_AVEC_COORDONNEES = {
  // Le modèle écrit un nombre ET une provenance : l'un comme l'autre sont IGNORÉS (JobAI#154),
  // le code compte à partir des dates du parcours ci-dessous.
  anneesExperience: 59,
  anneesExperienceProvenance: `Section Expérience, 2021-2026, ${COURRIEL}`,
  parcours: [
    {
      titre: `Technicien, ${COURRIEL}`,
      employeur: "Usine ABC",
      debut: "Janvier 2021",
      fin: "Présent",
      faits: ["Mise en service de lignes"],
    },
  ],
  langues: [`Français, ${TEL_A}`, "Anglais"],
  diplomes: [`Master en robotique, ${ADRESSE_A}`],
  outils: ["TIA Portal", `SolidWorks (contact : ${TEL_B})`],
  titresOccupes: [`Coordonnateur technique, Usine ABC, ${ADRESSE_B}`],
  recherchesSuggerees: ["coordonnateur automatisation"],
  forces: [`Encadrement d'équipe, joignable au ${TEL_A}`],
  manques: ["Aucune certification en santé-sécurité"],
};

/** Ce que le faux SDK rend. Modifiable par cas de test. */
let usageRendu: unknown = { input_tokens: 1000, output_tokens: 200 };
let contenuRendu: unknown[] = [
  { type: "tool_use", name: "rendre_profil", input: REPONSE_AVEC_COORDONNEES },
];

/** La dernière requête envoyée au faux SDK : on éprouve ce qu'on demande au modèle, pas seulement ce qu'il rend. */
let requete: Record<string, unknown> = {};

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (args: Record<string, unknown>) => {
        requete = args;
        return {
        stop_reason: "tool_use",
        content: contenuRendu,
        usage: usageRendu,
        };
      },
    };
  },
}));

/**
 * La comptabilité est mockée : `extraireFaits` l'appelle par DÉFAUT (c'est le point — elle
 * ne doit pas pouvoir être oubliée par un appelant), et l'écrivain réel touche la base.
 */
const comptabilise = vi.fn(async (_usage: unknown, _modele: string) => {});
vi.mock("@/lib/coutLlmStore", () => ({
  enregistrerUsageLlm: (usage: unknown, modele: string) => comptabilise(usage, modele),
}));

const { extraireFaits, expurgerCoordonnees } = await import("@/lib/cv/extraction");

/** Un CV assez long pour passer le plancher de `extraireFaits`. */
const TEXTE_CV = "Coordonnateur de projets techniques. ".repeat(10);

/** « Présent » = juin 2026 dans ces épreuves : janvier 2021 → juin 2026 = 66 mois = 5,5 ans. */
const AUJOURDHUI = new Date(Date.UTC(2026, 5, 15));

describe("expurgerCoordonnees — les formes reconnues", () => {
  it("courriel, téléphone, code postal, adresse municipale", () => {
    expect(expurgerCoordonnees(`écris à ${COURRIEL}`)).not.toContain("courriel.com");
    expect(expurgerCoordonnees(`appelle le ${TEL_A}`)).not.toContain(TEL_A);
    expect(expurgerCoordonnees(`appelle le ${TEL_B}`)).not.toContain(TEL_B);
    expect(expurgerCoordonnees(`${["G1V", "0A6"].join(" ")}, Québec`)).not.toContain("G1V");
    expect(expurgerCoordonnees(ADRESSE_A)).not.toContain("Érables");
  });

  it("laisse le texte professionnel intact", () => {
    const vrai = "Coordonnateur de projets — 5 ans d'expérience en automatisation.";
    expect(expurgerCoordonnees(vrai)).toBe(vrai);
  });
});

describe("ce que l'extraction PERSISTE", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "cle-de-test");
  });

  it("aucune coordonnée ne survit dans AUCUN champ", async () => {
    const r = await extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // ⚠️ ON SÉRIALISE `r.brut` — le champ RÉELLEMENT écrit en base par `enregistrerCv`.
    // Éprouver `r.faits` (l'objet nettoyé) passerait au vert en laissant le trou ouvert :
    // c'est exactement l'erreur d'origine.
    const persiste = JSON.stringify(r.brut);

    expect(persiste).not.toContain(COURRIEL);
    expect(persiste).not.toContain(TEL_A);
    expect(persiste).not.toContain(TEL_B);
    expect(persiste).not.toContain("Érables");
    expect(persiste).not.toContain("Laurier");
  });

  it("mais le contenu PROFESSIONNEL, lui, survit", () => {
    // Un expurgeur qui viderait tout « passerait » le test précédent sans rien valoir.
    return extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI }).then((r) => {
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const persiste = JSON.stringify(r.brut);
      expect(persiste).toContain("TIA Portal");
      expect(persiste).toContain("Anglais");
      expect(persiste).toContain("Coordonnateur technique");
      expect(persiste).toContain("Master en robotique");
      // Le nombre du CALCUL (66 mois), pas les 59 que le modèle a écrits.
      expect(r.brut.anneesExperience).toBe(5.5);
      expect(r.faits.anneesExperience).toBe(5.5);
    });
  });

  it("la provenance est expurgée elle aussi", async () => {
    const r = await extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI });
    if (!r.ok) throw new Error("extraction attendue en succès");
    // Elle s'affiche à l'écran de revue sous chaque écart : elle circule autant que le reste.
    expect(r.provenances.anneesExperience).not.toContain(COURRIEL);
    // Et c'est le détail du CALCUL, pas la phrase du modèle.
    expect(r.provenances.anneesExperience).toContain("janv. 2021");
    expect(r.provenances.anneesExperience).toContain("66 mois");
    expect(r.provenances.anneesExperience).not.toContain("2021-2026");
  });

  it("`faits` et `brut` portent les MÊMES valeurs nettoyées", () => {
    // Deux objets censés dire la même chose ont fini par diverger une fois : `faits` était
    // nettoyé, `brut` ne l'était pas, et c'est `brut` qui partait en base. Ce test verrouille
    // leur accord.
    return extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI }).then((r) => {
      if (!r.ok) throw new Error("extraction attendue en succès");
      expect(r.faits.langues).toEqual(r.brut.langues);
      expect(r.faits.diplomes).toEqual(r.brut.diplomes);
      expect(r.faits.outils).toEqual(r.brut.outils);
      expect(r.faits.titresOccupes).toEqual(r.brut.titresOccupes);
    });
  });
});

describe("les échecs restent honnêtes", () => {
  it("clé absente : un échec NOMMÉ, jamais un profil vide", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const r = await extraireFaits(TEXTE_CV, { cle: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("document trop court : on dit quoi faire", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "cle-de-test");
    const r = await extraireFaits("trop court");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/scanné|texte/i);
  });
});

describe("la requête envoyée au modèle (JobAI#158)", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "cle-de-test");
    usageRendu = { input_tokens: 1000, output_tokens: 200 };
    contenuRendu = [{ type: "tool_use", name: "rendre_profil", input: REPONSE_AVEC_COORDONNEES }];
  });

  it("appelle Sonnet 5.5, sans appel forcé (refusé en 400) et sans pensée avant l'outil", async () => {
    await extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI });
    expect(requete.model).toBe("claude-sonnet-5-5");
    // ⚠️ Sonnet 5.5 renvoie 400 sur tool_choice « tool » ou « any » : un retour à l'appel forcé casserait l'analyse.
    expect(requete.tool_choice).toEqual({ type: "auto" });
    // La pensée se facture en sortie : au défaut (adaptative, effort « high ») elle gonflerait le coût d'un CV.
    expect(requete.thinking).toEqual({ type: "between_tools" });
    expect(requete.output_config).toEqual({ effort: "medium" });
  });

  it("la consigne demande d'appeler l'outil, puisque rien ne l'impose plus", async () => {
    await extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI });
    expect(String(requete.system)).toMatch(/appelant l'outil rendre_profil/);
  });

  it("une réponse en texte, sans appel d'outil, est un échec dit ET l'appel est compté", async () => {
    contenuRendu = [{ type: "text", text: "Voici le profil…" }];
    comptabilise.mockClear();
    const r = await extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/pas rendu de résultat structuré/);
    expect(comptabilise).toHaveBeenCalledTimes(1);
  });
});

describe("la comptabilité de l'appel", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "cle-de-test");
    comptabilise.mockClear();
    usageRendu = { input_tokens: 1000, output_tokens: 200 };
    contenuRendu = [{ type: "tool_use", name: "rendre_profil", input: REPONSE_AVEC_COORDONNEES }];
  });

  it("est appelée par DÉFAUT, sans que l'appelant ait à y penser", async () => {
    // ⚠️ LE POINT : `extraireFaits` a deux appelants (téléversement et ré-analyse). Laisser
    // chacun penser à compter, c'est « un outil qu'on peut oublier d'appeler ne protège
    // rien » — et le premier oubli produirait un cumul silencieusement amputé.
    await extraireFaits(TEXTE_CV);
    expect(comptabilise).toHaveBeenCalledTimes(1);
    expect(comptabilise).toHaveBeenCalledWith({ input_tokens: 1000, output_tokens: 200 }, "claude-sonnet-5-5");
  });

  it("compte l'appel MÊME quand la réponse est ensuite refusée", async () => {
    // L'appel est fait et FACTURÉ : ce qui suit peut échouer (pas de bloc `tool_use`,
    // réponse hors schéma) sans qu'Anthropic rende ses tokens. Compter après les
    // validations sous-estimerait le coût exactement les jours où ça ne va pas.
    contenuRendu = [{ type: "text", text: "je préfère répondre en prose" }];
    const r = await extraireFaits(TEXTE_CV);
    expect(r.ok).toBe(false);
    expect(comptabilise).toHaveBeenCalledTimes(1);
  });

  it("une panne de comptabilité ne fait PAS échouer l'extraction", async () => {
    // Perdre la mesure d'un appel est regrettable ; perdre l'analyse d'un CV parce que la
    // base a hoqueté ne l'est pas. La garantie tient quel que soit l'écrivain injecté.
    const r = await extraireFaits(TEXTE_CV, {
      comptabiliser: async () => {
        throw new Error("base injoignable");
      },
    });
    expect(r.ok).toBe(true);
  });

  it("n'est PAS appelée quand l'appel n'a pas eu lieu", async () => {
    // Pas de clé, texte trop court : rien n'a été facturé, rien ne doit être compté —
    // sinon le compteur passerait de « aucun appel » à « des appels non mesurés », et le
    // hub afficherait une alerte pour un appel qui n'a jamais existé.
    await extraireFaits("trop court");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await extraireFaits(TEXTE_CV, { cle: undefined });
    expect(comptabilise).not.toHaveBeenCalled();
  });
});

describe("les années d'expérience viennent du code, pas du modèle (JobAI#154)", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "cle-de-test");
  });

  it("un CV sans poste daté rend « non établi », jamais le nombre du modèle", async () => {
    contenuRendu = [
      {
        type: "tool_use",
        name: "rendre_profil",
        input: { ...REPONSE_AVEC_COORDONNEES, parcours: [] },
      },
    ];
    const r = await extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI });
    if (!r.ok) throw new Error("extraction attendue en succès");
    expect(r.brut.anneesExperience).toBeNull();
    expect(r.provenances.anneesExperience).toMatch(/Aucun poste daté/);
  });

  it("un nombre absurde écrit quand même par le modèle ne fait pas échouer l'analyse", async () => {
    contenuRendu = [
      {
        type: "tool_use",
        name: "rendre_profil",
        input: { ...REPONSE_AVEC_COORDONNEES, anneesExperience: 999, anneesExperienceProvenance: "x".repeat(5000) },
      },
    ];
    const r = await extraireFaits(TEXTE_CV, { aujourdhui: AUJOURDHUI });
    if (!r.ok) throw new Error("extraction attendue en succès");
    expect(r.brut.anneesExperience).toBe(5.5);
  });

  it("le modèle ne reçoit plus la consigne de compter", async () => {
    const { OUTIL_EXTRACTION } = await import("@/lib/cv/extraction");
    expect(Object.keys(OUTIL_EXTRACTION.input_schema.properties)).not.toContain("anneesExperience");
  });
});
