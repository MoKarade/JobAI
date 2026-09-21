// tests/employeurs.test.ts — le même employeur sous deux noms.
//
// ⚠️ HISTORIQUE (ADR-0022, 2026-09-21). Ce module portait deux règles à la frontière nette :
// `apparier` (sous-chaîne, GROUPAIT l'affichage) et `memeEmployeur` (égalité, DÉCIDAIT des
// données). `memeEmployeur` couvre désormais LES DEUX rôles — via `cleGroupement` côté
// affichage — parce que le flou d'`apparier` groupait aussi ce qu'il n'aurait pas dû : le
// même défaut qui faisait fusionner « Robert » et « Groupe Robert » côté DONNÉES existait
// côté AFFICHAGE depuis le début (mesuré : `lib/carte.ts` et `lib/groupesEntreprise.ts`
// l'employaient pour regrouper les épingles et les cartes de la liste). `apparier` survit
// pour un usage distinct : le proofreading (`tests/reference.test.ts`), où un faux positif
// coûte un coup d'œil humain, jamais une fusion silencieuse. Les tests du bas verrouillent
// cette nouvelle frontière.

import { describe, it, expect } from "vitest";
import {
  ALIAS_EMPLOYEUR,
  LONGUEUR_MIN_APPARIEMENT,
  apparier,
  cleGroupement,
  memeEmployeur,
  normaliserNomEmployeur,
  positionDe,
} from "../lib/employeurs";
import { ENTREPRISES_CIBLES } from "../lib/reference";
import { SEED } from "../lib/seed";

describe("appariement des noms", () => {
  it("apparie une désignation plus longue à sa forme courte", () => {
    expect(apparier("Groupe Leclerc", "Leclerc")).toBe(true);
    expect(apparier("Laserax", "Laserax inc.")).toBe(true);
    expect(apparier("STERIS Canada", "STERIS")).toBe(true);
  });

  it("n'apparie PAS deux employeurs distincts", () => {
    expect(apparier("Canam Ponts", "Robotiq")).toBe(false);
  });

  it("ignore la casse et les espaces de bord", () => {
    expect(apparier("  LASERAX  ", "laserax")).toBe(true);
  });

  it("exige l'égalité stricte sous la longueur minimale", () => {
    // Sans plancher, un sigle apparierait la moitié de la liste par sous-chaîne. La
    // contrepartie est assumée : « ISS » et « ISS Facility Services » restent distincts.
    const court = "A".repeat(LONGUEUR_MIN_APPARIEMENT - 1);
    expect(apparier(court, `${court}METEK`)).toBe(false);
    expect(apparier(court, court)).toBe(true);
    expect(apparier("ISS", "ISS Facility Services")).toBe(false);
    expect(apparier("", "")).toBe(false);
  });
});

describe("retrouver une position sous n'importe lequel des deux noms", () => {
  const positions = new Map([
    ["Laserax", { lat: 46.75, lon: -71.29 }],
    ["Chantier Davie", { lat: 46.73, lon: -71.18 }],
  ]);

  it("rend la position quand le nom coïncide", () => {
    expect(positionDe("Laserax", positions)).toEqual({ lat: 46.75, lon: -71.29 });
  });

  it("rend la position quand le nom DIFFÈRE mais désigne le même employeur", () => {
    // C'est tout l'objet du module : la passe de la carte inscrit `cible.nom`, la mesure
    // des distances inscrit `offre.entreprise`. Les deux doivent se retrouver.
    expect(positionDe("Laserax inc.", positions)).toEqual({ lat: 46.75, lon: -71.29 });
  });

  it("rend null — et pas undefined — quand l'employeur est inconnu", () => {
    expect(positionDe("Employeur Jamais Vu", positions)).toBeNull();
  });

  it("préfère l'égalité stricte à l'heuristique", () => {
    // Quand les deux noms coïncident, aucune heuristique n'a à se prononcer : sinon
    // l'ordre d'insertion de la table déciderait à sa place.
    const ambigu = new Map([
      ["Groupe Test Canada", { lat: 1, lon: 1 }],
      ["Groupe Test", { lat: 2, lon: 2 }],
    ]);
    expect(positionDe("Groupe Test", ambigu)).toEqual({ lat: 2, lon: 2 });
  });

  it("ne trouve rien dans une table vide, sans lever", () => {
    expect(positionDe("Laserax", new Map())).toBeNull();
  });
});

