// tests/mcpServeur.test.ts — le serveur MCP, éprouvé par un VRAI client.
//
// POURQUOI UN CLIENT PLUTÔT QUE D'APPELER LES HANDLERS
// Appeler un handler directement contourne tout ce que le SDK fait autour : la validation
// des schémas, la forme des réponses, la liste des outils. C'est exactement le piège déjà
// consigné pour FinanceAI — « un test qui appelle le HANDLER directement BYPASS la
// validation Zod du SDK ». Ici le client parle au serveur par un transport, donc ce qui est
// éprouvé est ce que claude.ai verra.
//
// Aucune base, aucun réseau : les entrées/sorties sont injectées. C'est ce qui rend ce test
// possible, et c'est aussi la condition n°2 de l'ADR-0011 — le serveur ne PEUT pas atteindre
// la base tout seul.

import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { creerServeur, type EntreesSorties } from "../lib/mcp/serveur";
import { PROFIL_DEFAUT } from "../lib/profil";
import type { Offre } from "../lib/types";
import { ReponseExtractionSchema } from "../lib/cv/extraction";
import { PREFIXE_CALCUL_ANNEES } from "../lib/cv/anneesExperience";

const BASE: Offre = {
  id: "laserax-coordonnateur",
  source: "jobbank",
  dateReperage: "2026-08-01",
  entreprise: "Laserax",
  poste: "Coordonnateur de projets",
  lien: "https://exemple.test/o",
  km: 12,
  ville: "Québec",
  salaireAffiche: null,
  statut: "Identifiee",
  priorite: "Moyenne",
  dateEnvoi: "",
  userNote: "",
  score: 70,
  scoreSource: "calcule",
  raisons: [],
  notes: "",
  histo: false,
  perimeeLe: null,
};

const offre = (p: Partial<Offre> = {}): Offre => ({ ...BASE, ...p });

