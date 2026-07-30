// tests/seed.test.ts — l'intégrité du jeu de départ.
//
// Le seed est saisi à la main : c'est exactement le genre de données où une coquille passe
// inaperçue jusqu'à ce qu'elle s'affiche. Ces tests valident les 38 entrées contre le vrai
// schéma Zod, et vérifient les invariants que le schéma seul ne couvre pas.

import { describe, it, expect } from "vitest";
import { SEED } from "../lib/seed";
import { OffreSchema } from "../lib/types";
import { PLAFOND_NOTE_CALCULEE, palier } from "../lib/scoring";

const actives = SEED.filter((o) => !o.histo);
const historiques = SEED.filter((o) => o.histo);

describe("volume", () => {
  // Prouver le volume AVANT d'en dépendre : un tableau vide passerait tous les tests
  // « pour chaque offre… » sans rien vérifier.
  it("contient les 38 offres actives et les 15 candidatures de 2025", () => {
    // 23 relevées à la main au 2026-07-27, plus 6 trouvées par balayage Indeed le
    // 2026-07-29. Ce compte est volontairement EN DUR : il doit tomber quand le jeu
    // change, pour qu'on relise ce qui a été ajouté au lieu de le découvrir en prod.
    expect(actives).toHaveLength(38);
    expect(historiques).toHaveLength(15);
    expect(SEED).toHaveLength(53);
  });
});

