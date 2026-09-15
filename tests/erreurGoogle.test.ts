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

/**
 * Le corps d'un refus Google « moderne » (Routes, Places New) : `ErrorInfo` dans `details`.
 *
 * ⚠️ RENDU EN TEXTE, parce que c'est ce que la fonction reçoit en vrai. Le premier usage réel
 * (2026-09-15) a montré pourquoi ça compte : tant que l'appelant faisait `reponse.json()`, un
 * corps qui n'est pas du JSON était jeté avant d'arriver ici, et les tests ne pouvaient même
 * pas exprimer ce cas.
 */
function corpsAvecReason(reason: string, message = "Une phrase de Google.") {
  return JSON.stringify({
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
  });
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

describe("lireRefusGoogle — le corps de computeRouteMatrix est un TABLEAU", () => {
  /**
   * ⚠️ LE CORPS EXACT RENVOYÉ PAR LA PRODUCTION LE 2026-09-15 À 17:05 UTC, relevé dans les
   * journaux parce que le lot précédent avait appris à CITER ce qu'il ne comprenait pas.
   * `computeRouteMatrix` est un endpoint de STREAMING : son refus arrive enveloppé dans un
   * tableau. La cause — `API_KEY_SERVICE_BLOCKED` — était dans la table depuis le premier
   * jour et n'a jamais été atteinte : `.error` sur un tableau vaut `undefined`.
   */
  const CORPS_MATRICE = JSON.stringify([
    {
      error: {
        code: 403,
        message:
          "Requests to this API routes.googleapis.com method " +
          "google.maps.routing.v2.Routes.ComputeRouteMatrix are blocked.",
        status: "PERMISSION_DENIED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "API_KEY_SERVICE_BLOCKED",
            domain: "googleapis.com",
            metadata: {
              service: "routes.googleapis.com",
              method: "google.maps.routing.v2.Routes.ComputeRouteMatrix",
            },
          },
        ],
      },
    },
  ]);

  it("⚠️ reconnaît la cause ENVELOPPÉE dans un tableau — le cas réel du 2026-09-15", () => {
    const r = lireRefusGoogle(CORPS_MATRICE);
    expect(r.raison).toBe("cle-restreinte-api");
    expect(r.message).toContain("are blocked");
    // Cause reconnue ⇒ plus de citation brute : le geste se suffit.
    expect(r.brut).toBeNull();
  });

  it("mène au geste JUSTE — les restrictions de la clé, PAS la Library", () => {
    const p = expliquerRefusGoogle("Routes API", 403, lireRefusGoogle(CORPS_MATRICE));
    expect(p).toContain("Restrictions d'API");
    expect(p).not.toContain("Library");
  });

  it("un tableau sans erreur reconnaissable reste « inconnue », et se cite", () => {
    const r = lireRefusGoogle('[{"autre":1}]');
    expect(r.raison).toBe("inconnue");
    expect(r.brut).toContain("autre");
  });

  it("un tableau VIDE ne lève pas et n'invente rien", () => {
    const r = lireRefusGoogle("[]");
    expect(r.raison).toBe("inconnue");
    expect(r.message).toBeNull();
  });

  it("prend le PREMIER élément qui porte une erreur, pas le premier tout court", () => {
    // Un flux de matrice peut commencer par des éléments valides avant de buter.
    const r = lireRefusGoogle(
      '[{"originIndex":0},{"error":{"message":"Refus.","details":[{"reason":"BILLING_DISABLED"}]}}]',
    );
    expect(r.raison).toBe("facturation");
    expect(r.message).toBe("Refus.");
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
    const r = lireRefusGoogle(
      JSON.stringify({ status: "REQUEST_DENIED", error_message: "La clé est bloquée." }),
    );
    expect(r.raison).toBe("inconnue");
    expect(r.message).toBe("La clé est bloquée.");
  });

  it("ne lève JAMAIS sur un corps illisible — un diagnostic n'est pas une seconde panne", () => {
    for (const brut of [null, "", "   ", "42", "[]", "<html>oups", '{"error":null}', '{"error":{}}']) {
      const r = lireRefusGoogle(brut);
      expect(r.raison).toBe("inconnue");
    }
    expect(lireRefusGoogle(null).message).toBeNull();
  });

  it("⚠️ CITE la réponse brute quand elle ne porte AUCUNE phrase — le cas du 2026-09-15", () => {
    // Journal du premier usage réel : « Google n'a donné aucune explication lisible ». Vrai,
    // et inexploitable — parce que le corps était jeté avant d'arriver ici. Une page HTML,
    // une réponse tronquée et un JSON muet donnaient tous la même phrase.
    const r = lireRefusGoogle("<html><title>403 Forbidden</title></html>");
    expect(r.raison).toBe("inconnue");
    expect(r.message).toBeNull();
    expect(r.brut).toContain("403 Forbidden");
  });

  it("replie les espaces et borne la citation — un journal, pas un vidage", () => {
    const r = lireRefusGoogle("<html>\n\n   " + "z".repeat(500) + "</html>");
    expect(r.brut).not.toBeNull();
    expect((r.brut ?? "").length).toBeLessThanOrEqual(300);
    expect(r.brut).not.toContain("\n");
  });

  it("⚠️ NE cite PAS le brut quand une phrase existe — répéter la même chose est du bruit", () => {
    const r = lireRefusGoogle(corpsAvecReason("REASON_INEDITE", "Une cause inédite."));
    expect(r.message).toBe("Une cause inédite.");
    expect(r.brut).toBeNull();
  });

  it("⚠️ NI quand la cause est RECONNUE — le geste se suffit, la citation encombre", () => {
    expect(lireRefusGoogle(corpsAvecReason("SERVICE_DISABLED")).brut).toBeNull();
  });

  it("distingue un corps VIDE d'un corps illisible — deux diagnostics, pas un", () => {
    expect(lireRefusGoogle("").brut).toBeNull();
    expect(lireRefusGoogle(null).brut).toBeNull();
    expect(lireRefusGoogle("bruit").brut).toBe("bruit");
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

  it("⚠️ un corps VIDE et un corps ILLISIBLE ne rendent PAS la même phrase", () => {
    // C'est exactement ce que la version du 2026-09-15 confondait, et les deux cas appellent
    // des gestes opposés : lire ce que le serveur a renvoyé, ou constater qu'il n'a rien
    // renvoyé du tout — un refus sans corps ne vient en général pas de l'API elle-même.
    const vide = expliquerRefusGoogle("Routes API", 403, lireRefusGoogle(""));
    const illisible = expliquerRefusGoogle("Routes API", 403, lireRefusGoogle("<html>403</html>"));
    expect(vide).toContain("VIDE");
    expect(illisible).toContain("Réponse brute");
    expect(illisible).toContain("403");
    expect(vide).not.toBe(illisible);
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
