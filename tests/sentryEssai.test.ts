import { describe, expect, it } from "vitest";
import { retirerDonneesPersonnelles } from "@/lib/sentryConfig";
import {
  construireEnveloppe,
  lireDsn,
  trouverDsn,
  urlEnveloppe,
  urlSansCle,
} from "@/lib/sentryEssai";

const DSN = "https://0123456789abcdef0123456789abcdef@o123.ingest.us.sentry.io/4567";

describe("trouverDsn (JobAI#117)", () => {
  it("trouve le DSN dans un script client, parmi d'autres textes", () => {
    const textes = ["console.log('rien')", `var a="${DSN}";`];
    expect(trouverDsn(textes)).toEqual({
      cle: "0123456789abcdef0123456789abcdef",
      hote: "o123.ingest.us.sentry.io",
      projet: "4567",
    });
  });

  it("rend null sans DSN, ou si l'hôte n'est pas sentry.io", () => {
    expect(trouverDsn([])).toBeNull();
    expect(trouverDsn(["https://abc@exemple.com/1"])).toBeNull();
    expect(trouverDsn(["connect-src https://*.sentry.io"])).toBeNull();
  });

  it("lireDsn refuse une valeur mal formée, ou en clair (http)", () => {
    expect(lireDsn(`  ${DSN}\n`)?.projet).toBe("4567");
    expect(lireDsn("pas un dsn")).toBeNull();
    expect(lireDsn("http://abc@o1.ingest.sentry.io/1")).toBeNull();
  });
});

describe("adresses d'envoi", () => {
  const dsn = lireDsn(DSN)!;

  it("l'adresse d'envoi porte la clé, l'adresse de journal ne la porte pas", () => {
    expect(urlEnveloppe(dsn)).toContain("/api/4567/envelope/?");
    expect(urlEnveloppe(dsn)).toContain(`sentry_key=${dsn.cle}`);
    expect(urlSansCle(dsn)).toBe("https://o123.ingest.us.sentry.io/api/4567/envelope/");
    expect(urlSansCle(dsn)).not.toContain(dsn.cle);
  });
});

describe("construireEnveloppe", () => {
  const maintenant = new Date("2026-10-26T20:00:00Z");
  const lignes: string[] = construireEnveloppe("a".repeat(32), maintenant, retirerDonneesPersonnelles).split("\n");

  it("a trois lignes JSON : en-tête, type, événement", () => {
    expect(lignes).toHaveLength(3);
    expect(JSON.parse(lignes[0] ?? "")).toEqual({ event_id: "a".repeat(32), sent_at: maintenant.toISOString() });
    expect(JSON.parse(lignes[1] ?? "")).toEqual({ type: "event" });
  });

  it("l'événement est une erreur d'essai, sans donnée perso, environnement « essai »", () => {
    const evenement = JSON.parse(lignes[2] ?? "");
    expect(evenement.level).toBe("error");
    expect(evenement.environment).toBe("essai");
    expect(evenement.exception.values[0].value).toContain("aucune panne réelle");
    expect(evenement.user).toBeUndefined();
    expect(evenement.server_name).toBeUndefined();
    expect(evenement.timestamp).toBe(maintenant.getTime() / 1000);
  });
});
