// tests/erreurGoogle.test.ts — dire la cause de Google, pas celle qu'on suppose.
//
// ⚠️ LES CORPS SONT CEUX QUE GOOGLE ENVOIE, pas des exemples inventés : `error.details[]`
// porte un `google.rpc.ErrorInfo` dont le champ `reason` est l'identifiant STABLE, tandis
// que `error.message` est une phrase pour humains que Google remanie et traduit. Un
// détecteur qui lirait le message rendrait un verdict différent le jour d'une reformulation.
//
// ⚠️ ET LE CAS QUI COMPTE LE PLUS EST « INCONNUE » : c'est lui qui distingue ce module de
// celui qu'il remplace. L'ancien code déduisait « l'API n'est pas activée » d'un simple 403
// — vrai une fois sur six, et les cinq autres envoyaient Marc au mauvais endroit de la
// console en lui laissant croire le problème réglé.

import { describe, it, expect } from "vitest";
import {
  lireRefusGoogle,
  expliquerRefusGoogle,
  type RaisonRefusGoogle,
} from "@/lib/erreurGoogle";

/** Le corps d'un refus Google « moderne » (Routes, Places New) : `ErrorInfo` dans `details`. */
function corpsAvecReason(reason: string, message = "Une phrase de Google.") {
  return {
    error: {
      code: 403,
      message,
      status: "PERMISSION_DENIED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason,
          domain: "googleapis.com",
          metadata: { service: "routes.googleapis.com" },
        },
      ],
    },
  };
}

describe("lireRefusGoogle — la cause vient de `reason`, jamais du message", () => {
  const cas: ReadonlyArray<readonly [string, RaisonRefusGoogle]> = [
    ["SERVICE_DISABLED", "api-desactivee"],
    ["accessNotConfigured", "api-desactivee"],
    ["API_KEY_SERVICE_BLOCKED", "cle-restreinte-api"],
    ["API_KEY_HTTP_REFERRER_BLOCKED", "cle-restreinte-referer"],
    ["API_KEY_IP_ADDRESS_BLOCKED", "cle-restreinte-ip"],
    ["API_KEY_INVALID", "cle-invalide"],
    ["BILLING_DISABLED", "facturation"],
  ];

  for (const [reason, attendu] of cas) {
    it(`${reason} → ${attendu}`, () => {
      expect(lireRefusGoogle(corpsAvecReason(reason)).raison).toBe(attendu);
    });
  }

  it("ne se laisse pas tromper par un message qui dit autre chose que `reason`", () => {
    // Le discriminant : si le détecteur lisait la prose, il dirait « api-desactivee ».
    const corps = corpsAvecReason(
      "API_KEY_HTTP_REFERRER_BLOCKED",
      "Routes API has not been used in project 42 before or it is disabled.",
    );
    expect(lireRefusGoogle(corps).raison).toBe("cle-restreinte-referer");
  });

  it("cite le message de Google, borné", () => {
    const long = "x".repeat(500);
    const r = lireRefusGoogle(corpsAvecReason("SERVICE_DISABLED", long));
    expect(r.message).not.toBeNull();
    expect((r.message ?? "").length).toBeLessThanOrEqual(300);
  });
});

describe("lireRefusGoogle — ce qu'on ne sait pas, on ne l'invente pas", () => {
  it("rend « inconnue » sur une raison qu'on ne connaît pas, en gardant la phrase", () => {
    const r = lireRefusGoogle(corpsAvecReason("QUELQUE_CHOSE_DE_NEUF", "Une cause inédite."));
    expect(r.raison).toBe("inconnue");
    expect(r.message).toBe("Une cause inédite.");
  });

  it("lit le `error_message` des API legacy, qui n'ont pas d'ErrorInfo", () => {
    // Geocoding classique : ni `details`, ni `error` — un `status` et un `error_message`.
    const r = lireRefusGoogle({ status: "REQUEST_DENIED", error_message: "La clé est bloquée." });
    expect(r.raison).toBe("inconnue");
    expect(r.message).toBe("La clé est bloquée.");
  });

  it("ne lève JAMAIS sur un corps illisible — un diagnostic n'est pas une seconde panne", () => {
    for (const brut of [null, undefined, "", 42, [], { error: null }, { error: {} }]) {
      const r = lireRefusGoogle(brut);
      expect(r.raison).toBe("inconnue");
    }
    expect(lireRefusGoogle(null).message).toBeNull();
  });
});

describe("expliquerRefusGoogle — le geste SUIT la cause", () => {
  const de = (reason: string) => lireRefusGoogle(corpsAvecReason(reason));

  it("envoie activer l'API quand elle est désactivée, et NOMME l'API", () => {
    const p = expliquerRefusGoogle("Routes API", 403, de("SERVICE_DISABLED"));
    expect(p).toContain("Routes API");
    expect(p).toContain("Activer");
  });

  it("envoie aux RESTRICTIONS quand l'API est activée mais absente de la clé", () => {
    const p = expliquerRefusGoogle("Routes API", 403, de("API_KEY_SERVICE_BLOCKED"));
    expect(p).toContain("Restrictions d'API");
    // Et surtout PAS vers l'activation : c'est le faux geste qu'on vient de supprimer.
    expect(p).not.toContain("Library");
  });

  it("dit qu'une clé NAVIGATEUR ne se débloque par aucune activation", () => {
    // ⚠️ LE CAS QUI JUSTIFIE TOUT LE MODULE. L'ancien message envoyait activer une API ;
    // ici aucune activation ne peut marcher, et le dire évite un aller-retour complet.
    const p = expliquerRefusGoogle("Routes API", 403, de("API_KEY_HTTP_REFERRER_BLOCKED"));
    expect(p).toContain("aucune activation");
    expect(p).toContain("GOOGLE_MAPS_API_KEY");
  });

  it("ne propose AUCUN geste inventé sur une cause inconnue", () => {
    const p = expliquerRefusGoogle("Places API (New)", 403, de("REASON_INEDITE"));
    expect(p).toContain("Cause non reconnue");
    expect(p).not.toContain("Activer");
    expect(p).not.toContain("Restrictions d'API");
  });

  it("le dit aussi quand Google n'a rien expliqué du tout", () => {
    const p = expliquerRefusGoogle("Geocoding API", 403, lireRefusGoogle(null));
    expect(p).toContain("aucune explication");
  });

  it("rend une phrase DIFFÉRENTE pour chaque cause — sinon le classement est décoratif", () => {
    const raisons = [
      "SERVICE_DISABLED",
      "API_KEY_SERVICE_BLOCKED",
      "API_KEY_HTTP_REFERRER_BLOCKED",
      "API_KEY_IP_ADDRESS_BLOCKED",
      "API_KEY_INVALID",
      "BILLING_DISABLED",
    ];
    const phrases = new Set(
      raisons.map((r) => expliquerRefusGoogle("Routes API", 403, de(r))),
    );
    expect(phrases.size).toBe(raisons.length);
  });
});
