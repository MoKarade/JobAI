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
import { DELAI_MAX_MS, DELAI_SERVEUR_S, INSTANCES_OVERPASS } from "../lib/overpass";

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
  it("l'interrogation Overpass du LOT ENTIER tient dans le budget, avec marge", () => {
    // ⚠️ LA PRÉMISSE DE CE TEST A CHANGÉ, ET C'EST VOULU — le reformuler n'est pas
    // l'affaiblir. Écrit le matin, il protégeait contre « une seule entreprise injoignable
    // consomme tout » : il y avait alors une requête PAR entreprise, et 15 s × 3 instances
    // = 45 s pour un seul lieu. La mesure du soir a montré la suite (« bornes=2/6, 3 en
    // échec, budget restant=0 ms ») : même à 5 s, trois échecs suffisaient à tout manger.
    //
    // Le modèle est désormais UNE requête pour tout le lot — boîte englobante, proximité
    // calculée en local. Le pire cas ne dépend donc plus du nombre d'entreprises.
    //
    // ⚠️ ET LA PRÉMISSE A CHANGÉ UNE SECONDE FOIS (2026-08-17) : les trois instances sont
    // interrogées EN PARALLÈLE, plus en série. Le pire cas n'est donc plus la SOMME des
    // délais mais UN SEUL — c'est précisément ce qui permet de le rendre patient. Multiplier
    // par le nombre d'instances ici reviendrait à borner un modèle qui n'existe plus.
    const pireCasDuLot = DELAI_MAX_MS;
    expect(pireCasDuLot).toBeLessThan(BUDGET_PASSE_PAGE_MS);
    // La marge : le reste de la passe (mesures, écritures, trace) doit encore tenir.
    expect(BUDGET_PASSE_PAGE_MS - pireCasDuLot).toBeGreaterThanOrEqual(10_000);
    // La course n'a de sens que si les instances sont bien plusieurs : à une seule, il n'y
    // aurait aucun repli et la formule ci-dessus deviendrait un aveu, pas une borne.
    expect(INSTANCES_OVERPASS.length).toBeGreaterThan(1);
  });

  // ⚠️ LE VERROU QUI MANQUAIT, et son absence a gelé la mesure des bornes du 15 au 17 août.
  //
  // `[timeout:N]` ne gouverne que l'EXÉCUTION côté Overpass, jamais l'attente en file — et
  // les instances publiques font la queue. Un client qui abandonne une seconde après le
  // budget d'exécution du serveur ne laisse donc rien pour la file, la connexion et le
  // transfert : sous charge, les trois instances expiraient identiquement alors que la même
  // requête rendait 68 bornes deux jours plus tôt.
  it("le client laisse au serveur BIEN PLUS qu'une seconde de marge", () => {
    const margeMs = DELAI_MAX_MS - DELAI_SERVEUR_S * 1000;
    expect(margeMs).toBeGreaterThanOrEqual(3_000);
  });

  it("la passe des bornes REFUSE de commencer sans de quoi finir une requête", () => {
    // Une requête tuée en vol ne rapporte rien et consomme tout ce qui restait. Le code
    // vérifie donc le budget restant AVANT de partir — sinon la dernière étape de la passe
    // partirait systématiquement pour mourir.
    const source = lire("lib/actions.ts");
    expect(source).toContain("budgetMs < DELAI_MAX_MS");
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
