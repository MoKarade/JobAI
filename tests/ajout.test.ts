// tests/ajout.test.ts — l'ajout manuel d'une offre.
//
// Trois choses valent d'être verrouillées ici, parce qu'elles se cassent en silence :
// l'identifiant (une collision écraserait une offre existante), la provenance de la note
// (garde-fou n°3 : une note calculée ne doit jamais se faire passer pour une note
// vérifiée), et la DATE — le serveur tourne en UTC, Marc vit à UTC−4.

import { describe, it, expect } from "vitest";
import {
  FUSEAU,
  NouvelleOffreSchema,
  aujourdhui,
  construireOffre,
  identifiantPour,
  slug,
} from "../lib/ajout";
import { OffreSchema } from "../lib/types";
import { PLAFOND_NOTE_CALCULEE } from "../lib/scoring";

/** La saisie minimale valide, à surcharger cas par cas. */
function saisie(champs: Record<string, unknown> = {}) {
  return NouvelleOffreSchema.parse({
    entreprise: "Fabrique Nord",
    poste: "Coordonnateur automatisation",
    ...champs,
  });
}

describe("slug", () => {
  it("retire les accents plutôt que de les remplacer par des tirets", () => {
    expect(slug("Élévateurs Québec")).toBe("elevateurs-quebec");
  });

  it("traite les ligatures françaises, que NFD ne décompose pas", () => {
    // Sans le traitement explicite, « Cœur » donnerait « c-ur » : illisible dans une URL.
    expect(slug("Cœur de Métier")).toBe("coeur-de-metier");
    expect(slug("Ex æquo")).toBe("ex-aequo");
  });

  it("réduit la ponctuation à un seul tiret, sans tiret aux extrémités", () => {
    expect(slug("  Groupe A.C.E. — inc.  ")).toBe("groupe-a-c-e-inc");
  });

  it("rend une chaîne vide quand il ne reste rien de latin", () => {
    // Ce cas n'est pas théorique : il détermine s'il faut un repli dans `identifiantPour`.
    expect(slug("現場監督")).toBe("");
  });
});

describe("identifiant", () => {
  it("combine l'entreprise et le poste", () => {
    expect(identifiantPour("IEL Technologie", "Superviseur technique")).toBe(
      "iel-technologie-superviseur-technique",
    );
  });

  it("suffixe en cas de collision, sans jamais rendre un identifiant déjà pris", () => {
    const deja = new Set(["fabrique-nord-soudeur", "fabrique-nord-soudeur-2"]);
    expect(identifiantPour("Fabrique Nord", "Soudeur", deja)).toBe("fabrique-nord-soudeur-3");
  });

  it("respecte la longueur maximale de `OffreSchema`, suffixe compris", () => {
    const long = identifiantPour("A".repeat(120), "B".repeat(200));
    expect(long.length).toBeLessThanOrEqual(80);
    // Et il reste un identifiant VALIDE : c'est la contrainte qui compte, pas la longueur.
    expect(() => OffreSchema.shape.id.parse(long)).not.toThrow();

    const avecSuffixe = identifiantPour("A".repeat(120), "B".repeat(200), new Set([long]));
    expect(avecSuffixe.length).toBeLessThanOrEqual(80);
    expect(() => OffreSchema.shape.id.parse(avecSuffixe)).not.toThrow();
  });

  it("ne laisse jamais de tiret en fin d'identifiant après troncature", () => {
    // Un tiret final passe le regex mais donne une URL laide et un diff instable.
    const id = identifiantPour("Entreprise", `${"x".repeat(70)} suite du titre`);
    expect(id.endsWith("-")).toBe(false);
  });

  it("se rabat sur un identifiant valide quand le slug est vide", () => {
    const id = identifiantPour("現場", "監督");
    expect(id).toBe("offre");
    expect(() => OffreSchema.shape.id.parse(id)).not.toThrow();
  });

  it("lève plutôt que de rendre un doublon quand toutes les variantes sont prises", () => {
    const base = identifiantPour("Fabrique Nord", "Soudeur");
    const toutes = new Set([base, ...Array.from({ length: 199 }, (_, i) => `${base}-${i + 2}`)]);
    expect(() => identifiantPour("Fabrique Nord", "Soudeur", toutes)).toThrow();
  });
});

describe("date de repérage", () => {
  it("suit le fuseau de Marc, pas l'UTC du serveur", () => {
    // 2026-07-29 à 01:30 UTC = 2026-07-28 à 21:30 à Québec. Une offre ajoutée le soir doit
    // porter la date du SOIR MÊME. `toISOString().slice(0,10)` rendrait ici « 2026-07-29 ».
    const soir = new Date("2026-07-29T01:30:00.000Z");
    expect(soir.toISOString().slice(0, 10)).toBe("2026-07-29"); // ce que fait l'UTC
    expect(aujourdhui(soir)).toBe("2026-07-28"); // ce qu'il faut
  });

  it("bascule au bon moment, pas avant", () => {
    // Minuit pile à Québec = 04:00 UTC en heure avancée de l'Est.
    expect(aujourdhui(new Date("2026-07-29T03:59:00.000Z"))).toBe("2026-07-28");
    expect(aujourdhui(new Date("2026-07-29T04:00:00.000Z"))).toBe("2026-07-29");
  });

  it("rend un format que `OffreSchema` accepte", () => {
    const jour = aujourdhui(new Date("2026-01-05T12:00:00.000Z"));
    expect(jour).toBe("2026-01-05");
    expect(() => OffreSchema.shape.dateReperage.parse(jour)).not.toThrow();
  });

  it("nomme un fuseau réellement connu du moteur", () => {
    // Un fuseau inconnu ne lève pas toujours : il peut retomber silencieusement sur UTC.
    const resolu = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).resolvedOptions()
      .timeZone;
    expect(resolu).toBe(FUSEAU);
  });
});

