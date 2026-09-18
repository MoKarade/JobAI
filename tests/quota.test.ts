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
    //
    // ⚠️ ELLE A CHANGÉ DE FICHIER LE 2026-09-18, ET C'EST UNE RE-DÉCISION, PAS UN RE-BASEMENT.
    // Elle lisait `lib/actions.ts`, où l'appel vivait. La sélection est passée dans
    // `choisirARaffiner` (`lib/travaux.ts`) parce que trancher AVANT d'écarter les éligibles
    // sans ville laissait celles-ci occuper une place à vie. Le FAIT défendu n'a pas bougé —
    // la tranche et le reste sortent du même appel —, seul son domicile a changé.
    const selection = readFileSync(resolve(process.cwd(), "lib/travaux.ts"), "utf8");
    expect(selection).toMatch(/const \{ servies, sansTentative \} = trancherParQuota\(/);

    // Et les DEUX passes CONSOMMENT cette sélection au lieu de refaire la tranche chez elles.
    // `[QUOTA-VILLE-02]` : le rattrapage des adresses portait le même défaut d'ordre, écrit
    // deux cents lignes plus haut. Nommer les deux ici est ce qui empêche qu'une seule des
    // deux files reparte en copie privée.
    const passe = readFileSync(resolve(process.cwd(), "lib/actions.ts"), "utf8");
    expect(passe).toMatch(/const \{ servies, sansTentative, sansVille \} = choisirARaffiner\(/);
    expect(passe).toMatch(
      /const \{ servies, sansTentative, sansVille \} = choisirARattraperAdresse\(/,
    );

    // Les comptes partent bien dans les journaux : calculés sans être écrits, ils ne
    // répondraient à personne — c'est toute la raison d'être de l'item. DEUX comptes, et
    // DEUX lignes de journal : on exige donc deux occurrences de chacun, sinon une des deux
    // files pourrait cesser de publier sans que rien ne rougisse.
    //
    // ⚠️ LE MOTIF PORTE L'INTERPOLATION, PAS SEULEMENT LE TEXTE — sinon il compte la PROSE.
    // Premier jet : `/en attente de quota/g` rendait TROIS occurrences, la troisième étant
    // le commentaire qui explique le champ. Ancré sur `.sansVille}`, il ne peut matcher que
    // du code.
    expect(passe.match(/\.sansTentative\} en attente de quota/g)).toHaveLength(2);
    expect(passe.match(/\.sansVille\} sans ville connue/g)).toHaveLength(2);
  });
});
