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

describe("METIERS_DEFAUT — le défaut n'est plus vide, et il est MESURÉ", () => {
  it("porte les quatre classes relevées sur la lecture complète du flux", () => {
    // ⚠️ CE TEST VERROUILLE UNE DÉCISION, pas une valeur de commodité. Repasser le défaut à
    // vide rendrait le facteur de domaine inerte — donc un laveur de voitures proche
    // battrait un coordonnateur de projet, le défaut MESURÉ le 2026-08-20 et corrigé.
    expect([...METIERS_DEFAUT].sort()).toEqual(["21", "22", "70", "92"]);
  });

  it("est lisible par le normaliseur — un défaut mal formé ne retiendrait rien", () => {
    // Un code hors des deux granularités que `codeRetenu` compare serait silencieusement
    // ignoré : le défaut doit franchir sa propre validation.
    const r = normaliserMetiers([...METIERS_DEFAUT].join(" "));
    expect(r.codes).toHaveLength(METIERS_DEFAUT.length);
    expect(r.rejets).toEqual([]);
  });
});
