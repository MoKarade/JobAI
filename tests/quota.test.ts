// tests/quota.test.ts — servir une file bornée sans perdre le compte de ce qui attend.
//
// CE QUE CES TESTS PROTÈGENT (`[V-ROUTINE-QUOTA]`)
//
// Le défaut corrigé n'était pas une mauvaise arithmétique : c'était que le dénominateur de
// `precisees=N/M` se calculait APRÈS la tranche, donc valait au plus N. « Trois candidates »
// et « trois cents candidates dont huit servies » rendaient la même ligne, alors qu'elles
// appellent des gestes opposés. Ce qui doit tenir ici, c'est que la tranche et le reste
// décrivent la MÊME entrée.

import { describe, it, expect } from "vitest";
import { trancherParQuota } from "../lib/quota";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("trancherParQuota — ce qui passe et ce qui attend, d'un seul appel", () => {
  it("sert les `max` PREMIERS, et compte le reste sur la file ENTIÈRE", () => {
    // Le cas du défaut : 10 éligibles, 3 servies. Un compte pris après la tranche dirait
    // « 3 sur 3 » et laisserait croire qu'il n'y avait rien d'autre à faire.
    const t = trancherParQuota(FILE, 3);
    expect(t.servies).toEqual([1, 2, 3]);
    expect(t.sansTentative).toBe(7);
  });

  it("l'ORDRE est préservé — la file est déjà triée par l'appelant", () => {
    // `raffinerPositions` trie par « la moins récemment tentée d'abord » AVANT d'appeler :
    // réordonner ici ferait tourner la file autrement que ce que son tri promet.
    expect(trancherParQuota(FILE, 4).servies).toEqual([1, 2, 3, 4]);
  });

  it("une file plus courte que le quota : rien n'attend", () => {
    // Le contrôle négatif. Sans lui, un `sansTentative` qui rendrait toujours la longueur de
    // la file passerait le premier test.
    const t = trancherParQuota([1, 2], 8);
    expect(t.servies).toEqual([1, 2]);
    expect(t.sansTentative).toBe(0);
  });

  it("file vide : zéro servie, zéro en attente — et surtout pas un négatif", () => {
    expect(trancherParQuota([], 8)).toEqual({ servies: [], sansTentative: 0 });
  });

  it("⚠️ un quota à ZÉRO est un ARRÊT, et TOUT attend", () => {
    // Le cas qui dit la nature du compte : « en attente », jamais « écarté ». Rendre une file
    // vide sans dire que dix éléments attendent ferait passer un arrêt pour une passe qui
    // n'avait rien à faire — exactement la confusion que ce module existe pour lever.
    expect(trancherParQuota(FILE, 0)).toEqual({ servies: [], sansTentative: 10 });
    // Et une borne absurde ne fabrique pas un compte absurde.
    expect(trancherParQuota(FILE, -5)).toEqual({ servies: [], sansTentative: 10 });
  });

  it("ne MUTE pas la file d'origine", () => {
    const source = [...FILE];
    trancherParQuota(source, 3);
    expect(source).toEqual(FILE);
  });
});

describe("le câblage dans le raffinage des positions", () => {
  it("⚠️ le compte vient du MÊME appel que la tranche — pas d'un `slice` posé à part", () => {
    // Le mode de panne de ce correctif est le retour du `slice` séparé : le compte
    // recommencerait à décrire la tranche au lieu de la file. La garde vise donc la FORME de
    // l'appel, parce que c'est elle qui rend le défaut impossible.
    const source = readFileSync(resolve(process.cwd(), "lib/actions.ts"), "utf8");
    expect(source).toMatch(/const \{ servies: lignes, sansTentative \} = trancherParQuota\(/);
    // Et le compte part bien dans les journaux : calculé sans être écrit, il ne répondrait à
    // personne — c'est toute la raison d'être de l'item.
    expect(source).toContain("en attente de quota");
  });
});
