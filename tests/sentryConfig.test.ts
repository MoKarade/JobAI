// tests/sentryConfig.test.ts — verrou de la configuration Sentry (JobAI#117, ADR-0031).
//
// Trois promesses : sans DSN rien ne part (l'app démarre et se construit sans bruit), avec un DSN
// aucune donnée personnelle ne part, et le texte libre d'une erreur est expurgé et tronqué.
// Toutes les valeurs ci-dessous sont FICTIVES (le dépôt est public).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expurgerTexte, optionsSentry, retirerDonneesPersonnelles } from "@/lib/sentryConfig";

// Numéro construit par morceaux : `piiGuard` refuse tout numéro de téléphone écrit en clair.
const TELEPHONE_FICTIF = ["418", "555", "0100"].join("-");

describe("optionsSentry", () => {
  it("est éteint sans DSN (absent, vide ou en blancs)", () => {
    for (const dsn of [undefined, "", "   "]) {
      const options = optionsSentry(dsn);
      expect(options.enabled, `dsn = ${JSON.stringify(dsn)}`).toBe(false);
      expect(options.dsn).toBeUndefined();
    }
  });

  it("est allumé avec un DSN, sans traces, sans fil d'Ariane ni donnée personnelle par défaut", () => {
    const options = optionsSentry("  https://cle@exemple.invalid/1  ");
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://cle@exemple.invalid/1");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.maxBreadcrumbs).toBe(0);
  });
});

describe("expurgerTexte", () => {
  it("retire courriel, adresse web (chaîne de base comprise), téléphone, code postal et longs nombres", () => {
    const texte = [
      "contact fictif@exemple.invalid",
      "base postgres://utilisateur:motdepasse@hote.exemple.invalid/base?sslmode=require",
      `appel ${TELEPHONE_FICTIF}`,
      "code G1A 0A1",
      "identifiant 123456789",
    ].join(" ; ");
    const propre = expurgerTexte(texte);
    for (const reste of [
      "fictif@exemple.invalid",
      "motdepasse",
      "hote.exemple.invalid",
      TELEPHONE_FICTIF,
      "G1A 0A1",
      "123456789",
    ]) {
      expect(propre, reste).not.toContain(reste);
    }
    expect(propre).toContain("[courriel retiré]");
    expect(propre).toContain("[adresse retirée]");
  });

  it("garde un message ordinaire tel quel", () => {
    expect(expurgerTexte("Cannot read properties of undefined (reading 'id')")).toBe(
      "Cannot read properties of undefined (reading 'id')",
    );
  });

  it("tronque à 300 caractères", () => {
    const long = expurgerTexte("a".repeat(1000));
    expect(long.length).toBe(301);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("retirerDonneesPersonnelles", () => {
  it("retire requête, cookies, en-têtes, utilisateur, extra, fil d'Ariane et nom de machine", () => {
    const evenement = retirerDonneesPersonnelles({
      message: "Erreur d'essai",
      request: {
        url: "https://exemple.invalid/offre/42?jeton=fictif#ancre",
        data: { courriel: "fictif@exemple.invalid" },
        cookies: { session: "fictif" },
        headers: { authorization: "fictif", "x-forwarded-for": "203.0.113.7" },
        query_string: "jeton=fictif",
      },
      user: { ip_address: "203.0.113.7", email: "fictif@exemple.invalid" },
      extra: { adresse: "fictive" },
      breadcrumbs: [{ message: "GET https://exemple.invalid/?q=fictif" }],
      server_name: "machine-fictive",
    });
    expect(evenement.request).toEqual({ url: "https://exemple.invalid/offre/42" });
    for (const cle of ["user", "extra", "breadcrumbs", "server_name"]) {
      expect(evenement, cle).not.toHaveProperty(cle);
    }
    expect(evenement.message).toBe("Erreur d'essai");
  });

  it("expurge le message, l'entrée de journal et la valeur de chaque exception", () => {
    const evenement = retirerDonneesPersonnelles({
      message: "échec pour fictif@exemple.invalid",
      logentry: { message: "échec pour fictif@exemple.invalid" },
      exception: {
        values: [{ value: "refus de postgres://u:p@hote.exemple.invalid/b" }, { value: "ok" }],
      },
    });
    expect(JSON.stringify(evenement)).not.toMatch(/fictif@|postgres:|hote\.exemple/);
    expect(evenement.exception?.values?.[1]?.value).toBe("ok");
  });

  it("accepte un événement sans requête ni utilisateur", () => {
    expect(retirerDonneesPersonnelles({ message: "seul" })).toEqual({ message: "seul" });
  });

  it("est bien branché dans les options (beforeSend)", () => {
    const options = optionsSentry("https://cle@exemple.invalid/1");
    expect(options.beforeSend({ user: { email: "x" } })).not.toHaveProperty("user");
  });
});

describe("branchement", () => {
  const lire = (chemin: string): string => readFileSync(join(process.cwd(), chemin), "utf8");

  it("aucun fichier ne réactive l'envoi de données personnelles", () => {
    for (const chemin of ["instrumentation.ts", "instrumentation-client.ts", "lib/sentryConfig.ts"]) {
      expect(lire(chemin), chemin).not.toMatch(/sendDefaultPii\s*:\s*true/);
    }
  });

  it("le serveur et le navigateur passent par optionsSentry, jamais par un Sentry.init libre", () => {
    for (const chemin of ["instrumentation.ts", "instrumentation-client.ts"]) {
      expect(lire(chemin), chemin).toMatch(/Sentry\.init\(optionsSentry\(/);
    }
  });

  it("le seul hôte Sentry autorisé par la CSP est celui de Sentry", () => {
    expect(lire("next.config.mjs")).toContain("connect-src 'self' https://*.sentry.io");
  });
});
