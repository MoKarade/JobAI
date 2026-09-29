// tests/sessionSignee.test.ts — le NOUVEAU cookie signé (phase 1, « accepter les deux »).
//
// Aucune clé n'est écrite en dur : chaque test génère sa propre paire ES256 avec `jose`,
// exactement comme le demande le garde-fou sécurité (« clé publique lue d'une variable
// publique, jamais inventée ; en tests, une paire générée dans le test »). La vérification
// cryptographique testée ici est celle, RÉELLE, de `@mokarade/hub-contract/session` — ce
// fichier éprouve le CÂBLAGE (lecture de l'environnement, règle d'autorisation à deux
// étages), pas une resimulation de `verifierSession`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, UnsecuredJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import {
  NOM_COOKIE_SESSION_SIGNEE,
  clesPubliquesDepuisEnv,
  estAuthentifieParSessionSignee,
  lireIdentiteSignee,
} from "../lib/sessionSignee";

const EMETTEUR = "hubperso.com";
const KID = "hub-2026-09";
const MARC = "marc@exemple.com";

async function paireClesEs256(): Promise<{ privateKey: CryptoKey; jwkPublique: JWK }> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const jwkPublique = await exportJWK(publicKey);
  jwkPublique.kid = KID;
  return { privateKey, jwkPublique };
}

/** Un cookie valide, signé par la vraie clé privée — le cas passant de référence. */
async function cookieValide(
  privateKey: CryptoKey,
  overrides: { email?: string; iat?: number; exp?: number; kid?: string; iss?: string } = {},
): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: overrides.email ?? MARC })
    .setProtectedHeader({ alg: "ES256", kid: overrides.kid ?? KID })
    .setIssuedAt(overrides.iat ?? maintenant)
    .setExpirationTime(overrides.exp ?? maintenant + 3600)
    .setIssuer(overrides.iss ?? EMETTEUR)
    .sign(privateKey);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("NOM_COOKIE_SESSION_SIGNEE", () => {
  it("est le nom fixé par le plan, jamais dérivé", () => {
    expect(NOM_COOKIE_SESSION_SIGNEE).toBe("__Secure-hub.session");
  });
});

describe("clesPubliquesDepuisEnv — échec fermé, jamais de clé inventée", () => {
  it("rend `null` sans la variable", () => {
    expect(clesPubliquesDepuisEnv({})).toBeNull();
  });

  it("rend `null` sur une variable vide ou blanche", () => {
    expect(clesPubliquesDepuisEnv({ HUB_SESSION_PUBLIC_KEYS: "" })).toBeNull();
    expect(clesPubliquesDepuisEnv({ HUB_SESSION_PUBLIC_KEYS: "   " })).toBeNull();
  });

  it("rend `null` sur du JSON illisible, sans lever", () => {
    expect(clesPubliquesDepuisEnv({ HUB_SESSION_PUBLIC_KEYS: "{pas du json" })).toBeNull();
  });

  it("rend `null` si la forme n'est pas { keys: [...] }", () => {
    expect(clesPubliquesDepuisEnv({ HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ autre: 1 }) })).toBeNull();
  });

  it("rend les clés telles quelles quand la variable est valide", async () => {
    const { jwkPublique } = await paireClesEs256();
    const clesPubliques = clesPubliquesDepuisEnv({
      HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }),
    });
    expect(clesPubliques?.keys).toHaveLength(1);
    expect(clesPubliques?.keys[0]?.kid).toBe(KID);
  });
});