/** Un client branché sur un serveur, avec les écritures observées. */
async function brancher(io: Partial<EntreesSorties> = {}) {
  const enregistrees: Offre[] = [];
  const serveur = creerServeur({
    lireOffres: async () => [offre()],
    enregistrer: async (o) => {
      enregistrees.push(o);
    },
    aujourdhui: () => "2026-08-19",
    lireJournal: async () => ({}),
    lireEtatSynchro: async () => [],
    lireResumeDistances: async () => ({ brut: null }),
    lireBareme: async () => ({ profil: PROFIL_DEFAUT, metiers: ["21"] }),
    lirePreuvesProfil: async () => ({ profil: PROFIL_DEFAUT, proposition: null }),
    lireCompteurUsage: async () => ({ etat: "absent" }),
    listerCvs: async () => [],
    reanalyserCv: async () => ({ ok: true, message: "Analyse refaite." }),
    diagnostiquerFlux: async () => ({
      fin: "flux-termine",
      verdicts: { "dans-la-region": 2 },
      inventaireRetenues: { noc2021: { distinctes: 1, top: [{ nom: "21301", n: 2 }] } },
      exemplesRetenues: { noc2021: { "21301": ["Mechanical engineer"] } },
      professions: [],
    }),
    sonderEmployeurs: async () => ({ employeursCherches: 2 }),
    ...io,
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([serveur.connect(b), client.connect(a)]);
  return { client, enregistrees };
}

/**
 * Le JSON d'une réponse d'outil.
 *
 * Typée `unknown` en entrée : le résultat d'un appel est une UNION côté SDK (une variante
 * porte `content`, une autre `toolResult`), et la contraindre trop tôt casse le typage sans
 * rien protéger — c'est le test qui sait ce qu'il vient de demander.
 */
function corps(resultat: unknown): Record<string, unknown> {
  const c = (resultat as { content?: { type: string; text: string }[] }).content;
  return JSON.parse(c?.[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("la surface exposée à claude.ai", () => {
  it("publie exactement les outils prévus, et rien de plus", async () => {
    // La liste des outils EST le contrat public : un outil ajouté sans décision devient
    // appelable par un modèle. On la capture plutôt que de la supposer.
    const { client } = await brancher();
    const noms = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(noms).toEqual([
      "chercher_offres",
      "diagnostic_bareme",
      "diagnostic_flux",
      "etat_synchro",
      "lire_offre",
      "modifier_suivi",
      "preuves_ecrans",
      "reanalyser_profil",
      "resume_suivi",
      "sonde_employeurs",
    ]);
  });

  it("annonce quels outils LISENT et lequel ÉCRIT", async () => {
    // `readOnlyHint` est ce qui permet à un client de traiter différemment une lecture et
    // une écriture. Le déclarer faux par omission ferait passer une écriture pour anodine.
    const { client } = await brancher();
    const outils = (await client.listTools()).tools;
    const parNom = new Map(outils.map((t) => [t.name, t.annotations?.readOnlyHint]));
    expect(parNom.get("chercher_offres")).toBe(true);
    expect(parNom.get("resume_suivi")).toBe(true);
    expect(parNom.get("diagnostic_flux")).toBe(true);
    expect(parNom.get("etat_synchro")).toBe(true);
    expect(parNom.get("diagnostic_bareme")).toBe(true);
    expect(parNom.get("sonde_employeurs")).toBe(true);
    expect(parNom.get("preuves_ecrans")).toBe(true);
    expect(parNom.get("modifier_suivi")).toBe(false);
    expect(parNom.get("reanalyser_profil")).toBe(false);
  });
});

describe("la sonde des employeurs", () => {
  it("rend le rapport tel quel, et une base muette est une ERREUR, pas un rapport vide", async () => {
    const { client } = await brancher();
    expect(corps(await client.callTool({ name: "sonde_employeurs", arguments: {} })).employeursCherches).toBe(2);
    const muet = await brancher({ sonderEmployeurs: async () => null });
    const r = await muet.client.callTool({ name: "sonde_employeurs", arguments: {} });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("pas pu regarder");
  });
});

describe("une base muette ne se déguise JAMAIS en suivi vide", () => {
  it("rend une ERREUR, pas une liste vide", async () => {
    // « Tu n'as aucune offre » et « je n'ai pas pu regarder » sont deux phrases opposées.
    // Les confondre est la panne qui a laissé la veille muette trois jours durant.
    const { client } = await brancher({ lireOffres: async () => null });
    const r = await client.callTool({ name: "chercher_offres", arguments: {} });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("pas pu regarder");
  });

  it("vaut pour TOUS les outils, pas seulement la recherche", async () => {
    const { client } = await brancher({ lireOffres: async () => null });
    for (const name of ["resume_suivi", "lire_offre", "modifier_suivi"]) {
      const args = name === "chercher_offres" ? {} : { id: "x", patch: { priorite: "Haute" } };
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError, name).toBe(true);
    }
  });
});

describe("les lectures", () => {
  it("rend les offres et dit si la liste est tronquée", async () => {
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "chercher_offres", arguments: {} }));
    expect(r.correspondances).toBe(1);
    expect(r.tronque).toBe(false);
  });

  it("distingue « introuvable » d'une panne", async () => {
    // L'un se corrige en changeant d'identifiant, l'autre en attendant la base.
    const { client } = await brancher();
    const r = await client.callTool({ name: "lire_offre", arguments: { id: "inconnue" } });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("identifiant");
  });

  it("rend les statuts à zéro dans le résumé", async () => {
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "resume_suivi", arguments: {} }));
    expect((r.parStatut as Record<string, number>)["Entrevue"]).toBe(0);
  });
});

