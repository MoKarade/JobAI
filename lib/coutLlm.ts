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
 * Le modèle de TOUS les appels faits avant JobAI#158 (Haiku 4.5). Un compteur écrit sous l'ancien format, sans nom de
 * modèle, se relit sous ce nom : c'est exact, aucun autre modèle n'avait jamais été appelé.
 */
export const MODELE_HISTORIQUE = "claude-haiku-4-5-20251001";

/** Les prix d'UN modèle, en dollars US par MILLION de tokens. */
export interface PrixModele {
  entree: number;
  sortie: number;
  /** Lecture de cache : multiple du prix d'entrée (0,10 chez Haiku 4.5, 0,05 chez Sonnet 5.5). */
  facteurLectureCache: number;
}

/**
 * Prix publiés par modèle. Un modèle absent d'ici NE SE CHIFFRE PAS : son appel est compté comme non mesuré
 * (`ignores`), jamais facturé au prix d'un autre.
 *
 * ⚠️ PROVENANCE. Relus le 2026-10-19 sur la page de tarifs de l'API (platform.claude.com/docs/en/about-claude/pricing) :
 *   · Haiku 4.5 : 1 $ en entrée, 5 $ en sortie, lecture de cache 0,10 $ (soit ×0,10) ;
 *   · Sonnet 5.5 : 2 $ en entrée, 10 $ en sortie, lecture de cache 0,10 $ (soit ×0,05).
 * Le prix d'écriture de cache (5 minutes) est ×1,25 du prix d'entrée chez les deux (1,25 $ et 2,50 $) : dérivé, jamais
 * recopié, comme avant. La pensée du modèle se facture au prix de SORTIE et est déjà comptée dans `output_tokens`.
 * Haiku 4.5 était aussi dans `CONFIG.LLM_PRIX` de DriveAI (`haiku_in: 1`, `haiku_out: 5`).
 *
 * La devise publiée est USD parce que c'est ce qu'Anthropic facture. Le hub convertit lui-même en CAD ; convertir ici
 * appliquerait un second taux.
 */
export const PRIX_PAR_MODELE: Readonly<Record<string, PrixModele>> = {
  [MODELE_HISTORIQUE]: { entree: 1, sortie: 5, facteurLectureCache: 0.1 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10, facteurLectureCache: 0.05 },
};

/** Les prix de `modele`, ou `undefined` : une clé héritée (« constructor ») n'est pas un modèle. PURE. */
function prixDe(modele: string): PrixModele | undefined {
  return Object.hasOwn(PRIX_PAR_MODELE, modele) ? PRIX_PAR_MODELE[modele] : undefined;
}

/** Les prix du modèle historique, sous le nom d'avant JobAI#158. */
export const PRIX_USD_PAR_MTOK = PRIX_PAR_MODELE[MODELE_HISTORIQUE] as PrixModele;

/** Écriture de cache : ×1,25 du prix d'entrée. Dérivé, jamais recopié. */
export const FACTEUR_ECRITURE_CACHE = 1.25;
/** Lecture de cache de Haiku 4.5 : ×0,10 du prix d'entrée. Les autres modèles portent le leur dans `PRIX_PAR_MODELE`. */
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

/**
 * Le coût en dollars US d'un compteur de tokens, au prix de `modele`, non arrondi. PURE.
 * Un modèle sans prix connu rend `null` : on ne chiffre pas au prix d'un autre.
 */
export function coutUsd(c: CompteurTokens, modele: string): number | null {
  const p = prixDe(modele);
  if (p === undefined) return null;
  return (
    (c.entree * p.entree +
      c.sortie * p.sortie +
      c.ecritureCache * p.entree * FACTEUR_ECRITURE_CACHE +
      c.lectureCache * p.entree * p.facteurLectureCache) /
    1e6
  );
}

/** Les compteurs de tokens, un par modèle appelé. C'est ce qui est persisté. */
export type ParModele = Readonly<Record<string, CompteurTokens>>;

/**
 * Ajoute un relevé au compteur de `modele`. PURE.
 *
 * Un modèle sans prix connu n'est pas chiffrable : l'appel est compté en `ignores` (le montant le dira, il sous-estime)
 * au lieu d'être facturé au prix d'un autre modèle.
 */
export function ajouterUsageModele(parModele: ParModele, modele: string, brut: unknown): ParModele {
  const avant = parModele[modele] ?? COMPTEUR_VIDE;
  if (prixDe(modele) === undefined) {
    return { ...parModele, [modele]: { ...avant, ignores: avant.ignores + 1 } };
  }
  return { ...parModele, [modele]: ajouterUsage(avant, brut) };
}

/**
 * Le coût total en dollars US des modèles CHIFFRABLES, non arrondi. PURE.
 * Un modèle sans prix n'est pas sommé : `coutAPublier` compte ses appels en « non mesurés » au lieu de le rabattre sur 0.
 */
export function coutUsdTotal(parModele: ParModele): number {
  let total = 0;
  for (const [modele, c] of Object.entries(parModele)) {
    const cout = coutUsd(c, modele);
    if (cout !== null) total += cout;
  }
  return total;
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
  | { etat: "compteur"; parModele: ParModele }
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
  // Ancien format : UN compteur à plat, d'avant les prix par modèle. Tout venait de Haiku 4.5 (MODELE_HISTORIQUE).
  if ("parModele" in v) {
    const brutParModele = v.parModele;
    if (typeof brutParModele !== "object" || brutParModele === null) return { etat: "illisible" };
    const lus: Record<string, CompteurTokens> = {};
    for (const [modele, brut] of Object.entries(brutParModele)) {
      const c = lireCompteurTokens(brut);
      if (c === null) return { etat: "illisible" };
      lus[modele] = c;
    }
    return { etat: "compteur", parModele: lus };
  }
  const ancien = lireCompteurTokens(v);
  if (ancien === null) return { etat: "illisible" };
  return { etat: "compteur", parModele: { [MODELE_HISTORIQUE]: ancien } };
}

/** Un compteur de tokens relu depuis du JSON : tous ses champs sont des nombres ≥ 0, sinon `null`. PURE. */
function lireCompteurTokens(brut: unknown): CompteurTokens | null {
  if (typeof brut !== "object" || brut === null) return null;
  const v = brut as Record<string, unknown>;
  const champs = ["appels", "entree", "sortie", "ecritureCache", "lectureCache", "ignores"] as const;
  const lu: Record<string, number> = {};
  for (const nom of champs) {
    const n = entier(v[nom]);
    if (n === null) return null;
    lu[nom] = n;
  }
  return lu as unknown as CompteurTokens;
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

  // ⚠️ UN MODÈLE SANS PRIX (retiré ou renommé de `PRIX_PAR_MODELE` depuis l'écriture, ou état édité à la main) N'EST PAS
  // UN COÛT NUL : ses appels et ses relevés ignorés passent en « non mesurés », et le montant le dit en sous-estimant.
  let appels = 0;
  let nonMesures = 0;
  for (const [modele, c] of Object.entries(etat.parModele)) {
    if (prixDe(modele) === undefined) {
      nonMesures += c.appels + c.ignores;
    } else {
      appels += c.appels;
      nonMesures += c.ignores;
    }
  }
  if (appels === 0) {
    return nonMesures === 0 ? { etat: "aucun-appel" } : { etat: "non-mesure", appelsNonMesures: nonMesures };
  }
  return {
    etat: "mesure",
    montantUsd: arrondirCents(coutUsdTotal(etat.parModele)),
    appelsNonMesures: nonMesures,
  };
}
