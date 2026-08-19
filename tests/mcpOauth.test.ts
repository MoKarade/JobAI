// tests/mcpOauth.test.ts — le contrôle qui empêche une prise de contrôle de compte.
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UN FINDING CRITIQUE DÉJÀ PAYÉ. FinanceAI avait livré
// `uri.startsWith("http://127.0.0.1")` pour valider un `redirect_uri` sur un endpoint
// d'enregistrement PUBLIC. Deux chaînes le traversaient, et elles sont testées ici nommément.
// Un test qui ne les contiendrait pas ne protégerait de rien : c'est précisément ce qu'un
// raisonnement « ça commence par l'adresse locale, donc c'est local » laisse passer.

import { describe, it, expect } from "vitest";
import {
  ACCES_TTL_MS,
  CODE_TTL_MS,
  empreinte,
  estProprietaire,
  expire,
  genererSecret,
  jugerRedirectUri,
  memeEmpreinte,
  metadonneesAutorisation,
  metadonneesRessource,
  redirectUriEnregistree,
  verifierPkceS256,
} from "../lib/mcp/oauth";
import { createHash } from "node:crypto";

describe("jugerRedirectUri — les deux chaînes qui ont traversé un `startsWith`", () => {
  it("REFUSE le sous-domaine : l'hôte réel n'est pas la boucle locale", () => {
    // `http://127.0.0.1.evil.com/cb` — un préfixe le lit comme local ; `new URL()` rend
    // hostname = « 127.0.0.1.evil.com », qui n'est pas « 127.0.0.1 ».
    expect(jugerRedirectUri("http://127.0.0.1.evil.com/cb")).toEqual({
      ok: false,
      motif: "http-hors-loopback",
    });
  });

  it("REFUSE la partie userinfo : tout ce qui précède l'arobase n'est pas un hôte", () => {
    // `http://127.0.0.1@evil.com/cb` — l'hôte réel est evil.com. C'est la forme la plus
    // vicieuse : elle RESSEMBLE à une adresse locale et n'en est pas une.
    expect(jugerRedirectUri("http://127.0.0.1@evil.com/cb")).toEqual({
      ok: false,
      motif: "userinfo-interdit",
    });
    expect(jugerRedirectUri("https://marc:mdp@exemple.test/cb").ok).toBe(false);
  });

  it("accepte ce qui doit l'être : https, et http SEULEMENT sur la boucle locale", () => {
    expect(jugerRedirectUri("https://claude.ai/api/mcp/auth_callback").ok).toBe(true);
    expect(jugerRedirectUri("http://127.0.0.1:6274/oauth/callback").ok).toBe(true);
    expect(jugerRedirectUri("http://localhost:3000/cb").ok).toBe(true);
  });

  it("REFUSE http ailleurs que sur la boucle locale — un code partirait en clair", () => {
    expect(jugerRedirectUri("http://exemple.test/cb")).toEqual({
      ok: false,
      motif: "http-hors-loopback",
    });
  });

  it("REFUSE un schéma exotique et une URL illisible", () => {
    expect(jugerRedirectUri("javascript:alert(1)").ok).toBe(false);
    expect(jugerRedirectUri("pas-une-url").ok).toBe(false);
  });

  it("REFUSE un fragment : il n'atteint jamais le serveur et casse la comparaison exacte", () => {
    expect(jugerRedirectUri("https://exemple.test/cb#x")).toEqual({
      ok: false,
      motif: "fragment-interdit",
    });
  });
});

describe("redirectUriEnregistree — comparaison EXACTE, jamais un préfixe", () => {
  const enregistrees = ["https://claude.ai/api/mcp/auth_callback"];

  it("accepte l'adresse enregistrée, telle quelle", () => {
    expect(redirectUriEnregistree("https://claude.ai/api/mcp/auth_callback", enregistrees)).toBe(true);
  });

  it("REFUSE une adresse qui commence pareil", () => {
    // C'est la moitié complémentaire du contrôle d'enregistrement : même une origine
    // légitime ne suffit pas, OAuth 2.1 exige l'adresse exacte.
    expect(redirectUriEnregistree("https://claude.ai/api/mcp/auth_callback/evil", enregistrees)).toBe(false);
    expect(redirectUriEnregistree("https://claude.ai/", enregistrees)).toBe(false);
  });
});

