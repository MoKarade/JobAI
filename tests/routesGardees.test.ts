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
import { readdirSync } from "node:fs";
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
  "/api/cron/veille":
    "Gardée AUTREMENT — par CRON_SECRET, comparé en temps constant dans la route, avec " +
    "échec fermé : 503 si le secret n'est pas configuré, 401 s'il est faux. Derrière la " +
    "garde de session, l'appel quotidien de Vercel recevrait une redirection HTML et la " +
    "veille ne tournerait jamais, sans qu'aucune alerte ne se déclenche.",
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
});
