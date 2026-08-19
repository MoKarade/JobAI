// tests/routesGardees.test.ts — toute page qui affiche des données reste derrière la garde.
//
// Le garde-fou n°5 dit « échec fermé ». Le danger n'est pas la route d'aujourd'hui, qu'on
// vérifie en l'écrivant : c'est la SIXIÈME, ajoutée dans six semaines, dont personne ne se
// demandera si elle est gardée — parce que les cinq précédentes l'étaient.
//
// Ce test ne vérifie donc pas une liste écrite à la main : il DÉCOUVRE les routes depuis
// l'arborescence `app/` et exige que chacune soit gardée, sauf celles explicitement
// exemptées ici avec leur raison. Une nouvelle page non exemptée fait échouer le test tant
// qu'on n'a pas tranché son cas.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { deciderGarde, estCheminPublic } from "../lib/garde";

/**
 * Exemptions, chacune avec son motif. Une exemption sans motif finit par être copiée
 * « parce que l'autre y était ».
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {
  "/connexion": "C'est l'écran de connexion : le garder derrière la garde serait circulaire.",
  "/api/hub/summary":
    "Gardée AUTREMENT — par le jeton x-hub-token vérifié dans la route. La mettre derrière " +
    "la garde de session renverrait au hub une redirection HTML au lieu du JSON attendu.",
  "/api/auth/[...nextauth]": "Routes d'Auth.js : elles portent le flux de connexion lui-même.",
  "/api/ingest/depot":
    "Gardée AUTREMENT — par INGEST_TOKEN, comparé en temps constant, échec fermé (503 " +
    "sans secret, 401 si faux). C'est le point de dépôt d'une Routine, qui a le connecteur " +
    "Indeed mais aucun accès au dépôt GitHub ni session Google : la garde de session lui " +
    "renverrait une redirection HTML au lieu du JSON attendu.",
  "/api/cron/veille":
    "Gardée AUTREMENT — par CRON_SECRET, comparé en temps constant dans la route, avec " +
    "échec fermé : 503 si le secret n'est pas configuré, 401 s'il est faux. Derrière la " +
    "garde de session, l'appel quotidien de Vercel recevrait une redirection HTML et la " +
    "veille ne tournerait jamais, sans qu'aucune alerte ne se déclenche.",
  "/api/mcp":
    "Gardée AUTREMENT — par MCP_TOKEN, comparé en temps constant, échec fermé (503 sans " +
    "secret, 401 si faux), en attendant OAuth 2.1 (ADR-0011, lot 3). Un client MCP n'a " +
    "aucune session Google : derrière la garde de session il recevrait une redirection " +
    "HTML au lieu du JSON-RPC attendu, et le connecteur serait muet sans erreur.",
  "/api/cron/geocodage":
    "Même famille que /api/cron/veille, même CRON_SECRET (lib/cronAuth.ts) : une seconde " +
    "passe de géocodage quotidienne, à une autre heure ([CARTE-03], 2026-08-12).",
};

/** Parcourt `app/` et rend la route de chaque `page.tsx` / `route.ts`. */
function routesDeLApp(): string[] {
  const racine = resolve(process.cwd(), "app");
  const routes: string[] = [];

  function descendre(dossier: string, prefixe: string) {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      if (entree.isDirectory()) {
        // Les groupes `(nom)` ne participent pas à l'URL ; les dossiers privés `_nom` non plus.
        const segment = /^\(.*\)$/.test(entree.name) || entree.name.startsWith("_")
          ? ""
          : `/${entree.name}`;
        descendre(resolve(dossier, entree.name), `${prefixe}${segment}`);
      } else if (entree.name === "page.tsx" || entree.name === "route.ts") {
        routes.push(prefixe === "" ? "/" : prefixe);
      }
    }
  }

  descendre(racine, "");
  return [...new Set(routes)].sort();
}

const ROUTES = routesDeLApp();

/** Un chemin concret pour une route à segment dynamique — `estCheminPublic` lit du réel. */
function chemin(route: string): string {
  return route.replace(/\[\.\.\.[^\]]+\]/g, "valeur").replace(/\[[^\]]+\]/g, "valeur");
}

describe("le scan trouve bien des routes", () => {
  it("découvre l'arborescence, au lieu de passer à vide", () => {
    // Sans cette assertion, un mauvais chemin de départ rendrait zéro route : aucune
    // route non gardée, donc tout vert. C'est le premier piège d'un test-garde.
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
    expect(ROUTES).toContain("/");
    expect(ROUTES).toContain("/connexion");
    expect(ROUTES).toContain("/api/hub/summary");
  });

  it("voit les routes ajoutées récemment", () => {
    // Si ces deux-là disparaissent du scan, c'est que la découverte s'est cassée.
    expect(ROUTES).toContain("/references");
    expect(ROUTES).toContain("/offre/[id]");
  });
});

