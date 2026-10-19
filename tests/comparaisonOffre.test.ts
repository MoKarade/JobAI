// tests/comparaisonOffre.test.ts — comparer ce qu'une offre exige à la fiche de compétences (JobAI#157, ADR-0034).
//
// CE QU'ON ÉPROUVE : le modèle relève des exigences, le CODE rend le verdict. On compare donc ce que le code RENDU
// contient (lignes, statuts, preuves), jamais seulement que la fonction ne lève pas. Toutes les données sont FICTIVES :
// le dépôt est public (`tests/piiGuard.test.ts`).

import { describe, it, expect } from "vitest";
import {
  ANNONCE_MIN,
  AUTRE,
  CONSIGNE,
  EXIGENCES_MAX,
  MEILLEURES_OFFRES,
  OUTIL_COMPARAISON,
  comparerALaFiche,
  eligibiliteComparaison,
  resumeComparaison,
  resumeDesEcarts,
  texteAnnonce,
  verifierExigences,
  vocabulaireEnTexte,
  type EntreeEligibilite,
} from "@/lib/comparaisonOffre";
import { IDS_COMPETENCES, VOCABULAIRE_COMPETENCES, definition, type CompetenceProuvee } from "@/lib/competences";

const FICHE: CompetenceProuvee[] = [
  {
    id: "automates-programmables",
    niveau: "maitrise",
    phrase: "Programmation d'automates programmables et mise en service de lignes",
    poste: "Technicien en automatisation",
  },
  {
    id: "vision-industrielle",
    niveau: "notions",
    phrase: "Intégration d'un robot industriel avec vision industrielle",
    poste: "Technicien en automatisation",
  },
];

const ANNONCE = [
  "Poste : Technicien en automatisation",
  "Nous cherchons une personne qui maîtrise la programmation d'automates programmables (PLC) pour nos lignes.",
  "Une première expérience avec la vision industrielle est un atout.",
  "Connaissance du SCADA exigée pour la supervision de l'usine.",
  "Permis de conduire classe 5 requis pour les déplacements chez nos clients.",
  "Maîtrise de la suite Office pour les rapports hebdomadaires.",
].join("\n");

const BASE: EntreeEligibilite = {
  fiche: FICHE,
  texteNote: "x".repeat(ANNONCE_MIN),
  score: 70,
  histo: false,
  perimeeLe: null,
  rang: 12,
};

