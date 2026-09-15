// lib/erreurGoogle.ts — pourquoi Google refuse, d'après GOOGLE, jamais d'après le code HTTP.
//
// ── CE QUE ÇA RÉPARE ────────────────────────────────────────────────────────────────
//
// Journaux du 2026-09-15 : `[trajets] échec : Matrice refusée (403) : « Routes API » doit
// être activée et dans les restrictions de la clé serveur.` La phrase est SÛRE D'ELLE, et
// elle est déduite d'un seul nombre — 403. Or un 403 de Google porte au moins six causes,
// et chacune appelle un geste DIFFÉRENT :
//
//   · `SERVICE_DISABLED`            → activer l'API dans la console (Library) ;
//   · `API_KEY_SERVICE_BLOCKED`     → la clé existe, mais cette API n'est pas dans ses
//                                     restrictions ;
//   · `API_KEY_HTTP_REFERRER_BLOCKED` → c'est une clé NAVIGATEUR utilisée côté serveur ;
//                                     aucune activation ne la débloquera ;
//   · `API_KEY_IP_ADDRESS_BLOCKED`  → restriction par IP, et Vercel n'en a pas de fixe ;
//   · `API_KEY_INVALID`             → la clé est fausse ou révoquée ;
//   · facturation absente           → rien à voir avec les API activées.
//
// Envoyer Marc activer une API alors que sa clé est une clé navigateur lui fait perdre son
// temps et le laisse croire le problème réglé. « Un message d'erreur FAUX coûte plus cher
// qu'un message générique » (§9) — et celui-là était faux cinq fois sur six.
//
// ── LE VERDICT SE LIT DANS LA DONNÉE RICHE, UNE SEULE FOIS ──────────────────────────
//
// Google met la vraie cause dans `error.details[].reason` (un `google.rpc.ErrorInfo`), pas
// dans `error.message` — qui est une phrase pour humains, traduite et remaniée sans
// préavis. Un détecteur qui lirait le message se tromperait le jour où Google le reformule,
// et il ne rendrait pas le même verdict que celui qui lit `reason`. On lit donc `reason`
// d'abord, `status` ensuite, et on ne retombe sur le message QUE pour le citer — jamais
// pour en déduire quoi que ce soit.
//
// ── ET CE QU'ON NE SAIT PAS, ON LE CITE ─────────────────────────────────────────────
//
// Une raison inconnue ne devient pas « l'API n'est pas activée » par défaut : on rend ce que
// Google a dit, borné, avec le code HTTP. C'est moins satisfaisant à lire et c'est vrai —
// et c'est ce qui permettra de reconnaître la prochaine cause au lieu de la déguiser en
// celle d'avant.
//
// ⚠️ ET « CITER » NE VOULAIT RIEN DIRE TANT QUE LE CORPS DEVAIT ÊTRE DU JSON. Premier usage
// réel, 2026-09-15 15:45 UTC : `[trajets] échec : Routes API refuse la clé (403). Google n'a
// donné aucune explication lisible — relever la réponse brute pour trancher.` Le message ne
// mentait pas — il n'apprenait rien non plus. La version d'avant lisait `reponse.json()` et
// rabattait TOUT échec d'analyse sur `null` : un corps vide, une page HTML et un JSON sans
// `message` produisaient la même phrase, alors que ce sont trois diagnostics différents.
// On lit donc le corps en TEXTE, on tente le JSON dessus, et ce qui n'a livré aucune phrase
// est cité TEL QUEL (borné, espaces repliés). Un refus qui ne s'explique pas doit au moins
// être REPRODUCTIBLE par quelqu'un qui lit le journal.
//
// ⚠️ Le corps ne porte JAMAIS la clé — elle voyage dans l'en-tête `X-Goog-Api-Key`, et Google
// ne la renvoie pas. Citer la réponse brute ne publie donc aucun secret (garde-fou n°1).

