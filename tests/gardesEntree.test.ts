// tests/gardesEntree.test.ts — les gardes d'ENTRÉE qui n'étaient jamais exercées.
//
// POURQUOI CE FICHIER EXISTE (`[ACTIONS-02]`, premier lot)
//
// Le recensement des modules sans test a sorti douze noms. Trois d'entre eux ne sont pas des
// modules ordinaires : ce sont des GARDES, c'est-à-dire du code dont le seul travail est de
// refuser quelque chose. Un module de calcul sans test rend un mauvais chiffre, qu'on finit
// par voir ; une garde sans test ne rend RIEN — elle laisse passer, et personne ne le sait.
//
// · `cheminInterne` (`lib/connexionHub.ts`) refuse qu'une URL externe devienne la destination
//   d'après-connexion. Son commentaire nomme l'attaque : « JobAI deviendrait un tremplin ».
// · `origineDe` (`lib/mcp/origine.ts`) refuse que l'en-tête `Host` décide de l'adresse publiée
//   dans les métadonnées OAuth — sinon quiconque atteint l'app désigne un autre serveur.
// · `domicile` (`lib/domicile.ts`) refuse de rendre une position quand l'environnement n'en
//   porte pas : sans elle, une coordonnée plausible et fausse contaminerait TOUTES les
//   distances (garde-fou n°1 et « no fake data »).

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cheminInterne, urlConnexionHub } from "@/lib/connexionHub";
import { origineDe } from "@/lib/mcp/origine";

/** Ce que `domicile()` a touché. C'est l'observation — le retour ne dit pas si on a APPELÉ. */
const touches: string[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => { touches.push("db.select"); return []; } }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => { touches.push("db.insert"); } }) }),
  },
}));
vi.mock("@/lib/db/schema", () => ({ syncState: { cle: "cle" } }));
vi.mock("@/lib/geocodage", () => ({
  geocoderPlusieurs: async () => {
    touches.push("geocoderPlusieurs(RÉSEAU)");
    return { trouvees: [{ nom: "chez-moi", lat: 46.8, lon: -71.2 }], panne: null };
  },
}));

