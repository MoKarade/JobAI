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
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Les fichiers qui partent en ligne : ceux que git suit, ET ceux qui ne le sont pas encore.
 *
 * ⚠️ « SUIVI PAR GIT » ARRIVE UN COMMIT TROP TARD, et ça s'est payé le 2026-08-05.
 * Le scan ne listait que `git ls-files`. Un fichier NEUF n'y figure pas : il devient
 * visible du garde au moment précis où il entre dans l'historique — c'est-à-dire quand il
 * est trop tard. Le gate local était sincèrement vert avant le commit, la CI rouge juste
 * après, et le fichier fautif contenait douze adresses sous la forme surveillée. Un garde
 * qui ne voit une faute qu'une fois commise ne protège pas : il constate.
 *
 * `--others --exclude-standard` ajoute exactement les fichiers non suivis que `.gitignore`
 * ne couvre pas — donc ceux qu'un `git add -A` emporterait. Le garde regarde désormais ce
 * qui EST en ligne et ce qui est sur le point d'y aller.
 */
function fichiersVersionnes(): string[] {
  const lister = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

  const sortie = `${lister(["ls-files"])}\n${lister(["ls-files", "--others", "--exclude-standard"])}`;
  return [...new Set(sortie.split("\n"))]
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

/**
 * Cette ligne documente-t-elle l'adresse du PROPRIÉTAIRE plutôt que celle d'un tiers ?
 *
 * `AUTHORIZED_EMAIL` est, par définition, l'adresse de Marc : c'est la variable qui dit qui
 * a le droit d'entrer. Elle est écrite volontairement dans `docs/DEPLOIEMENT.md`, et la
 * signaler comme une fuite de PII de tiers serait un faux positif permanent — le genre qui
 * finit par faire ignorer la garde.
 *
 * L'exception est bornée à la LIGNE qui nomme la variable : un courriel nominatif posé
 * ailleurs, dans le même fichier, reste détecté.
 */
function estAdresseDuProprietaire(ligne: string): boolean {
  return /AUTHORIZED_EMAIL/.test(ligne);
}

function chercher(motif: RegExp, fichiers: readonly string[]): Trouvaille[] {
  const trouvailles: Trouvaille[] = [];
  for (const f of fichiers) {
    // ⚠️ AUCUNE EXEMPTION, ET C'EST NEUF (2026-09-18). Le scan neutralisait la valeur du
    // champ `adresse` des `data/depot/*.json`, qui portaient l'adresse civique ANNONCÉE d'un
    // employeur, recopiée d'une offre publique — donc exactement la forme surveillée ici. Le
    // canal de dépôt a été supprimé : plus aucun fichier versionné ne porte le texte d'une
    // annonce, et l'exemption n'avait plus d'objet. Une exception qui survit à sa raison est
    // un trou qui attend. Tout est scanné tel quel.
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

  it("voit un fichier NEUF avant son premier commit", () => {
    // ⚠️ CE TEST EXISTE PARCE QUE LE GARDE A ÉCHOUÉ EXACTEMENT LÀ, le 2026-08-05.
    //
    // Le scan ne listait que `git ls-files` : un fichier neuf n'y figure pas, et devient
    // visible du garde au moment précis où il entre dans l'historique — trop tard. Le gate
    // local était sincèrement vert avant le commit, la CI rouge juste après, et le fichier
    // fautif portait douze adresses sous la forme surveillée. Un garde qui ne voit une
    // faute qu'une fois commise ne protège pas : il constate.
    //
    // La sonde ne contient AUCUNE donnée sensible — ce qu'on vérifie ici est la PORTÉE du
    // scan, pas sa détection : la faire porter une vraie forme d'adresse ferait échouer les
    // autres tests du fichier pour une raison sans rapport.
    const sonde = resolve(process.cwd(), "lib/_sonde-portee-du-scan.ts");
    try {
      writeFileSync(sonde, "export const SONDE = 1;\n", "utf8");
      expect(fichiersVersionnes()).toContain("lib/_sonde-portee-du-scan.ts");
    } finally {
      rmSync(sonde, { force: true });
    }
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

  it("aucune PII de tiers — courriel nominatif ou profil personnel", () => {
    // ⚠️ LE VECTEUR QUE CE TEST FERME, ET POURQUOI IL EST NÉ APRÈS LES AUTRES.
    //
    // Le 2026-08-12, la veille a lu les annonces en entier pour la première fois. L'une
    // d'elles (Randstad) portait le NOM, le COURRIEL et le PROFIL LINKEDIN PERSONNELS d'un
    // recruteur. Aucun autre motif de ce fichier ne l'attrapait : il a fallu que je le voie.
    // Une exécution automatique de la veille l'aurait committé sans broncher.
    //
    // `lib/ingest/expurger.ts` est l'OUTIL qui nettoie ; ce test est la GARDE qui refuse.
    // Les deux sont nécessaires : un outil qu'on peut oublier d'appeler ne protège rien.
    //
    // ⚠️ LA PORTÉE A ÉTÉ ÉLARGIE À TOUT LE DÉPÔT LE 2026-09-18, ET C'EST UNE CORRECTION,
    // PAS UNE EXTENSION DE CONFORT. Ces deux motifs ne tournaient que sur `data/depot/*.json`
    // — « la seule surface où du texte écrit par un tiers entre dans le dépôt ». Ce canal a
    // été supprimé ce jour-là : laissés là, les deux motifs auraient scanné une liste VIDE,
    // donc protégé RIEN, en restant verts. Une garde dont la population disparaît ne se
    // supprime pas avec elle : elle se re-pointe sur la population qui reste.
    //
    // Mesuré au moment de l'élargissement, sur 369 fichiers versionnés : DEUX trouvailles,
    // toutes deux dans `tests/expurger.test.ts`, qui portait depuis le 12/08 le vrai nom, le
    // vrai courriel et le vrai identifiant LinkedIn du recruteur Randstad — recopiés de
    // l'annonce dans les fixtures, dans un dépôt PUBLIC, sans qu'aucune garde ne les voie.
    // « Le garde PII se déclenchera sur tes FIXTURES, et il aura raison. » Ils ont été
    // remplacés par des valeurs de même FORME et sans personne derrière.
    const motifs: readonly { nom: string; motif: RegExp }[] = [
      { nom: "courriel nominatif", motif: /[\p{L}][\p{L}'-]*\.[\p{L}][\p{L}'-]*@[\p{L}\d.-]+\.[a-z]{2,}/u },
      { nom: "profil LinkedIn personnel", motif: /linkedin\.com\/in\// },
    ];
    for (const { nom, motif } of motifs) {
      const trouvailles = chercher(motif, FICHIERS).filter((t) => !estAdresseDuProprietaire(t.extrait));
      expect(trouvailles, `PII de tiers (${nom})`).toEqual([]);
    }
  });

  it("l'exemption du propriétaire discrimine : elle ne couvre QUE sa ligne", () => {
    // ⚠️ SANS CE CAS, L'EXEMPTION SERAIT UN TROU. Elle existe pour une raison nommée :
    // `AUTHORIZED_EMAIL` est l'adresse de MARC, documentée volontairement dans
    // `docs/DEPLOIEMENT.md` — ce n'est pas la PII d'un tiers, et un garde qui crie au loup
    // sur une valeur légitime finit contourné.
    //
    // ⚠️ ET ELLE NE REPOSE PAS SUR UN ACCIDENT. Mesuré : l'adresse de Marc échappe DÉJÀ au
    // motif de courriel nominatif, mais seulement parce que sa partie locale finit par un
    // CHIFFRE (`…richard4@`), que le motif n'accepte pas avant l'arobase. Une adresse de la
    // même famille sans chiffre serait signalée. On ne garde pas une garde debout sur un
    // hasard de graphie : l'exception est écrite, bornée à la ligne qui NOMME la variable.
    expect(estAdresseDuProprietaire("AUTHORIZED_EMAIL=prenom.nom@fournisseur.com")).toBe(true);
    // Le tiers sur une ligne ordinaire n'est pas couvert — et c'est tout l'enjeu.
    expect(estAdresseDuProprietaire("Écrire à prenom.nom@fournisseur.com")).toBe(false);
    // Ni une ligne qui parle d'autre chose en mentionnant une adresse nominative.
    expect(estAdresseDuProprietaire("Contact RH : prenom.nom@employeur.ca")).toBe(false);
  });

  it("le scan de PII de tiers discrimine, et il a de quoi scanner", () => {
    // Un scan qui ne voit AUCUN fichier passe à vide : protection nulle, silencieuse. Et un
    // motif cassé passe à vide de la même façon. On prouve donc le VOLUME et la DÉTECTION.
    expect(FICHIERS.length).toBeGreaterThan(50);

    const courriel = /[\p{L}][\p{L}'-]*\.[\p{L}][\p{L}'-]*@[\p{L}\d.-]+\.[a-z]{2,}/u;
    expect("Écrire à jean.dupont@fournisseur.ca").toMatch(courriel);
    // La boîte de rôle — celle à laquelle Marc postule — ne doit PAS être vue comme de la PII.
    expect("Écrire à carriere@fournisseur.ca").not.toMatch(courriel);

    const linkedin = /linkedin\.com\/in\//;
    expect("https://www.linkedin.com/in/quelquun-123/").toMatch(linkedin);
    // Une page d'ENTREPRISE est publique et renseigne sur l'employeur : elle reste.
    expect("https://www.linkedin.com/company/quelque-employeur/").not.toMatch(linkedin);

    const tel = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
    expect("418 555-0142").toMatch(tel);
    expect("Rémunération : 100 000,00 $ à 150 000,00 $").not.toMatch(tel);
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

  it("aucune personne nommée par une civilité, en français COMME en anglais", () => {
    // ⚠️ LES CIVILITÉS ANGLAISES ONT ÉTÉ AJOUTÉES LE 2026-08-19, PARCE QU'IL EN MANQUAIT.
    // Ce motif ne connaissait que `M.|Mme|Monsieur|Madame`. Les annonces de la région sont
    // bilingues : « Ms. … » dans une annonce ELEM est passée sans un bruit. C'est la même
    // classe de défaut que le barème monolingue — une règle écrite dans une seule langue
    // laisse l'autre décider en silence.
    const motif = /\b(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Ms\.|Mrs\.|Mr\.|Dr\.)\s+\p{Lu}[\p{L}'’-]{2,}/u;
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
      nom: "civilité française",
      motif: /\b(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Ms\.|Mrs\.|Mr\.|Dr\.)\s+\p{Lu}[\p{L}'’-]{2,}/u,
      doitDetecter: "Entrevue avec Mme Untel la semaine prochaine.",
      doitIgnorer: "Contact RH déjà établi, entrevue passée en mars 2025.",
    },
    {
      // Le cas RÉEL du 2026-08-19 : une annonce en anglais, une civilité anglaise.
      nom: "civilité anglaise",
      motif: /\b(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Ms\.|Mrs\.|Mr\.|Dr\.)\s+\p{Lu}[\p{L}'’-]{2,}/u,
      doitDetecter: "Send your application to Ms. Exemple Untel at rh@exemple.test.",
      // Et ce qu'il ne doit PAS mordre : « MS » (casse) n'est pas « Ms. ».
      doitIgnorer: "Maitrise de la suite MS Office et de MS Project.",
    },
    {
      // « M. Sc. » est un diplôme, pas une personne : le second jeton fait deux lettres.
      nom: "civilité — le diplôme n'est pas une personne",
      motif: /\b(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Ms\.|Mrs\.|Mr\.|Dr\.)\s+\p{Lu}[\p{L}'’-]{2,}/u,
      doitDetecter: "Rencontre avec M. Untel jeudi.",
      doitIgnorer: "Formation : M. Sc. en genie industriel.",
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
