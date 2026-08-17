// tests/sondeGuichet.test.ts — la sonde ne doit pas retomber dans le piège qu'elle corrige.
//
// Elle existe parce qu'une question a reçu trois réponses le 2026-08-17 sans être mesurée
// une seule fois. Le pire résultat qu'elle puisse produire n'est pas une erreur : c'est un
// « HTTP 200 » rassurant sur une page qui a redirigé vers l'accueil et ne porte aucune
// offre — exactement ce que Marc a vu à l'écran en ouvrant le premier lien proposé.

import { describe, it, expect } from "vitest";
import {
  adressesCandidates,
  sonderGuichet,
  fluxDeclares,
  DELAI_SONDE_MS,
} from "@/lib/ingest/sondeGuichet";
import { BUDGET_SONDE_MS } from "@/lib/synchro";

describe("adressesCandidates — ce qu'on éprouve, et dans quel ordre", () => {
  it("commence par un TÉMOIN de joignabilité", () => {
    const a = adressesCandidates("automatisation");
    // Si l'accueil lui-même ne répond pas, tout le reste est du bruit : « le flux est mort »
    // et « l'hôte est injoignable » sont deux conclusions opposées, et seule la première
    // justifierait d'abandonner la source.
    expect(a[0]).toMatch(/jobbank\.gc\.ca\/home$/);
  });

  // ⚠️ LE PIRE CAS SE COMPTE PAR HÔTE, PAS SUR LA LISTE ENTIÈRE. La sonde interroge les
  // domaines en parallèle et reste en série chez chacun : ce qui la borne est donc la file
  // du domaine le plus chargé. Dix-huit adresses en série dépasseraient le mur de 60 s de la
  // fonction, et la sonde mourrait sans rien rapporter — ce qui se lirait comme « le site ne
  // répond pas ». Le test dérive la borne du budget et du délai, jamais d'un chiffre écrit.
  it("aucun hôte ne porte plus d'adresses que le budget ne peut en payer", () => {
    const parHote = new Map<string, number>();
    for (const u of adressesCandidates("automatisation")) {
      const h = new URL(u).hostname;
      parHote.set(h, (parHote.get(h) ?? 0) + 1);
    }
    const pire = Math.max(...parHote.values());
    expect(pire * DELAI_SONDE_MS).toBeLessThan(BUDGET_SONDE_MS);
  });

  it("couvre plusieurs sites, pas seulement le Guichet-Emplois", () => {
    const hotes = new Set(adressesCandidates("test").map((u) => new URL(u).hostname));
    expect(hotes.size).toBeGreaterThan(8);
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

  // La sonde ne RETIENT rien : elle mesure. Mais elle ne doit viser que des sites d'emploi
  // publics, jamais une adresse arbitraire — c'est du trafic sortant au nom de Marc.
  it("ne vise que des sites d'emploi, en HTTPS", () => {
    for (const u of adressesCandidates("test")) {
      const url = new URL(u);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toMatch(
        /(jobbank|guichetemplois|jobboom|jobillico|quebecemploi|espresso-jobs|isarta|grenier|jobsquebec|quebecentete|ville\.quebec|carrieres\.gouv|ulaval|indeed|careerjet)/,
      );
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

describe("fluxDeclares — demander à la page au lieu de deviner", () => {
  const base = "https://www.guichetemplois.gc.ca/accueil";

  it("trouve un flux déclaré et le rend ABSOLU", () => {
    const html = `<head><link rel="alternate" type="application/rss+xml" href="/jobsearch/rss?x=1"></head>`;
    expect(fluxDeclares(html, base)).toEqual([
      "https://www.guichetemplois.gc.ca/jobsearch/rss?x=1",
    ]);
  });

  // ⚠️ L'ORDRE DES ATTRIBUTS EST LIBRE EN HTML. Un motif qui exigerait `type` avant `href`
  // raterait la moitié des pages — et ne le dirait pas, ce qui ferait conclure « aucun flux
  // déclaré » d'un scan qui n'a jamais regardé au bon endroit.
  it("lit la balise quel que soit l'ordre des attributs", () => {
    const html = `<link href="/a.xml" rel="alternate" type="application/rss+xml">`;
    expect(fluxDeclares(html, base)).toEqual(["https://www.guichetemplois.gc.ca/a.xml"]);
  });

  it("accepte Atom autant que RSS, et dédoublonne", () => {
    const html =
      `<link type="application/atom+xml" href="/a.xml">` +
      `<link type="application/rss+xml" href="/a.xml">`;
    expect(fluxDeclares(html, base)).toHaveLength(1);
  });

  it("ignore les feuilles de style et les icônes — seul le type compte", () => {
    const html = `<link rel="stylesheet" href="/x.css"><link rel="icon" href="/f.ico">`;
    expect(fluxDeclares(html, base)).toEqual([]);
  });

  // Le silence est une RÉPONSE : « la page n'annonce aucun flux » se distingue de « je n'ai
  // pas regardé ». Sans ce cas, un tableau vide pourrait venir d'un scan cassé.
  it("rend un tableau vide sur une page sans flux, sans lever", () => {
    expect(fluxDeclares("<html><head><title>rien</title></head></html>", base)).toEqual([]);
    expect(() => fluxDeclares("", base)).not.toThrow();
  });

  it("ne plante pas sur un href illisible", () => {
    const html = `<link type="application/rss+xml" href="ht!tp://%%%">`;
    expect(() => fluxDeclares(html, base)).not.toThrow();
  });
});