/** La cause d'un refus, telle que Google la nomme. */
export type RaisonRefusGoogle =
  | "api-desactivee"
  | "cle-restreinte-api"
  | "cle-restreinte-referer"
  | "cle-restreinte-ip"
  | "cle-invalide"
  | "facturation"
  | "inconnue";

export interface RefusGoogle {
  raison: RaisonRefusGoogle;
  /** La PHRASE de Google (`error.message`), bornée. `null` si le corps n'en portait aucune. */
  message: string | null;
  /**
   * La réponse TELLE QUELLE, bornée — renseignée UNIQUEMENT quand aucune phrase n'a pu être
   * lue. Les deux ne cohabitent jamais : une citation qui répète ce qu'on vient de dire est
   * du bruit, et le journal doit rester lisible.
   *
   * `null` avec `message` nul aussi = le corps était VIDE, ce qui est en soi un fait :
   * un refus sans corps ne vient probablement pas de l'API elle-même.
   */
  brut: string | null;
}

/** Longueur au-delà de laquelle on tronque la phrase de Google dans un journal. */
const MAX_MESSAGE = 300;

/**
 * Les `reason` de `google.rpc.ErrorInfo` qu'on sait traduire en geste.
 *
 * ⚠️ UNE TABLE, PAS UNE SUITE DE `includes` SUR LE MESSAGE. `reason` est un identifiant
 * stable que Google documente ; le message est de la prose. Chercher « disabled » dans une
 * phrase marcherait jusqu'au jour où elle serait traduite en français.
 */
const PAR_REASON: Readonly<Record<string, RaisonRefusGoogle>> = {
  SERVICE_DISABLED: "api-desactivee",
  accessNotConfigured: "api-desactivee",
  API_KEY_SERVICE_BLOCKED: "cle-restreinte-api",
  API_KEY_HTTP_REFERRER_BLOCKED: "cle-restreinte-referer",
  API_KEY_IP_ADDRESS_BLOCKED: "cle-restreinte-ip",
  API_KEY_ANDROID_APP_BLOCKED: "cle-restreinte-referer",
  API_KEY_IOS_APP_BLOCKED: "cle-restreinte-referer",
  API_KEY_INVALID: "cle-invalide",
  BILLING_DISABLED: "facturation",
};

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, MAX_MESSAGE) : null;
}

/** Le corps tel quel, replié sur une ligne et borné — pour un journal, pas pour un parseur. */
function citation(brut: string | null): string | null {
  if (brut === null) return null;
  const plat = brut.replace(/\s+/g, " ").trim();
  return plat === "" ? null : plat.slice(0, MAX_MESSAGE);
}

/**
 * Lit le corps d'une erreur Google, à partir du TEXTE de la réponse. PURE, et tolérante :
 * un corps illisible rend « inconnue », jamais une exception — un diagnostic ne doit pas
 * devenir une seconde panne.
 *
 * ⚠️ ELLE PREND DU TEXTE, PAS UN OBJET DÉJÀ ANALYSÉ, et c'est le point. Un appelant qui
 * ferait `reponse.json().catch(() => null)` JETTERAIT le corps au premier caractère
 * inattendu — page HTML, corps vide, réponse tronquée — et rendrait « rien à dire » sur
 * exactement les cas qu'on cherche à diagnostiquer. Ici l'analyse rate sans rien perdre.
 */
export function lireRefusGoogle(brut: string | null): RefusGoogle {
  let corps: unknown = null;
  if (brut !== null && brut.trim() !== "") {
    try {
      corps = JSON.parse(brut);
    } catch {
      corps = null;
    }
  }

  const err = (corps as { error?: unknown } | null)?.error as
    | { message?: unknown; status?: unknown; details?: unknown }
    | undefined;
  // Les API « legacy » (Geocoding classique) n'ont pas d'`ErrorInfo` : elles rendent
  // `status: "REQUEST_DENIED"` et un `error_message`. On ne sur-interprète pas — c'est un
  // refus dont on ne connaît pas la cause, et le message cité fera le diagnostic.
  const legacy = (corps as { error_message?: unknown } | null) ?? {};
  const message = texte(err?.message) ?? texte(legacy.error_message);

  const details = Array.isArray(err?.details) ? err.details : [];
  for (const d of details) {
    const reason = (d as { reason?: unknown } | null)?.reason;
    if (typeof reason === "string" && PAR_REASON[reason] !== undefined) {
      // Cause reconnue : le corps brut n'apprendrait plus rien, et le geste se suffit.
      return { raison: PAR_REASON[reason], message, brut: null };
    }
  }

  // Cause inconnue : si Google n'a livré aucune phrase, c'est la réponse ELLE-MÊME qui
  // devient l'information. Sinon on ne la répète pas.
  return { raison: "inconnue", message, brut: message === null ? citation(brut) : null };
}

