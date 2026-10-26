import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  creerEvenementOffreSuivie,
  creerEvenementReponseRecruteur,
  creerEvenementStatutChange,
  envoyerSorties,
} from "../lib/sortiesMemoryAI";

const offre = {
  id: "offre-essai-1",
  poste: "Poste d’essai",
  entreprise: "Entreprise exemple",
};

const date = () => new Date().toISOString();
const jetonEphemere = () => randomBytes(32).toString("hex");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("événements MemoryAI", () => {
  it("construit une offre suivie sans texte autre que son titre public", () => {
    expect(creerEvenementOffreSuivie(offre, date())).toEqual({
      type: "offre_suivie",
      date: expect.any(String),
      titre: "Poste d’essai — Entreprise exemple",
      resume: "Offre ajoutée au suivi.",
      ref: offre.id,
    });
  });

  it("construit un changement de statut", () => {
    expect(creerEvenementStatutChange(offre, "Entrevue", date())).toEqual({
      type: "statut_change",
      date: expect.any(String),
      titre: "Poste d’essai — Entreprise exemple",
      resume: "Statut mis à jour : Entrevue.",
      ref: offre.id,
    });
  });

  it("construit une réponse sans reprendre le texte du courriel ni le nom du tiers", () => {
    expect(creerEvenementReponseRecruteur(offre, date())).toEqual({
      type: "reponse_recruteur",
      date: expect.any(String),
      titre: "Poste d’essai — Entreprise exemple",
      resume: "Réponse de recruteur enregistrée.",
      ref: offre.id,
    });
  });

  it("refuse une date sans décalage et un identifiant non conforme", () => {
    expect(creerEvenementOffreSuivie(offre, "2026-10-26T12:00:00")).toBeNull();
    expect(creerEvenementOffreSuivie({ ...offre, id: "id avec espace" }, date())).toBeNull();
  });

  it("borne le titre en unités de texte sans couper une paire Unicode", () => {
    const evenement = creerEvenementOffreSuivie(
      { ...offre, poste: "😀".repeat(80) },
      date(),
    );

    expect(evenement?.titre.length).toBe(120);
    expect(Array.from(evenement!.titre)).toHaveLength(60);
  });
});

describe("envoi des sorties", () => {
  it("n'envoie rien sans jeton", async () => {
    vi.stubEnv("MEMORYAI_SORTIES_TOKEN", "");
    const journal = vi.spyOn(console, "info").mockImplementation(() => {});
    const requete = vi.fn();
    vi.stubGlobal("fetch", requete);
    const evenement = creerEvenementOffreSuivie(offre, date())!;

    await envoyerSorties([evenement]);

    expect(requete).not.toHaveBeenCalled();
    expect(JSON.stringify(journal.mock.calls)).not.toContain(evenement.titre);
  });

  it("respecte la porte et le corps du contrat", async () => {
    const jeton = jetonEphemere();
    vi.stubEnv("MEMORYAI_SORTIES_TOKEN", jeton);
    vi.stubEnv("MEMORYAI_URL", "https://memoryai.exemple.test/");
    const requete = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", requete);

    await envoyerSorties([creerEvenementStatutChange(offre, "Entrevue", date())!]);

    expect(requete).toHaveBeenCalledOnce();
    const [url, options] = requete.mock.calls[0]!;
    expect(String(url)).toBe("https://memoryai.exemple.test/api/sorties");
    expect(options.headers).toEqual({
      Authorization: "Bearer " + jeton,
      "Content-Type": "application/json",
    });
    const corps = JSON.parse(options.body);
    expect(corps.source).toBe("sorties");
    expect(corps.evenements).toHaveLength(1);
    expect(corps.evenements[0]).toMatchObject({
      type: "statut_change",
      date: expect.any(String),
      titre: "Poste d’essai — Entreprise exemple",
      resume: "Statut mis à jour : Entrevue.",
      ref: offre.id,
    });
  });

  it("avale une réponse 500 sans journaliser le jeton ni le titre", async () => {
    const jeton = jetonEphemere();
    vi.stubEnv("MEMORYAI_SORTIES_TOKEN", jeton);
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const evenement = creerEvenementOffreSuivie(offre, date())!;

    await expect(envoyerSorties([evenement])).resolves.toBeUndefined();

    expect(JSON.stringify(avertissement.mock.calls)).not.toContain(jeton);
    expect(JSON.stringify(avertissement.mock.calls)).not.toContain(evenement.titre);
    expect(avertissement).toHaveBeenCalledWith("[sorties] envoi impossible", {
      raison: "reponse_http",
      statut: 500,
    });
  });

  it("avale un délai dépassé sans journaliser le texte de l'événement", async () => {
    vi.useFakeTimers();
    const jeton = jetonEphemere();
    vi.stubEnv("MEMORYAI_SORTIES_TOKEN", jeton);
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    const requete = vi.fn(
      (_url: URL, options: RequestInit) =>
        new Promise((_, rejeter) => {
          options.signal?.addEventListener("abort", () =>
            rejeter(new DOMException("délai dépassé", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", requete);
    const evenement = creerEvenementReponseRecruteur(offre, date())!;

    const envoi = envoyerSorties([evenement]);
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(envoi).resolves.toBeUndefined();

    expect(JSON.stringify(avertissement.mock.calls)).not.toContain(evenement.titre);
    expect(JSON.stringify(avertissement.mock.calls)).not.toContain(jeton);
    expect(avertissement).toHaveBeenCalledWith("[sorties] envoi impossible", {
      raison: "delai_depasse",
    });
  });
});