describe("validation de la saisie", () => {
  it("refuse une entreprise ou un poste vide", () => {
    expect(NouvelleOffreSchema.safeParse({ entreprise: "  ", poste: "Soudeur" }).success).toBe(
      false,
    );
    expect(NouvelleOffreSchema.safeParse({ entreprise: "Alpha", poste: "" }).success).toBe(false);
  });

  it("accepte un lien vide, refuse un lien qui n'en est pas un", () => {
    expect(saisie({ lien: "" }).lien).toBe("");
    expect(NouvelleOffreSchema.safeParse({
      entreprise: "A",
      poste: "B",
      lien: "pas-une-url",
    }).success).toBe(false);
  });

  it("distingue une distance ABSENTE d'une distance nulle", () => {
    // Le barème traite les deux à l'opposé : `null` est neutre, `0` est le maximum.
    expect(saisie().km).toBeNull();
    expect(saisie({ km: 0 }).km).toBe(0);
  });

  it("refuse une distance négative, non finie ou invraisemblable", () => {
    for (const km of [-1, Number.NaN, Number.POSITIVE_INFINITY, 5000]) {
      expect(NouvelleOffreSchema.safeParse({ entreprise: "A", poste: "B", km }).success).toBe(
        false,
      );
    }
  });

  it("refuse une note hors de 0–100 ou décimale", () => {
    for (const note of [-1, 101, 72.5]) {
      expect(NouvelleOffreSchema.safeParse({ entreprise: "A", poste: "B", note }).success).toBe(
        false,
      );
    }
  });

  it("nettoie les espaces autour des valeurs", () => {
    expect(saisie({ entreprise: "  Fabrique Nord  " }).entreprise).toBe("Fabrique Nord");
  });
});

describe("construction de l'offre", () => {
  const ctx = { id: "fabrique-nord-coordonnateur", aujourdhui: "2026-07-28" };

  it("marque l'origine : ajoutée par l'utilisateur, active, jamais envoyée", () => {
    const o = construireOffre(saisie(), ctx);
    expect(o.source).toBe("user");
    expect(o.statut).toBe("Identifiee");
    expect(o.dateEnvoi).toBe("");
    expect(o.histo).toBe(false);
    expect(o.perimeeLe).toBeNull();
  });

  it("garde la note saisie et la déclare VÉRIFIÉE À LA MAIN", () => {
    const o = construireOffre(saisie({ note: 91 }), ctx);
    expect(o.score).toBe(91);
    expect(o.scoreSource).toBe("manuel");
  });

  it("calcule la note quand elle est laissée vide, et le déclare", () => {
    const o = construireOffre(saisie({ note: null }), ctx);
    expect(o.scoreSource).toBe("calcule");
    expect(o.score).not.toBeNull();
  });

  it("ne laisse JAMAIS une note calculée dépasser le plafond", () => {
    // Garde-fou n°3 : une note calculée ne doit pas passer devant une offre lue à la main.
    // Le poste le mieux noté possible, à distance nulle.
    const o = construireOffre(
      saisie({ poste: "Coordonnateur automatisation robotique", km: 0, note: null }),
      ctx,
    );
    expect(o.score).toBeLessThanOrEqual(PLAFOND_NOTE_CALCULEE);
  });

  it("laisse une note MANUELLE dépasser ce plafond — c'est tout l'intérêt", () => {
    const o = construireOffre(saisie({ note: 100 }), ctx);
    expect(o.score).toBe(100);
  });

  it("n'invente aucune justification", () => {
    // Une justification décrit une LECTURE de l'annonce, que personne n'a faite ici.
    // La fabriquer depuis le barème donnerait à un calcul l'apparence d'une analyse.
    expect(construireOffre(saisie(), ctx).raisons).toEqual([]);
    expect(construireOffre(saisie(), ctx).notes).toBe("");
  });

  it("préserve la note personnelle, qui appartient à Marc", () => {
    const o = construireOffre(saisie({ userNote: "Vu sur LinkedIn, relancer lundi" }), ctx);
    expect(o.userNote).toBe("Vu sur LinkedIn, relancer lundi");
  });

  it("rend une offre que `OffreSchema` accepte, toujours", () => {
    // La fonction parse déjà en sortie ; ce test verrouille le fait qu'elle le FASSE.
    for (const cas of [{}, { km: 0 }, { note: 0 }, { note: 100 }, { lien: "https://x.test/a" }]) {
      expect(() => OffreSchema.parse(construireOffre(saisie(cas), ctx))).not.toThrow();
    }
  });

  it("refuse de construire une offre avec un identifiant hors contrat", () => {
    // Le parse de sortie est la dernière barrière : un identifiant en majuscules ou vide
    // ne doit pas atteindre la base, même si l'appelant se trompe.
    expect(() => construireOffre(saisie(), { ...ctx, id: "Majuscules Interdites" })).toThrow();
    expect(() => construireOffre(saisie(), { ...ctx, id: "" })).toThrow();
  });
});
