// tests/sondeGuichet.test.ts — la sonde ne doit pas retomber dans le piège qu'elle corrige.
//
// Elle existe parce qu'une question a reçu trois réponses le 2026-08-17 sans être mesurée
// une seule fois. Le pire résultat qu'elle puisse produire n'est pas une erreur : c'est un
// « HTTP 200 » rassurant sur une page qui a redirigé vers l'accueil et ne porte aucune
// offre — exactement ce que Marc a vu à l'écran en ouvrant le premier lien proposé.

import { describe, it, expect } from "vitest";
import { adressesCandidates, sonderGuichet, DELAI_SONDE_MS } from "@/lib/ingest/sondeGuichet";

describe("adressesCandidates — ce qu'on éprouve, et dans quel ordre", () => {
  it("commence par des TÉMOINS de joignabilité", () => {
    const a = adressesCandidates("automatisation");
    // Si l'accueil lui-même ne répond pas, tout le reste est du bruit : « le flux est mort »
    // et « l'hôte est injoignable » sont deux conclusions opposées, et seule la première
    // justifierait d'abandonner la source.
    expect(a[0]).toMatch(/jobbank\.gc\.ca\/home$/);
    expect(a[1]).toMatch(/guichetemplois\.gc\.ca\/accueil$/);
  });

  it("éprouve l'adresse historique, celle qui avait fait éteindre la source", () => {
    const a = adressesCandidates("automatisation");
    expect(a.some((u) => u.includes("/jobsearch/rss?"))).toBe(true);
  });

  it("encode le terme, sans quoi un terme à espaces ou à accent fabriquerait une URL fausse", () => {
    const a = adressesCandidates("chargé de projet");
    const avecTerme = a.filter((u) => u.includes("searchstring="));
    expect(avecTerme.length).toBeGreaterThan(0);
    for (const u of avecTerme) {
      expect(u).not.toContain(" ");
      expect(() => new URL(u)).not.toThrow();
    }
  });

  it("ne vise que les deux domaines officiels — jamais un tiers", () => {
    for (const u of adressesCandidates("test")) {
      expect(new URL(u).hostname).toMatch(/^www\.(jobbank|guichetemplois)\.gc\.ca$/);
    }
  });
});

describe("sonderGuichet — le budget se dit, il ne se tait pas", () => {
  const horloge = (valeurs: number[]) => {
    let i = 0;
    return () => valeurs[Math.min(i++, valeurs.length - 1)]!;
  };

  // ⚠️ UNE LISTE TRONQUÉE EN SILENCE SE LIT COMME UNE LISTE COMPLÈTE. C'est la faute que
  // cette sonde existe pour ne plus commettre : si le budget coupe, elle doit NOMMER ce
  // qu'elle n'a pas essayé, sinon on conclurait « aucune adresse ne répond » d'un test
  // qui n'a jamais eu lieu.
  it("rend les adresses NON ESSAYÉES quand le budget ne suffit pas", async () => {
    // Le temps est déjà au-delà de ce que le premier essai coûterait.
    const r = await sonderGuichet("test", 0, horloge([0, 0, 0]), async () => {});
    expect(r.verdicts).toEqual([]);
    expect(r.nonEssayees).toEqual(adressesCandidates("test"));
  });

  it("ne lance jamais un essai qu'il ne peut pas payer", async () => {
    // Budget juste sous le coût d'un essai : rien ne part, et tout est déclaré non essayé.
    const r = await sonderGuichet("test", DELAI_SONDE_MS - 1, horloge([0]), async () => {});
    expect(r.verdicts).toHaveLength(0);
    expect(r.nonEssayees.length).toBe(adressesCandidates("test").length);
  });
});
