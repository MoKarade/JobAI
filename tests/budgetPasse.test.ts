// tests/budgetPasse.test.ts — le travail de fond tient-il dans la durée de vie de sa page ?
//
// ⚠️ CE QUI EST VERROUILLÉ ICI A DÉJÀ COÛTÉ LA PAGE, EN PRODUCTION.
//
// Le 2026-08-05, trois `GET /carte` d'affilée sont morts en « Vercel Runtime Timeout Error:
// Task timed out after 30 seconds », sans qu'une seule ligne de trace ne sorte : la passe
// était tuée avant d'avoir pu écrire quoi que ce soit. Deux causes cumulées, et aucune
// n'était visible depuis un fichier isolé —
//
//   1. `mesurerDistances()` appelée sans options laissait son budget à `null`. Un budget
//      absent n'est pas un grand budget : c'est AUCUNE borne.
//   2. Le travail lancé par `after()` vit DANS l'invocation de la fonction. Il hérite de son
//      `maxDuration`, il ne s'y ajoute pas — croire l'inverse est l'erreur de fond.
//
// Le rapport entre ces nombres vit dans TROIS fichiers (la page annonce `maxDuration`, la
// constante partagée en tient le double, le budget vit ailleurs) parce que Next exige un
// littéral dans la page. Trois exemplaires d'un même fait finissent toujours par diverger —
// d'où ce test, qui les relit sur le disque plutôt que de les supposer.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUDGET_PASSE_PAGE_MS,
  MAX_DURATION_CARTE_S,
  DELAI_MESURE_AUTO_MS,
} from "../lib/synchro";
import { DELAI_MAX_MS, INSTANCES_OVERPASS } from "../lib/overpass";

/** Les pages qui déclenchent la passe de fond, et doivent donc lui survivre. */
const PAGES = ["app/carte/page.tsx", "app/page.tsx"] as const;

function lire(chemin: string): string {
  return readFileSync(resolve(process.cwd(), chemin), "utf8");
}

describe("durée de vie annoncée par les pages", () => {
  it("les deux déclencheurs annoncent la MÊME durée que la constante partagée", () => {
    // Un scan qui ne trouve rien passerait à vide : on prouve le volume avant d'en dépendre.
    expect(PAGES.length).toBe(2);

    for (const page of PAGES) {
      const source = lire(page);
      const m = source.match(/export const maxDuration = (\d+)/);
      expect(m, `${page} doit annoncer maxDuration`).not.toBeNull();
      expect(Number(m?.[1]), page).toBe(MAX_DURATION_CARTE_S);
    }
  });

  it("le budget du travail de fond laisse de la marge sous la durée de la fonction", () => {
    // Un budget qui touche le plafond ne protège de rien : c'est précisément au moment où
    // il déborde qu'il doit rester de quoi finir la requête en cours et écrire la trace.
    const plafondMs = MAX_DURATION_CARTE_S * 1000;
    expect(BUDGET_PASSE_PAGE_MS).toBeLessThan(plafondMs);
    expect(plafondMs - BUDGET_PASSE_PAGE_MS).toBeGreaterThanOrEqual(15_000);
  });
});

describe("aucune étape ne peut à elle seule manger le budget", () => {
  it("une interrogation Overpass, replis compris, reste une fraction du budget", () => {
    // Le délai est payé PAR INSTANCE, et il y a trois instances en repli : c'est le produit
    // qui compte, jamais le délai seul. À 15 s × 3, une seule entreprise injoignable
    // consommait 45 s — plus que le budget entier, et la page mourait avec elle.
    const pireCasUneEntreprise = DELAI_MAX_MS * INSTANCES_OVERPASS.length;
    expect(pireCasUneEntreprise).toBeLessThan(BUDGET_PASSE_PAGE_MS / 2);
  });

  it("la temporisation entre deux passes dépasse la durée d'une passe", () => {
    // Sinon une passe serait encore en vol quand la suivante démarre, et deux flux
    // simultanés partiraient vers des services qui l'interdisent.
    expect(DELAI_MESURE_AUTO_MS).toBeGreaterThan(MAX_DURATION_CARTE_S * 1000);
  });
});

describe("le budget par défaut", () => {
  it("n'est JAMAIS absent — un défaut permissif est une bombe à retardement", () => {
    // La valeur par défaut était `null`, donc illimitée. Tant que le gate ne s'ouvrait
    // presque jamais, ce chemin passait inaperçu ; l'avoir ouvert l'a rendu quotidien.
    const source = lire("lib/actions.ts");
    expect(source).toContain("options.budgetGeocodageMs ?? BUDGET_PASSE_PAGE_MS");
    expect(source).not.toContain("options.budgetGeocodageMs ?? null");
  });
});