describe("l'égalité STRICTE, celle qui décide des données", () => {
  // `apparier` groupe un affichage ; `memeEmployeur` décide quelle position sert à écrire
  // une distance et une note. Confondre les deux a un coût mesuré, verrouillé plus bas.

  it("ignore la forme juridique, la casse et la ponctuation", () => {
    expect(memeEmployeur("Laserax", "Laserax inc.")).toBe(true);
    expect(memeEmployeur("LASERAX INC", "laserax")).toBe(true);
    expect(memeEmployeur("Machin ltée", "Machin")).toBe(true);
    expect(memeEmployeur("Truc Corp.", "truc")).toBe(true);
  });

  it("retire les formes juridiques EMPILÉES", () => {
    expect(normaliserNomEmployeur("Machin inc. ltée")).toBe("machin");
  });

  it("ne rapproche PAS deux employeurs qu'une sous-chaîne suffirait à confondre", () => {
    // LE cas qui a motivé la séparation des deux règles. Mesuré avant correction :
    // `apparier` rendait `true`, donc une offre de « Robert » recevait la position, la
    // distance et la note de « Groupe Robert » — sans un mot dans les journaux.
    expect(apparier("Robert", "Groupe Robert")).toBe(true);
    expect(memeEmployeur("Robert", "Groupe Robert")).toBe(false);
    expect(memeEmployeur("Leclerc", "Groupe Leclerc")).toBe(false);
    expect(memeEmployeur("Boulangerie Leclerc", "Groupe Leclerc")).toBe(false);
  });

  it("un nom vide n'apparie rien, pas même un autre nom vide", () => {
    expect(memeEmployeur("", "")).toBe(false);
    expect(memeEmployeur("  inc.  ", "")).toBe(false);
  });

  it("aucune entreprise cible n'en confond une autre", () => {
    // Volume prouvé : sans cette borne, une liste vidée ferait passer le test à vide.
    expect(ENTREPRISES_CIBLES.length).toBeGreaterThan(20);
    const confusions: string[] = [];
    for (const a of ENTREPRISES_CIBLES) {
      for (const b of ENTREPRISES_CIBLES) {
        if (a.nom !== b.nom && memeEmployeur(a.nom, b.nom)) confusions.push(`${a.nom} ~ ${b.nom}`);
      }
    }
    expect(confusions).toEqual([]);
  });
});

describe("cleGroupement — la même identité que memeEmployeur, en O(1) (ADR-0022)", () => {
  it("deux noms qui apparient au sens STRICT rendent la MÊME clé", () => {
    expect(cleGroupement("Laserax", "secours")).toBe(cleGroupement("Laserax inc.", "secours"));
    expect(cleGroupement("LASERAX INC", "secours")).toBe(cleGroupement("laserax", "secours"));
  });

  it("deux noms qui ne s'égalent QUE par sous-chaîne rendent des clés DIFFÉRENTES", () => {
    // Le cœur du changement : `apparier("Robert", "Groupe Robert")` vaut `true`, mais
    // `cleGroupement` ne doit PAS les confondre — c'est exactement ce que `memeEmployeur`
    // refuse déjà.
    expect(apparier("Robert", "Groupe Robert")).toBe(true);
    expect(cleGroupement("Robert", "s1")).not.toBe(cleGroupement("Groupe Robert", "s2"));
  });

  it("l'équivalence tient : cleGroupement(a) === cleGroupement(b) ⟺ memeEmployeur(a, b)", () => {
    const paires: [string, string][] = [
      ["Laserax", "Laserax inc."],
      ["Robert", "Groupe Robert"],
      ["STERIS", "STERIS Canada"],
      ["Machin ltée", "Machin"],
      ["Canam Ponts", "Robotiq"],
      ["ISS", "ISS Facility Services"],
    ];
    for (const [a, b] of paires) {
      expect(cleGroupement(a, "s") === cleGroupement(b, "s"), `${a} / ${b}`).toBe(
        memeEmployeur(a, b),
      );
    }
  });

  it("un nom vide ne fusionne PAS avec un autre nom vide — le secours les distingue", () => {
    // `memeEmployeur("", "")` vaut `false` : une clé de Map, elle, ne peut pas « refuser »
    // une égalité — sans secours, deux offres à l'entreprise vide fusionneraient en silence.
    expect(cleGroupement("", "offre-1")).not.toBe(cleGroupement("", "offre-2"));
    // Mais un même secours pour un même nom vide reste déterministe (même offre, même clé).
    expect(cleGroupement("", "offre-1")).toBe(cleGroupement("", "offre-1"));
  });

  it("le secours n'entre PAS en jeu quand le nom est réel — deux offres du même employeur se retrouvent malgré des secours différents", () => {
    expect(cleGroupement("Laserax", "offre-a")).toBe(cleGroupement("Laserax", "offre-b"));
  });
});

