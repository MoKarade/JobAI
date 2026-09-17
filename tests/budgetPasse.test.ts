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
import { BUDGET_BORNES_VEILLE_MS, BUDGET_GEOCODAGE_CRON_MS } from "../lib/geocodageCron";

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
    //
    // ⚠️ CETTE GARDE ANCRAIT LA FORME, PAS LE FAIT, et elle a rougi le 2026-09-14 sur un
    // lot qui ne touchait pas à ce qu'elle défend : elle cherchait littéralement
    // `budgetMs < DELAI_MAX_MS`, et le passage à une requête PAR GRAPPE a renommé la
    // grandeur comparée en `reste` — le budget restant à l'instant de la grappe, ce qui est
    // strictement plus juste puisqu'il y a maintenant plusieurs requêtes. Ce qu'elle doit
    // dire : « quelque chose est comparé à `DELAI_MAX_MS` avant de lancer la requête ».
    const source = lire("lib/actions.ts");
    expect(source).toMatch(/<\s*DELAI_MAX_MS/);
    // Non-vacuité : la constante doit venir d'`overpass`, pas d'un homonyme local qui
    // laisserait la comparaison vraie tout en mesurant autre chose.
    expect(source).toMatch(/DELAI_MAX_MS[^\n]*\}? from "\.\/overpass"|DELAI_MAX_MS,/);
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

describe("l'étape des bornes a une enveloppe À ELLE, et seulement là où le mur l'autorise", () => {
  // ⚠️ CE QUI EST VERROUILLÉ ICI A DÉJÀ COÛTÉ LA MESURE, EN PRODUCTION.
  //
  // Les 16 et 17/09/2026, deux passes consécutives ont rendu `[bornes] 0/N grappe(s)
  // interrogée(s) · 0 lieu(x) mesuré(s)`, et le reste à mesurer MONTAIT (14 → 21). Le budget
  // restant en fin de passe était remarquablement stable (7 409 ms, puis 7 722 ms) : l'amont
  // consomme ~17,5 s des 25 s partagés, et l'étape des bornes, qui vient en avant-dernier, a
  // besoin de `DELAI_MAX_MS` D'UN COUP pour seulement COMMENCER une requête — une requête
  // tuée en vol ne rapporte rien. Elle ne partait donc plus jamais, sans qu'une ligne change
  // et sans qu'aucune erreur ne soit levée.
  //
  // ⚠️ ET LE REMÈDE N'EST PAS DE LA REMONTER EN TÊTE DE PASSE. `bornesLe` ne se pose qu'une
  // fois par lieu, et `raffinerPositions` tourne juste avant : mesurer les bornes AVANT lui
  // les figerait depuis le centre-ville pour toute entreprise fraîchement épinglée. On aurait
  // troqué une étape affamée contre une donnée fausse.

  it("l'enveloppe suffit à COMMENCER une requête — sinon elle ne sert à rien", () => {
    // Le seuil n'est pas décoratif : sous `DELAI_MAX_MS`, la garde interne refuse de partir
    // et l'enveloppe ne fait que déplacer la famine sans la corriger.
    expect(BUDGET_BORNES_VEILLE_MS).toBeGreaterThanOrEqual(DELAI_MAX_MS);
    // Et il reste de quoi écrire les lignes de la grappe une fois la réponse arrivée.
    expect(BUDGET_BORNES_VEILLE_MS - DELAI_MAX_MS).toBeGreaterThanOrEqual(2_000);
  });

  it("⚠️ elle est accordée par le cron de VEILLE, et le bornes step la CONSOMME", () => {
    // Les deux moitiés, parce qu'une seule ne prouve rien : une enveloppe que personne ne
    // passe est morte, et une enveloppe passée que l'étape ignore l'est tout autant. C'est
    // le trou exact de `[FERMETURE-03]` — un mécanisme vert, testé, et mort à l'arrivée.
    expect(lire("lib/veilleComplete.ts")).toContain("budgetBornesMs: BUDGET_BORNES_VEILLE_MS");
    expect(lire("lib/actions.ts")).toMatch(/mesurerBornes\(\s*options\.budgetBornesMs/);
  });

  it("⚠️ le cron de GÉOCODAGE ne la reçoit PAS — son mur est à 60 s", () => {
    // Elle s'ajoute au budget partagé : l'accorder là où la fonction n'a que 60 s referait
    // le calcul que `BUDGET_GEOCODAGE_CRON_MS` interdit de refaire à la légère, et un mur
    // atteint tue le processus sans exécuter le moindre `catch`.
    const source = lire("app/api/cron/geocodage/route.ts");
    expect(source).not.toContain("budgetBornesMs");
    const m = source.match(/export const maxDuration = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(60);
  });

  it("⚠️ la route qui l'accorde a le mur qui la rend sûre, avec marge", () => {
    // Un plafond ne se suppose pas : le budget partagé PLUS l'enveloppe doivent tenir
    // largement sous le mur, parce que l'ingestion tourne AVANT dans la même invocation.
    const m = lire("app/api/cron/veille/route.ts").match(/export const maxDuration = (\d+)/);
    expect(m).not.toBeNull();
    const murMs = Number(m?.[1]) * 1000;
    expect(BUDGET_GEOCODAGE_CRON_MS + BUDGET_BORNES_VEILLE_MS).toBeLessThan(murMs / 2);
  });
});