describe("conformité au schéma", () => {
  it("chaque offre est valide, sans exception", () => {
    const invalides = SEED.map((o) => ({ id: o.id, r: OffreSchema.safeParse(o) }))
      .filter((x) => !x.r.success)
      .map((x) => `${x.id}: ${x.r.success ? "" : x.r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`);
    expect(invalides).toEqual([]);
  });

  it("les identifiants sont uniques", () => {
    const ids = SEED.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("provenance des notes", () => {
  it("toute offre notée déclare sa provenance, et une note CALCULÉE respecte le plafond", () => {
    // Le jeu de départ venait d'une lecture réelle : tout y était « manuel ». Depuis le
    // repérage automatique du 2026-07-29, les deux provenances coexistent — c'est prévu
    // par le barème, pas une entorse. Ce qui doit rester vrai, et qui est le VRAI risque,
    // c'est qu'une note calculée ne passe jamais devant une note vérifiée à la main :
    // elle est plafonnée. Une entrée qui se dirait « manuelle » sans l'être échapperait
    // à ce plafond, d'où la vérification dans les deux sens.
    for (const o of actives.filter((x) => x.score !== null)) {
      expect(o.scoreSource, `offre ${o.id}`).not.toBeNull();
      if (o.scoreSource === "calcule") {
        expect(o.score!, `offre ${o.id}`).toBeLessThanOrEqual(PLAFOND_NOTE_CALCULEE);
      }
    }
  });

  it("les notes MANUELLES restent majoritaires — le jeu lu à la main fait autorité", () => {
    // Un repérage automatique qui noierait les offres lues à la main retournerait le
    // rapport de force du barème sans que personne ne le décide. Si ce test tombe un
    // jour, c'est une décision à prendre, pas un chiffre à ajuster.
    const notees = actives.filter((o) => o.score !== null);
    const manuelles = notees.filter((o) => o.scoreSource === "manuel");
    expect(manuelles.length).toBeGreaterThan(notees.length / 2);
  });

  it("les candidatures de 2025 n'ont ni note ni justification", () => {
    for (const o of historiques) {
      // « Pas évaluée » n'est pas « mauvaise » : c'est null, jamais 0.
      expect(o.score, `offre ${o.id}`).toBeNull();
      expect(o.scoreSource, `offre ${o.id}`).toBeNull();
      expect(o.raisons, `offre ${o.id}`).toEqual([]);
    }
  });

  it("chaque offre active notée porte au moins une justification", () => {
    // Une note sans explication est une note qu'on ne peut pas contester.
    for (const o of actives.filter((x) => x.score !== null)) {
      expect(o.raisons.length, `offre ${o.id}`).toBeGreaterThan(0);
    }
  });

  it("les offres de palier A portent au moins un atout", () => {
    for (const o of actives.filter((x) => palier(x.score) === "A")) {
      expect(o.raisons.some((r) => r.ton === "atout"), `offre ${o.id}`).toBe(true);
    }
  });
});

describe("aucun balisage résiduel", () => {
  it("les justifications sont du texte, pas du HTML", () => {
    // L'artifact stockait « <b>…</b> » et l'injectait sans échappement. Si du balisage
    // revenait ici, il serait affiché tel quel — ou pire, interprété.
    const avecBalise = SEED.flatMap((o) =>
      o.raisons.filter((r) => /<[^>]+>/.test(r.texte)).map((r) => `${o.id}: ${r.texte}`),
    );
    expect(avecBalise).toEqual([]);
  });

  it("les notes de recherche ne contiennent pas de balise non plus", () => {
    const avecBalise = SEED.filter((o) => /<[^>]+>/.test(o.notes)).map((o) => o.id);
    expect(avecBalise).toEqual([]);
  });
});

describe("données personnelles (garde-fou n°1)", () => {
  it("aucune adresse municipale n'apparaît dans le jeu de départ", () => {
    const motif = /\b\d{3,5},?\s+(av\.|avenue|rue|boul\.|boulevard|ch\.|chemin)\s/i;
    const fautives = SEED.filter(
      (o) => motif.test(o.notes) || o.raisons.some((r) => motif.test(r.texte)),
    ).map((o) => o.id);
    expect(fautives).toEqual([]);
  });

  it("aucune personne de recrutement n'est nommée", () => {
    // Un contact se note « contact RH établi » ; son nom est la donnée personnelle d'un
    // TIERS et vit dans la note de Marc, hors du dépôt.
    //
    // PORTÉE HONNÊTE DE CE TEST : il ne détecte PAS un nom de personne en général —
    // c'est impossible de façon fiable en français, où les mots composés à trait d'union
    // sont partout (« Machines-Outils », « servo-contrôle », « Saint-Damien », « là-bas »
    // matchaient tous un motif générique de patronyme, mesuré). Il détecte les FORMES DE
    // PRÉSENTATION d'une personne : une civilité, ou un nom glissé après une mention de
    // contact. C'est un filet, pas une preuve — la vraie protection reste la relecture.
    const texte = SEED.map(
      (o) => `${o.notes} ${o.raisons.map((r) => r.texte).join(" ")}`,
    ).join(" ");

    // Civilité suivie d'un mot capitalisé — exemples factices : « M. Untel », « Mme Unetelle ».
    expect(texte, "civilité suivie d'un nom").not.toMatch(
      /\b(M\.|Mme|Monsieur|Madame)\s+[A-ZÉÈÀ]/,
    );
    // Une mention de contact suivie d'une parenthèse : « contact RH (Untel) ».
    expect(texte, "contact nommé entre parenthèses").not.toMatch(
      /\b(contact|recruteur|recruteuse|RH)\b[^.]{0,30}\([A-ZÉÈÀ]/i,
    );
    // Un rapprochement explicite : « entrevue avec Untel Untel ».
    expect(texte, "personne nommée après « avec »").not.toMatch(
      /\bavec\s+[A-ZÉÈÀ][a-zéèêàî]+\s+[A-ZÉÈÀ]/,
    );
  });

  it("la note personnelle de chaque offre part vide", () => {
    // `userNote` appartient à Marc : le jeu de départ n'a rien à y écrire.
    for (const o of SEED) {
      expect(o.userNote, `offre ${o.id}`).toBe("");
    }
  });
});

describe("cohérence du suivi", () => {
  it("une candidature envoyée porte une date d'envoi, et réciproquement", () => {
    for (const o of SEED) {
      const envoyee = o.statut !== "Identifiee";
      expect(Boolean(o.dateEnvoi), `offre ${o.id} (statut ${o.statut})`).toBe(envoyee);
    }
  });

  it("les offres actives sont toutes à l'état identifié", () => {
    // Aucune candidature n'a été envoyée en 2026 : le jeu de départ doit le refléter.
    for (const o of actives) {
      expect(o.statut, `offre ${o.id}`).toBe("Identifiee");
    }
  });

  it("une distance PRÉSENTE est plausible ; absente, elle est franchement nulle", () => {
    // Ce que ce test protège, c'est la distance ABERRANTE (un zéro, un millier de km),
    // pas la distance manquante : le type dit `null = inconnue (pas zéro)`, et une offre
    // repérée automatiquement n'en a pas — la session ne peut pas la mesurer sans le
    // domicile. Exiger une distance partout forcerait à en inventer une, ce qui est
    // exactement le défaut que le reste du fichier interdit.
    for (const o of actives) {
      if (o.km === null) continue;
      expect(o.km, `offre ${o.id}`).toBeGreaterThan(0);
      expect(o.km, `offre ${o.id}`).toBeLessThan(100);
    }
  });

  it("la MAJORITÉ des offres actives portent une distance mesurée", () => {
    // Filet contre la dérive inverse : si les repérages automatiques finissaient par
    // dominer, la carte et le barème raisonneraient surtout sur des distances inconnues
    // (10/20 neutres) sans que personne ne l'ait décidé.
    const mesurees = actives.filter((o) => o.km !== null);
    expect(mesurees.length).toBeGreaterThan(actives.length / 2);
  });

  it("la seule offre hors rayon est explicitement signalée comme telle", () => {
    // Elle est conservée volontairement (elle était dans la liste d'origine), mais sa
    // justification doit le dire — sinon elle passerait pour une cible.
    const horsRayon = actives.filter((o) => o.km !== null && o.km > 50);
    expect(horsRayon).toHaveLength(1);
    expect(
      horsRayon[0]!.raisons.some((r) => r.ton === "reserve" && /rayon/i.test(r.texte)),
    ).toBe(true);
  });
});