describe("PKCE — S256 seulement", () => {
  const verificateur = "a".repeat(64);
  const defi = createHash("sha256").update(verificateur).digest("base64url");

  it("accepte le vérificateur qui produit le défi", () => {
    expect(verifierPkceS256(verificateur, defi)).toBe(true);
  });

  it("REFUSE un vérificateur qui ne le produit pas", () => {
    expect(verifierPkceS256("b".repeat(64), defi)).toBe(false);
  });

  it("REFUSE le mode `plain` déguisé : le vérificateur n'est pas le défi", () => {
    // Si on acceptait `plain`, le défi vaudrait le vérificateur et PKCE ne protégerait rien.
    expect(verifierPkceS256(verificateur, verificateur)).toBe(false);
  });

  it("REFUSE un vérificateur hors des bornes de la RFC", () => {
    expect(verifierPkceS256("court", defi)).toBe(false);
    expect(verifierPkceS256("a".repeat(200), defi)).toBe(false);
  });
});

describe("secrets et empreintes", () => {
  it("ne rend jamais deux fois le même secret", () => {
    expect(genererSecret()).not.toBe(genererSecret());
  });

  it("l'empreinte ne permet pas de retrouver le secret", () => {
    const s = genererSecret();
    expect(empreinte(s)).not.toContain(s);
    expect(empreinte(s)).toBe(empreinte(s));
  });

  it("compare deux empreintes sans fuir par la longueur", () => {
    expect(memeEmpreinte(empreinte("a"), empreinte("a"))).toBe(true);
    expect(memeEmpreinte(empreinte("a"), empreinte("b"))).toBe(false);
    expect(memeEmpreinte("court", "beaucoup-plus-long")).toBe(false);
  });
});

describe("estProprietaire — vérifié à l'USAGE, pas seulement à l'émission", () => {
  it("reconnaît l'adresse autorisée quelle que soit la casse", () => {
    expect(estProprietaire("Marc@Exemple.test", "marc@exemple.test")).toBe(true);
  });

  it("REFUSE tout autre compte, et refuse en ÉCHEC FERMÉ si rien n'est configuré", () => {
    // Sans `AUTHORIZED_EMAIL`, on ne laisse pas passer « faute de règle » : on refuse.
    expect(estProprietaire("autre@exemple.test", "marc@exemple.test")).toBe(false);
    expect(estProprietaire("marc@exemple.test", "")).toBe(false);
    expect(estProprietaire(null, "marc@exemple.test")).toBe(false);
    expect(estProprietaire(undefined, "marc@exemple.test")).toBe(false);
  });
});

describe("expiration — le « maintenant » est un paramètre", () => {
  it("compare à l'instant fourni, jamais à une horloge lue", () => {
    const t = new Date("2026-08-19T12:00:00.000Z");
    expect(expire(new Date("2026-08-19T11:59:59.000Z"), t)).toBe(true);
    expect(expire(new Date("2026-08-19T12:00:01.000Z"), t)).toBe(false);
  });

  it("un code vit moins longtemps qu'un jeton d'accès", () => {
    // Un code ne fait que traverser un navigateur ; le garder longtemps agrandit la fenêtre
    // pendant laquelle un code intercepté vaut quelque chose.
    expect(CODE_TTL_MS).toBeLessThan(ACCES_TTL_MS);
  });
});

describe("métadonnées — sans elles, claude.ai refuse de se connecter", () => {
  it("annonce S256 SEULEMENT", () => {
    // Annoncer `plain` inviterait un client à s'en servir, et PKCE ne protégerait plus rien.
    const m = metadonneesAutorisation("https://emploi.exemple.test");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("fait pointer chaque endpoint sur l'origine réelle", () => {
    const m = metadonneesAutorisation("https://emploi.exemple.test");
    expect(m.authorization_endpoint).toBe("https://emploi.exemple.test/oauth/authorize");
    expect(m.token_endpoint).toBe("https://emploi.exemple.test/oauth/token");
    expect(m.registration_endpoint).toBe("https://emploi.exemple.test/oauth/register");
  });

  it("désigne la ressource protégée et son serveur d'autorisation", () => {
    const r = metadonneesRessource("https://emploi.exemple.test");
    expect(r.resource).toBe("https://emploi.exemple.test/api/mcp");
    expect(r.authorization_servers).toEqual(["https://emploi.exemple.test"]);
  });
});
