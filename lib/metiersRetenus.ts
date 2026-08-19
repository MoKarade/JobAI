// lib/metiersRetenus.ts — les métiers que Marc retient dans le flux du Guichet.
//
// POURQUOI CETTE LISTE EST UN RÉGLAGE ET NON UNE CONSTANTE
// Le flux complet du Guichet porte tout le Canada : ~67 000 offres, dont plusieurs milliers
// dans la région une fois le lieu tranché. Les ingérer toutes noierait le suivi. Le tri se
// fait par `noc2021`, un code de profession NORMALISÉ — donc indépendant de la langue de
// l'annonce, ce qui est la seule façon de trier un flux anglophone sans traduire tout le
// vocabulaire du barème (ADR-0012).
//
// ⚠️ MAIS QUELS CODES RETENIR EST UNE DÉCISION DE MARC, PAS UNE MESURE. Je peux mesurer
// combien d'offres portent `21301` et quels titres s'y rangent ; je ne peux pas savoir si ce
// métier l'intéresse. Écrire la liste en dur ferait de mon avis une constante du code, et il
// faudrait un commit — donc moi — pour la corriger. C'est exactement ce que le réglage du
// rayon a défait le 2026-08-17, et pour la même raison.
//
// ⚠️ LE DÉFAUT EST VIDE, ET C'EST DÉLIBÉRÉ. Une liste vide rend la source du flux INERTE :
// elle n'est pas interrogée du tout. Ni « tout passe » (qui inonderait le suivi au premier
// cron, sans que personne ne l'ait demandé), ni une sélection devinée (qui écarterait en
// silence des métiers que Marc n'a jamais refusés). Tant qu'il n'a pas choisi, la veille se
// comporte exactement comme avant.

/** Clé sous laquelle les métiers retenus sont conservés. */
export const CLE_METIERS = "veille-metiers";

/** Rien tant que Marc n'a pas choisi. Voir l'en-tête : le vide éteint la source. */
export const METIERS_DEFAUT: readonly string[] = [];

/**
 * Codes retenus au maximum.
 *
 * ⚠️ FILET, PAS RÉGLAGE. Le flux compte quelques centaines de codes distincts : une liste
 * qui les approcherait ne serait plus une sélection mais un collage accidentel, et elle
 * ferait grossir sans bruit la ligne d'état que chaque passe relit. Au-delà, on refuse en le
 * DISANT plutôt que de tronquer — une troncature silencieuse ferait croire à Marc qu'il a
 * retenu des métiers qui ne le sont pas.
 */
export const MAX_METIERS = 120;

/** Ce qu'une saisie a donné. Les rejets sont NOMMÉS, jamais avalés. */
export interface MetiersNormalises {
  /** Les codes valides, dédoublonnés et triés. */
  codes: string[];
  /** Les fragments illisibles, tels que saisis. Rendus à l'écran, jamais ignorés. */
  rejets: string[];
  /** Trop de codes : la saisie entière est refusée. `codes` est alors vide. */
  troplong: boolean;
}

/**
 * Lit une saisie libre et en tire des codes de profession. PURE.
 *
 * Deux granularités acceptées, celles que `codeRetenu` sait comparer (`lib/nocProfession.ts`) :
 * un préfixe de DEUX chiffres (« 21 » = un domaine à un niveau) ou un code COMPLET de CINQ
 * chiffres (un métier précis). Toute autre longueur est un rejet : la deviner reviendrait à
 * choisir à la place de Marc, et un « 2 » interprété comme « tout le domaine 2 » ferait entrer
 * quarante métiers qu'il n'a pas demandés.
 *
 * ⚠️ LES REJETS SONT RENDUS, PAS JETÉS. Une saisie « 21, 2130, 6320 » où deux entrées sur
 * trois sont mal formées doit le dire : sans ça, Marc croirait avoir retenu trois métiers et
 * la source n'en verrait qu'un — un écart qui ne se manifesterait que par une veille
 * anormalement pauvre, des semaines plus tard.
 */
export function normaliserMetiers(saisie: unknown): MetiersNormalises {
  const texte =
    Array.isArray(saisie) ? saisie.map((x) => String(x)).join(" ") : String(saisie ?? "");

  const fragments = texte
    .split(/[\s,;]+/)
    .map((f) => f.trim())
    .filter((f) => f !== "");

  const codes: string[] = [];
  const rejets: string[] = [];
  for (const f of fragments) {
    if (/^\d{2}$/.test(f) || /^\d{5}$/.test(f)) {
      if (!codes.includes(f)) codes.push(f);
    } else if (!rejets.includes(f)) {
      rejets.push(f);
    }
  }

  if (codes.length > MAX_METIERS) return { codes: [], rejets, troplong: true };

  // Triés : la liste est relue par un humain à chaque réglage, et un ordre de saisie ne se
  // compare pas d'une fois sur l'autre. Le tri est lexicographique — tous les codes ont deux
  // ou cinq chiffres, donc il regroupe les domaines, ce qui est l'ordre utile à l'œil.
  codes.sort();
  return { codes, rejets, troplong: false };
}

/**
 * Les codes complets qu'un préfixe déjà retenu rend REDONDANTS.
 *
 * PURE, et purement informative : la redondance ne casse rien (`codeRetenu` s'arrête au
 * premier ensemble qui matche). Elle se DIT quand même, parce qu'une liste où « 21 » et
 * « 21301 » cohabitent laisse croire que retirer « 21301 » changerait quelque chose — et
 * Marc le retirerait un jour en pensant restreindre, sans aucun effet.
 */
export function metiersRedondants(codes: readonly string[]): string[] {
  const prefixes = new Set(codes.filter((c) => c.length === 2));
  return codes.filter((c) => c.length === 5 && prefixes.has(c.slice(0, 2)));
}
