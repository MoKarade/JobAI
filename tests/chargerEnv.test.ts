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
import {
  AIDE_URL_MANQUANTE,
  chargerEnvLocal,
  diagnostiquerUrl,
  masquerIdentifiants,
  urlBaseDeDonnees,
} from "../lib/chargerEnv";

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

  it("LIT un fichier écrit par Windows : BOM UTF-8 et fins de ligne CRLF", () => {
    // ⚠️ LE bug du 2026-07-28, qui a coûté deux allers-retours. `process.loadEnvFile` de
    // Node ne retire PAS le BOM : la première clé devient « \uFEFFDATABASE_URL » et
    // `process.env.DATABASE_URL` reste `undefined`. Le fichier est correct, la variable est
    // introuvable, et RIEN ne l'explique.
    //
    // Windows écrit ce BOM par DÉFAUT — `Set-Content -Encoding utf8` sous PowerShell 5.1
    // comme le Bloc-notes. On ne demande pas à quelqu'un de contourner le comportement par
    // défaut de son système : on lit le fichier nous-mêmes.
    memoriser(CLE);
    delete process.env[CLE];

    const d = dossierAvec({ ".env.local": `\uFEFF${CLE}=valeur-factice\r\n` });
    chargerEnvLocal(d);
    expect(process.env[CLE]).toBe("valeur-factice");
    rmSync(d, { recursive: true, force: true });
  });

  it("tolère les formes courantes d'un fichier .env", () => {
    for (const [libelle, contenu] of [
      ["guillemets doubles", `${CLE}="valeur-factice"\n`],
      ["guillemets simples", `${CLE}='valeur-factice'\n`],
      ["préfixe export", `export ${CLE}=valeur-factice\n`],
      ["espaces autour du =", `${CLE} = valeur-factice\n`],
      ["commentaire en tête", `# un commentaire\n${CLE}=valeur-factice\n`],
      ["ligne vide avant", `\n\n${CLE}=valeur-factice\n`],
    ] as const) {
      memoriser(CLE);
      delete process.env[CLE];
      const d = dossierAvec({ ".env.local": contenu });
      chargerEnvLocal(d);
      expect(process.env[CLE], libelle).toBe("valeur-factice");
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("ne coupe PAS une valeur qui contient des « = »", () => {
    // Une chaîne Neon finit par `?sslmode=require&channel_binding=require` : découper sur
    // chaque `=` la tronquerait silencieusement, et la connexion échouerait sans raison
    // visible. Seul le PREMIER `=` sépare la clé de la valeur.
    memoriser(CLE);
    delete process.env[CLE];
    const d = dossierAvec({
      ".env.local": `${CLE}=postgresql://u:p@h/db?sslmode=require&channel_binding=require\n`,
    });
    chargerEnvLocal(d);
    expect(process.env[CLE]).toBe("postgresql://u:p@h/db?sslmode=require&channel_binding=require");
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
    // Un exemple d'aide ne doit jamais devenir l'endroit où quelqu'un colle un secret.
    expect(AIDE_URL_MANQUANTE).not.toMatch(/npg_[A-Za-z0-9]/);

    // Toute paire identifiant:motdepasse du message doit être un GABARIT (`<…>`), jamais
    // une valeur. Une assertion qui interdirait toute paire refuserait un exemple lisible ;
    // une qui les autoriserait toutes ne protégerait rien.
    const paires = AIDE_URL_MANQUANTE.match(/[a-z]+:\/\/[^\s]+:[^\s@]+@/gi) ?? [];
    for (const paire of paires) {
      expect(paire, `« ${paire} » n'est pas un gabarit`).toMatch(/<[^>]+>:<[^>]+>@/);
    }
  });
});

describe("espace réservé — une erreur DIFFÉRENTE d'une variable absente", () => {
  it("détecte une chaîne restée à l'espace réservé et le NOMME", () => {
    // Vécu le 2026-07-28 : `.env.local` contenait `postgresql://…?sslmode=require`, copié
    // depuis la documentation. `neon()` répondait « is not a valid URL », ce qui est vrai
    // mais n'oriente pas — on cherche une faute de syntaxe au lieu d'une valeur à remplacer.
    memoriser(CLE_URL);
    process.env[CLE_URL] = "postgresql://…?sslmode=require&channel_binding=require";

    const etat = diagnostiquerUrl();
    expect(etat.ok).toBe(false);
    if (!etat.ok) {
      expect(etat.message).toContain("espace réservé");
      expect(etat.message).toContain(".env.local");
    }
  });

  it("reconnaît les autres espaces réservés de la documentation", () => {
    memoriser(CLE_URL);
    for (const faux of [
      "postgresql://COLLE-ICI-TA-VRAIE-CHAINE-NEON",
      "postgresql://TON_UTILISATEUR:x@hote/db",
      "postgresql://user:xxx@hote/db",
    ]) {
      process.env[CLE_URL] = faux;
      expect(diagnostiquerUrl().ok, faux).toBe(false);
    }
  });

  it("laisse passer une chaîne d'allure réelle", () => {
    memoriser(CLE_URL);
    // Valeur FACTICE, mais de la forme d'une vraie : aucun marqueur d'exemple.
    process.env[CLE_URL] = "postgresql://proprietaire:MotDePasseFactice@ep-truc.aws.neon.tech/db";
    const etat = diagnostiquerUrl();
    expect(etat.ok).toBe(true);
    expect(urlBaseDeDonnees()).not.toBeNull();
  });
});

describe("masquage des identifiants", () => {
  // ⚠️ `neon()` RECOPIE la chaîne de connexion dans son message d'erreur. Sans masquage,
  // une faute de frappe dans `.env.local` affiche le mot de passe de la base en clair —
  // dans le terminal, l'historique du shell, puis dans le copier-coller envoyé pour aide.
  it("masque le mot de passe dans un message d'erreur réel", () => {
    const message =
      "Connection string: postgresql://neondb_owner:MotDePasseFactice123@ep-x.neon.tech/db";
    const masque = masquerIdentifiants(message);
    expect(masque).not.toContain("MotDePasseFactice123");
    expect(masque).toContain("neondb_owner:***@");
  });

  it("masque ENTIÈREMENT un mot de passe contenant lui-même un « @ »", () => {
    // Premier jet du masqueur : il s'arrêtait au PREMIER `@` et laissait fuir la fin
    // (`***@ssw0rd`). Un mot de passe non encodé peut contenir un `@` — et une assertion
    // qui ne cherche que la chaîne ENTIÈRE ne voit pas le fragment.
    const masque = masquerIdentifiants("postgres://utilisateur:p@ssw0rd@hote/db");
    expect(masque).not.toContain("ssw0rd");
    expect(masque).toBe("postgres://utilisateur:***@hote/db");
  });

  it("ne touche pas à une chaîne sans identifiants, ni à un texte ordinaire", () => {
    expect(masquerIdentifiants("postgresql://hote/db")).toBe("postgresql://hote/db");
    expect(masquerIdentifiants("connexion refusée")).toBe("connexion refusée");
  });
});
