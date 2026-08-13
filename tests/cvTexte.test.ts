// tests/cvTexte.test.ts — l'extraction de texte, éprouvée sur des PDF RÉELS.
//
// ⚠️ CE FICHIER N'INVENTE PAS SES PDF, ET C'EST TOUT L'INTÉRÊT.
//
// Un PDF fabriqué par le test pour satisfaire le lecteur du test ne prouve rien : c'est
// exactement le piège dans lequel la première version de `lib/cv/texte.ts` est tombée. Elle
// lisait les PDF à la main, passait ses propres tests, et sur deux documents réels a rendu
// un faux « c'est un scan » sur un PDF plein de texte, puis 76 784 caractères de binaire
// d'image annoncés comme un SUCCÈS.
//
// On éprouve donc contre deux fichiers présents sur le disque, produits par des chaînes
// d'outils qui ignorent tout de ce code :
//
//   · un PDF de présentation, riche en texte → doit RENDRE ce texte ;
//   · un PDF de captures d'écran, sans couche de texte → doit ÉCHOUER honnêtement.
//
// Ces deux fichiers n'appartiennent pas à JobAI : ils viennent d'autres dossiers de la
// machine. S'ils disparaissent, les cas correspondants se SAUTENT en le DISANT — un test
// silencieusement inactif est pire qu'un test absent, et c'est justement ce genre de trou
// qui a laissé passer le bug d'origine.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { extraireTexte, typeReel, TAILLE_MAX_OCTETS, LONGUEUR_MIN_TEXTE } from "@/lib/cv/texte";

const PDF_AVEC_TEXTE = "/mnt/skills/examples/theme-factory/theme-showcase.pdf";
const PDF_SANS_TEXTE = "/home/user/DriveAI/docs/captures/captures-app.pdf";

function octetsDe(chemin: string): Uint8Array | null {
  return existsSync(chemin) ? new Uint8Array(readFileSync(chemin)) : null;
}

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

describe("les PDF réels", () => {
  const avecTexte = octetsDe(PDF_AVEC_TEXTE);
  const sansTexte = octetsDe(PDF_SANS_TEXTE);

  it.runIf(avecTexte)("un PDF riche en texte rend son texte", async () => {
    const r = await extraireTexte(avecTexte!);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // La première version rendait ici « aucun texte lisible, c'est un scan ». Faux :
      // le document en porte plus de 4 000 caractères.
      expect(r.texte.length).toBeGreaterThan(1000);
      expect(r.texte).toContain("Ocean Depths");
    }
  });

  it.runIf(sansTexte)("un PDF d'images échoue HONNÊTEMENT, sans fabriquer de contenu", async () => {
    const r = await extraireTexte(sansTexte!);
    // ⚠️ LE CŒUR DU FICHIER. La première version annonçait ici un SUCCÈS avec 76 784
    // caractères de binaire d'image — du charabia qui serait parti vers le modèle, lequel
    // en aurait tiré un profil entièrement inventé, affiché avec assurance.
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Et le message doit dire QUOI FAIRE, pas seulement « non ».
      expect(r.raison).toMatch(/images|scanné/);
      expect(r.raison).toMatch(/\.txt|traitement de texte/);
    }
  });

  it.runIf(avecTexte)("le tampon de l'appelant SURVIT à l'extraction", async () => {
    // ⚠️ RÉGRESSION MESURÉE : `getDocumentProxy` DÉTACHE le tampon qu'on lui passe
    // (124 310 octets → 0). L'appelant en a besoin APRÈS, pour stocker le fichier : sans
    // la copie défensive, la base recevrait un CV VIDE, sans la moindre erreur, et
    // personne ne le verrait avant d'essayer de le ré-analyser des semaines plus tard.
    const octets = new Uint8Array(readFileSync(PDF_AVEC_TEXTE));
    const avant = octets.length;
    await extraireTexte(octets);
    expect(octets.length).toBe(avant);
  });

  it("les fichiers d'épreuve sont bien là — sinon on le DIT", () => {
    // Un test sauté en silence est un test qui a cessé de protéger sans prévenir.
    // S'il échoue, ce n'est pas grave : il faut juste choisir de nouveaux fichiers réels.
    expect(
      [avecTexte, sansTexte].filter(Boolean).length,
      "Les PDF de référence ont disparu de la machine : les cas PDF réels ne tournent plus.",
    ).toBe(2);
  });
});

describe("le seuil de vraisemblance", () => {
  it("est celui qui a rattrapé le PDF de captures d'écran", () => {
    // Il en avait rendu 2 caractères. Un document qui rend trois mots n'est pas un CV
    // maigre : c'est une extraction qui n'a rien trouvé.
    expect(LONGUEUR_MIN_TEXTE).toBeGreaterThanOrEqual(50);
  });
});
