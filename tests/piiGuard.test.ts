// tests/piiGuard.test.ts — le verrou du garde-fou n°1.
//
// Le dépôt est privé, mais « privé » n'est pas « sans conséquence » : un dépôt change de
// visibilité en deux clics, se clone, s'exporte, et l'historique git garde tout pour
// toujours. Ce scan cherche donc, dans les fichiers RÉELLEMENT versionnés, ce qui ne doit
// jamais y entrer.
//
// PORTÉE — écrite ici plutôt que promise ailleurs :
//   - il détecte des FORMES (adresse municipale, secret assigné, coordonnées, civilité) ;
//   - il ne « comprend » rien : un nom de personne isolé lui échappe, et c'est assumé —
//     un motif générique de patronyme est inutilisable en français (mesuré : il attrapait
//     « Machines-Outils », « Saint-Damien », « garde-fou ») ;
//   - il couvre TOUS les fichiers versionnés sauf lui-même, fixtures de test comprises.
// Un garde qui promet plus qu'il ne fait est pire qu'un garde absent : on cesse de relire.
//
// C'est le SEUL garde de ce type du dépôt. La CI portait au départ deux `git grep`
// équivalents en bash ; ils ont été retirés une fois ce test écrit, parce que maintenir la
// même règle dans deux langages la fait diverger — et elle avait déjà divergé : le bash
// n'avait aucune notion d'« exemple documenté » et échouait sur la doc de `charger-seed.ts`.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Les fichiers suivis par git — la seule définition qui compte : ce qui part en ligne. */
function fichiersVersionnes(): string[] {
  const sortie = execFileSync("git", ["ls-files"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return sortie
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|mjs|json|md|css|yml|yaml|sql|example)$/.test(f))
    // Le lockfile est du bruit machine. Les fichiers de test, eux, contiennent PAR NATURE
    // les motifs qu'ils vérifient — les scanner reviendrait à détecter le détecteur.
    // Le lockfile est du bruit machine. `piiGuard` s'exclut LUI-MÊME parce qu'il contient
    // par construction les motifs qu'il cherche — le scanner reviendrait à détecter le
    // détecteur. Les AUTRES fichiers de test, eux, sont scannés : ils sont versionnés comme
    // le reste, et rien ne garantit qu'une vraie valeur ne s'y glisse pas un jour.
    .filter((f) => f !== "package-lock.json" && f !== "tests/piiGuard.test.ts");
}

/**
 * Une ligne qui montre EXPLICITEMENT un exemple.
 *
 * La documentation doit pouvoir écrire à quoi ressemble une chaîne de connexion sans faire
 * échouer le scan. La règle est donc : **tout exemple porte un marqueur reconnaissable**
 * (`…`, `xxx`, `motdepasse`, `<...>`, `TON_`). Une vraie valeur, elle, n'en porte aucun —
 * un mot de passe Neon ressemble à `npg_` suivi de caractères aléatoires.
 *
 * C'est une convention, et elle est vérifiable : si quelqu'un colle une vraie valeur dans
 * la doc, elle n'aura pas de marqueur et sera détectée.
 */
function estExemple(ligne: string): boolean {
  return /…|\.\.\.|xxx|motdepasse|mot-de-passe|<[a-z-]+>|TON_|COLLE-ICI|factice|à remplir|exemple/i.test(
    ligne,
  );
}

interface Trouvaille {
  fichier: string;
  ligne: number;
  extrait: string;
}

function chercher(motif: RegExp, fichiers: readonly string[]): Trouvaille[] {
  const trouvailles: Trouvaille[] = [];
  for (const f of fichiers) {
    const contenu = readFileSync(resolve(process.cwd(), f), "utf8");
    contenu.split("\n").forEach((ligne, i) => {
      if (motif.test(ligne) && !estExemple(ligne)) {
        trouvailles.push({ fichier: f, ligne: i + 1, extrait: ligne.trim().slice(0, 100) });
      }
      motif.lastIndex = 0;
    });
  }
  return trouvailles;
}

const FICHIERS = fichiersVersionnes();

describe("volume du scan", () => {
  it("lit un nombre plausible de fichiers versionnés", () => {
    // SANS cette assertion, un scan qui ne lit RIEN passerait tous les tests ci-dessous :
    // protection nulle, et silencieuse. C'est le premier piège d'un test-garde.
    expect(FICHIERS.length).toBeGreaterThan(25);
  });

  it("couvre bien les fichiers qui portent des données", () => {
    // Un filtre d'extension trop strict viderait le scan de sa substance sans rien dire.
    expect(FICHIERS).toContain("lib/seed.ts");
    expect(FICHIERS).toContain("lib/reference.ts");
    expect(FICHIERS).toContain(".env.example");
  });

  it("scanne AUSSI les autres fichiers de test, et pas seulement lui-même", () => {
    // Les fixtures de test sont versionnées comme le reste. Les exclure en bloc — ce que
    // faisait la première version — laissait un angle mort entier.
    expect(FICHIERS).toContain("tests/diagnostic.test.ts");
    expect(FICHIERS).toContain("tests/seed.test.ts");
    // Le détecteur, lui, reste hors du scan : il contient par construction ce qu'il cherche.
    expect(FICHIERS).not.toContain("tests/piiGuard.test.ts");
  });
});