describe("eligibiliteComparaison", () => {
  it("accepte une offre ouverte, bien classée, avec une fiche et un texte d'annonce", () => {
    expect(eligibiliteComparaison(BASE)).toEqual({ ok: true });
  });

  it("accepte le rang limite et refuse celui d'après, en le disant", () => {
    expect(eligibiliteComparaison({ ...BASE, rang: MEILLEURES_OFFRES })).toEqual({ ok: true });
    const r = eligibiliteComparaison({ ...BASE, rang: MEILLEURES_OFFRES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toContain(`${MEILLEURES_OFFRES + 1}`);
  });

  it("refuse une offre périmée ou archivée avant toute autre raison", () => {
    for (const e of [{ histo: true }, { perimeeLe: "2026-10-01T00:00:00.000Z" }]) {
      const r = eligibiliteComparaison({ ...BASE, ...e, rang: 500, fiche: [] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.raison).toMatch(/périmée|archivée/);
    }
  });

  it("refuse une offre sans note ou sans rang", () => {
    expect(eligibiliteComparaison({ ...BASE, score: null }).ok).toBe(false);
    expect(eligibiliteComparaison({ ...BASE, rang: null }).ok).toBe(false);
  });

  it("refuse, en nommant le geste, quand la fiche n'existe pas", () => {
    const r = eligibiliteComparaison({ ...BASE, fiche: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/Relancer l'analyse/);
  });

  it("refuse un extrait trop court ou absent : ce n'est pas une annonce", () => {
    for (const texteNote of [null, undefined, "", "   ", "x".repeat(ANNONCE_MIN - 1)]) {
      const r = eligibiliteComparaison({ ...BASE, texteNote });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.raison).toMatch(/texte d'annonce/);
    }
  });

  it("compte les espaces autour : un extrait de blancs n'est pas un texte", () => {
    expect(eligibiliteComparaison({ ...BASE, texteNote: ` ${" ".repeat(ANNONCE_MIN)} ` }).ok).toBe(false);
  });
});

describe("texteAnnonce", () => {
  it("ne lit que l'extrait d'annonce, jamais la note de provenance", () => {
    expect(texteAnnonce({ texteNote: "  Une annonce.  " })).toBe("Une annonce.");
    expect(texteAnnonce({ texteNote: null })).toBe("");
    expect(texteAnnonce({ texteNote: undefined })).toBe("");
  });
});

describe("l'outil et la consigne", () => {
  it("l'identifiant est un choix dans la liste fermée, plus « autre »", () => {
    const enumIds = (
      OUTIL_COMPARAISON.input_schema.properties.exigences.items.properties.competence as { enum: string[] }
    ).enum;
    expect(enumIds).toEqual([...IDS_COMPETENCES, AUTRE]);
    expect(OUTIL_COMPARAISON.input_schema.properties.exigences.maxItems).toBe(EXIGENCES_MAX);
  });

  it("la consigne donne tout le vocabulaire et ne parle pas du candidat", () => {
    for (const c of VOCABULAIRE_COMPETENCES) {
      expect(CONSIGNE).toContain(`- ${c.id} : ${c.libelle}`);
    }
    expect(vocabulaireEnTexte().split("\n")).toHaveLength(VOCABULAIRE_COMPETENCES.length);
    expect(CONSIGNE).toMatch(/ne sais rien du candidat/);
  });
});

describe("verifierExigences — le code retient ce que l'annonce porte", () => {
  const exigence = (competence: string, phrase: string) => ({ competence, phrase });

  it("retient une phrase de l'annonce qui nomme la compétence", () => {
    const { retenues, ecartees } = verifierExigences(
      [exigence("automates-programmables", "programmation d'automates programmables (PLC)")],
      ANNONCE,
    );
    expect(retenues).toEqual([
      { competence: "automates-programmables", phrase: "programmation d'automates programmables (PLC)" },
    ]);
    expect(ecartees).toEqual([]);
  });

  it("ignore la casse, les accents et la mise en page", () => {
    const { retenues } = verifierExigences(
      [exigence("vision-industrielle", "PREMIÈRE   expérience avec la\nVISION industrielle")],
      ANNONCE,
    );
    expect(retenues).toHaveLength(1);
  });

  it("écarte une phrase que l'annonce ne porte pas", () => {
    const { retenues, ecartees } = verifierExigences(
      [exigence("scada", "Dix ans d'expérience en supervision SCADA exigés")],
      ANNONCE,
    );
    expect(retenues).toEqual([]);
    expect(ecartees).toEqual([{ competence: "scada", raison: "phrase introuvable dans l'annonce" }]);
  });

  it("écarte un rattachement forcé : la phrase existe mais ne parle pas de la compétence", () => {
    const { retenues, ecartees } = verifierExigences(
      [exigence("scada", "Maîtrise de la suite Office pour les rapports hebdomadaires")],
      ANNONCE,
    );
    expect(retenues).toEqual([]);
    expect(ecartees[0]?.raison).toBe("phrase sans rapport avec la compétence");
  });

  it("écarte un identifiant que le modèle a inventé, sans le répéter dans la sortie", () => {
    const { retenues, ecartees } = verifierExigences(
      [exigence("hypnose-industrielle", "Connaissance du SCADA exigée")],
      ANNONCE,
    );
    expect(retenues).toEqual([]);
    expect(ecartees).toEqual([{ competence: "?", raison: "hors vocabulaire" }]);
  });

  it("écarte une phrase trop courte, trop longue, absente ou qui n'est pas du texte", () => {
    const sorties = verifierExigences(
      [
        exigence(AUTRE, "SCADA"),
        exigence(AUTRE, "a".repeat(201)),
        { competence: AUTRE },
        { competence: AUTRE, phrase: 42 },
        null,
        "texte",
      ],
      ANNONCE,
    );
    expect(sorties.retenues).toEqual([]);
    expect(sorties.ecartees).toHaveLength(6);
  });

  it("garde `autre` quand la phrase est dans l'annonce, et le déduplique sur la phrase", () => {
    const { retenues, ecartees } = verifierExigences(
      [
        exigence(AUTRE, "Permis de conduire classe 5 requis"),
        exigence(AUTRE, "PERMIS de conduire classe 5 requis"),
        exigence(AUTRE, "déplacements chez nos clients"),
      ],
      ANNONCE,
    );
    expect(retenues.map((r) => r.phrase)).toEqual([
      "Permis de conduire classe 5 requis",
      "déplacements chez nos clients",
    ]);
    expect(ecartees).toEqual([{ competence: AUTRE, raison: "déjà relevée" }]);
  });

  it("compte une compétence citée deux fois une seule fois", () => {
    const { retenues, ecartees } = verifierExigences(
      [
        exigence("scada", "Connaissance du SCADA exigée"),
        exigence("scada", "supervision de l'usine"),
      ],
      ANNONCE,
    );
    expect(retenues).toHaveLength(1);
    expect(ecartees).toHaveLength(1);
  });

  it("une phrase qui commence au milieu d'un mot n'est pas une citation de l'annonce", () => {
    const { retenues, ecartees } = verifierExigences(
      [exigence(AUTRE, "rogrammation d'automates programmables")],
      ANNONCE,
    );
    expect(retenues).toHaveLength(0);
    expect(ecartees).toEqual([{ competence: AUTRE, raison: "phrase introuvable dans l'annonce" }]);
  });

  it("plafonne le nombre d'exigences", () => {
    const mots = Array.from({ length: 40 }, (_, i) => `exigence numéro ${i + 100} du poste`);
    const { retenues, ecartees } = verifierExigences(
      mots.map((m) => exigence(AUTRE, m)),
      mots.join(". "),
    );
    expect(retenues).toHaveLength(EXIGENCES_MAX);
    // Le surplus est DIT, pas coupé en silence.
    expect(ecartees).toHaveLength(40 - EXIGENCES_MAX);
    expect(ecartees.every((e) => e.raison === `au-delà de ${EXIGENCES_MAX} exigences`)).toBe(true);
  });
});

describe("comparerALaFiche — le verdict est celui du code", () => {
  it("tu as / notions / il te manque / hors fiche, avec la preuve de la FICHE", () => {
    const lignes = comparerALaFiche(
      [
        { competence: "automates-programmables", phrase: "programmation d'automates programmables" },
        { competence: "vision-industrielle", phrase: "vision industrielle" },
        { competence: "scada", phrase: "Connaissance du SCADA exigée" },
        { competence: AUTRE, phrase: "Permis de conduire classe 5 requis" },
      ],
      FICHE,
    );
    expect(lignes.map((l) => l.statut)).toEqual(["tu-as", "notions", "manque", "hors-fiche"]);
    // La preuve vient de la fiche de Marc, jamais du texte du modèle.
    expect(lignes[0]?.preuve).toEqual({
      niveau: "maitrise",
      phrase: FICHE[0]?.phrase,
      poste: "Technicien en automatisation",
    });
    expect(lignes[1]?.preuve?.niveau).toBe("notions");
    expect(lignes[2]?.preuve).toBeNull();
    expect(lignes[3]?.preuve).toBeNull();
    expect(lignes[0]?.competence).toBe(definition("automates-programmables")?.libelle);
    expect(lignes[3]?.competence).toBeNull();
  });

  it("le niveau « pratique » compte comme couvert", () => {
    const [ligne] = comparerALaFiche(
      [{ competence: "scada", phrase: "Connaissance du SCADA exigée" }],
      [{ id: "scada", niveau: "pratique", phrase: "Supervision SCADA de la ligne 4", poste: "Technicien" }],
    );
    expect(ligne?.statut).toBe("tu-as");
  });

  it("une fiche vide ne couvre rien : tout identifiant du vocabulaire manque", () => {
    const lignes = comparerALaFiche(
      [
        { competence: "scada", phrase: "Connaissance du SCADA exigée" },
        { competence: "python", phrase: "Python est un atout" },
      ],
      [],
    );
    expect(lignes.map((l) => l.statut)).toEqual(["manque", "manque"]);
  });

  it("aucune exigence : aucune ligne, jamais un « tout est couvert »", () => {
    expect(comparerALaFiche([], FICHE)).toEqual([]);
    expect(resumeComparaison([])).toEqual({ tuAs: 0, notions: 0, manque: 0, horsFiche: 0 });
  });
});

describe("résumés", () => {
  it("compte les quatre statuts", () => {
    const lignes = comparerALaFiche(
      [
        { competence: "automates-programmables", phrase: "programmation d'automates programmables" },
        { competence: "scada", phrase: "Connaissance du SCADA exigée" },
        { competence: "python", phrase: "Python est un atout" },
        { competence: AUTRE, phrase: "Permis de conduire classe 5 requis" },
      ],
      FICHE,
    );
    expect(resumeComparaison(lignes)).toEqual({ tuAs: 1, notions: 0, manque: 2, horsFiche: 1 });
  });

  it("dit combien d'exigences ont été écartées et pourquoi, au pluriel comme au singulier", () => {
    expect(resumeDesEcarts([])).toBe("");
    expect(resumeDesEcarts([{ competence: "scada", raison: "phrase introuvable dans l'annonce" }])).toBe(
      "1 exigence proposée par le modèle a été écartée (1 × phrase introuvable dans l'annonce).",
    );
    expect(
      resumeDesEcarts([
        { competence: "scada", raison: "a" },
        { competence: "?", raison: "a" },
        { competence: AUTRE, raison: "b" },
      ]),
    ).toBe("3 exigences proposées par le modèle ont été écartées (2 × a, 1 × b).");
  });
});
