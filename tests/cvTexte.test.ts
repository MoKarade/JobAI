// tests/cvTexte.test.ts — l'extraction de texte, éprouvée sur des PDF RÉELS.
//
// LES DEUX CAS QUI COMPTENT, ET D'OÙ ILS VIENNENT
//
// La première version de `lib/cv/texte.ts` lisait les PDF à la main. Elle passait ses
// propres tests, et sur deux documents RÉELS elle a échoué deux fois : un faux « c'est un
// scan » sur un PDF plein de texte, puis 76 784 caractères de binaire d'image annoncés
// comme un SUCCÈS. C'est cette épreuve-là qui a décidé du passage à `unpdf` ; elle est
// consignée dans l'en-tête du module et dans l'ADR-0009.
//
// ⚠️ MAIS UN TEST NE PEUT PAS DÉPENDRE DE CES FICHIERS. Ils vivent sur la machine de
// développement, pas sur le serveur d'intégration — première tentative : CI ROUGE, sur un
// test qui exigeait leur présence. Et les committer était exclu : l'un est un PDF de
// captures d'écran d'un AUTRE projet de Marc, qui montre du contenu réel de son Drive
// (garde-fou n°1).
//
// Les deux cas sont donc CONSTRUITS (`tests/aides/pdf.ts`), et c'est `pdf.js` qui les lit —
// pas notre code. Si la structure produite était fantaisiste, il la refuserait. Ce qui est
// éprouvé ici est notre CÂBLAGE ; la confrontation au monde réel a eu lieu une fois, à la
// main, et elle est écrite.
//
// Les fichiers réels restent éprouvés EN PLUS quand ils sont là — jamais en condition.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { extraireTexte, typeReel, TAILLE_MAX_OCTETS, LONGUEUR_MIN_TEXTE } from "@/lib/cv/texte";
import { pdfAvecTexte, pdfSansTexte } from "./aides/pdf";

const PDF_AVEC_TEXTE = "/mnt/skills/examples/theme-factory/theme-showcase.pdf";
const PDF_SANS_TEXTE = "/home/user/DriveAI/docs/captures/captures-app.pdf";

function octetsDe(chemin: string): Uint8Array | null {
  return existsSync(chemin) ? new Uint8Array(readFileSync(chemin)) : null;
}

const CV_FABRIQUE = [
  "Coordonnateur de projets techniques",
  "Superviseur de maintenance - Groupe Industriel (2023-2026)",
  "Encadrement d'une equipe de 8 techniciens, planification de la maintenance.",
  "Mise en service d'automates programmables et de robots industriels.",
  "Master en robotique. Francais et anglais courants. DEC en electromecanique.",
];

describe("détection du type par le CONTENU", () => {
  it("un PDF se reconnaît à sa signature, pas à son nom", () => {
    expect(typeReel(new TextEncoder().encode("%PDF-1.7\nreste"))).toBe("application/pdf");
  });

  it("du texte UTF-8 accentué est reconnu", () => {
    expect(typeReel(new TextEncoder().encode("Coordonnateur — génie mécanique"))).toBe(
      "text/plain",
    );
  });

  it("du binaire n'est ni l'un ni l'autre", () => {
    expect(typeReel(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x00, 0x01, 0x02]))).toBeNull();
  });
});

describe("les refus, avant même de lire", () => {
  it("fichier vide", async () => {
    expect(await extraireTexte(new Uint8Array(0))).toEqual({ ok: false, raison: "Fichier vide." });
  });

  it("fichier trop lourd — le message DONNE la taille et la limite", async () => {
    const gros = new Uint8Array(TAILLE_MAX_OCTETS + 1);
    const r = await extraireTexte(gros);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/trop lourd.*8 Mo/);
  });

  it("format inconnu", async () => {
    const r = await extraireTexte(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x00, 0x01]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/Format non reconnu/);
  });
});

