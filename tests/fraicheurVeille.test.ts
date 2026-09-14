// tests/fraicheurVeille.test.ts — ce que le hub peut dire du rythme de la veille.
//
// JobAI ne publiait AUCUN `dataAsOf` : le hub pouvait afficher ses chiffres, jamais dire
// depuis quand ils sont vrais. C'est la panne du 12-14 août 2026 (cron `/api/cron/veille`
// absent des journaux trois jours) : les compteurs de la veille, inchangés, avec l'aplomb
// d'une mesure. Ces tests gardent les trois états et leurs trois messages DISTINCTS.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSummary } from "@mokarade/hub-contract";
import {
  AGE_MAX_VEILLE_SEC,
  CADENCE_VEILLE_HEURES,
  MARGE_VEILLE_HEURES,
  alertesVeille,
  blocFraicheur,
  lireVeillePubliee,
  sectionVeille,
  type VeillePubliee,
} from "../lib/fraicheurVeille";
import { construireSummary } from "../lib/hubSummary";
import { resumer } from "../lib/suivi";
import { SEED } from "../lib/seed";

const LE = "2026-09-14T18:00:00.000Z";
const FINI = "2026-09-14T11:04:00.000Z";

/** Un rapport de passe tel que `CLE_RAPPORT` le porte — que des nombres et une date. */
const RAPPORT = JSON.stringify({
  jour: "2026-09-14",
  fini: FINI,
  declencheur: "cron-veille",
  trouvees: 118,
  nouvelles: 7,
  perimees: 3,
  revenues: 1,
  enSursis: 5,
  sansMotif: 0,
  suivies: 64,
  // Le rapport porte AUSSI la meilleure offre : elle ne doit pas ressortir d'ici.
  meilleure: { entreprise: "Employeur de test", poste: "Poste de test", score: 91 },
});

describe("lireVeillePubliee — trois états, trois sens", () => {
  it("lit un rapport complet", () => {
    expect(lireVeillePubliee(RAPPORT)).toEqual({
      etat: "connue",
      finiLe: FINI,
      declencheur: "cron-veille",
      trouvees: 118,
      nouvelles: 7,
      perimees: 3,
      revenues: 1,
      sansMotif: 0,
    });
  });

  it("aucune ligne d'état → « jamais », jamais « illisible »", () => {
    // L'app tourne et la veille n'a pas encore abouti. Confondre avec « illisible »
    // rendrait une installation neuve inquiétante.
    expect(lireVeillePubliee(null)).toEqual({ etat: "jamais" });
  });

  it("JSON corrompu, valeur non-objet, date absente ou illisible → « illisible »", () => {
    // DISCRIMINANT : sans le contrôle de `fini`, un rapport sans date publierait ses
    // compteurs SANS `dataAsOf` — donc en les faisant passer pour ceux de l'instant.
    for (const brut of [
      "{pas du json",
      "null",
      "42",
      '"une chaîne"',
      JSON.stringify({ trouvees: 10 }),
      JSON.stringify({ fini: "", trouvees: 10 }),
      JSON.stringify({ fini: "pas-une-date", trouvees: 10 }),
    ]) {
      expect(lireVeillePubliee(brut), brut).toEqual({ etat: "illisible" });
    }
  });

  it("compteurs absents, négatifs ou non numériques → 0, et la date SURVIT", () => {
    // Tolérance PAR CHAMP, comme `lireHistorique` : une passe datée dont un compteur est
    // corrompu garde sa fraîcheur, qui est l'information la plus précieuse des deux.
    expect(lireVeillePubliee(JSON.stringify({
      fini: FINI, trouvees: "beaucoup", nouvelles: -4, perimees: null, sansMotif: 2.6,
    }))).toEqual({
      etat: "connue", finiLe: FINI, declencheur: "inconnu",
      trouvees: 0, nouvelles: 0, perimees: 0, revenues: 0, sansMotif: 3,
    });
  });

  it("le déclencheur est borné (le contrat plafonne les précisions à 80)", () => {
    const v = lireVeillePubliee(JSON.stringify({ fini: FINI, declencheur: "d".repeat(300) }));
    expect(v.etat).toBe("connue");
    if (v.etat === "connue") expect(v.declencheur.length).toBe(40);
  });
});