describe("diagnostic_flux — la table qui décide, pas les onze inventaires", () => {
  it("rend par défaut la table des professions, avec ses exemples", async () => {
    // Un rapport qu'on ne peut pas lire en entier ne se lit pas du tout : l'outil rend le
    // résumé et UN inventaire, pas les onze.
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "diagnostic_flux", arguments: {} }));
    expect(r.champ).toBe("noc2021");
    expect(r.fin).toBe("flux-termine");
    expect(r.exemples).toEqual({ "21301": ["Mechanical engineer"] });
    expect(r.inventairesDisponibles).toEqual(["noc2021"]);
  });

  it("rend `null` — jamais un objet vide — pour un champ qui n'existe pas", async () => {
    // « Le champ demandé n'existe pas » et « il n'a aucune valeur » sont deux choses
    // différentes ; un objet vide tairait la première.
    const { client } = await brancher();
    const r = corps(
      await client.callTool({ name: "diagnostic_flux", arguments: { champ: "inexistant" } }),
    );
    expect(r.inventaire).toBeNull();
    expect(r.exemples).toBeNull();
    expect(r.inventairesDisponibles).toEqual(["noc2021"]);
  });

  it("RELAIE le code postal des offres non placées, avec son dénominateur", async () => {
    // ⚠️ CALCULÉ JUSTE, JAMAIS LIVRÉ — la classe `[FERMETURE-03]`. Les deux comptes de
    // `[VEILLE-42]` sont les seuls du rapport qui décrivent les offres qu'on n'a PAS su
    // placer ; s'ils s'arrêtent à la frontière de l'outil, la mesure existe et personne ne
    // la voit. `verdicts` part avec eux : un compte de classes sans son dénominateur se lit
    // comme une proportion.
    const { client } = await brancher({
      diagnostiquerFlux: async () => ({
        fin: "flux-termine",
        verdicts: { "lieu-inconnu": 3 },
        lettresInconnues: [{ nom: "J", n: 2 }, { nom: "(vide)", n: 1 }],
        regionsInconnues: [{ nom: "J9T", n: 1 }],
        lettresHorsRegion: [{ nom: "H", n: 9 }],
      }),
    });
    const r = corps(await client.callTool({ name: "diagnostic_flux", arguments: {} }));
    expect(r.lettresInconnues).toEqual([{ nom: "J", n: 2 }, { nom: "(vide)", n: 1 }]);
    expect(r.regionsInconnues).toEqual([{ nom: "J9T", n: 1 }]);
    // Le contraste part AVEC eux : sans lui, les deux autres ne disent pas quelle bande est
    // lointaine, et la règle de bande se déciderait de mémoire.
    expect(r.lettresHorsRegion).toEqual([{ nom: "H", n: 9 }]);
    expect(r.verdicts).toEqual({ "lieu-inconnu": 3 });
  });
});

describe("etat_synchro — la fraîcheur des passes de fond, jamais leur contenu", () => {
  it("rend cle/majLe/ageMs pour chaque ligne, triées", async () => {
    const { client } = await brancher({
      lireEtatSynchro: async () => [
        { cle: "veille-auto", majLe: new Date("2026-09-21T11:00:00.000Z") },
        { cle: "distances-auto", majLe: new Date("2026-09-21T11:55:00.000Z") },
      ],
    });
    const r = await client.callTool({ name: "etat_synchro", arguments: {} });
    const lignes = corps(r) as unknown as { cle: string; majLe: string; ageMs: number }[];
    expect(lignes.map((l) => l.cle)).toEqual(["distances-auto", "veille-auto"]);
    expect(Object.keys(lignes[0]!).sort()).toEqual(["ageMs", "cle", "majLe"]);
  });

  it("[OBS-02] rend villesManquantes, distancesEffacees et centresCorriges de la dernière passe", async () => {
    const resume = {
      ecritLe: "2026-10-15T07:31:00.000Z",
      terminee: true,
      derniereEtape: "mesure",
      mesurees: 12,
      situees: 3,
      candidatesSituees: 9,
      placees: 4,
      villesManquantes: 41,
      distancesEffacees: 2,
      centresCorriges: 1,
      bornesMesurees: 5,
      bornesCandidates: 8,
      budgetRestantMs: 6400,
      etapes: [{ nom: "villes", ms: 20 }],
    };
    const { client } = await brancher({
      lireEtatSynchro: async () => [
        { cle: "distances-auto", majLe: new Date("2026-10-15T07:30:00.000Z") },
        { cle: "distances-resume", majLe: new Date("2026-10-15T07:31:00.000Z") },
      ],
      lireResumeDistances: async () => ({ brut: JSON.stringify(resume) }),
    });
    const r = await client.callTool({ name: "etat_synchro", arguments: {} });
    const lignes = corps(r) as unknown as { cle: string; resume?: typeof resume }[];
    const ligne = lignes.find((l) => l.cle === "distances-resume");
    expect(ligne?.resume?.villesManquantes).toBe(41);
    expect(ligne?.resume?.distancesEffacees).toBe(2);
    expect(ligne?.resume?.centresCorriges).toBe(1);
    // Les autres lignes restent des dates, rien de plus.
    expect(Object.keys(lignes.find((l) => l.cle === "distances-auto")!).sort()).toEqual([
      "ageMs",
      "cle",
      "majLe",
    ]);
  });

  it("[OBS-02] un résumé illisible est DIT illisible, pas rendu en zéros", async () => {
    const { client } = await brancher({
      lireEtatSynchro: async () => [
        { cle: "distances-resume", majLe: new Date("2026-10-15T07:31:00.000Z") },
      ],
      lireResumeDistances: async () => ({ brut: "{cassé" }),
    });
    const r = await client.callTool({ name: "etat_synchro", arguments: {} });
    const [ligne] = corps(r) as unknown as Record<string, unknown>[];
    expect(ligne?.resume).toBeNull();
    expect(ligne?.resumeIllisible).toBe(true);
  });

  it("[OBS-02] une base muette sur le résumé est une erreur, pas un résumé absent", async () => {
    const { client } = await brancher({ lireResumeDistances: async () => null });
    const r = await client.callTool({ name: "etat_synchro", arguments: {} });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("pas répondu");
  });

  it("rend une ERREUR, pas une liste vide, quand la base n'a pas répondu", async () => {
    const { client } = await brancher({ lireEtatSynchro: async () => null });
    const r = await client.callTool({ name: "etat_synchro", arguments: {} });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("pas répondu");
  });
});

