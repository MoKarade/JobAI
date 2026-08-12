// tests/ingest-pipeline.test.ts — ce qui entre dans le suivi, et ce qui n'y entre pas.
//
// Six sources qui tirent en même temps, c'est trois façons de salir le jeu de données :
// la même offre trois fois, du bruit noyant les bonnes offres, et des lignes qui ont l'air
// vérifiées alors que personne ne les a lues. Les trois se testent ici.

import { describe, it, expect } from "vitest";
import { cleCanonique, idsStockesVus,
  FIT_ROLE_PLANCHER,
  idOffre,
  trier,
  villeDepuisRaisons,
  villesACompleter,
  villesARattraper,
} from "../lib/ingest/pipeline";
import { OffreSchema, type Offre } from "../lib/types";
import { SEED } from "../lib/seed";
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

describe("relire la ville dans les justifications", () => {
  // Les 40 premières offres déposées sont entrées avant que la colonne `ville` soit
  // écrite. Leur ville n'est pas perdue pour autant : le tri l'avait recopiée dans leurs
  // justifications. La relire n'est pas une déduction — c'est la même donnée, ailleurs.

  it("fait l'ALLER-RETOUR avec ce que le tri écrit vraiment", () => {
    // LE test qui compte : il part de `trier()` — pas d'une chaîne recopiée à la main —
    // donc il tombe le jour où la phrase change de forme. Sans lui, la relecture
    // cesserait de trouver quoi que ce soit sans la moindre erreur.
    const r = trier([brute({ ville: "Saint-Augustin-de-Desmaures" })], new Set(), "2026-07-31");
    const retenue = r.retenues[0];
    expect(retenue, "l'offre témoin doit être retenue, sinon le test ne mesure rien").toBeDefined();
    expect(villeDepuisRaisons(retenue!.raisons)).toBe("Saint-Augustin-de-Desmaures");
  });

  it("garde la ville telle quelle, virgule de province comprise", () => {
    const r = trier([brute({ ville: "Lévis, QC" })], new Set(), "2026-07-31");
    expect(villeDepuisRaisons(r.retenues[0]!.raisons)).toBe("Lévis, QC");
  });

  it("rend null quand aucune justification ne porte de ville", () => {
    expect(villeDepuisRaisons([])).toBeNull();
    expect(
      villeDepuisRaisons([{ ton: "reserve", texte: "Trouvée automatiquement : la note vient…" }]),
    ).toBeNull();
  });

  it("n'invente rien à partir d'une phrase tronquée", () => {
    expect(villeDepuisRaisons([{ ton: "reserve", texte: "Annoncée à " }])).toBeNull();
    expect(villeDepuisRaisons([{ ton: "reserve", texte: "Annoncée à    — la distance" }])).toBeNull();
  });

  it("tolère l'absence du reste de la phrase", () => {
    expect(villeDepuisRaisons([{ ton: "reserve", texte: "Annoncée à Québec" }])).toBe("Québec");
  });
});

