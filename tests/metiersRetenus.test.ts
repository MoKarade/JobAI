// tests/metiersRetenus.test.ts — la liste de métiers que Marc règle depuis l'app.
//
// Ce qui se protège ici n'est pas la syntaxe d'une saisie, c'est ce qu'une saisie mal lue
// COÛTE : un code refusé en silence, et la source du flux tourne pour rien pendant des
// semaines sans qu'aucun voyant ne change. La règle du dépôt est déjà écrite — compter un
// refus ne suffit pas, il faut le NOMMER — et elle vaut ici pour les fragments rejetés.

import { describe, it, expect } from "vitest";
import {
  MAX_METIERS,
  METIERS_DEFAUT,
  metiersRedondants,
  normaliserMetiers,
  normaliserModeFlux,
  MODE_FLUX_DEFAUT,
} from "../lib/metiersRetenus";
import { codeRetenu, lireCodeNoc } from "../lib/nocProfession";

describe("normaliserMetiers — ce qui est lu, et ce qui est refusé À VOIX HAUTE", () => {
  it("accepte les deux granularités que codeRetenu sait comparer", () => {
    const r = normaliserMetiers("21 21301");
    expect(r.codes).toEqual(["21", "21301"]);
    expect(r.rejets).toEqual([]);
  });

  it("REFUSE toute autre longueur, et rend le fragment tel que saisi", () => {
    // ⚠️ C'est la garde qui empêche une politique de se glisser dans une saisie : un « 2 »
    // interprété comme « tout le domaine 2 » ferait entrer des dizaines de métiers que Marc
    // n'a pas demandés. On ne devine pas, et on le DIT.
    const r = normaliserMetiers("2, 2130, 213011, abc, 21");
    expect(r.codes).toEqual(["21"]);
    expect(r.rejets).toEqual(["2", "2130", "213011", "abc"]);
  });

  it("dédoublonne et trie — la liste est relue par un humain à chaque réglage", () => {
    const r = normaliserMetiers("72 21 72 21301 21");
    expect(r.codes).toEqual(["21", "21301", "72"]);
  });

  it("sépare sur les espaces, les virgules, les points-virgules et les retours à la ligne", () => {
    expect(normaliserMetiers("21,72;\n22\t21301").codes).toEqual(["21", "21301", "22", "72"]);
  });

  it("accepte un tableau (c'est la forme lue depuis l'état persisté)", () => {
    expect(normaliserMetiers(["21", "72"]).codes).toEqual(["21", "72"]);
  });

  it("rend une liste vide sur une saisie vide, sans rejet inventé", () => {
    const r = normaliserMetiers("   ");
    expect(r.codes).toEqual([]);
    expect(r.rejets).toEqual([]);
    expect(r.troplong).toBe(false);
  });

  it("REFUSE la saisie entière au-delà du plafond, plutôt que de la tronquer", () => {
    // ⚠️ Une troncature silencieuse ferait croire à Marc qu'il a retenu des métiers que la
    // source ne verra jamais — exactement le défaut que `rejets` existe pour empêcher.
    // Le cas se DÉRIVE de la constante, jamais de sa valeur du jour : codé « 121 codes »,
    // ce test mentirait au premier rajustement du plafond.
    const trop = Array.from({ length: MAX_METIERS + 1 }, (_, i) =>
      String(10000 + i).padStart(5, "0"),
    );
    const r = normaliserMetiers(trop.join(" "));
    expect(r.troplong).toBe(true);
    expect(r.codes).toEqual([]);

    const juste = normaliserMetiers(trop.slice(0, MAX_METIERS).join(" "));
    expect(juste.troplong).toBe(false);
    expect(juste.codes).toHaveLength(MAX_METIERS);
  });

  it("le défaut est VIDE — la source du flux reste éteinte tant que Marc n'a pas choisi", () => {
    expect(METIERS_DEFAUT).toEqual([]);
  });

  it("tout code accepté est effectivement comparable par codeRetenu", () => {
    // Le lien entre les deux modules est l'invariant qui compte : accepter une forme que
    // `codeRetenu` ne sait pas comparer produirait une liste inerte, sans erreur.
    const code = lireCodeNoc("21301");
    expect(code).not.toBeNull();
    for (const c of normaliserMetiers("21 21301").codes) {
      expect(codeRetenu(code!, [c])).toBe(true);
    }
  });
});

describe("metiersRedondants — dire ce qui ne sert à rien plutôt que de le retirer", () => {
  it("nomme un code complet déjà couvert par son préfixe", () => {
    expect(metiersRedondants(["21", "21301", "72201"])).toEqual(["21301"]);
  });

  it("ne signale rien quand le préfixe est absent", () => {
    expect(metiersRedondants(["21301", "72201"])).toEqual([]);
  });
});

describe("normaliserModeFlux — l'absence de mode n'éteint pas une source allumée", () => {
  it("lit une valeur explicite telle quelle, y compris « eteint »", () => {
    expect(normaliserModeFlux("tout", ["70"])).toBe("tout");
    expect(normaliserModeFlux("domaine", ["70"])).toBe("domaine");
    // Explicite : éteint MALGRÉ une liste remplie. C'est ce qui permet de couper la source
    // sans avoir à vider ses réglages.
    expect(normaliserModeFlux("eteint", ["70"])).toBe("eteint");
  });

  it("sans mode enregistré, une liste NON VIDE vaut « domaine » — le comportement d'avant", () => {
    // ⚠️ LA RÉTROCOMPATIBILITÉ. Avant ADR-0013 il n'y avait pas de mode : une liste remplie
    // suffisait à allumer la source filtrée. Rabattre l'absence sur « eteint » couperait en
    // silence une source que Marc avait allumée.
    for (const absent of [null, undefined, "", "n'importe quoi", 42]) {
      expect(normaliserModeFlux(absent, ["70", "92"])).toBe("domaine");
    }
  });

  it("sans mode enregistré et liste VIDE, c'est « eteint » — le défaut sûr", () => {
    for (const absent of [null, undefined, "bidon"]) {
      expect(normaliserModeFlux(absent, [])).toBe("eteint");
    }
  });

  it("le défaut du paramètre `metiers` ne rallume rien", () => {
    expect(normaliserModeFlux(null)).toBe(MODE_FLUX_DEFAUT);
    expect(MODE_FLUX_DEFAUT).toBe("eteint");
  });
});
