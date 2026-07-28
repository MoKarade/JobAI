// tests/chargerEnv.test.ts — charger `.env.local` hors de Next.js.
//
// Incident du 2026-07-28 : `npm run db:migrate` a échoué sur « url: '' » alors que la
// chaîne de connexion était dans `.env.local`, juste à côté. Next.js charge ce fichier ;
// `drizzle-kit` et `tsx`, qui tournent hors de Next, non. Le contournement — poser la
// variable dans le terminal — meurt avec la fenêtre et oblige à recoller un secret à la
// main. C'est le geste qu'on cherche justement à ne pas répéter.
//
// Aucune valeur de ce fichier n'est réelle : ce sont des chaînes factices.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AIDE_URL_MANQUANTE, chargerEnvLocal, urlBaseDeDonnees } from "../lib/chargerEnv";

const CLE = "JOBAI_SONDE_ENV";
const CLE_URL = "DATABASE_URL";
const aRestaurer = new Map<string, string | undefined>();

function memoriser(cle: string) {
  if (!aRestaurer.has(cle)) aRestaurer.set(cle, process.env[cle]);
}

afterEach(() => {
  for (const [cle, valeur] of aRestaurer) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  aRestaurer.clear();
});

/** Un dossier jetable avec les fichiers demandés. */
function dossierAvec(fichiers: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "jobai-env-"));
  for (const [nom, contenu] of Object.entries(fichiers)) {
    writeFileSync(resolve(d, nom), contenu, "utf8");
  }
  return d;
}

describe("chargement", () => {
  it("lit `.env.local`", () => {
    memoriser(CLE);
    delete process.env[CLE];

    const d = dossierAvec({ ".env.local": `${CLE}=valeur-factice\n` });
    expect(chargerEnvLocal(d)).toEqual([".env.local"]);
    expect(process.env[CLE]).toBe("valeur-factice");
    rmSync(d, { recursive: true, force: true });
  });

  it("lit aussi `.env`, et `.env.local` a la priorité", () => {
    memoriser(CLE);
    delete process.env[CLE];

    const d = dossierAvec({
      ".env.local": `${CLE}=depuis-local\n`,
      ".env": `${CLE}=depuis-env\n`,
    });
    // `.env.local` est chargé EN PREMIER, et une variable déjà posée n'est plus écrasée :
    // c'est ce qui donne la priorité au fichier propre à la machine.
    expect(chargerEnvLocal(d)).toEqual([".env.local", ".env"]);
    expect(process.env[CLE]).toBe("depuis-local");
    rmSync(d, { recursive: true, force: true });
  });

  it("n'écrase JAMAIS une variable déjà posée dans l'environnement", () => {
    // Mesuré, pas supposé. C'est la bonne priorité : ce qu'on passe explicitement à une
    // commande doit l'emporter sur un fichier qu'on a peut-être oublié.
    memoriser(CLE);
    process.env[CLE] = "depuis-le-shell";

    const d = dossierAvec({ ".env.local": `${CLE}=depuis-le-fichier\n` });
    chargerEnvLocal(d);
    expect(process.env[CLE]).toBe("depuis-le-shell");
    rmSync(d, { recursive: true, force: true });
  });

  it("reste silencieux quand aucun fichier n'existe", () => {
    // Cas NORMAL : la CI et les conteneurs n'en ont pas. Lever ici casserait le build.
    const d = mkdtempSync(join(tmpdir(), "jobai-env-vide-"));
    expect(chargerEnvLocal(d)).toEqual([]);
    rmSync(d, { recursive: true, force: true });
  });

  it("PROPAGE une erreur qui n'est pas « fichier absent »", () => {
    // Un `catch` qui avale tout ferait échouer la commande plus loin, avec un message sans
    // rapport — le genre de panne qu'on met une heure à diagnostiquer. Ici : un DOSSIER
    // nommé `.env.local` donne EISDIR, pas ENOENT.
    const d = mkdtempSync(join(tmpdir(), "jobai-env-dossier-"));
    mkdirSync(resolve(d, ".env.local"));
    expect(() => chargerEnvLocal(d)).toThrow();
    rmSync(d, { recursive: true, force: true });
  });
});

describe("chaîne de connexion", () => {
  it("rend la valeur posée", () => {
    memoriser(CLE_URL);
    process.env[CLE_URL] = "postgresql://exemple";
    expect(urlBaseDeDonnees()).toBe("postgresql://exemple");
  });

  it("traite une valeur vide ou blanche comme ABSENTE", () => {
    // Une variable définie mais vide est le piège classique d'un fichier mal rempli : la
    // traiter comme présente donnerait « url: '' », l'erreur illisible qu'on corrige ici.
    memoriser(CLE_URL);
    for (const vide of ["", "   ", "\n"]) {
      process.env[CLE_URL] = vide;
      expect(urlBaseDeDonnees(), JSON.stringify(vide)).toBeNull();
    }
  });

  it("rend null quand la variable n'existe pas", () => {
    memoriser(CLE_URL);
    delete process.env[CLE_URL];
    expect(urlBaseDeDonnees()).toBeNull();
  });
});

describe("le message d'aide est ACTIONNABLE", () => {
  it("nomme le fichier, la variable et la doc", () => {
    // `drizzle-kit` seul rend « [x] url: '' » : c'est vrai, et ça n'aide personne. Un
    // message d'erreur qui ne dit pas quoi faire ne vaut pas mieux que pas de message.
    expect(AIDE_URL_MANQUANTE).toContain(".env.local");
    expect(AIDE_URL_MANQUANTE).toContain("DATABASE_URL");
    expect(AIDE_URL_MANQUANTE).toContain("docs/DEPLOIEMENT.md");
  });

  it("ne contient aucune vraie valeur", () => {
    // Un exemple d'aide ne doit jamais devenir un endroit où colle un secret.
    expect(AIDE_URL_MANQUANTE).not.toMatch(/npg_[A-Za-z0-9]/);
    expect(AIDE_URL_MANQUANTE).not.toMatch(/postgresql:\/\/[^\s…]+:[^\s@…]+@/);
  });
});
