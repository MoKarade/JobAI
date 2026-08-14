// tests/traceVeille.test.ts — la passe DIT ce qu'elle a fait, même quand elle n'a rien fait.
//
// POURQUOI CE TEST EXISTE
// Le 2026-08-14, Marc a vu son compte d'offres BAISSER de deux après une veille. Établir
// pourquoi a demandé de relire le code de péremption, la fenêtre de relecture des dépôts et
// les logs de localisation — alors que la passe connaissait déjà tous les nombres. Ils
// partaient dans la réponse JSON, que personne ne lit quand le déclencheur est un
// planificateur ou un bouton de tableau de bord.
//
// La règle du dépôt était déjà écrite (« un travail de fond qui ne journalise QUE ses échecs
// est indiagnosticable ») ; elle n'était simplement pas VÉRIFIÉE sur l'étape la plus
// importante. Un contrôle promis en prose ne verrouille rien — d'où ce scan.
//
// CE QU'IL NE FAIT PAS : exécuter la passe. Elle touche la base, le réseau et le système de
// fichiers ; la monter en test coûterait plus qu'elle ne prouverait ici. Ce test vérifie la
// PRÉSENCE et la COMPOSITION de la trace, ce qui est exactement ce qui a manqué.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// `process.cwd()` et pas `import.meta.url` : après la transformation de Vite, l'URL du
// module n'est pas de schéma `file://` — leçon déjà payée sur un autre scan.
const SOURCE = readFileSync(resolve(process.cwd(), "lib/veilleComplete.ts"), "utf8");

describe("la trace de la passe de veille", () => {
  // ⚠️ Un scan qui ne trouve rien PASSE à vide, et ne protège plus rien. On prouve d'abord
  // qu'on lit bien le fichier attendu.
  it("lit un module de veille non vide", () => {
    expect(SOURCE.length).toBeGreaterThan(2_000);
    expect(SOURCE).toContain("executerVeilleComplete");
  });

  it("émet une ligne de trace inconditionnelle", () => {
    const trace = SOURCE.match(/console\.log\(\s*`\[veille\][\s\S]*?\);/);
    expect(trace, "aucune trace `[veille]` dans la passe").not.toBeNull();

    // Inconditionnelle : la trace ne doit pas vivre dans une branche. Une trace qu'on
    // n'émet que « quand il s'est passé quelque chose » est précisément celle qui manque
    // le jour où l'on cherche à savoir s'il s'est passé quelque chose.
    const avant = SOURCE.slice(0, SOURCE.indexOf(trace![0]));
    const derniereAccolade = avant.lastIndexOf("{");
    const derniereCondition = Math.max(avant.lastIndexOf("if ("), avant.lastIndexOf("if("));
    expect(derniereCondition).toBeLessThan(derniereAccolade);
  });

  it("porte les grandeurs qui expliquent un solde d'offres", () => {
    const trace = SOURCE.match(/console\.log\(\s*`\[veille\][\s\S]*?\);/)![0];

    // Le minimum pour qu'une variation de stock se lise sans enquête : ce qui ENTRE, ce qui
    // SORT, et ce qui a été ÉCARTÉ en chemin. Sans les trois, un « −2 » reste une énigme.
    for (const grandeur of [
      "ingérées",
      "périmées",
      "revenues",
      "doublons",
      "hors-région",
      "sous-plancher",
      "sources",
    ]) {
      expect(trace, `la trace ne dit pas « ${grandeur} »`).toContain(grandeur);
    }

    // Les entrées se comptent en X/Y : « 0/0 » dit qu'il n'y avait rien à ingérer,
    // « 0/31 » dit que trente-et-une candidates ont toutes été écartées. Deux situations
    // opposées, un seul chiffre ne les distingue pas.
    expect(trace).toMatch(/ingérées=\$\{[^}]+\}\/\$\{[^}]+\}/);

    // Et elle nomme QUI a déclenché la passe : cron, reprise, ou dépôt manuel.
    expect(trace).toContain("${declencheur}");
  });
});