describe("lireIdentiteSignee", () => {
  it("rend `null` sans cookie — cas nominal tant que Hubperso ne l'émet pas", async () => {
    expect(await lireIdentiteSignee(undefined, {})).toBeNull();
  });

  it("rend `null` sans HUB_SESSION_PUBLIC_KEYS configurée, sans même essayer de vérifier", async () => {
    const { privateKey } = await paireClesEs256();
    const cookie = await cookieValide(privateKey);
    expect(await lireIdentiteSignee(cookie, {})).toBeNull();
  });

  it("accepte un cookie valide et rend l'identité qu'il porte", async () => {
    const { privateKey, jwkPublique } = await paireClesEs256();
    const env = { HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }) };
    const cookie = await cookieValide(privateKey);

    const identite = await lireIdentiteSignee(cookie, env);
    expect(identite?.email).toBe(MARC);
    expect(identite?.emisLe).toBeTypeOf("number");
    expect(identite?.expireLe).toBeTypeOf("number");
  });

  it("refuse `alg: none` — la confusion la plus grossière", async () => {
    const { jwkPublique } = await paireClesEs256();
    const env = { HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }) };
    const maintenant = Math.floor(Date.now() / 1000);
    const cookie = new UnsecuredJWT({ email: MARC })
      .setIssuedAt(maintenant)
      .setExpirationTime(maintenant + 3600)
      .setIssuer(EMETTEUR)
      .encode();

    expect(await lireIdentiteSignee(cookie, env)).toBeNull();
  });

  it("refuse `alg: HS256` signé avec la clé publique comme secret — confusion d'algorithme", async () => {
    const { jwkPublique } = await paireClesEs256();
    const env = { HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }) };
    const maintenant = Math.floor(Date.now() / 1000);
    // L'attaque classique : prendre ce que le vérifieur connaît (ici la clé publique
    // publiée) et l'utiliser comme secret HMAC, en espérant qu'aucun algorithme ne soit
    // figé côté vérification.
    const secretConfusion = new TextEncoder().encode(JSON.stringify(jwkPublique));
    const cookie = await new SignJWT({ email: MARC })
      .setProtectedHeader({ alg: "HS256", kid: KID })
      .setIssuedAt(maintenant)
      .setExpirationTime(maintenant + 3600)
      .setIssuer(EMETTEUR)
      .sign(secretConfusion);

    expect(await lireIdentiteSignee(cookie, env)).toBeNull();
  });

  it("refuse une signature invalide — signé par une AUTRE clé privée que celle publiée", async () => {
    const { jwkPublique } = await paireClesEs256();
    const { privateKey: cleDunAutre } = await paireClesEs256();
    const env = { HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }) };
    // Même `kid` que la clé publiée (sinon le test mesurerait « kid inconnu », pas
    // « signature invalide ») mais signé par une clé privée différente.
    const cookie = await cookieValide(cleDunAutre);

    expect(await lireIdentiteSignee(cookie, env)).toBeNull();
  });

  it("refuse un `kid` inconnu, même avec une signature par ailleurs correcte", async () => {
    const { privateKey, jwkPublique } = await paireClesEs256();
    const env = { HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }) };
    const cookie = await cookieValide(privateKey, { kid: "kid-jamais-publie" });

    expect(await lireIdentiteSignee(cookie, env)).toBeNull();
  });

  it("refuse un cookie expiré", async () => {
    const { privateKey, jwkPublique } = await paireClesEs256();
    const env = { HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }) };
    const passe = Math.floor(Date.now() / 1000) - 7200;
    const cookie = await cookieValide(privateKey, { iat: passe, exp: passe + 60 });

    expect(await lireIdentiteSignee(cookie, env)).toBeNull();
  });

  it("refuse un émetteur (`iss`) différent de hubperso.com", async () => {
    const { privateKey, jwkPublique } = await paireClesEs256();
    const env = { HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }) };
    const cookie = await cookieValide(privateKey, { iss: "pas-hubperso.com" });

    expect(await lireIdentiteSignee(cookie, env)).toBeNull();
  });
});

describe("estAuthentifieParSessionSignee — la règle à deux étages, sur le nouveau cookie", () => {
  it("refuse sans cookie, sans jamais interroger le hub", async () => {
    const verifierAcces = vi.fn();
    expect(await estAuthentifieParSessionSignee(undefined, {}, undefined, verifierAcces)).toBe(false);
    expect(verifierAcces).not.toHaveBeenCalled();
  });

  it("autorise Marc (AUTHORIZED_EMAIL) sans jamais interroger le hub", async () => {
    const { privateKey, jwkPublique } = await paireClesEs256();
    const env = {
      HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }),
      AUTHORIZED_EMAIL: MARC,
    };
    const cookie = await cookieValide(privateKey, { email: MARC });
    const verifierAcces = vi.fn();

    expect(await estAuthentifieParSessionSignee(cookie, env, undefined, verifierAcces)).toBe(true);
    expect(verifierAcces).not.toHaveBeenCalled();
  });

  it("email hors accès : refuse quand le hub refuse aussi", async () => {
    const invite = "invite@exemple.com";
    const { privateKey, jwkPublique } = await paireClesEs256();
    const env = {
      HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }),
      AUTHORIZED_EMAIL: MARC,
    };
    const cookie = await cookieValide(privateKey, { email: invite });
    const verifierAcces = vi.fn(async () => false);

    expect(await estAuthentifieParSessionSignee(cookie, env, undefined, verifierAcces)).toBe(false);
    expect(verifierAcces).toHaveBeenCalledWith(invite, env);
  });

  it("email hors accès : autorise quand le hub accorde l'accès", async () => {
    const invite = "invite@exemple.com";
    const { privateKey, jwkPublique } = await paireClesEs256();
    const env = {
      HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }),
      AUTHORIZED_EMAIL: MARC,
    };
    const cookie = await cookieValide(privateKey, { email: invite });
    const verifierAcces = vi.fn(async () => true);

    expect(await estAuthentifieParSessionSignee(cookie, env, undefined, verifierAcces)).toBe(true);
  });

  it("un cookie invalide (mauvaise signature) refuse, sans jamais interroger le hub", async () => {
    const { jwkPublique } = await paireClesEs256();
    const { privateKey: cleDunAutre } = await paireClesEs256();
    const env = {
      HUB_SESSION_PUBLIC_KEYS: JSON.stringify({ keys: [jwkPublique] }),
      AUTHORIZED_EMAIL: MARC,
    };
    const cookie = await cookieValide(cleDunAutre);
    const verifierAcces = vi.fn();

    expect(await estAuthentifieParSessionSignee(cookie, env, undefined, verifierAcces)).toBe(false);
    expect(verifierAcces).not.toHaveBeenCalled();
  });
});