describe("l'écriture — l'exception de l'ADR-0011, vue du protocole", () => {
  it("persiste et rend l'AVANT/APRÈS", async () => {
    const { client, enregistrees } = await brancher();
    const r = corps(
      await client.callTool({
        name: "modifier_suivi",
        arguments: { id: BASE.id, patch: { statut: "CVenvoye" } },
      }),
    );
    expect(enregistrees).toHaveLength(1);
    expect(enregistrees[0]?.statut).toBe("CVenvoye");
    // La date d'envoi vient du jour INJECTÉ, pas d'une horloge lue dans le module.
    expect(enregistrees[0]?.dateEnvoi).toBe("2026-08-19");
    expect(r.changements).toContainEqual({ champ: "statut", avant: "Identifiee", apres: "CVenvoye" });
    expect(r.dateEnvoiPosee).toBe(true);
  });

  it("N'ÉCRIT PAS quand rien ne change", async () => {
    // Une écriture inutile fait bouger `majLe` et ment sur la fraîcheur de la ligne.
    const { client, enregistrees } = await brancher();
    const r = corps(
      await client.callTool({
        name: "modifier_suivi",
        arguments: { id: BASE.id, patch: { priorite: "Moyenne" } },
      }),
    );
    expect(enregistrees).toHaveLength(0);
    expect(r.changements).toEqual([]);
  });

  it("REFUSE une offre périmée, et n'écrit rien", async () => {
    const { client, enregistrees } = await brancher({
      lireOffres: async () => [offre({ perimeeLe: "2026-08-10T00:00:00.000Z" })],
    });
    const r = await client.callTool({
      name: "modifier_suivi",
      arguments: { id: BASE.id, patch: { statut: "CVenvoye" } },
    });
    expect(r.isError).toBe(true);
    expect(enregistrees).toHaveLength(0);
  });

  it("LAISSE TOMBER un champ hors du domaine de Marc, sans écrire de faux", async () => {
    // ⚠️ MESURÉ, ET CE N'EST PAS CE QUE JE CROYAIS. Zod STRIPPE les clés inconnues par
    // défaut, il ne lève pas : `{ score: 100 }` devient `{}`, donc le refus qu'on observe
    // est « patch vide » et non un rejet. Mon premier test portait un nom qui mentait sur
    // le mécanisme — il passait, et il aurait continué de passer si le stripping avait
    // disparu. On éprouve donc le cas qui COMPTE vraiment : une demande MIXTE.
    const { client, enregistrees } = await brancher();
    const r = corps(
      await client.callTool({
        name: "modifier_suivi",
        arguments: { id: BASE.id, patch: { priorite: "Haute", score: 100, perimeeLe: null } },
      }),
    );
    // La priorité bouge, les calculs du moteur ne bougent pas — condition n°4 de l'ADR-0011.
    expect(enregistrees[0]?.priorite).toBe("Haute");
    expect(enregistrees[0]?.score).toBe(70);
    expect(enregistrees[0]?.perimeeLe).toBeNull();
    // Et l'avant/après ne parle QUE de ce qui a réellement changé : annoncer un champ non
    // modifié ferait croire à Marc qu'un calcul a bougé.
    expect(r.changements).toEqual([{ champ: "priorite", avant: "Moyenne", apres: "Haute" }]);
  });

  it("refuse une demande qui ne porte QUE des champs hors domaine", async () => {
    // Elle se vide au parse et tombe donc sur « aucun champ à modifier » — un refus dit,
    // jamais un succès silencieux qui laisserait croire que le score a été posé.
    const { client, enregistrees } = await brancher();
    const r = await client.callTool({
      name: "modifier_suivi",
      arguments: { id: BASE.id, patch: { score: 100 } },
    });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("Aucun champ");
    expect(enregistrees).toHaveLength(0);
  });

  it("REJETTE un statut inventé — la validation du SDK fait son travail", async () => {
    const { client, enregistrees } = await brancher();
    const r = await client.callTool({
      name: "modifier_suivi",
      arguments: { id: BASE.id, patch: { statut: "Embauche" } },
    });
    expect(r.isError).toBe(true);
    expect(enregistrees).toHaveLength(0);
  });
});

