// lib/coutLlm.ts — ce que JobAI dépense en appels de modèle, compté puis publié au hub.
//
// POURQUOI CE FICHIER EXISTE
// Le README affirmait « aucun appel LLM dans l'app », et en tirait que l'absence de bloc
// `usage` au contrat du hub était HONNÊTE. C'est faux depuis le module CV : `lib/cv/
// extraction.ts` appelle Anthropic. L'absence n'était donc plus un aveu, c'était un TROU —
// et le total affiché par le hub ignorait ce que JobAI dépense.
//
// ⚠️ LA RÈGLE QUI COMMANDE TOUT LE FICHIER : ZÉRO APPEL ⇒ PAS DE BLOC `usage`.
// C'est le garde-fou n°3 appliqué à l'argent. « 0,00 $ » AFFIRME que l'app ne coûte rien ;
// l'absence de bloc ADMET qu'on ne suit rien. Tant qu'aucun appel n'a eu lieu, la seconde
// est la seule vraie. La distinction n'est pas cosmétique : « zéro appel » est une absence
// de mesure, « des appels dont le coût arrondi tombe à 0,00 $ » est une mesure — et le
// second publie bien un bloc, avec 0.
//
// ⚠️ ET UN CHAMP ABSENT VAUT 0, JAMAIS `undefined`. `undefined + nombre` donne `NaN`, et un
// seul `NaN` empoisonne TOUT le cumul, pas seulement l'appel concerné (bug vécu par DriveAI
// sur un JSON d'avant sa Vague 3). Les champs de cache sont donc normalisés à l'entrée, et
// un relevé qu'on ne sait pas lire est COMPTÉ comme ignoré — jamais traité comme un zéro.

/** Clé d'état sous laquelle le compteur vit (table `sync_state`, via `lib/etat.ts`). */
export const CLE_COUT_LLM = "cout-llm";

/**
 * Prix en dollars US par MILLION de tokens, pour `claude-haiku-4-5`.
 *
 * ⚠️ PROVENANCE, ET CE QUI EST MESURÉ vs CE QUI EST DÉRIVÉ.
 * `entree` et `sortie` sont repris de `CONFIG.LLM_PRIX` dans `DriveAI/src/Config.gs`
 * (`haiku_in: 1`, `haiku_out: 5`) — lu dans le dépôt, pas de mémoire.
 * Les deux prix de cache n'y figurent PAS : ce sont les multiplicateurs publiés par
 * Anthropic appliqués au prix d'entrée (×1,25 à l'écriture, ×0,10 à la lecture). Ils sont
 * donc DÉRIVÉS de `entree`, et non recopiés — une valeur recopiée finit par diverger de
 * celle dont elle dépend, ce dépôt en a déjà payé six instances.
 *
 * La devise publiée est USD parce que c'est ce qu'Anthropic facture. Le hub convertit
 * lui-même en CAD ; convertir ici appliquerait un second taux.
 */
export const PRIX_USD_PAR_MTOK = {
  entree: 1,
  sortie: 5,
} as const;

/** Écriture de cache : ×1,25 du prix d'entrée. Dérivé, jamais recopié. */
export const FACTEUR_ECRITURE_CACHE = 1.25;
/** Lecture de cache : ×0,10 du prix d'entrée. Dérivé, jamais recopié. */
export const FACTEUR_LECTURE_CACHE = 0.1;

/**
 * Le compteur, tel qu'il est persisté.
 *
 * ⚠️ UN SEUL CUMUL, PAS DE DÉTAIL MENSUEL — ET C'EST UN CHOIX, PAS UN OUBLI.
 * L'exigence est que le cumul et le détail ne puissent pas DIVERGER. La façon la plus sûre
 * de la tenir, quand il n'y a qu'un site d'appel utilisé quelques fois par an, est de
 * n'avoir aucun détail : il n'y a rien qui puisse diverger. Si un découpage mensuel devient
 * utile un jour, la règle est stricte — le cumul devra être la SOMME des mois, calculée à
 * la lecture, jamais un total stocké à côté d'eux.
 */
export interface CompteurTokens {
  /** Appels dont l'usage a été LU. C'est ce que le montant mesure. */
  appels: number;
  entree: number;
  sortie: number;
  ecritureCache: number;
  lectureCache: number;
  /**
   * Appels dont le relevé d'usage était illisible.
   *
   * ⚠️ COMPTÉS, JAMAIS TRAITÉS COMME ZÉRO. Un cumul discrètement amputé est pire qu'une
   * erreur visible : il se présente comme une mesure. Ce compteur permet de dire « le
   * montant sous-estime » au lieu de le laisser mentir en silence.
   */
  ignores: number;
}

export const COMPTEUR_VIDE: CompteurTokens = {
  appels: 0,
  entree: 0,
  sortie: 0,
  ecritureCache: 0,
  lectureCache: 0,
  ignores: 0,
};

/** Un nombre fini ≥ 0, ou `null`. PURE. */
function entier(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return v;
}

/**
 * Un champ de cache : absent ⇒ 0, présent mais illisible ⇒ `null`. PURE.
 *
 * ⚠️ LES DEUX CAS SONT DIFFÉRENTS ET NE SE CONFONDENT PAS. Le prompt caching n'est pas
 * activé ici, donc ces champs sont normalement absents : les rendre 0 est juste. Mais un
 * champ PRÉSENT qu'on ne sait pas lire est un signal — le rabattre sur 0 jetterait des
 * tokens réellement facturés, exactement la sous-estimation qu'on corrige.
 */