describe("rattraper les villes sans rien demander à personne", () => {
  // Ce rattrapage-ci ne dépend ni d'un nouveau dépôt, ni d'un clic, ni du réseau :
  // l'information est déjà en base, une colonne plus loin. C'est ce qui débloque les 40
  // offres entrées avant que `ville` soit écrite.
  const suivie = (champs: Partial<Offre>): Offre =>
    OffreSchema.parse({
      id: "x",
      source: "jobbank",
      dateReperage: "2026-07-30",
      entreprise: "Exemple inc.",
      poste: "Coordonnateur",
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

  const raisonVille = (v: string) => ({
    ton: "reserve" as const,
    texte: `Annoncée à ${v} — la distance reste à mesurer, elle n'est pas déduite du nom de la ville.`,
  });

  it("trouve la ville que la justification porte", () => {
    const r = villesARattraper([suivie({ id: "a", raisons: [raisonVille("Lévis")] })]);
    expect(r).toEqual([{ id: "a", ville: "Lévis" }]);
  });

  it("laisse tranquille une offre qui a DÉJÀ sa ville", () => {
    expect(
      villesARattraper([suivie({ id: "a", ville: "Québec", raisons: [raisonVille("Lévis")] })]),
    ).toEqual([]);
  });

  it("ignore l'historique : les candidatures de 2025 n'ont pas à être situées", () => {
    expect(
      villesARattraper([suivie({ id: "a", histo: true, raisons: [raisonVille("Lévis")] })]),
    ).toEqual([]);
  });

  it("ne rend rien quand aucune justification ne porte de ville", () => {
    expect(villesARattraper([suivie({ id: "a", raisons: [] })])).toEqual([]);
  });

  it("sur le VRAI jeu de départ, ne fabrique aucune ville", () => {
    // Les offres du seed portent leur ville en clair ou n'en ont pas ; aucune ne doit
    // gagner une ville par ce chemin. Sans ce cas, une régression qui inventerait des
    // villes passerait inaperçue.
    expect(villesARattraper(SEED)).toEqual([]);
  });
});

describe("variantes de raison sociale entre deux sources (ADR-0006)", () => {
  const T = "Coordonnateur de projet";

  it("reconnaît le même employeur écrit avec ou sans suffixe juridique", () => {
    // LE CAS RÉEL qui a créé ce besoin : Indeed écrit « EllisDon Corporation »,
    // ZipRecruiter écrit « Ellisdon ». Une seule source ne pouvait pas produire ce défaut.
    for (const [a, b] of [
      ["EllisDon Corporation", "Ellisdon"],
      ["Systèmes Stekar inc.", "Systèmes Stekar"],
      ["Larouche Raymond, Inc.", "Larouche Raymond"],
    ] as const) {
      expect(cleCanonique(a, T), `« ${a} » et « ${b} » sont le même employeur`).toBe(
        cleCanonique(b, T),
      );
    }
  });

  it("ne fusionne PAS ce qui n'est pas un suffixe juridique", () => {
    // ⚠️ LE VOLET QUI REND L'ÉLARGISSEMENT SÛR. Le dépôt porte déjà la leçon : une
    // heuristique peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.
    // `apparier("Robert", "Groupe Robert")` est vrai — fusionner ces deux-là ferait entrer
    // une offre sous le mauvais employeur, avec la mauvaise distance.
    for (const [a, b] of [
      ["Groupe Novatech Inc.", "Novatech"],
      ["Robert", "Groupe Robert"],
      ["Laserax", "Qualtech"],
    ] as const) {
      expect(cleCanonique(a, T), `« ${a} » et « ${b} » sont DEUX employeurs`).not.toBe(
        cleCanonique(b, T),
      );
    }
  });

  it("n'écarte pas deux postes DIFFÉRENTS chez le même employeur", () => {
    // La clé porte aussi le titre : sans ça, on ne garderait qu'une offre par entreprise.
    expect(cleCanonique("Laserax", "Coordonnateur")).not.toBe(cleCanonique("Laserax", "Superviseur"));
  });

  it("laisse `idOffre` INTACT — aucune migration de clé primaire", () => {
    // ⚠️ LA NON-RÉGRESSION QUI COMPTE LE PLUS. Si `idOffre` bougeait, l'identité de toutes
    // les offres en base changerait, `dejaSuivies` cesserait de matcher, et le balayage
    // suivant recréerait le suivi ENTIER en double — en perdant le rattachement des champs
    // qui appartiennent à Marc (garde-fou n°2).
    expect(idOffre("EllisDon Corporation", T)).toBe("ellisdon-corporation-coordonnateur-de-projet");
    expect(idOffre("Ellisdon", T)).toBe("ellisdon-coordonnateur-de-projet");
  });

  it("écarte la variante quand l'employeur est DÉJÀ suivi sous son autre forme", () => {
    const tri = trier(
      [brute({ entreprise: "Ellisdon", titre: T, ville: "Québec" })],
      new Set([cleCanonique("EllisDon Corporation", T)]),
      "2026-08-12",
    );
    expect(tri.retenues).toHaveLength(0);
    expect(tri.doublons).toBe(1);
    expect(tri.refusees[0]?.motif).toBe("doublon");
  });

  it("écarte la variante à l'intérieur d'un MÊME lot, quel que soit l'ordre", () => {
    // Les deux clés sont mémorisées, sinon deux variantes du même poste passeraient l'une
    // après l'autre dans le même balayage.
    const tri = trier(
      [
        brute({ entreprise: "EllisDon Corporation", titre: T, ville: "Québec" }),
        brute({ entreprise: "Ellisdon", titre: T, ville: "Québec" }),
      ],
      new Set(),
      "2026-08-12",
    );
    expect(tri.retenues).toHaveLength(1);
    expect(tri.retenues[0]?.entreprise).toBe("EllisDon Corporation"); // la première gagne
    expect(tri.doublons).toBe(1);
  });
});

describe("idsStockesVus — le marquage « vue » résout vers l'id STOCKÉ (fix du 2026-08-12)", () => {
  const T = "Coordonnateur de projet";
  const connues = [
    { id: idOffre("EllisDon Corporation", T), entreprise: "EllisDon Corporation", poste: T },
    { id: idOffre("Laserax", "Superviseur"), entreprise: "Laserax", poste: "Superviseur" },
  ];
  const b = (entreprise: string, titre: string) =>
    ({ refSource: "r", titre, entreprise, ville: "Québec", lien: "https://x.test/1",
       description: "", publieeLe: null, adresse: "", adresseSource: null, adresseUrl: null }) as never;

  it("brute VARIANTE (courte) → l'id de la version STOCKÉE (longue) est vu", () => {
    // LE BUG QUE CE TEST FERME : l'ancien code ajoutait l'id de la BRUTE (« ellisdon-… »),
    // qu'aucune offre stockée ne porte — l'offre prenait +1 absence PENDANT que le lot la
    // contenait, et se périmait en trois jours sous nos yeux.
    const vus = idsStockesVus([b("Ellisdon", T)], connues);
    expect([...vus]).toEqual([idOffre("EllisDon Corporation", T)]);
  });

  it("sens inverse : base courte, brute longue", () => {
    const courtes = [{ id: idOffre("Ellisdon", T), entreprise: "Ellisdon", poste: T }];
    const vus = idsStockesVus([b("EllisDon Corporation", T)], courtes);
    expect([...vus]).toEqual([idOffre("Ellisdon", T)]);
  });

  it("graphie identique : comportement inchangé", () => {
    const vus = idsStockesVus([b("EllisDon Corporation", T)], connues);
    expect([...vus]).toEqual([idOffre("EllisDon Corporation", T)]);
  });

  it("ne marque RIEN pour un employeur inconnu ou un autre poste", () => {
    expect(idsStockesVus([b("Qualtech", T)], connues).size).toBe(0);
    expect(idsStockesVus([b("Laserax", "Coordonnateur")], connues).size).toBe(0);
  });
});
