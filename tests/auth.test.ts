// tests/auth.test.ts — le contrôle d'accès, en fonctions pures.
//
// C'est le seul rempart entre le monde et les données personnelles de Marc. Un middleware
// Next ne se teste pas facilement ; c'est précisément pour ça que la décision vit dans des
// fonctions pures, et qu'elles sont couvertes exhaustivement ici.

import { describe, it, expect } from "vitest";
import { estEmailAutorise, estAuthConfiguree } from "../lib/autorisation";
import { estCheminPublic, deciderGarde } from "../lib/garde";

describe("adresse autorisée", () => {
  it("accepte exactement l'adresse admise", () => {
    expect(estEmailAutorise("marc@exemple.test", "marc@exemple.test")).toBe(true);
  });

  it("ignore la casse et les espaces autour", () => {
    expect(estEmailAutorise("  Marc@Exemple.TEST ", "marc@exemple.test")).toBe(true);
  });

  it("refuse toute autre adresse", () => {
    expect(estEmailAutorise("autre@exemple.test", "marc@exemple.test")).toBe(false);
    // Un préfixe ou un suffixe ne suffit pas : la comparaison est exacte.
    expect(estEmailAutorise("marc@exemple.test.evil.com", "marc@exemple.test")).toBe(false);
    expect(estEmailAutorise("xmarc@exemple.test", "marc@exemple.test")).toBe(false);
  });

  it("ÉCHOUE FERMÉ quand une valeur manque", () => {
    // Le cas dangereux : AUTHORIZED_EMAIL non configuré en production. Sans cette garde,
    // deux chaînes vides seraient « égales » et laisseraient entrer n'importe qui.
    expect(estEmailAutorise("", "")).toBe(false);
    expect(estEmailAutorise("marc@exemple.test", "")).toBe(false);
    expect(estEmailAutorise("marc@exemple.test", undefined)).toBe(false);
    expect(estEmailAutorise(null, "marc@exemple.test")).toBe(false);
    expect(estEmailAutorise(undefined, undefined)).toBe(false);
    expect(estEmailAutorise("   ", "   ")).toBe(false);
  });
});

describe("configuration de l'authentification", () => {
  it("exige les deux variables, non vides", () => {
    expect(estAuthConfiguree({ AUTH_SECRET: "s", AUTHORIZED_EMAIL: "a@b.c" })).toBe(true);
    expect(estAuthConfiguree({ AUTH_SECRET: "s" })).toBe(false);
    expect(estAuthConfiguree({ AUTHORIZED_EMAIL: "a@b.c" })).toBe(false);
    expect(estAuthConfiguree({})).toBe(false);
    // Une variable posée mais vide est le piège classique d'un déploiement à moitié fait.
    expect(estAuthConfiguree({ AUTH_SECRET: "  ", AUTHORIZED_EMAIL: "a@b.c" })).toBe(false);
  });
});

describe("chemins publics", () => {
  it("laisse passer la connexion et les routes d'Auth.js", () => {
    expect(estCheminPublic("/connexion")).toBe(true);
    expect(estCheminPublic("/api/auth/callback/google")).toBe(true);
  });

  it("laisse passer l'endpoint du hub — c'est le jeton qui le garde", () => {
    // ⚠️ LE test à ne pas casser. Sans cette exception, le hub reçoit une redirection HTML
    // vers la page de connexion au lieu du JSON attendu, et son widget affiche
    // « injoignable » en permanence — sans que rien ne paraisse cassé côté app.
    expect(estCheminPublic("/api/hub/summary")).toBe(true);
  });

  it("laisse passer les assets", () => {
    expect(estCheminPublic("/_next/static/chunk.js")).toBe(true);
    expect(estCheminPublic("/favicon.ico")).toBe(true);
    expect(estCheminPublic("/icon.svg")).toBe(true);
  });

  it("garde TOUT le reste, y compris les pages de données", () => {
    for (const chemin of ["/", "/offres", "/api/offres", "/api/hub", "/api/hub/autre"]) {
      expect(estCheminPublic(chemin), `chemin ${chemin}`).toBe(false);
    }
  });

  it("ne se laisse pas contourner par un chemin qui ressemble à une exception", () => {
    // Un attaquant qui devine la liste blanche essaiera ces variantes.
    for (const chemin of [
      "/api/hub/summary/secret",
      "/api/hub/summaryX",
      "/connexionX",
      "/api/authx/token",
    ]) {
      expect(estCheminPublic(chemin), `chemin ${chemin}`).toBe(false);
    }
  });
});

describe("décision de garde", () => {
  it("laisse passer un utilisateur authentifié", () => {
    expect(deciderGarde({ authentifie: true, chemin: "/offres" })).toEqual({
      type: "laisser-passer",
    });
  });

  it("répond 401 sur une route machine, jamais une redirection", () => {
    // Un appelant machine ne suit pas une redirection vers un écran de connexion : il
    // reçoit du HTML là où il attend du JSON, et lit ça comme une panne.
    expect(deciderGarde({ authentifie: false, chemin: "/api/offres" })).toEqual({
      type: "non-authentifie",
    });
  });

  it("redirige une page vers la connexion, en mémorisant la destination", () => {
    const d = deciderGarde({ authentifie: false, chemin: "/offres", recherche: "?f=top" });
    expect(d.type).toBe("rediriger");
    if (d.type === "rediriger") {
      expect(d.vers).toBe("/connexion?retour=%2Foffres%3Ff%3Dtop");
    }
  });

  it("laisse passer l'endpoint du hub même sans session", () => {
    expect(deciderGarde({ authentifie: false, chemin: "/api/hub/summary" })).toEqual({
      type: "laisser-passer",
    });
  });

  it("ne laisse AUCUNE route de données passer sans session", () => {
    for (const chemin of ["/", "/offres", "/api/offres", "/api/ingest"]) {
      const d = deciderGarde({ authentifie: false, chemin });
      expect(d.type, `chemin ${chemin}`).not.toBe("laisser-passer");
    }
  });
});