describe("garde-fou n°5 — aucune page de données ouverte", () => {
  for (const route of ROUTES) {
    const motif = EXEMPTIONS[route];

    if (motif) {
      it(`« ${route} » est exemptée, et sait pourquoi`, () => {
        expect(motif.length).toBeGreaterThan(20);
        expect(estCheminPublic(chemin(route))).toBe(true);
      });
      continue;
    }

    it(`« ${route} » exige une session`, () => {
      expect(estCheminPublic(chemin(route)), `${route} est publique`).toBe(false);
      const decision = deciderGarde({ authentifie: false, chemin: chemin(route) });
      expect(decision.type, `${route} laisse passer un visiteur non authentifié`).not.toBe(
        "laisser-passer",
      );
    });
  }
});

describe("les contournements ne passent pas", () => {
  it("un chemin qui RESSEMBLE à l'endpoint du hub reste gardé", () => {
    for (const faux of [
      "/api/hub/summaryX",
      "/api/hub/summary/secret",
      "/api/hub",
      "/references/secret",
    ]) {
      expect(estCheminPublic(faux), `${faux} est ouvert`).toBe(false);
    }
  });

  it("une route /api non authentifiée reçoit 401, jamais une redirection HTML", () => {
    // Un appelant machine ne suit pas une redirection : il reçoit du HTML là où il attend
    // du JSON, et le lit comme une panne de l'app.
    expect(deciderGarde({ authentifie: false, chemin: "/api/quelque-chose" }).type).toBe(
      "non-authentifie",
    );
  });
  // INSTALLABILITÉ (PWA, 2026-08-12). Ces chemins DOIVENT rester accessibles sans session,
  // sinon l'app cesse d'être installable — en silence, sans erreur nulle part. Le navigateur
  // récupère le manifeste SANS cookies : derrière la garde, il recevrait la redirection vers
  // /connexion. Chromium exige en plus `/sw.js` pour proposer l'installation.
  //
  // ⚠️ Le scan ci-dessus ne les voit PAS : il ne découvre que `page.tsx` et `route.ts`, or
  // `/manifest.webmanifest` vient d'une route de MÉTADONNÉES (`app/manifest.ts`) et les
  // icônes sont des fichiers statiques. D'où ce verrou écrit à la main.
  //
  // Aucun de ces fichiers ne porte de donnée — ni offre, ni adresse, ni statut migratoire.
  // La règle « ne jamais ouvrir une route qui affiche des données » reste entière, et les
  // deux assertions de fin le vérifient.
  it("laisse passer les fichiers requis pour l'installation, et RIEN de plus", () => {
    for (const chemin of [
      "/manifest.webmanifest",
      "/sw.js",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      "/apple-touch-icon.png",
    ]) {
      expect(estCheminPublic(chemin), `${chemin} devrait être public`).toBe(true);
    }
    // Les routes qui affichent des données restent gardées.
    expect(estCheminPublic("/")).toBe(false);
    expect(estCheminPublic("/carte")).toBe(false);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SECONDE COUCHE — chaque page REVÉRIFIE la session elle-même.
 *
 * Le bloc précédent éprouve la MIDDLEWARE : elle décide qu'un chemin n'est pas public et
 * redirige un visiteur. C'est la première ligne, et c'est déjà l'essentiel.
 *
 * Mais chaque page de données porte AUSSI un `await auth()` + `redirect("/connexion")`, et
 * les commentaires du dépôt appellent ça « défense en profondeur : si le matcher change un
 * jour, cette page ne s'ouvre pas en silence ». Cette promesse-là n'était vérifiée nulle
 * part — retirer les deux lignes d'une page laissait toute la suite au vert (constaté en
 * ajoutant `/profil`). Une garantie annoncée dans un commentaire et absente des tests finit
 * par être supprimée par quelqu'un qui la croit décorative.
 *
 * Le scan est grossier À DESSEIN : il cherche l'APPEL, pas la logique. Une page qui
 * appellerait `auth()` sans rien en faire lui échapperait — c'est le prix d'un scan de
 * source, et c'est dit ici plutôt que découvert.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("défense en profondeur — chaque page revérifie la session", () => {
  /** Les `page.tsx` suivis par git, ET ceux qui ne le sont pas encore. */
  function pages(): string[] {
    const lister = (args: string[]) =>
      execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
    const sortie = `${lister(["ls-files", "app"])}\n${lister([
      "ls-files",
      "--others",
      "--exclude-standard",
      "app",
    ])}`;
    return [...new Set(sortie.split("\n"))]
      .map((f) => f.trim())
      .filter((f) => f.endsWith("page.tsx"));
  }

  /** La seule page qui n'a pas à se garder : celle qui SERT à se connecter. */
  const EXEMPTES = new Set(["app/connexion/page.tsx"]);

  const fichiers = pages();

  it("trouve bien des pages, au lieu de passer à vide", () => {
    // Un scan qui ne lit rien passerait au vert : protection nulle et silencieuse.
    expect(fichiers.length).toBeGreaterThan(3);
    expect(fichiers).toContain("app/page.tsx");
  });

  it("chaque page de données appelle auth() et redirige", () => {
    const nues = fichiers
      .filter((f) => !EXEMPTES.has(f))
      .filter((f) => {
        const source = readFileSync(resolve(process.cwd(), f), "utf8");
        return !/await auth\(\)/.test(source) || !/redirect\(/.test(source);
      });

    expect(nues, "ces pages s'ouvriraient si la middleware cessait de les couvrir").toEqual([]);
  });
});
