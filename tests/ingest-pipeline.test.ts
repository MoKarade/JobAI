// tests/ingest-pipeline.test.ts — ce qui entre dans le suivi, et ce qui n'y entre pas.
//
// Six sources qui tirent en même temps, c'est trois façons de salir le jeu de données :
// la même offre trois fois, du bruit noyant les bonnes offres, et des lignes qui ont l'air
// vérifiées alors que personne ne les a lues. Les trois se testent ici.

import { describe, it, expect } from "vitest";
import { FIT_ROLE_PLANCHER, idOffre, trier, villesACompleter } from "../lib/ingest/pipeline";
import { OffreSchema, type Offre } from "../lib/types";
import type { OffreBrute } from "../lib/ingest/types";

function brute(champs: Partial<OffreBrute> = {}): OffreBrute {
  return {
    refSource: "1",
    titre: "Coordonnateur de projets en automatisation",
    entreprise: "Exemple inc.",
    ville: "Lévis, QC",
    lien: "https://exemple.test/1",
    description: "Coordination d'une équipe technique, robotique et mise en service.",
    publieeLe: "2026-07-29",
    ...champs,
  };
}

describe("identifiants", () => {
  it("sont stables, lisibles et sans accent", () => {
    expect(idOffre("Groupe Sani-Tech", "Superviseur(e) technique")).toBe(
      "groupe-sani-tech-superviseur-e-technique",
    );
  });

  it("respectent le schéma même sur un titre non latin", () => {
    // Un identifiant vide ferait échouer l'insertion sans rien expliquer.
    const id = idOffre("株式会社", "技術者");
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("tiennent dans la limite du schéma", () => {
    const id = idOffre("Une entreprise au nom très long ".repeat(5), "Un poste au titre interminable ".repeat(5));
    expect(id.length).toBeLessThanOrEqual(80);
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(id.endsWith("-")).toBe(false);
  });
});

describe("dédoublonnage", () => {
  it("la même offre vue sur deux sources n'entre qu'une fois", () => {
    // Le cas central du multi-sources : le Guichet-Emplois et l'ATS de l'employeur
    // publient le même poste, avec des références et des URL différentes.
    const r = trier(
      [
        brute({ refSource: "jb-1", lien: "https://jobbank.test/1" }),
        brute({ refSource: "gh-9", lien: "https://boards.greenhouse.io/x/9" }),
      ],
      new Set(),
      "2026-07-30",
    );
    expect(r.retenues).toHaveLength(1);
    expect(r.doublons).toBe(1);
  });

  it("la première occurrence gagne : les sources fiables passent en tête", () => {
    const r = trier(
      [
        brute({ lien: "https://source-fiable.test/1" }),
        brute({ lien: "https://source-secondaire.test/1" }),
      ],
      new Set(),
      "2026-07-30",
    );
    expect(r.retenues[0]!.lien).toBe("https://source-fiable.test/1");
  });

  it("une offre DÉJÀ suivie n'est pas recréée", () => {
    // Sinon chaque passe quotidienne écraserait le suivi de Marc avec une ligne neuve.
    const id = idOffre("Exemple inc.", "Coordonnateur de projets en automatisation");
    const r = trier([brute()], new Set([id]), "2026-07-30");
    expect(r.retenues).toEqual([]);
    expect(r.doublons).toBe(1);
  });

  it("deux postes DIFFÉRENTS chez le même employeur entrent tous les deux", () => {
    const r = trier(
      [brute(), brute({ titre: "Superviseur maintenance", lien: "https://exemple.test/2" })],
      new Set(),
      "2026-07-30",
    );
    expect(r.retenues).toHaveLength(2);
    expect(r.doublons).toBe(0);
  });
});

describe("seuil de pertinence", () => {
  it("écarte ce qui est sous le plancher, et le COMPTE", () => {
    // Un rétrécissement silencieux serait pire qu'une liste longue : Marc croirait que le
    // marché est vide alors que c'est le filtre qui a coupé.
    const r = trier(
      [brute({ titre: "Préposé à l'entretien ménager", description: "Nettoyage des locaux." })],
      new Set(),
      "2026-07-30",
    );
    expect(r.retenues).toEqual([]);
    expect(r.souslePlancher).toBe(1);
  });

  it("garde un poste de technicien technique — le plancher exact", () => {
    // Cas DÉRIVÉ de la constante, jamais d'une valeur du jour.
    const r = trier(
      [brute({ titre: "Technicien en automatisation", description: "Automates et robotique." })],
      new Set(),
      "2026-07-30",
    );
    expect(r.retenues).toHaveLength(1);
    expect(FIT_ROLE_PLANCHER).toBe(14);
  });

  it("écarte un métier hors profil MALGRÉ une note totale élevée", () => {
    // Le piège mesuré : « Caissier » note 48 sur 100 — plus qu'un plancher naïf à 45 —
    // uniquement grâce aux points des inconnues. Seul fitRole le démasque.
    const r = trier(
      [brute({ titre: "Caissier", description: "Service à la clientèle en épicerie." })],
      new Set(),
      "2026-07-30",
    );
    expect(r.retenues).toEqual([]);
    expect(r.souslePlancher).toBe(1);
  });
});

describe("honnêteté de ce qui entre", () => {
  it("chaque offre respecte le schéma — sinon l'insertion échoue sans rien expliquer", () => {
    const r = trier([brute()], new Set(), "2026-07-30");
    expect(() => OffreSchema.parse(r.retenues[0])).not.toThrow();
  });

  it("la note est marquée CALCULÉE, jamais manuelle", () => {
    // Une note manuelle vient de la lecture de Marc. Marquer « manuel » une note de machine
    // la ferait passer devant ses propres jugements dans le tri.
    const r = trier([brute()], new Set(), "2026-07-30");
    expect(r.retenues[0]!.scoreSource).toBe("calcule");
  });

  it("dit qu'aucun humain n'a lu l'annonce", () => {
    const r = trier([brute()], new Set(), "2026-07-30");
    const textes = r.retenues[0]!.raisons.map((x) => x.texte).join(" ");
    expect(textes).toMatch(/sans lecture humaine|jamais lue/i);
    expect(r.retenues[0]!.notes).toMatch(/veille automatique/i);
  });

  it("n'invente NI distance NI salaire", () => {
    // La ville est connue (« Lévis, QC ») : la tentation serait d'en déduire des km.
    const r = trier([brute()], new Set(), "2026-07-30");
    expect(r.retenues[0]!.km).toBeNull();
    expect(r.retenues[0]!.salaireAffiche).toBeNull();
    expect(r.retenues[0]!.raisons.some((x) => /distance reste à mesurer/i.test(x.texte))).toBe(true);
  });

  it("n'attribue aucun statut ni priorité forte : c'est le domaine de Marc", () => {
    const r = trier([brute()], new Set(), "2026-07-30");
    expect(r.retenues[0]!.statut).toBe("Identifiee");
    expect(r.retenues[0]!.dateEnvoi).toBe("");
    expect(r.retenues[0]!.userNote).toBe("");
  });

  it("nomme l'employeur inconnu plutôt que de laisser un champ vide", () => {
    const r = trier([brute({ entreprise: "  " })], new Set(), "2026-07-30");
    expect(r.retenues[0]!.entreprise).toBe("Employeur non nommé");
  });
});

describe("ce qui est écarté est NOMMÉ, pas seulement compté", () => {
  it("chaque refus porte son motif", () => {
    // Signalé par le premier vrai dépôt : « le serveur donne les compteurs mais ne
    // ventile pas offre par offre ». Un compte seul ne se vérifie pas — « 5 écartées »
    // ne dit pas si le filtre a bien travaillé ou s'il vient de jeter la meilleure
    // offre du jour.
    const r = trier(
      [
        brute({ titre: "Caissier", description: "Épicerie.", ville: "Québec, QC" }),
        brute({ entreprise: "Ailleurs inc.", ville: "Toronto, ON" }),
        brute({ entreprise: "Nulle part", ville: "" }),
      ],
      new Set(),
      "2026-07-31",
    );

    expect(r.refusees).toHaveLength(3);
    const parMotif = Object.fromEntries(r.refusees.map((x) => [x.motif, x.entreprise]));
    expect(parMotif["sous-le-plancher"]).toBe("Exemple inc.");
    expect(parMotif["hors-region"]).toBe("Ailleurs inc.");
    expect(parMotif["lieu-inconnu"]).toBe("Nulle part");
  });

  it("les comptes et la liste nommée disent la MÊME chose", () => {
    // Deux façons de compter la même réalité : si elles divergent, l'une des deux ment.
    const r = trier(
      [
        brute({ titre: "Caissier", description: "Épicerie." }),
        brute({ entreprise: "Loin", ville: "Winnipeg, MB" }),
        brute(),
        brute(), // doublon du précédent
      ],
      new Set(),
      "2026-07-31",
    );
    const compte = (m: string) => r.refusees.filter((x) => x.motif === m).length;
    expect(compte("sous-le-plancher")).toBe(r.souslePlancher);
    expect(compte("hors-region")).toBe(r.horsRegion);
    expect(compte("lieu-inconnu")).toBe(r.lieuInconnu);
    expect(compte("doublon")).toBe(r.doublons);
    expect(r.refusees.length + r.retenues.length).toBe(4);
  });
});

describe("rattrapage des villes manquantes", () => {
  // Les 40 offres du premier lot réel sont entrées AVANT que la colonne `ville` soit
  // écrite : sans elle, leur employeur n'est pas géocodable, donc sans distance et hors
  // de la carte. Rejouer le même dépôt doit les compléter — sans rien abîmer au passage.
  const suivie = (champs: Partial<Offre> = {}): Offre =>
    OffreSchema.parse({
      id: idOffre("Exemple inc.", "Coordonnateur de projets en automatisation"),
      source: "jobbank",
      dateReperage: "2026-07-30",
      entreprise: "Exemple inc.",
      poste: "Coordonnateur de projets en automatisation",
      lien: "https://exemple.test/1",
      km: null,
      ville: null,
      salaireAffiche: null,
      priorite: "Moyenne",
      statut: "Identifiee",
      dateEnvoi: "",
      score: 60,
      scoreSource: "calcule",
      raisons: [],
      notes: "",
      userNote: "",
      histo: false,
      perimeeLe: null,
      ...champs,
    });

  it("complète une offre suivie dont la ville manque", () => {
    const r = villesACompleter([brute({ ville: "Lévis, QC" })], [suivie()]);
    expect(r).toEqual([{ id: suivie().id, ville: "Lévis, QC" }]);
  });

  it("n'ÉCRASE JAMAIS une ville déjà connue", () => {
    // Une ville en base vient d'une source antérieure : un lot plus récent n'a pas
    // autorité pour la remplacer.
    expect(villesACompleter([brute({ ville: "Québec" })], [suivie({ ville: "Lévis" })])).toEqual([]);
  });

  it("ne complète pas une offre INCONNUE du suivi — elle passe par `trier`", () => {
    expect(villesACompleter([brute({ entreprise: "Jamais Vue" })], [suivie()])).toEqual([]);
  });

  it("REFUSE un employeur non nommé : deux annonces d'agence partageraient un identifiant", () => {
    // `idOffre("", "Technicien")` est le même pour deux offres réellement différentes.
    // Dans `trier`, la collision coûte une offre non ajoutée ; ici elle écrirait la ville
    // de l'une sur la fiche de l'autre — une donnée existante ALTÉRÉE, pas juste absente.
    const anonyme = suivie({ id: idOffre("Employeur non nommé", "Technicien") });
    expect(villesACompleter([brute({ entreprise: "", titre: "Technicien" })], [anonyme])).toEqual(
      [],
    );
  });

  it("ignore une ville vide plutôt que d'écrire du vide", () => {
    expect(villesACompleter([brute({ ville: "   " })], [suivie()])).toEqual([]);
  });

  it("une seule écriture même si le lot mentionne l'offre deux fois", () => {
    const r = villesACompleter(
      [brute({ ville: "Lévis" }), brute({ ville: "Québec", refSource: "2" })],
      [suivie()],
    );
    expect(r).toHaveLength(1);
    // La PREMIÈRE mention gagne, comme pour le dédoublonnage de `trier`.
    expect(r[0]!.ville).toBe("Lévis");
  });
});