describe("AGE_MAX_VEILLE_SEC — dérivé du cron, et le cron le vérifie", () => {
  it("vaut la cadence PLUS la marge, pas un chiffre choisi", () => {
    expect(AGE_MAX_VEILLE_SEC).toBe((CADENCE_VEILLE_HEURES + MARGE_VEILLE_HEURES) * 3600);
    expect(AGE_MAX_VEILLE_SEC).toBe(30 * 3600);
  });

  it("la cadence déclarée est celle de `vercel.json` — deux sources, un test", () => {
    // Faute de pouvoir importer un cron à l'exécution, la cadence est écrite deux fois.
    // Changer le planning sans toucher la constante publierait un seuil de fraîcheur FAUX,
    // et un seuil faux est exactement ce que ce module répare.
    const vercel = JSON.parse(readFileSync(resolve(__dirname, "..", "vercel.json"), "utf8"));
    const veille = (vercel.crons as { path: string; schedule: string }[])
      .find((c) => c.path === "/api/cron/veille");
    expect(veille, "le cron de veille doit exister dans vercel.json").toBeDefined();
    // `m h * * *` = une fois par jour. Toute autre forme invalide la constante.
    expect(veille!.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
    expect(CADENCE_VEILLE_HEURES).toBe(24);
  });

  it("la marge attrape une journée MANQUÉE et laisse passer un simple retard", () => {
    // Les deux erreurs que le choix de 6 h évite, chiffrées : à la cadence nue (24 h) le
    // moindre décalage du planificateur crierait « figée » chaque jour ; au double (48 h) la
    // panne du 12-14 août serait passée un jour de plus.
    const retard = 26 * 3600; // passe de 11 h hier, sondage à 13 h aujourd'hui
    const journeeManquee = 34 * 3600; // une passe sautée
    expect(retard).toBeLessThanOrEqual(AGE_MAX_VEILLE_SEC);
    expect(journeeManquee).toBeGreaterThan(AGE_MAX_VEILLE_SEC);
  });
});

describe("blocFraicheur — les deux champs ensemble, ou aucun", () => {
  it("publie dataAsOf ET expectedMaxAgeSec sur une passe connue", () => {
    expect(blocFraicheur(lireVeillePubliee(RAPPORT))).toEqual({
      dataAsOf: FINI,
      expectedMaxAgeSec: AGE_MAX_VEILLE_SEC,
    });
  });

  it("ne publie NI l'un NI l'autre quand il n'y a pas de passe", () => {
    // Le contrat v1.3 rejette `expectedMaxAgeSec` sans `dataAsOf` : un seuil sans horodatage
    // à comparer donnerait la certitude d'être surveillé alors que rien ne le serait.
    for (const v of [{ etat: "jamais" }, { etat: "illisible" }] as VeillePubliee[]) {
      expect(blocFraicheur(v)).toEqual({});
    }
  });
});

describe("alertesVeille — « jamais » et « illisible » ne disent pas la même chose", () => {
  it("rien à signaler sur une passe connue", () => {
    expect(alertesVeille(lireVeillePubliee(RAPPORT))).toEqual([]);
  });

  it("« jamais » est une information, pas une panne", () => {
    expect(alertesVeille({ etat: "jamais" })).toEqual([
      { label: "Aucune passe de veille enregistrée", severity: "info" },
    ]);
  });

  it("« illisible » est quelque chose à regarder", () => {
    expect(alertesVeille({ etat: "illisible" })).toEqual([
      { label: "Fraîcheur de la veille illisible", severity: "warn" },
    ]);
  });
});

describe("sectionVeille — des nombres, et « inexpliquées » qui doit valoir 0", () => {
  it("cinq lignes, aucune donnée personnelle", () => {
    const s = sectionVeille(lireVeillePubliee(RAPPORT));
    expect(s?.title).toBe("Dernière passe de veille");
    expect(s?.items.map((i) => [i.label, i.value])).toEqual([
      ["Offres vues", 118],
      ["Retenues", 7],
      ["Périmées", 3],
      ["Revenues", 1],
      ["Inexpliquées", 0],
    ]);
    // 🔴 GARDE-FOU N°1 (dépôt PUBLIC) : le rapport contient l'employeur et le poste de la
    // meilleure offre. La section en est extraite champ par champ, jamais recopiée.
    const texte = JSON.stringify(s);
    expect(texte).not.toContain("Employeur de test");
    expect(texte).not.toContain("Poste de test");
  });

  it("« inexpliquées » > 0 passe en warn — c'est tout l'intérêt de la ligne", () => {
    // Le 17 août, l'app affichait « 100 trouvées · 0 nouvelle · 26 déjà connues » :
    // soixante-quatorze offres disparues sans qu'aucun écran ne le dise.
    const s = sectionVeille(lireVeillePubliee(JSON.stringify({
      fini: FINI, trouvees: 100, nouvelles: 0, sansMotif: 74,
    })));
    const ligne = s?.items.find((i) => i.label === "Inexpliquées");
    expect(ligne?.value).toBe(74);
    expect(ligne?.severity).toBe("warn");
    // Et un zéro sain ne porte AUCUNE gravité : sinon la couleur ne voudrait plus rien dire.
    expect(sectionVeille(lireVeillePubliee(RAPPORT))?.items.at(-1)?.severity).toBeUndefined();
  });

  it("aucune section quand il n'y a pas de passe — jamais un encadré vide", () => {
    expect(sectionVeille({ etat: "jamais" })).toBeNull();
    expect(sectionVeille({ etat: "illisible" })).toBeNull();
  });
});

describe("construireSummary avec la fraîcheur (contrat v1.3)", () => {
  const resume = resumer(SEED, "2026-08-14");

  it("le summary complet reste conforme au VRAI schéma", () => {
    const s = construireSummary(resume, LE, { etat: "aucun-appel" }, lireVeillePubliee(RAPPORT));
    expect(() => validateSummary(s)).not.toThrow();
    expect(s.dataAsOf).toBe(FINI);
    expect(s.expectedMaxAgeSec).toBe(AGE_MAX_VEILLE_SEC);
  });

  it("`primary` désigne la meilleure offre, et se REPLIE sur l'arrivage s'il n'y en a pas", () => {
    // Le contrat autorise zéro `primary`, mais une carte sans chiffre mis en avant est une
    // carte qu'on ne lit pas. DISCRIMINANT : sans le repli, un suivi sans offre notée
    // perdrait son titre de carte — l'état le plus fréquent d'un début de recherche.
    const avec = construireSummary(resume, LE);
    expect(avec.metrics.filter((m) => m.primary).map((m) => m.label))
      .toEqual([avec.metrics[0]!.label]);
    expect(avec.metrics[0]!.label).toContain("Meilleure");

    const vide = construireSummary(resumer([], "2026-08-14"), LE);
    expect(vide.metrics.filter((m) => m.primary).map((m) => m.label)).toEqual(["Nouvelles (7 j)"]);
  });

  it("un seul `primary` — le contrat refuse deux titres de carte", () => {
    for (const s of [construireSummary(resume, LE), construireSummary(resumer([], "2026-08-14"), LE)]) {
      expect(s.metrics.filter((m) => m.primary).length).toBe(1);
      expect(() => validateSummary(s)).not.toThrow();
    }
  });

  it("l'entonnoir passe en DÉTAIL, en nombres séparés que le hub pourra tracer", () => {
    // « CV envoyés · réponses » reste une métrique TEXTE née du plafond de six créneaux, et
    // une valeur texte n'entre dans aucune série côté hub. Le détail les republie séparés.
    const s = construireSummary(resume, LE, { etat: "aucun-appel" }, lireVeillePubliee(RAPPORT));
    const entonnoir = s.details?.find((d) => d.title === "Entonnoir de candidature");
    expect(entonnoir?.items.map((i) => i.label))
      .toEqual(["CV envoyés", "Réponses", "Entrevues", "Offres suivies"]);
    for (const item of entonnoir!.items) expect(typeof item.value).toBe("number");
    // La métrique fusionnée SURVIT : la retirer changerait ce que Marc voit aujourd'hui pour
    // un rendu qui n'existe pas encore côté hub.
    expect(s.metrics.some((m) => m.label === "CV envoyés · réponses")).toBe(true);
  });

  it("sans passe de veille : pas de dataAsOf, pas de section de passe, et l'alerte le dit", () => {
    const s = construireSummary(resume, LE, { etat: "aucun-appel" }, { etat: "illisible" });
    expect(s.dataAsOf).toBeUndefined();
    expect(s.expectedMaxAgeSec).toBeUndefined();
    expect(s.details?.some((d) => d.title === "Dernière passe de veille")).toBe(false);
    // L'entonnoir, lui, reste : il ne dépend pas de la veille.
    expect(s.details?.some((d) => d.title === "Entonnoir de candidature")).toBe(true);
    expect(s.alerts.some((a) => a.label === "Fraîcheur de la veille illisible")).toBe(true);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("les bornes du contrat tiennent sur les sections de détail", () => {
    const s = construireSummary(resume, LE, { etat: "aucun-appel" }, lireVeillePubliee(RAPPORT));
    expect(s.details!.length).toBeLessThanOrEqual(6);
    for (const section of s.details!) {
      expect(section.title.length).toBeLessThanOrEqual(40);
      expect(section.items.length).toBeGreaterThan(0);
      expect(section.items.length).toBeLessThanOrEqual(8);
      for (const item of section.items) {
        expect(item.label.length).toBeLessThanOrEqual(40);
        if (item.hint !== undefined) expect(item.hint.length).toBeLessThanOrEqual(80);
      }
    }
  });
});