describe("garde-fou n°1 — aucune donnée personnelle en clair", () => {
  it("aucune adresse municipale", () => {
    // Le domicile de Marc ne doit apparaître nulle part : seules les DISTANCES sont
    // committées, calculées depuis DOMICILE_LAT / DOMICILE_LON.
    const motif = /\b\d{3,5},?\s+(av\.|avenue|rue|boul\.|boulevard|ch\.|chemin)\s+\S/i;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("aucune coordonnée géographique en dur", () => {
    // Une latitude québécoise (46-47) suivie d'une longitude (-71) reconstituerait le
    // domicile aussi sûrement qu'une adresse.
    const motif = /\b4[5-8]\.\d{4,}\s*,\s*-7[0-5]\.\d{4,}/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
    // Et les variables d'environnement restent VIDES dans l'exemple.
    const affectee = /DOMICILE_(LAT|LON)\s*=\s*[-\d]/;
    expect(chercher(affectee, FICHIERS)).toEqual([]);
  });

  it("aucune personne nommée par une civilité", () => {
    const motif = /\b(M\.|Mme|Monsieur|Madame)\s+[A-ZÉÈÀ][a-zéèêàî]+/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("aucun numéro de téléphone ni d'assurance sociale", () => {
    const tel = /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/;
    expect(chercher(tel, FICHIERS)).toEqual([]);
    const nas = /\b\d{3}[-\s]\d{3}[-\s]\d{3}\b/;
    expect(chercher(nas, FICHIERS)).toEqual([]);
  });
});

describe("garde-fou n°5 — aucun secret en dur", () => {
  it("aucune variable de secret affectée à une valeur", () => {
    // `NOM=` seul (fichier d'exemple) est légitime ; `NOM=valeur` ne l'est pas.
    const motif =
      /\b(HUB_TOKEN|AUTH_SECRET|GOOGLE_CLIENT_SECRET|DATABASE_URL|ANTHROPIC_API_KEY)\s*[=:]\s*["']?[A-Za-z0-9+/_-]{8}/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("aucune chaîne de connexion Postgres complète", () => {
    // Le vecteur le plus probable : coller une connection string dans un fichier ou un
    // commentaire « juste pour tester ».
    const motif = /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("aucune clé d'API au format reconnaissable", () => {
    const motif = /\b(sk-ant-[A-Za-z0-9_-]{10}|npg_[A-Za-z0-9]{10}|ghp_[A-Za-z0-9]{20})/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });
});

describe("le scan discrimine réellement", () => {
  // Un garde qui n'a jamais rien détecté ne protège rien. On lui soumet des contenus
  // fabriqués — ce sont des chaînes de test, jamais de vraies valeurs.
  const cas: readonly { nom: string; motif: RegExp; doitDetecter: string; doitIgnorer: string }[] = [
    {
      nom: "adresse municipale",
      motif: /\b\d{3,5},?\s+(av\.|avenue|rue|boul\.|boulevard|ch\.|chemin)\s+\S/i,
      doitDetecter: "const domicile = '1548 av. de la Rosaliere';",
      doitIgnorer: "Saint-Anselme, 33 km. Publiée le 21/07/2026.",
    },
    {
      nom: "coordonnées",
      motif: /\b4[5-8]\.\d{4,}\s*,\s*-7[0-5]\.\d{4,}/,
      doitDetecter: "const centre = [46.812345, -71.234567];",
      doitIgnorer: "score de 46 sur 100, écart de -71 points",
    },
    {
      nom: "chaîne de connexion",
      motif: /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/,
      doitDetecter: "postgresql://utilisateur:MotDePasseFactice@hote.neon.tech/db",
      doitIgnorer: "DATABASE_URL=  # à remplir, voir docs/DEPLOIEMENT.md",
    },
    {
      nom: "secret affecté",
      motif:
        /\b(HUB_TOKEN|AUTH_SECRET|GOOGLE_CLIENT_SECRET|DATABASE_URL|ANTHROPIC_API_KEY)\s*[=:]\s*["']?[A-Za-z0-9+/_-]{8}/,
      doitDetecter: "HUB_TOKEN=VALEURFACTICE123456",
      doitIgnorer: "HUB_TOKEN=",
    },
    {
      nom: "civilité",
      motif: /\b(M\.|Mme|Monsieur|Madame)\s+[A-ZÉÈÀ][a-zéèêàî]+/,
      doitDetecter: "Entrevue avec Mme Untel la semaine prochaine.",
      doitIgnorer: "Contact RH déjà établi, entrevue passée en mars 2025.",
    },
  ];

  for (const c of cas) {
    it(`détecte « ${c.nom} » et ignore la formulation légitime`, () => {
      expect(c.motif.test(c.doitDetecter), `aurait dû détecter : ${c.doitDetecter}`).toBe(true);
      c.motif.lastIndex = 0;
      expect(c.motif.test(c.doitIgnorer), `faux positif sur : ${c.doitIgnorer}`).toBe(false);
      c.motif.lastIndex = 0;
    });
  }

  it("l'exemption d'exemple ne laisse PAS passer une vraie valeur", () => {
    // C'est le point faible de la règle « les exemples portent un marqueur » : si elle
    // exemptait trop large, le garde deviendrait décoratif. On vérifie donc les deux sens.
    const vraieAllure =
      "DATABASE_URL=postgresql://neondb_owner:AbCd1234EfGh@ep-truc-pooler.aws.neon.tech/neondb";
    const exemple =
      "DATABASE_URL=postgresql://user:motdepasse@ep-xxx-pooler.aws.neon.tech/neondb";

    expect(estExemple(vraieAllure), "une vraie valeur ne doit pas être exemptée").toBe(false);
    expect(estExemple(exemple), "un exemple marqué doit être exempté").toBe(true);

    const motif = /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/;
    expect(motif.test(vraieAllure) && !estExemple(vraieAllure)).toBe(true);
  });
});
