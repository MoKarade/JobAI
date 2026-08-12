// tests/cronAuth.test.ts — la garde partagée des deux routes cron.
//
// Extraite le 2026-08-12 ([CARTE-02]) pour que `cron/veille` et `cron/geocodage` ne puissent
// jamais diverger sur cette vérification — voir lib/cronAuth.ts.

import { afterEach, describe, expect, it } from "vitest";
import { autoriserCron, memeSecret } from "../lib/cronAuth";

const ANCIEN_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  if (ANCIEN_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ANCIEN_SECRET;
});

function requeteAvec(autorisation: string | null): Request {
  const en_tetes = new Headers();
  if (autorisation !== null) en_tetes.set("authorization", autorisation);
  return new Request("https://exemple.test/api/cron/quelconque", { headers: en_tetes });
}

describe("memeSecret", () => {
  it("accepte deux chaînes identiques", () => {
    expect(memeSecret("abc", "abc")).toBe(true);
  });

  it("refuse deux chaînes différentes, même de longueur différente", () => {
    expect(memeSecret("abc", "abcd")).toBe(false);
    expect(memeSecret("abc", "xyz")).toBe(false);
  });
});

describe("autoriserCron", () => {
  it("503 quand CRON_SECRET est absent — échec fermé", async () => {
    delete process.env.CRON_SECRET;
    const refus = autoriserCron(requeteAvec("Bearer quelconque"));
    expect(refus).not.toBeNull();
    expect(refus?.status).toBe(503);
    const corps = await refus?.json();
    expect(corps.ok).toBe(false);
  });

  it("503 quand CRON_SECRET est une chaîne vide — pas de contournement par une valeur creuse", async () => {
    process.env.CRON_SECRET = "   ";
    const refus = autoriserCron(requeteAvec("Bearer   "));
    expect(refus?.status).toBe(503);
  });

  it("401 quand le secret fourni est faux", () => {
    process.env.CRON_SECRET = "le-vrai-secret";
    const refus = autoriserCron(requeteAvec("Bearer un-mauvais-secret"));
    expect(refus?.status).toBe(401);
  });

  it("401 quand aucun en-tête d'autorisation n'est fourni", () => {
    process.env.CRON_SECRET = "le-vrai-secret";
    const refus = autoriserCron(requeteAvec(null));
    expect(refus?.status).toBe(401);
  });

  it("laisse passer (rend null) quand le secret est le bon", () => {
    process.env.CRON_SECRET = "le-vrai-secret";
    const refus = autoriserCron(requeteAvec("Bearer le-vrai-secret"));
    expect(refus).toBeNull();
  });

  it("chaque réponse de refus porte Cache-Control: no-store", async () => {
    delete process.env.CRON_SECRET;
    const r1 = autoriserCron(requeteAvec(null));
    expect(r1?.headers.get("Cache-Control")).toBe("no-store");

    process.env.CRON_SECRET = "x";
    const r2 = autoriserCron(requeteAvec("Bearer mauvais"));
    expect(r2?.headers.get("Cache-Control")).toBe("no-store");
  });
});
