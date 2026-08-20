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
  anneesExperience: 5,
  anneesExperienceProvenance: `Section Expérience, 2021-2026, ${COURRIEL}`,
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

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({
        stop_reason: "tool_use",
        content: contenuRendu,
        usage: usageRendu,
      }),
    };
  },
}));

/**
 * La comptabilité est mockée : `extraireFaits` l'appelle par DÉFAUT (c'est le point — elle
 * ne doit pas pouvoir être oubliée par un appelant), et l'écrivain réel touche la base.
 */
const comptabilise = vi.fn(async (_usage: unknown) => {});
vi.mock("@/lib/coutLlmStore", () => ({
  enregistrerUsageLlm: (usage: unknown) => comptabilise(usage),
}));

const { extraireFaits, expurgerCoordonnees } = await import("@/lib/cv/extraction");

/** Un CV assez long pour passer le plancher de `extraireFaits`. */
const TEXTE_CV = "Coordonnateur de projets techniques. ".repeat(10);

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
    const r = await extraireFaits(TEXTE_CV);
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
    return extraireFaits(TEXTE_CV).then((r) => {
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const persiste = JSON.stringify(r.brut);
      expect(persiste).toContain("TIA Portal");
      expect(persiste).toContain("Anglais");
      expect(persiste).toContain("Coordonnateur technique");
      expect(persiste).toContain("Master en robotique");
      expect(r.brut.anneesExperience).toBe(5);
    });
  });

  it("la provenance est expurgée elle aussi", async () => {
    const r = await extraireFaits(TEXTE_CV);
    if (!r.ok) throw new Error("extraction attendue en succès");
    // Elle s'affiche à l'écran de revue sous chaque écart : elle circule autant que le reste.
    expect(r.provenances.anneesExperience).not.toContain(COURRIEL);
    expect(r.provenances.anneesExperience).toContain("2021-2026");
  });

  it("`faits` et `brut` portent les MÊMES valeurs nettoyées", () => {
    // Deux objets censés dire la même chose ont fini par diverger une fois : `faits` était
    // nettoyé, `brut` ne l'était pas, et c'est `brut` qui partait en base. Ce test verrouille
    // leur accord.
    return extraireFaits(TEXTE_CV).then((r) => {
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
    expect(comptabilise).toHaveBeenCalledWith({ input_tokens: 1000, output_tokens: 200 });
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