describe("positionDe ne décide jamais au hasard", () => {
  it("n'utilise PAS la règle floue : un homonyme partiel n'a pas de position", () => {
    const positions = new Map([["Groupe Robert", { lat: 46.7, lon: -71.15 }]]);
    expect(positionDe("Robert", positions)).toBeNull();
  });

  it("rend le MÊME résultat quel que soit l'ordre de la table", () => {
    // `db.select()` sans `ORDER BY` ne garantit aucun ordre. Sans tri, le gagnant d'une
    // ambiguïté changerait d'une requête à l'autre — puis serait figé en base par la
    // première mesure de distance, donc indébogable après coup.
    const entrees: [string, { lat: number; lon: number }][] = [
      ["Machin ltée", { lat: 1, lon: 1 }],
      ["Machin inc.", { lat: 2, lon: 2 }],
    ];
    const a = positionDe("Machin", new Map(entrees));
    const b = positionDe("Machin", new Map([...entrees].reverse()));
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
});

describe("ALIAS_EMPLOYEUR — deux cas RENCONTRÉS, jamais une heuristique (ADR-0023)", () => {
  it("rapproche les deux paires connues, dans les DEUX sens", () => {
    expect(memeEmployeur("STERIS", "STERIS Canada")).toBe(true);
    expect(memeEmployeur("STERIS Canada", "STERIS")).toBe(true);
    expect(memeEmployeur("Exo-s Saint-Damien", "Exo-s")).toBe(true);
    expect(memeEmployeur("Exo-s", "Exo-s Saint-Damien")).toBe(true);
  });

  it("joue APRÈS le retrait des suffixes juridiques, pas à la place", () => {
    // « STERIS Canada inc. » doit perdre son suffixe ET son alias, dans cet ordre — l'alias
    // vise la forme déjà nettoyée, jamais le nom brut.
    expect(memeEmployeur("STERIS Canada inc.", "STERIS")).toBe(true);
  });

  it("ne rapproche PAS un cas voisin non vérifié — ce n'est pas une règle générale de pays/lieu", () => {
    // Le risque nommé par ADR-0023 : une règle syntaxique (retirer tout qualificatif
    // géographique) se tromperait un jour. La table n'énumère QUE ce qui a été vérifié.
    expect(memeEmployeur("Robert", "Groupe Robert")).toBe(false);
    expect(memeEmployeur("Novatech", "Novatech Canada")).toBe(false);
    expect(memeEmployeur("Groupe Novatech", "Novatech")).toBe(false);
    expect(memeEmployeur("ISS", "ISS Facility Services")).toBe(false);
  });

  it("positionDe retrouve désormais la position déjà connue sous l'autre nom", () => {
    const positions = new Map([["STERIS Canada", { lat: 46.85, lon: -71.2 }]]);
    expect(positionDe("STERIS", positions)).toEqual({ lat: 46.85, lon: -71.2 });
  });

  it("reste PETITE : une borne haute, mutation-testée par ce test lui-même", () => {
    // Volontairement PETITE (voir le commentaire de la table) : une table qui grossit sans
    // être relue à chaque ajout redevient une heuristique. La borne est haute exprès —
    // ce test doit ALERTER en cas de croissance, pas empêcher un ajout vérifié.
    expect(ALIAS_EMPLOYEUR.size).toBeGreaterThan(0);
    expect(ALIAS_EMPLOYEUR.size).toBeLessThanOrEqual(10);
  });

  it("audit SEED × ENTREPRISES_CIBLES : SEULES les deux paires visées changent (§11 point 2)", () => {
    // Reproduit l'audit qui a précédé le code (ADR-0023) : sur l'ensemble croisé, la table
    // ne doit faire basculer AUCUNE autre paire de « distincts » à « même employeur ».
    const avantAlias = (nom: string): string => {
      // La normalisation SANS l'alias — pour isoler l'effet de la table seule.
      let n = nom
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[.,;()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      for (let encore = true; encore; ) {
        encore = false;
        for (const s of ["inc", "ltee", "ltd", "limitee", "corp", "corporation", "enr", "cie", "co", "senc", "sencrl"]) {
          if (n.endsWith(` ${s}`)) {
            n = n.slice(0, -(s.length + 1)).trim();
            encore = true;
          }
        }
      }
      return n;
    };
    const bascules: string[] = [];
    for (const o of SEED) {
      for (const c of ENTREPRISES_CIBLES) {
        const avant = avantAlias(o.entreprise) !== "" && avantAlias(o.entreprise) === avantAlias(c.nom);
        const apres = memeEmployeur(o.entreprise, c.nom);
        if (avant !== apres) bascules.push(`${o.entreprise} / ${c.nom}`);
      }
    }
    // Volume prouvé : sans lui, une liste vidée ferait passer l'audit à vide.
    expect(SEED.length * ENTREPRISES_CIBLES.length).toBeGreaterThan(1000);
    expect(bascules.sort()).toEqual(["Exo-s Saint-Damien / Exo-s", "STERIS / STERIS Canada"]);
  });
});
