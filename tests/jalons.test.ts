// tests/jalons.test.ts — la ligne qui dit où est passé le budget d'une passe.
//
// CE QUE CES TESTS PROTÈGENT (`[DISTANCES-01]`)
//
// Le défaut corrigé n'était pas une étape trop lente : c'était qu'AUCUNE mesure n'existait,
// donc que le diagnostic se faisait par déduction. Ce qui doit tenir ici, c'est que la ligne
// reste LISIBLE et FIDÈLE — un instrument qui ment est pire que pas d'instrument.

import { describe, it, expect } from "vitest";
import { creerChrono } from "../lib/jalons";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Une horloge qui n'avance que quand on le lui dit : sans elle, le test mesurerait la machine. */
function horloge(debut = 1_000) {
  let t = debut;
  return { lire: () => t, avancer: (ms: number) => (t += ms) };
}

describe("creerChrono — où est passé le budget", () => {
  it("attribue à chaque étape le temps écoulé DEPUIS LA PRÉCÉDENTE, pas depuis le départ", () => {
    // La faute naturelle est de publier des horodatages cumulés : la dernière étape
    // paraîtrait alors coûter toute la passe, et l'étape coupable resterait invisible.
    const h = horloge();
    const c = creerChrono(h.lire);

    h.avancer(120);
    c.jalon("villes");
    h.avancer(4_200);
    c.jalon("situer");
    h.avancer(11_300);
    c.jalon("registre");

    expect(c.releve()).toEqual([
      { nom: "villes", ms: 120 },
      { nom: "situer", ms: 4_200 },
      { nom: "registre", ms: 11_300 },
    ]);
  });

  it("garde l'ORDRE CHRONOLOGIQUE — trier par durée détruirait l'information", () => {
    // Ce qu'on cherche est l'étape qui mange le reliquat de CELLES QUI LA SUIVENT. C'est une
    // relation d'ordre : la plus longue en tête ne dit plus qui a affamé qui.
    const h = horloge();
    const c = creerChrono(h.lire);
    h.avancer(9_000);
    c.jalon("grosse");
    h.avancer(10);
    c.jalon("petite");

    expect(c.ligne()).toBe("grosse:9000ms petite:10ms (total 9010 ms)");
  });

  it("AFFICHE les zéros au lieu de les masquer", () => {
    // « Cette étape n'a rien eu à faire » et « cette étape n'a pas été atteinte » sont deux
    // situations opposées. Faire disparaître l'entrée les rendrait indiscernables — et c'est
    // exactement la famine que ce dépôt vient de payer sur l'étape des bornes.
    const h = horloge();
    const c = creerChrono(h.lire);
    c.jalon("rien");
    h.avancer(50);
    c.jalon("quelque-chose");

    expect(c.ligne()).toBe("rien:0ms quelque-chose:50ms (total 50 ms)");
  });

  it("une passe sans aucune étape le DIT, au lieu de rendre une ligne vide", () => {
    // Une ligne vide se lirait comme une passe instantanée — un fait inventé.
    expect(creerChrono(horloge().lire).ligne()).toBe("aucune étape franchie");
  });

  it("le relevé est une COPIE : le lire ne peut pas altérer la mesure", () => {
    const h = horloge();
    const c = creerChrono(h.lire);
    h.avancer(5);
    c.jalon("a");
    const vu = c.releve();
    vu.push({ nom: "inventée", ms: 999 });
    expect(c.releve()).toHaveLength(1);
  });
});

describe("le câblage dans la passe de distances", () => {
  it("⚠️ CHAQUE étape porte son jalon — l'inventaire est ici pour rougir", () => {
    // Le mode de panne de cet instrument n'est pas qu'il se trompe : c'est qu'on ajoute une
    // étape à la passe et qu'on oublie de la mesurer. L'étape muette devient alors invisible
    // exactement comme `adressesDepuisRegistre` l'était — le défaut qu'on vient de corriger,
    // réintroduit par un oubli.
    //
    // Cette liste se met à jour DÉLIBÉRÉMENT : si elle rougit, la bonne question est « la
    // nouvelle étape a-t-elle son jalon ? », pas « comment faire repasser le test ? ».
    const source = readFileSync(resolve(process.cwd(), "lib/actions.ts"), "utf8");
    const noms = [...source.matchAll(/\bjalon\("([a-z-]+)"\)/g)].map((m) => m[1]);
    expect(noms).toEqual([
      "villes",
      "centres",
      "situer",
      "adresses",
      "registre",
      "raffinage",
      "bornes",
      "details",
      "mesure",
    ]);
    // Et la ligne part vraiment dans les journaux : un chrono calculé et jamais écrit est la
    // classe `[FERMETURE-03]`, et ce lot entier ne sert qu'à ce qu'on puisse LIRE la mesure.
    expect(source).toContain("[distances] budget par étape —");
  });
});