describe("diagnostic_bareme — mesurer le barème sans le modifier", () => {
  it("rend la population et les trois recalculs", async () => {
    const { client, enregistrees } = await brancher();
    const r = await client.callTool({ name: "diagnostic_bareme", arguments: {} });
    const c = corps(r) as unknown as {
      population: { ouvertes: number };
      renotation: unknown;
      complet: unknown;
      ingestion: unknown;
    };
    expect(c.population.ouvertes).toBe(1);
    expect(c.renotation).toBeDefined();
    expect(c.complet).toBeDefined();
    expect(c.ingestion).toBeDefined();
    expect(enregistrees).toHaveLength(0);
  });

  it("avec `apercu`, rend l'aperçu du nouveau barème et n'écrit rien (JobAI#152)", async () => {
    const { client, enregistrees } = await brancher();
    const r = await client.callTool({ name: "diagnostic_bareme", arguments: { apercu: true } });
    const c = corps(r) as unknown as {
      dejaApplique: boolean;
      poids: { avant: { salaire: number }; apres: { salaire: number } };
      exemples: { montent: unknown[]; descendent: unknown[] };
    };
    expect(c.dejaApplique).toBe(false);
    expect(c.poids.avant.salaire).toBe(PROFIL_DEFAUT.ponderation.salaire);
    expect(c.poids.apres.salaire).toBe(32);
    expect(Array.isArray(c.exemples.montent)).toBe(true);
    expect(enregistrees).toHaveLength(0);
  });

  it("dit une panne plutôt que de mesurer le profil par défaut", async () => {
    const { client } = await brancher({ lireBareme: async () => null });
    const r = await client.callTool({ name: "diagnostic_bareme", arguments: {} });
    expect(r.isError).toBe(true);
    expect(String(corps(r).erreur)).toContain("autre barème");
  });

  it("base muette : une erreur, pas un suivi vide", async () => {
    const { client } = await brancher({ lireOffres: async () => null });
    const r = await client.callTool({ name: "diagnostic_bareme", arguments: {} });
    expect(r.isError).toBe(true);
  });
});

