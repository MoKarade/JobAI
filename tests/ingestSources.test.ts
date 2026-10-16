// tests/ingestSources.test.ts — le récupérateur réel des sources d'offres (lib/ingest/sources.ts).
//
// C'est le SEUL fichier qui contacte une source (garde-fou n°4) : il s'identifie, borne sa
// durée, et ne laisse jamais passer une réponse d'erreur pour un contenu. Le réseau est la
// frontière : `fetch` est remplacé, le récupérateur lui-même s'exécute pour de vrai.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELAI_MAX_MS, entetes, recuperer } from "../lib/ingest/sources";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("entetes", () => {
  it("se présente honnêtement plutôt qu'en navigateur ou en anonyme", () => {
    const h = entetes();
    expect(h["User-Agent"]).toMatch(/^JobAI\/\d/);
    expect(h["User-Agent"]).not.toMatch(/mozilla|chrome|safari/i);
  });

  it("ne porte aucune coordonnée personnelle (le dépôt est public)", () => {
    const texte = JSON.stringify(entetes());
    expect(texte).not.toMatch(/@/);
    expect(texte).toContain("github.com/MoKarade/JobAI");
  });
});

describe("recuperer", () => {
  const reponse = (corps: string, statut = 200) => new Response(corps, { status: statut });

  it("rend le corps de la réponse et appelle la source sans cache, avec son identité", async () => {
    const fetchSimule = vi.fn(async () => reponse("<flux>ok</flux>"));
    vi.stubGlobal("fetch", fetchSimule);

    const corps = await recuperer("https://exemple.invalide/flux.xml", { "X-Test": "1" });

    expect(corps).toBe("<flux>ok</flux>");
    expect(fetchSimule).toHaveBeenCalledTimes(1);
    const appel = fetchSimule.mock.calls[0] as unknown as [string, RequestInit];
    expect(appel[0]).toBe("https://exemple.invalide/flux.xml");
    expect(appel[1].cache).toBe("no-store");
    const h = appel[1].headers as Record<string, string>;
    expect(h["User-Agent"]).toBe(entetes()["User-Agent"]);
    expect(h["X-Test"]).toBe("1");
  });

  it("les en-têtes de l'appelant l'emportent sur ceux par défaut", async () => {
    const fetchSimule = vi.fn(async () => reponse("x"));
    vi.stubGlobal("fetch", fetchSimule);
    await recuperer("https://exemple.invalide/", { Accept: "application/xml" });
    const appel = fetchSimule.mock.calls[0] as unknown as [string, RequestInit];
    expect((appel[1].headers as Record<string, string>).Accept).toBe("application/xml");
  });

  it.each([404, 429, 503])("lève sur un HTTP %i : une erreur n'est jamais un contenu", async (statut) => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse("<html>erreur</html>", statut)));
    await expect(recuperer("https://exemple.invalide/")).rejects.toThrow(`HTTP ${statut}`);
  });

  it("laisse remonter une panne réseau telle quelle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(recuperer("https://exemple.invalide/")).rejects.toThrow("fetch failed");
  });

  describe("délai maximal", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it(`coupe une source qui ne répond pas après ${DELAI_MAX_MS} ms`, async () => {
      // Un fetch qui ne finit jamais, sauf si le signal d'annulation tombe.
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init: RequestInit) =>
          new Promise((_resolve, rejeter) => {
            init.signal?.addEventListener("abort", () => rejeter(new Error("annulé")));
          }),
        ),
      );
      const attendu = expect(recuperer("https://exemple.invalide/")).rejects.toThrow("annulé");
      await vi.advanceTimersByTimeAsync(DELAI_MAX_MS - 1);
      await vi.advanceTimersByTimeAsync(1);
      await attendu;
    });

    it("ne coupe pas avant le délai", async () => {
      let annule = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          init.signal?.addEventListener("abort", () => { annule = true; });
          return reponse("à temps");
        }),
      );
      await expect(recuperer("https://exemple.invalide/")).resolves.toBe("à temps");
      await vi.advanceTimersByTimeAsync(DELAI_MAX_MS * 2);
      // Le minuteur est nettoyé dès la réponse : il ne tire pas après coup.
      expect(annule).toBe(false);
    });
  });
});