describe("le texte brut", () => {
  it("un CV en .txt traverse intact, accents compris", async () => {
    const cv =
      "Coordonnateur de projets — génie mécanique.\n" +
      "Encadrement d'une équipe de 8 techniciens, mise en service d'automates.\n" +
      "Maîtrise du français et de l'anglais. DEC en électromécanique.";
    const r = await extraireTexte(new TextEncoder().encode(cv));
    expect(r).toEqual({ ok: true, texte: cv });
  });

  it("un texte trop court est refusé, pas rendu vide", async () => {
    const r = await extraireTexte(new TextEncoder().encode("Marc"));
    expect(r.ok).toBe(false);
  });
});

describe("les PDF", () => {
  it("un PDF avec du texte rend son texte", async () => {
    const r = await extraireTexte(pdfAvecTexte(CV_FABRIQUE));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texte).toContain("Coordonnateur de projets techniques");
      expect(r.texte).toContain("automates programmables");
      // Les lignes restent séparées : un CV aplati en un bloc se lit mal, y compris
      // par le modèle qui doit y repérer des sections.
      expect(r.texte.split("\n").length).toBeGreaterThan(3);
    }
  });

  it("les parenthèses d'un CV ne cassent pas la lecture", async () => {
    // « (2023-2026) » est partout dans un CV, et `(` `)` délimitent une chaîne en PDF.
    const r = await extraireTexte(pdfAvecTexte([...CV_FABRIQUE, "Stage (2020-2021) a Lyon."]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texte).toContain("(2020-2021)");
  });

  it("un PDF SANS couche de texte échoue HONNÊTEMENT, sans fabriquer de contenu", async () => {
    const r = await extraireTexte(pdfSansTexte());
    // ⚠️ LE CŒUR DU FICHIER. La première implémentation annonçait ici un SUCCÈS avec
    // 76 784 caractères de binaire d'image — du charabia qui serait parti vers le modèle,
    // lequel en aurait tiré un profil entièrement inventé, affiché avec assurance.
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Et le message doit dire QUOI FAIRE, pas seulement « non ».
      expect(r.raison).toMatch(/images|scanné/);
      expect(r.raison).toMatch(/\.txt|traitement de texte/);
    }
  });

  it("le tampon de l'appelant SURVIT à l'extraction", async () => {
    // ⚠️ RÉGRESSION MESURÉE : `getDocumentProxy` DÉTACHE le tampon qu'on lui passe
    // (124 310 octets → 0 sur le fichier réel). L'appelant en a besoin APRÈS, pour stocker
    // le fichier : sans la copie défensive, la base recevrait un CV VIDE, sans la moindre
    // erreur, invisible jusqu'à la première ré-analyse des semaines plus tard.
    const octets = pdfAvecTexte(CV_FABRIQUE);
    const avant = octets.length;
    await extraireTexte(octets);
    expect(octets.length).toBe(avant);
  });
});

/**
 * Les fichiers RÉELS, quand ils sont là. Jamais en condition de réussite : ils
 * n'existent que sur la machine de développement, et les exiger a déjà mis la CI au rouge.
 * Ce qu'ils apportent en plus, c'est la confrontation à des PDF que personne n'a écrits
 * pour ce test — c'est-à-dire la seule chose qui avait démasqué l'implémentation d'origine.
 */
describe("les PDF réels (hors CI)", () => {
  const avecTexte = octetsDe(PDF_AVEC_TEXTE);
  const sansTexte = octetsDe(PDF_SANS_TEXTE);

  it.runIf(avecTexte)("un PDF de présentation rend ses milliers de caractères", async () => {
    const r = await extraireTexte(avecTexte!);
    expect(r.ok).toBe(true);
    // La première version rendait ici « aucun texte lisible, c'est un scan ». Faux :
    // le document en porte plus de 4 000 caractères.
    if (r.ok) expect(r.texte.length).toBeGreaterThan(1000);
  });

  it.runIf(sansTexte)("un PDF de captures d'écran ne fabrique pas de texte", async () => {
    const r = await extraireTexte(sansTexte!);
    expect(r.ok).toBe(false);
  });
});

describe("le seuil de vraisemblance", () => {
  it("est celui qui a rattrapé le PDF de captures d'écran", () => {
    // Il en avait rendu 2 caractères. Un document qui rend trois mots n'est pas un CV
    // maigre : c'est une extraction qui n'a rien trouvé.
    expect(LONGUEUR_MIN_TEXTE).toBeGreaterThanOrEqual(50);
  });
});