describe("preuves_ecrans — prouver les écrans sans session", () => {
  it("rend anneesExperience: null (et non 0) pour le profil par défaut", async () => {
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    expect(r.anneesExperience).toBeNull();
  });

  it("rend la fiche de compétences avec libelle, niveau, phrase, poste", async () => {
    const profilFictif = {
      ...PROFIL_DEFAUT,
      faits: {
        ...PROFIL_DEFAUT.faits,
        competences: [
          {
            id: "automates-programmables",
            niveau: "pratique" as const,
            phrase: "Programmation d'automates PLC",
            poste: "Coordonnateur",
          },
        ],
      },
    };
    const { client } = await brancher({
      lirePreuvesProfil: async () => ({ profil: profilFictif, proposition: null }),
    });
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    expect(r.competences).toEqual([
      {
        id: "automates-programmables",
        libelle: "Automates programmables (PLC)",
        niveau: "pratique",
        phrase: "Programmation d'automates PLC",
        poste: "Coordonnateur",
      },
    ]);
  });

  it("rend un écart d'années coché d'avance seulement quand sa provenance est le calcul du code", async () => {
    const extractionFictive = ReponseExtractionSchema.parse({
      anneesExperience: 5,
      anneesExperienceProvenance: `${PREFIXE_CALCUL_ANNEES} (mois de début et de fin inclus) · total : 60 mois = 5 ans`,
      langues: [],
      diplomes: [],
      outils: [],
      titresOccupes: [],
      parcours: [],
      competences: [],
      forces: [],
      manques: [],
      recherchesSuggerees: [],
    });
    const { client } = await brancher({
      lirePreuvesProfil: async () => ({
        profil: PROFIL_DEFAUT,
        proposition: { ok: true, extraction: extractionFictive },
      }),
    });
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    const props = r.propositions as Array<Record<string, unknown>>;
    const ecartAnnees = props.find((p) => p.cle === "faits.anneesExperience");
    expect(ecartAnnees).toBeDefined();
    expect(ecartAnnees?.provenance).toBe(extractionFictive.anneesExperienceProvenance);
    expect(ecartAnnees?.preuve).toBe(true);
    expect(ecartAnnees?.coche).toBe(true);
  });

  it("une estimation d'années (provenance qui n'est pas le calcul du code) n'est ni preuve ni cochée (JobAI#200)", async () => {
    const extractionFictive = ReponseExtractionSchema.parse({
      anneesExperience: 1,
      anneesExperienceProvenance: "5 ans d'expérience en gestion",
      langues: [],
      diplomes: [],
      outils: [],
      titresOccupes: [],
      parcours: [],
      competences: [],
      forces: [],
      manques: [],
      recherchesSuggerees: [],
    });
    const { client } = await brancher({
      lirePreuvesProfil: async () => ({
        profil: PROFIL_DEFAUT,
        proposition: { ok: true, extraction: extractionFictive },
      }),
    });
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    const props = r.propositions as Array<Record<string, unknown>>;
    const ecartAnnees = props.find((p) => p.cle === "faits.anneesExperience");
    expect(ecartAnnees?.provenance).toBe(
      "estimation, non calculée par le code : 5 ans d'expérience en gestion",
    );
    expect(ecartAnnees?.preuve).toBe(false);
    expect(ecartAnnees?.coche).toBe(false);
  });

  it("rend propositions: { illisible: '…' } pour { ok: false, raison: '…' }", async () => {
    const { client } = await brancher({
      lirePreuvesProfil: async () => ({
        profil: PROFIL_DEFAUT,
        proposition: { ok: false, raison: "Proposition corrompue" },
      }),
    });
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    expect(r.propositions).toEqual({ illisible: "Proposition corrompue" });
  });

  it("rend les signaux d'un employeur fictif quand employeur est donné, et employeur: null quand il n'a aucune offre", async () => {
    const { client } = await brancher({
      lireOffres: async () => [
        offre({ entreprise: "Entreprise Fictive Inc.", perimeeLe: null }),
      ],
      lireJournal: async () => ({
        "laserax-coordonnateur": { premiereVue: "2026-08-01", derniereVue: "2026-08-10", absences: 0 },
      }),
    });

    const r1 = corps(
      await client.callTool({
        name: "preuves_ecrans",
        arguments: { employeur: "Entreprise Fictive" },
      }),
    );
    expect(r1.employeur).not.toBeNull();
    const emp = r1.employeur as Record<string, unknown>;
    expect(emp.offres).toBe(1);

    const r2 = corps(
      await client.callTool({
        name: "preuves_ecrans",
        arguments: { employeur: "Inexistant Ltd" },
      }),
    );
    expect(r2.employeur).toBeNull();
  });

  it("ne contient jamais la clé valeur ni le texte brut d'un CV (JSON.stringify de la réponse ne contient pas 'valeur')", async () => {
    const extractionFictive = ReponseExtractionSchema.parse({
      anneesExperience: 3,
      anneesExperienceProvenance: "3 ans d'expérience",
      langues: [],
      diplomes: [],
      outils: [],
      titresOccupes: [],
      parcours: [],
      competences: [],
      forces: [],
      manques: [],
      recherchesSuggerees: [],
    });
    const { client } = await brancher({
      lirePreuvesProfil: async () => ({
        profil: PROFIL_DEFAUT,
        proposition: { ok: true, extraction: extractionFictive },
      }),
    });
    const res = await client.callTool({ name: "preuves_ecrans", arguments: {} });
    const jsonStr = JSON.stringify(res);
    expect(jsonStr.includes('"valeur"')).toBe(false);
  });

  it("une base muette (lirePreuvesProfil: async () => null, puis lireOffres: async () => null) rend isError: true", async () => {
    const muet1 = await brancher({ lirePreuvesProfil: async () => null });
    const r1 = await muet1.client.callTool({ name: "preuves_ecrans", arguments: {} });
    expect(r1.isError).toBe(true);

    const muet2 = await brancher({ lireOffres: async () => null });
    const r2 = await muet2.client.callTool({ name: "preuves_ecrans", arguments: {} });
    expect(r2.isError).toBe(true);
  });
});