function champCache(v: unknown): number | null {
  if (v === undefined || v === null) return 0;
  return entier(v);
}

/**
 * Lit le `usage` d'une réponse de l'API. PURE. `null` = illisible.
 *
 * `input_tokens` et `output_tokens` sont EXIGÉS : l'API les rend toujours, et leur absence
 * signale un relevé qu'on ne comprend pas — pas un appel gratuit.
 */
export function lireUsage(brut: unknown): Omit<CompteurTokens, "appels" | "ignores"> | null {
  if (typeof brut !== "object" || brut === null) return null;
  const u = brut as Record<string, unknown>;

  const entree = entier(u.input_tokens);
  const sortie = entier(u.output_tokens);
  if (entree === null || sortie === null) return null;

  const ecritureCache = champCache(u.cache_creation_input_tokens);
  const lectureCache = champCache(u.cache_read_input_tokens);
  if (ecritureCache === null || lectureCache === null) return null;

  return { entree, sortie, ecritureCache, lectureCache };
}

/**
 * Ajoute un relevé au compteur. PURE — elle ne mute rien.
 *
 * Un relevé illisible incrémente `ignores` et RIEN d'autre : le cumul reste exact sur ce
 * qu'il a pu mesurer, et le compte des ignorés dit de combien il sous-estime.
 */
export function ajouterUsage(compteur: CompteurTokens, brut: unknown): CompteurTokens {
  const lu = lireUsage(brut);
  if (lu === null) return { ...compteur, ignores: compteur.ignores + 1 };
  return {
    appels: compteur.appels + 1,
    entree: compteur.entree + lu.entree,
    sortie: compteur.sortie + lu.sortie,
    ecritureCache: compteur.ecritureCache + lu.ecritureCache,
    lectureCache: compteur.lectureCache + lu.lectureCache,
    ignores: compteur.ignores,
  };
}

/** Le coût en dollars US du compteur, non arrondi. PURE. */
export function coutUsd(c: CompteurTokens): number {
  const p = PRIX_USD_PAR_MTOK;
  return (
    (c.entree * p.entree +
      c.sortie * p.sortie +
      c.ecritureCache * p.entree * FACTEUR_ECRITURE_CACHE +
      c.lectureCache * p.entree * FACTEUR_LECTURE_CACHE) /
    1e6
  );
}

/** Arrondi au cent. Le contrat veut un montant, pas une fraction de millionième. */
export function arrondirCents(montant: number): number {
  return Math.round(montant * 100) / 100;
}

/**
 * Le compteur relu depuis son JSON stocké. PURE.
 *
 * ⚠️ TROIS ISSUES, ET ELLES NE SE CONFONDENT PAS — même discipline que `getTrackerState`.
 *   `absent`    → rien n'a jamais été écrit. Aucun appel : pas de bloc `usage`.
 *   `compteur`  → une mesure. Elle se publie.
 *   `illisible` → l'état existe mais ne se lit pas. On ne publie AUCUN montant : repartir
 *                 de zéro afficherait un cumul amputé avec l'autorité d'une mesure.
 */
export type EtatCompteur =
  | { etat: "absent" }
  | { etat: "compteur"; compteur: CompteurTokens }
  | { etat: "illisible" };

export function relireCompteur(brut: string | null): EtatCompteur {
  if (brut === null) return { etat: "absent" };

  let valeur: unknown;
  try {
    valeur = JSON.parse(brut);
  } catch {
    return { etat: "illisible" };
  }
  if (typeof valeur !== "object" || valeur === null) return { etat: "illisible" };

  const v = valeur as Record<string, unknown>;
  const champs = ["appels", "entree", "sortie", "ecritureCache", "lectureCache", "ignores"] as const;
  const lu: Record<string, number> = {};
  for (const nom of champs) {
    const n = entier(v[nom]);
    if (n === null) return { etat: "illisible" };
    lu[nom] = n;
  }
  return { etat: "compteur", compteur: lu as unknown as CompteurTokens };
}

/**
 * Ce que le summary doit publier, dérivé du compteur. PURE.
 *
 * C'est ici que vit la règle de l'en-tête, à un seul endroit — pour qu'aucun appelant ne
 * puisse décider tout seul de publier un `0` là où il faut une absence.
 */
export type CoutPublie =
  /** Rien à publier : aucun appel n'a eu lieu. Pas de bloc `usage`. */
  | { etat: "aucun-appel" }
  /** Des appels ont eu lieu, aucun n'a pu être mesuré. Pas de montant, mais on le DIT. */
  | { etat: "non-mesure"; appelsNonMesures: number }
  /** Une mesure. `appelsNonMesures` > 0 signifie que le montant SOUS-ESTIME. */
  | { etat: "mesure"; montantUsd: number; appelsNonMesures: number }
  /** Le compteur est illisible. Pas de montant, et on le DIT. */
  | { etat: "illisible" };

export function coutAPublier(etat: EtatCompteur): CoutPublie {
  if (etat.etat === "illisible") return { etat: "illisible" };
  if (etat.etat === "absent") return { etat: "aucun-appel" };

  const c = etat.compteur;
  if (c.appels === 0) {
    return c.ignores === 0
      ? { etat: "aucun-appel" }
      : { etat: "non-mesure", appelsNonMesures: c.ignores };
  }
  return {
    etat: "mesure",
    montantUsd: arrondirCents(coutUsd(c)),
    appelsNonMesures: c.ignores,
  };
}