/** Le nom de l'API tel qu'il apparaît DANS LA CONSOLE Google — c'est ce qu'on va y chercher. */
export type ApiGoogle = "Routes API" | "Geocoding API" | "Places API (New)";

/**
 * La phrase à journaliser : la cause, puis LE geste correspondant. PURE.
 *
 * ⚠️ LE GESTE SUIT LA CAUSE, il n'est plus le même pour tout le monde. C'est tout l'objet de
 * ce module : « active l'API » et « ta clé est une clé navigateur » envoient à deux endroits
 * différents de la console, et se tromper coûte un aller-retour complet à Marc.
 */
export function expliquerRefusGoogle(api: ApiGoogle, statut: number, refus: RefusGoogle): string {
  const dit = refus.message === null ? "" : ` Google dit : « ${refus.message} »`;
  const tete = `${api} refuse la clé (${statut}).`;

  switch (refus.raison) {
    case "api-desactivee":
      return `${tete} L'API n'est pas ACTIVÉE. Console Google, projet hubperso : Library → « ${api} » → Activer.${dit}`;
    case "cle-restreinte-api":
      return `${tete} L'API est activée, mais elle n'est pas dans les RESTRICTIONS D'API de la clé serveur. Console Google : Identifiants → la clé serveur → Restrictions d'API → ajouter « ${api} ».${dit}`;
    case "cle-restreinte-referer":
      return `${tete} Cette clé est restreinte à des SITES WEB (référent HTTP) : elle ne peut pas servir côté serveur, et aucune activation d'API n'y changera rien. Il faut une clé SERVEUR distincte dans GOOGLE_MAPS_API_KEY — la clé du navigateur reste NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY.${dit}`;
    case "cle-restreinte-ip":
      return `${tete} Cette clé est restreinte à des ADRESSES IP, et les fonctions Vercel n'en ont pas de fixe. Retirer la restriction d'IP, ou utiliser une clé serveur sans elle.${dit}`;
    case "cle-invalide":
      return `${tete} La clé est refusée en tant que telle (fausse, révoquée, ou d'un autre projet). Vérifier la valeur de GOOGLE_MAPS_API_KEY.${dit}`;
    case "facturation":
      return `${tete} La FACTURATION du projet n'est pas active — rien à voir avec les API activées.${dit}`;
    case "inconnue":
      // ⚠️ ON NE DEVINE PAS. La phrase de Google est la seule information fiable qu'on ait ;
      // l'habiller d'une cause plausible ferait exactement ce que ce module corrige.
      //
      // TROIS cas, parce qu'ils appellent trois gestes différents : une phrase non reconnue
      // (ajouter sa `reason` à la table), un corps qui n'est pas du JSON (le lire — une page
      // HTML désigne souvent un refus posé AVANT l'API), et un corps VIDE (il n'y a rien à
      // lire, et c'est le fait à rapporter).
      if (refus.message !== null) return `${tete} Cause non reconnue.${dit}`;
      if (refus.brut !== null) {
        return `${tete} Google n'a donné aucune explication lisible. Réponse brute : « ${refus.brut} »`;
      }
      return `${tete} La réponse est VIDE — aucune explication, pas même un corps d'erreur. Un refus sans corps ne vient en général pas de l'API elle-même.`;
  }
}