describe("preuves_ecrans — la mesure des annonces en double (JobAI#195)", () => {
  it("rend un bloc suivi.doublonsAnnonce fait de nombres, jamais d'un lien ni d'un intitulé", async () => {
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    const suivi = r.suivi as { doublonsAnnonce: Record<string, unknown> };
    expect(typeof suivi.doublonsAnnonce.offres).toBe("number");
    expect(typeof suivi.doublonsAnnonce.annoncesEnDouble).toBe("number");
    expect(typeof suivi.doublonsAnnonce.offresEnTrop).toBe("number");
    expect(Array.isArray(suivi.doublonsAnnonce.exemples)).toBe(true);
    expect(JSON.stringify(suivi)).not.toMatch(/https?:/);
  });
});

describe("preuves_ecrans — le coût des appels de modèle (JobAI#198)", () => {
  it("sans aucun appel, le bloc usage dit « aucun-appel » (jamais 0 $)", async () => {
    const { client } = await brancher();
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    expect(r.usage).toEqual({ etat: "aucun-appel" });
  });

  it("rend un modèle chiffré et un modèle sans prix « non mesuré », sans l'additionner au total", async () => {
    const { client } = await brancher({
      lireCompteurUsage: async () => ({
        etat: "compteur",
        parModele: {
          "claude-sonnet-5-5": {
            appels: 1,
            entree: 20_000,
            sortie: 3_000,
            ecritureCache: 0,
            lectureCache: 0,
            ignores: 0,
          },
          "modele-sans-prix": {
            appels: 0,
            entree: 0,
            sortie: 0,
            ecritureCache: 0,
            lectureCache: 0,
            ignores: 2,
          },
        },
      }),
    });
    const r = corps(await client.callTool({ name: "preuves_ecrans", arguments: {} }));
    const usage = r.usage as { etat: string; devise: string; coutTotal: number; modeles: Array<Record<string, unknown>> };
    expect(usage.etat).toBe("compteur");
    expect(usage.devise).toBe("USD");
    const sonnet = usage.modeles.find((m) => m.modele === "claude-sonnet-5-5");
    // (20 000 × 2 $ + 3 000 × 10 $) / 1 000 000 = 0,07 $ : le prix de Sonnet 5.5, pas celui d'un autre modèle.
    expect(sonnet?.cout).toBe(0.07);
    expect(sonnet?.appels).toBe(1);
    const inconnu = usage.modeles.find((m) => m.modele === "modele-sans-prix");
    expect(inconnu?.cout).toBe("non mesuré");
    expect(inconnu?.ignores).toBe(2);
    expect(usage.coutTotal).toBe(0.07);
  });

  it("un compteur illisible ou muet se dit « illisible », sans faire échouer les preuves du CV", async () => {
    for (const compteur of [{ etat: "illisible" as const }, null]) {
      const { client } = await brancher({ lireCompteurUsage: async () => compteur });
      const res = await client.callTool({ name: "preuves_ecrans", arguments: {} });
      expect(res.isError).toBeFalsy();
      const r = corps(res);
      expect((r.usage as { etat: string }).etat).toBe("illisible");
      expect(r.competences).toBeDefined();
    }
  });
});

