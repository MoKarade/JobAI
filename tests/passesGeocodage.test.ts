// tests/passesGeocodage.test.ts — le débit de géocodage se compte en PASSES (JobAI#91).
//
// POURQUOI CE VERROU. Une passe situe au plus 8 villes (`MAX_VILLES_PAR_PASSE`), plafond dérivé du
// mur de 60 s d'une fonction Vercel ; `lib/geocodageCron.ts` interdit de l'agrandir et dit que
// « vouloir un débit plus haut = ajouter une PASSE ». Marc a choisi d'en ajouter une
// (16/10/2026, sources gratuites seulement : Nominatim, déjà employé, et rien d'autre).
//
// Ce qui peut casser en silence : retirer l'entrée de `vercel.json` ne rougit rien, le débit
// retombe simplement à deux passes par jour ; et deux passes à la même heure se refuseraient
// mutuellement par le verrou de cinq minutes (`reserverPasse`), donc une seule travaillerait.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Cron = { path: string; schedule: string };

const vercel = JSON.parse(readFileSync(resolve(__dirname, "..", "vercel.json"), "utf8")) as {
  crons: Cron[];
};
const crons = vercel.crons;
const geocodage = crons.filter((c) => c.path.split("?")[0] === "/api/cron/geocodage");

/** Heure UTC d'un cron quotidien `m h * * *`. */
function heure(c: Cron): number {
  const m = /^(\d+) (\d+) \* \* \*$/.exec(c.schedule);
  expect(m, `« ${c.schedule} » doit être quotidien (plan hobby : une fois par jour)`).not.toBeNull();
  return Number(m![2]);
}

describe("passes de géocodage (vercel.json)", () => {
  it("il y a au moins DEUX passes de géocodage seul, en plus du cron de veille", () => {
    expect(crons.some((c) => c.path === "/api/cron/veille")).toBe(true);
    expect(geocodage.length).toBeGreaterThanOrEqual(2);
  });

  it("chaque passe est quotidienne — le plan hobby refuse tout le reste au déploiement", () => {
    for (const c of crons) heure(c);
  });

  it("deux entrées ne partagent ni chemin complet ni heure", () => {
    const chemins = crons.map((c) => c.path);
    expect(new Set(chemins).size).toBe(chemins.length);
    const heures = crons.map(heure);
    expect(new Set(heures).size).toBe(heures.length);
  });

  it("deux passes sont séparées d'au moins 5 heures, pour ne jamais se heurter au verrou", () => {
    // Le plan hobby fait partir un cron dans l'heure qui suit (±59 min) : l'écart minimal
    // doit rester sans commune mesure avec le verrou de cinq minutes (`DELAI_MESURE_AUTO_MS`).
    const heures = crons.map(heure).sort((a, b) => a - b);
    for (let i = 0; i < heures.length; i++) {
      const suivante = heures[(i + 1) % heures.length]! + (i + 1 === heures.length ? 24 : 0);
      expect(suivante - heures[i]!, `écart après ${heures[i]} h UTC`).toBeGreaterThanOrEqual(5);
    }
  });

  it("le filet de reprise de la veille reste cohérent avec le plus grand écart entre passes", () => {
    // Le filet (20 h) doit rester au-dessus du plus grand écart entre la veille et la passe qui
    // la suit, sinon il part chaque jour en annonçant un retard inexistant ([VEILLE-13]).
    const veille = heure(crons.find((c) => c.path === "/api/cron/veille")!);
    const ecarts = geocodage.map((c) => (heure(c) - veille + 24) % 24);
    for (const e of ecarts) expect(e).toBeLessThan(20);
  });
});
