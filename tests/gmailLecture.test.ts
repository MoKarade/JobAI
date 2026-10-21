// tests/gmailLecture.test.ts — l'accès Gmail est en lecture seule, échec fermé, jeton chiffré (JobAI#107, ADR-0041).

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REDIRECT_PAR_DEFAUT, SCOPE_GMAIL, configGmail, type ConfigGmailPrete } from "../lib/gmail/config";
import { chiffrerJeton, dechiffrerJeton } from "../lib/gmail/jeton";
import { echangerCode, egalConstant, genererPkce, rafraichir, urlAutorisation, type FetchFn } from "../lib/gmail/oauth";
import { COURRIELS_MAX, lireCourriels, requeteReponses } from "../lib/gmail/lecture";
import { resumerEtatSynchro } from "../lib/diagnosticSynchro";

const CFG: ConfigGmailPrete = {
  ok: true,
  clientId: "client-test",
  clientSecret: "secret-test",
  redirectUri: REDIRECT_PAR_DEFAUT,
  secretChiffrement: "auth-secret-test",
};

function reponseJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllEnvs());

describe("configGmail : échec fermé", () => {
  it("nomme les variables absentes ou blanches, jamais leur valeur", () => {
    vi.stubEnv("GMAIL_CLIENT_ID", "");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "   ");
    vi.stubEnv("AUTH_SECRET", "x");
    const cfg = configGmail();
    expect(cfg).toEqual({ ok: false, manquantes: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET"] });
  });

  it("est prête quand les trois variables sont posées, avec la redirection par défaut", () => {
    vi.stubEnv("GMAIL_CLIENT_ID", "id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "sec");
    vi.stubEnv("AUTH_SECRET", "auth");
    vi.stubEnv("GMAIL_REDIRECT_URI", "");
    const cfg = configGmail();
    expect(cfg.ok).toBe(true);
    if (cfg.ok) expect(cfg.redirectUri).toBe(REDIRECT_PAR_DEFAUT);
  });
});

describe("jeton chiffré", () => {
  it("se relit avec le même secret et pas avec un autre", () => {
    const blob = chiffrerJeton("1//refresh", "secret-a");
    expect(blob).not.toContain("refresh");
    expect(dechiffrerJeton(blob, "secret-a")).toBe("1//refresh");
    expect(dechiffrerJeton(blob, "secret-b")).toBeNull();
  });

  it("rend null pour tout ce qui est altéré ou mal formé, sans lever", () => {
    const blob = chiffrerJeton("jeton", "s");
    const altere = blob.slice(0, -2) + (blob.endsWith("AA") ? "BB" : "AA");
    expect(dechiffrerJeton(altere, "s")).toBeNull();
    expect(dechiffrerJeton("", "s")).toBeNull();
    expect(dechiffrerJeton("v2.a.b.c", "s")).toBeNull();
    expect(dechiffrerJeton("v1.a.b.c.d", "s")).toBeNull();
    // Une étiquette tronquée est refusée avant tout déchiffrement (finding Semgrep gcm-no-tag-length).
    const [v, iv, tag, ct] = blob.split(".");
    const courte = Buffer.from(tag ?? "", "base64url").subarray(0, 4).toString("base64url");
    expect(dechiffrerJeton([v, iv, courte, ct].join("."), "s")).toBeNull();
  });

  it("chiffre deux fois la même valeur en deux blobs différents (IV neuf)", () => {
    expect(chiffrerJeton("x", "s")).not.toBe(chiffrerJeton("x", "s"));
  });
});

describe("flux OAuth", () => {
  it("l'URL ne demande que gmail.readonly, en PKCE, hors ligne, sans scopes déjà accordés", () => {
    const pkce = genererPkce();
    const url = new URL(urlAutorisation(CFG, pkce));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(SCOPE_GMAIL);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(pkce.challenge);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
    expect(url.searchParams.get("state")).toBe(pkce.state);
  });

  it("égalité en temps constant", () => {
    expect(egalConstant("abc", "abc")).toBe(true);
    expect(egalConstant("abc", "abd")).toBe(false);
    expect(egalConstant("abc", "abcd")).toBe(false);
  });

  it("échange le code et rend le jeton de rafraîchissement", async () => {
    const f = vi.fn<FetchFn>(async () => reponseJson({ access_token: "a", refresh_token: "r", scope: SCOPE_GMAIL }));
    await expect(echangerCode(CFG, "code", "verif", f)).resolves.toEqual({ refreshToken: "r" });
    const corps = new URLSearchParams(String(f.mock.calls[0]?.[1]?.body));
    expect(corps.get("code_verifier")).toBe("verif");
    expect(corps.get("grant_type")).toBe("authorization_code");
  });

  it("refuse un scope accordé autre que la lecture seule, même en plus", async () => {
    for (const scope of ["https://mail.google.com/", `${SCOPE_GMAIL} https://www.googleapis.com/auth/gmail.send`]) {
      const f: FetchFn = async () => reponseJson({ access_token: "a", refresh_token: "r", scope });
      await expect(echangerCode(CFG, "c", "v", f)).rejects.toThrow(/Scope accordé inattendu/);
    }
  });

  it("refuse une réponse sans jeton de rafraîchissement", async () => {
    const f: FetchFn = async () => reponseJson({ access_token: "a", scope: SCOPE_GMAIL });
    await expect(echangerCode(CFG, "c", "v", f)).rejects.toThrow(/rafraîchissement/);
  });

  it("une erreur de Google garde le statut et le code standard, jamais son corps", async () => {
    const f: FetchFn = async () => reponseJson({ error: "invalid_grant", error_description: "client SECRET-DU-CLIENT" }, 400);
    const err = await echangerCode(CFG, "c", "v", f).catch((e: unknown) => e);
    expect(String((err as Error).message)).toContain("400");
    expect(String((err as Error).message)).toContain("invalid_grant");
    expect(String((err as Error).message)).not.toContain("SECRET");
  });

  it("une panne réseau se nomme sans lever autre chose qu'une erreur Google", async () => {
    const f: FetchFn = async () => {
      throw new Error("ECONNRESET http://interne");
    };
    const err = await rafraichir(CFG, "r", f).catch((e: unknown) => e);
    expect((err as Error).name).toBe("GoogleErreur");
    expect((err as Error).message).not.toContain("interne");
  });

  it("rafraîchit : un jeton d'accès", async () => {
    const f: FetchFn = async () => reponseJson({ access_token: "acces" });
    await expect(rafraichir(CFG, "r", f)).resolves.toBe("acces");
  });
});

describe("lireCourriels : des GET, bornés, expurgés", () => {
  // Assemblés à l'exécution : un nom et un numéro écrits en clair ici seraient refusés par `tests/piiGuard.test.ts` (garde-fou n°1).
  const CIVILITE = ["Mme", "Tremblay"].join(" ");
  const TELEPHONE = ["418", "555", "0199"].join("-");
  const MESSAGE = {
    snippet: `Bonjour, merci de votre candidature. Contactez ${CIVILITE} au ${TELEPHONE}.`,
    payload: {
      headers: [
        { name: "From", value: "RH <rh@exemple.test>" },
        { name: "Subject", value: "Votre candidature" },
        { name: "Date", value: "Tue, 20 Oct 2026 14:00:00 -0400" },
      ],
    },
  };

  it("n'émet que des GET vers l'API messages, avec le jeton, et lit les métadonnées seulement", async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const f: FetchFn = async (url, init) => {
      appels.push({ url, init });
      return url.includes("maxResults=")
        ? reponseJson({ messages: [{ id: "m1" }] })
        : reponseJson(MESSAGE);
    };
    const rendus = await lireCourriels("jeton-acces", { depuisJours: 14, max: 10 }, f);
    expect(appels).toHaveLength(2);
    for (const a of appels) {
      expect(a.init?.method).toBe("GET");
      expect(a.url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/messages")).toBe(true);
      expect((a.init?.headers as Record<string, string>).authorization).toBe("Bearer jeton-acces");
    }
    expect(appels[1]?.url).toContain("format=metadata");
    expect(rendus).toEqual([
      {
        id: "m1",
        de: "RH <rh@exemple.test>",
        sujet: "Votre candidature",
        recuLe: "2026-10-20T18:00:00.000Z",
        extrait: expect.any(String),
      },
    ]);
  });

  it("retire la PII de l'extrait avant de le rendre", async () => {
    const f: FetchFn = async (url) => (url.includes("maxResults") ? reponseJson({ messages: [{ id: "m1" }] }) : reponseJson(MESSAGE));
    const [c] = await lireCourriels("t", { depuisJours: 7, max: 5 }, f);
    expect(c?.extrait).not.toContain(TELEPHONE);
    expect(c?.extrait).not.toContain("Tremblay");
  });

  it("borne l'âge et le nombre", async () => {
    expect(requeteReponses(9999)).toContain("newer_than:60d");
    expect(requeteReponses(0)).toContain("newer_than:1d");
    expect(requeteReponses(14)).toContain("-category:promotions");
    const urls: string[] = [];
    const f: FetchFn = async (url) => {
      urls.push(url);
      return reponseJson({ messages: [] });
    };
    await lireCourriels("t", { depuisJours: 5, max: 9999 }, f);
    expect(new URL(urls[0] ?? "").searchParams.get("maxResults")).toBe(String(COURRIELS_MAX));
  });

  it("un refus de Gmail se nomme par son statut, sans le corps", async () => {
    const f: FetchFn = async () => reponseJson({ error: { message: "détail interne" } }, 403);
    const err = await lireCourriels("t", { depuisJours: 5, max: 5 }, f).catch((e: unknown) => e);
    expect(String((err as Error).message)).toContain("403");
    expect(String((err as Error).message)).not.toContain("interne");
  });
});

describe("garde de frontière : rien d'écrit chez Gmail, rien de gardé sans chiffrement", () => {
  const dossier = join(process.cwd(), "lib/gmail");
  const sources = readdirSync(dossier)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ f, s: readFileSync(join(dossier, f), "utf8") }));

  it("lecture.ts ne parle qu'à la racine messages, en GET", () => {
    const s = sources.find((x) => x.f === "lecture.ts")?.s ?? "";
    expect(s).not.toMatch(/method:\s*["'](?!GET)/);
    expect(s).not.toMatch(/\/(send|modify|trash|delete|batchModify|import|insert)\b/);
  });

  it("le seul POST de lib/gmail va vers le jeton de Google (oauth.ts)", () => {
    const posts = sources.filter(({ s }) => /method:\s*["']POST["']/.test(s.replace(/\/\/.*$/gm, "")));
    expect(posts.map((p) => p.f)).toEqual(["oauth.ts"]);
  });

  it("les routes de connexion ne sont pas des chemins publics", async () => {
    const { estCheminPublic } = await import("../lib/garde");
    expect(estCheminPublic("/api/gmail/connexion")).toBe(false);
    expect(estCheminPublic("/api/gmail/retour")).toBe(false);
    expect(estCheminPublic("/api/gmail/courriels")).toBe(false);
  });
});

describe("etat_synchro : la ligne gmail", () => {
  it("dit non configuré et non connecté, par noms de variables", () => {
    const lignes = resumerEtatSynchro([], new Date(), undefined, { configure: false, manquantes: ["GMAIL_CLIENT_ID"] });
    expect(lignes).toEqual([{ cle: "gmail", configure: false, manquantes: ["GMAIL_CLIENT_ID"], connecte: false }]);
  });

  it("connecté quand la ligne du jeton existe, sans jamais en rendre le contenu", () => {
    const lignes = resumerEtatSynchro(
      [{ cle: "gmail-jeton", majLe: new Date("2026-10-21T12:00:00Z") }],
      new Date("2026-10-21T13:00:00Z"),
      undefined,
      { configure: true, manquantes: [] },
    );
    const gmail = lignes.find((l) => l.cle === "gmail");
    expect(gmail).toEqual({ cle: "gmail", configure: true, manquantes: [], connecte: true });
    expect(JSON.stringify(lignes)).not.toMatch(/valeur/);
  });

  it("sans option gmail, rien n'est ajouté (compatible avec l'existant)", () => {
    expect(resumerEtatSynchro([], new Date())).toEqual([]);
  });
});