describe("reanalyser_profil — refaire la proposition sans session de la page profil", () => {
  it("cible le CV qui porte une proposition sans être actif, sinon le CV actif", async () => {
    let reanalyseId: number | null = null;
    const { client } = await brancher({
      listerCvs: async () => [
        {
          id: 1,
          nomFichier: "cv1.pdf",
          typeMime: "application/pdf",
          tailleOctets: 1000,
          actif: true,
          erreurExtraction: null,
          aUneProposition: true,
          televerseLe: "2026-08-01",
          valideLe: "2026-08-01",
        },
        {
          id: 2,
          nomFichier: "cv2.pdf",
          typeMime: "application/pdf",
          tailleOctets: 1000,
          actif: false,
          erreurExtraction: null,
          aUneProposition: true,
          televerseLe: "2026-08-02",
          valideLe: null,
        },
      ],
      reanalyserCv: async (id) => {
        reanalyseId = id;
        return { ok: true, message: "Analyse refaite." };
      },
    });

    const res = corps(await client.callTool({ name: "reanalyser_profil", arguments: {} }));
    expect(res.ok).toBe(true);
    expect(reanalyseId).toBe(2);
  });

  it("cible le CV actif si aucun CV non actif n'a de proposition", async () => {
    let reanalyseId: number | null = null;
    const { client } = await brancher({
      listerCvs: async () => [
        {
          id: 1,
          nomFichier: "cv1.pdf",
          typeMime: "application/pdf",
          tailleOctets: 1000,
          actif: true,
          erreurExtraction: null,
          aUneProposition: true,
          televerseLe: "2026-08-01",
          valideLe: "2026-08-01",
        },
      ],
      reanalyserCv: async (id) => {
        reanalyseId = id;
        return { ok: true, message: "Analyse refaite." };
      },
    });

    const res = corps(await client.callTool({ name: "reanalyser_profil", arguments: {} }));
    expect(res.ok).toBe(true);
    expect(reanalyseId).toBe(1);
  });

  it("refait la proposition sans toucher profilActif ni les notes", async () => {
    let reanalyseAppelee = false;
    const { client, enregistrees } = await brancher({
      listerCvs: async () => [
        {
          id: 1,
          nomFichier: "cv1.pdf",
          typeMime: "application/pdf",
          tailleOctets: 1000,
          actif: true,
          erreurExtraction: null,
          aUneProposition: true,
          televerseLe: "2026-08-01",
          valideLe: "2026-08-01",
        },
      ],
      reanalyserCv: async () => {
        reanalyseAppelee = true;
        return { ok: true, message: "Analyse refaite." };
      },
    });

    const res = corps(await client.callTool({ name: "reanalyser_profil", arguments: {} }));
    expect(res.ok).toBe(true);
    expect(reanalyseAppelee).toBe(true);
    expect(enregistrees).toHaveLength(0);
  });

  it("qu'une panne du modèle rend ok: false avec la raison", async () => {
    const { client } = await brancher({
      listerCvs: async () => [
        {
          id: 1,
          nomFichier: "cv1.pdf",
          typeMime: "application/pdf",
          tailleOctets: 1000,
          actif: true,
          erreurExtraction: null,
          aUneProposition: true,
          televerseLe: "2026-08-01",
          valideLe: "2026-08-01",
        },
      ],
      reanalyserCv: async () => ({
        ok: false,
        erreur: "Le modèle Anthropic n'a pas répondu",
      }),
    });

    const res = corps(await client.callTool({ name: "reanalyser_profil", arguments: {} }));
    expect(res.ok).toBe(false);
    expect(res.erreur).toBe("Le modèle Anthropic n'a pas répondu");
  });

  it("rend ok: false sans rien appeler quand aucun CV n'est présent", async () => {
    let reanalyseAppelee = false;
    const { client } = await brancher({
      listerCvs: async () => [],
      reanalyserCv: async () => {
        reanalyseAppelee = true;
        return { ok: true };
      },
    });

    const res = corps(await client.callTool({ name: "reanalyser_profil", arguments: {} }));
    expect(res.ok).toBe(false);
    expect(res.erreur).toContain("Aucun CV");
    expect(reanalyseAppelee).toBe(false);
  });

  it("ne rend jamais le texte du CV ni les faits extraits dans sa réponse", async () => {
    const { client } = await brancher({
      listerCvs: async () => [
        {
          id: 1,
          nomFichier: "cv.pdf",
          typeMime: "application/pdf",
          tailleOctets: 1000,
          actif: true,
          erreurExtraction: null,
          aUneProposition: true,
          televerseLe: "2026-08-01",
          valideLe: "2026-08-01",
        },
      ],
      reanalyserCv: async () => ({
        ok: true,
        message: "Analyse refaite.",
      }),
    });

    const brut = await client.callTool({ name: "reanalyser_profil", arguments: {} });
    const texteRendu = JSON.stringify(brut);
    expect(texteRendu.includes("anneesExperience")).toBe(false);
    expect(texteRendu.includes("texteDuCv")).toBe(false);
  });
});