beforeEach(() => {
  touches.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("cheminInterne — la garde du tremplin", () => {
  it("laisse passer un chemin interne, avec sa requête et son ancre", () => {
    expect(cheminInterne("/carte")).toBe("/carte");
    expect(cheminInterne("/offre/42?vue=liste#bas")).toBe("/offre/42?vue=liste#bas");
  });

  it("⚠️ refuse une URL ABSOLUE — c'est l'attaque que le module nomme", () => {
    // Renvoyer la personne sur un site tiers APRÈS une connexion réussie, donc en confiance.
    expect(cheminInterne("https://evil.com")).toBe("/");
    expect(cheminInterne("http://evil.com/piege")).toBe("/");
  });

  it("⚠️ refuse `//evil.com` — ça ressemble à un chemin sans en être un", () => {
    // Le navigateur y voit une autre ORIGINE. C'est le cas que le module cite en exemple.
    expect(cheminInterne("//evil.com")).toBe("/");
    expect(cheminInterne("//evil.com/suite")).toBe("/");
  });

  it("⚠️ refuse les formes à ANTISLASH — le contournement de `[REDIR-01]`", () => {
    // MESURÉ le 2026-09-18, AVANT correctif : ces deux chaînes traversaient la garde
    // textuelle intactes, puis devenaient `//evil.com` quand l'appelant composait l'URL.
    // Le `callbackUrl` produit avait alors pour origine `https://evil.com`.
    // Règle §9 n°128 : un contrôle de sécurité se teste avec les chaînes d'attaque EXACTES.
    expect(cheminInterne("/\\evil.com")).toBe("/");
    expect(cheminInterne("/\\/evil.com")).toBe("/");
    expect(cheminInterne("/\\\\evil.com")).toBe("/");
  });

  it("⚠️ et le `callbackUrl` de ces formes reste sur l'origine de JobAI", () => {
    // La garde ne vaut que si l'appelant en hérite : c'est là que le défaut se voyait.
    for (const attaque of ["/\\evil.com", "/\\/evil.com"]) {
      const url = new URL(urlConnexionHub("https://emploi.hubperso.com", attaque));
      expect(new URL(url.searchParams.get("callbackUrl") ?? "").origin).toBe(
        "https://emploi.hubperso.com",
      );
    }
  });

  it("rend `/` sur une entrée vide, absente ou blanche", () => {
    expect(cheminInterne(null)).toBe("/");
    expect(cheminInterne(undefined)).toBe("/");
    expect(cheminInterne("")).toBe("/");
    expect(cheminInterne("   ")).toBe("/");
  });

  it("⚠️ CONTRÔLE : la garde sert VRAIMENT de filtre à `urlConnexionHub`", () => {
    // Sans ce cas, les précédents prouvent que la fonction refuse — pas qu'un appelant s'en
    // sert. Le `callbackUrl` d'une tentative de tremplin doit rester sur l'origine de JobAI.
    const url = new URL(urlConnexionHub("https://emploi.hubperso.com", "https://evil.com"));
    expect(new URL(url.searchParams.get("callbackUrl") ?? "").origin).toBe(
      "https://emploi.hubperso.com",
    );
    // Et le cas légitime traverse, sinon la garde serait un simple « tout refuser ».
    const ok = new URL(urlConnexionHub("https://emploi.hubperso.com", "/carte"));
    expect(ok.searchParams.get("callbackUrl")).toBe("https://emploi.hubperso.com/carte");
  });
});

describe("origineDe — l'en-tête `Host` ne décide pas de l'adresse publiée", () => {
  const requete = (url: string) => new Request(url);

  it("⚠️ l'origine CONFIGURÉE gagne contre ce que dit la requête", () => {
    // C'est tout l'objet du module : les métadonnées OAuth annoncent OÙ aller chercher le
    // jeton. Les dériver de la requête laisse quiconque atteint l'app choisir cette adresse.
    vi.stubEnv("AUTH_URL", "https://emploi.hubperso.com");
    expect(origineDe(requete("https://forge.example/.well-known/x"))).toBe(
      "https://emploi.hubperso.com",
    );
  });

  it("garde l'ORIGINE seule, jamais le chemin de la variable", () => {
    vi.stubEnv("AUTH_URL", "https://emploi.hubperso.com/api/auth");
    expect(origineDe(requete("https://forge.example/x"))).toBe("https://emploi.hubperso.com");
  });

  it("⚠️ une variable BLANCHE est traitée comme absente — `[ENV-VIDE-01]`", () => {
    // AVANT correctif : `??` est le coalescement NULLISH, donc `""` n'était PAS remplacée par
    // `NEXTAUTH_URL` — elle coupait la chaîne de repli et faisait retomber l'origine sur
    // l'en-tête de la requête, exactement ce que ce module existe pour refuser.
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "https://emploi.hubperso.com");
    expect(origineDe(requete("https://forge.example/x"))).toBe("https://emploi.hubperso.com");
    // Et une valeur uniquement faite d'espaces compte pareil.
    vi.stubEnv("AUTH_URL", "   ");
    expect(origineDe(requete("https://forge.example/x"))).toBe("https://emploi.hubperso.com");
  });

  it("retombe sur `NEXTAUTH_URL` quand `AUTH_URL` est ABSENTE", () => {
    // ⚠️ ABSENTE, PAS VIDE, et la nuance est dans le code : `??` est le coalescement NULLISH,
    // donc `AUTH_URL=""` n'est PAS remplacée par `NEXTAUTH_URL` — elle court-circuite les
    // deux et l'app retombe sur l'en-tête de la requête. Mon premier jet posait `""` et
    // mesurait donc autre chose que ce que son titre annonçait.
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv("NEXTAUTH_URL", "https://emploi.hubperso.com");
    expect(origineDe(requete("https://forge.example/x"))).toBe("https://emploi.hubperso.com");
  });

  it("sans aucune variable : l'origine de la requête — le repli de développement", () => {
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv("NEXTAUTH_URL", undefined);
    expect(origineDe(requete("http://localhost:3000/.well-known/x"))).toBe("http://localhost:3000");
  });

  it("⚠️ une variable MAL FORMÉE ne casse pas la découverte, elle retombe", () => {
    // Le module le dit : une variable illisible ne doit pas rendre l'app indécouvrable.
    vi.stubEnv("AUTH_URL", "pas une url");
    vi.stubEnv("NEXTAUTH_URL", undefined);
    expect(origineDe(requete("http://localhost:3000/x"))).toBe("http://localhost:3000");
  });
});

describe("domicile — « pas de position » plutôt qu'une position fausse", () => {
  it("⚠️ rien de configuré : rend `null`, et n'a RIEN touché", async () => {
    vi.stubEnv("DOMICILE_LAT", undefined);
    vi.stubEnv("DOMICILE_LON", undefined);
    vi.stubEnv("DOMICILE_ADRESSE", undefined);
    const { domicile } = await import("@/lib/domicile");
    expect(await domicile()).toBeNull();
    // `null` est la SEULE réponse honnête : une coordonnée inventée contaminerait toutes les
    // distances, et aucun écran ne pourrait la démentir.
    expect(touches).toEqual([]);
  });

  it("⚠️ des coordonnées valides : aucun appel réseau, aucune lecture de base", async () => {
    vi.stubEnv("DOMICILE_LAT", "46.8139");
    vi.stubEnv("DOMICILE_LON", "-71.2080");
    const { domicile } = await import("@/lib/domicile");
    expect(await domicile()).toEqual({ lat: 46.8139, lon: -71.208 });
    // Le point du cas : la voie directe COURT-CIRCUITE tout le reste. Sans cette assertion,
    // un jour où elle cesserait de court-circuiter, on paierait un appel Nominatim par passe
    // sans qu'aucun résultat ne change.
    expect(touches).toEqual([]);
  });

  it("⚠️ des coordonnées BLANCHES ne deviennent pas `{0, 0}` — `[ENV-VIDE-01]`", async () => {
    // AVANT correctif : `Number("")` vaut 0 et 0 est fini, donc une variable créée puis
    // laissée blanche dans Vercel rendait un point au large de la Guinée — et le repli par
    // adresse n'était JAMAIS atteint. Toutes les distances partaient de là.
    vi.stubEnv("DOMICILE_LAT", "");
    vi.stubEnv("DOMICILE_LON", "");
    vi.stubEnv("DOMICILE_ADRESSE", undefined);
    const { domicile } = await import("@/lib/domicile");
    expect(await domicile()).toBeNull();

    // Une valeur uniquement faite d'espaces compte pareil : `Number(" ")` vaut 0 aussi.
    vi.stubEnv("DOMICILE_LAT", " ");
    vi.stubEnv("DOMICILE_LON", " ");
    vi.resetModules();
    const { domicile: d2 } = await import("@/lib/domicile");
    expect(await d2()).toBeNull();
  });

  it("des coordonnées ILLISIBLES ne deviennent pas une position : on passe à l'adresse", async () => {
    vi.stubEnv("DOMICILE_LAT", "pas-un-nombre");
    vi.stubEnv("DOMICILE_LON", "-71.2080");
    vi.stubEnv("DOMICILE_ADRESSE", "1 rue Exemple, Québec");
    const { domicile } = await import("@/lib/domicile");
    expect(await domicile()).toEqual({ lat: 46.8, lon: -71.2 });
    // Et la voie adresse passe bien par la base PUIS le réseau — c'est le contrôle qui rend
    // les deux `toEqual([])` ci-dessus non vacueux : cet espion sait VOIR un appel.
    expect(touches).toEqual(["db.select", "geocoderPlusieurs(RÉSEAU)", "db.insert"]);
  });
});
