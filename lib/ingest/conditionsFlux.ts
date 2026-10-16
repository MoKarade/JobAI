// lib/ingest/conditionsFlux.ts — lire le salaire et l'expérience exigée publiés par le flux du Guichet.
//
// ── POURQUOI (JobAI#150, ADR-0026) ──────────────────────────────────────────────────
//
// Le flux publie, pour chaque offre, `salary` (« $25.00 hourly », « $20.00 to $25.00 hourly (to be
// negotiated) », « $45,000.00 to $50,000.00 annually ») et `experience` (« 3 years to less than 5
// years »). L'app écrivait `salaireAffiche: null` et devinait la séniorité dans le texte de l'annonce :
// le salaire, premier critère de Marc, ne pesait rien parce qu'il n'était jamais lu.
//
// ⚠️ DEUX FONCTIONS PURES, QUI REFUSENT DE DEVINER. Une unité inconnue, un montant absurde, une
// formule qu'on ne reconnaît pas : `null`. Un salaire inventé est pire qu'un salaire absent (garde-fou
// n°3) — l'absence reste neutre à la note, le faux ne l'est pas.
//
// Les formats ci-dessus sont ceux de l'inventaire du flux du 2026-10-16 (43 483 offres vues, 1 494
// régionales) ; les unités autres que `hourly` et `annually` sont gérées mais pas observées dans les 40
// valeurs les plus fréquentes [À vérifier sur la première passe].

/** Heures travaillées par année, pour convertir un taux horaire. Décision provisoire (ADR-0026). */
export const HEURES_PAR_ANNEE = 2080;

/**
 * Quelle borne d'une fourchette on retient. Décision provisoire (ADR-0026) : la BASSE, comme pour
 * la séniorité (ADR-0024) — ce qu'on est sûr d'avoir, jamais un chiffre que l'annonce ne contient pas.
 */
export const EXTREMITE_FOURCHETTE: "basse" | "haute" | "milieu" = "basse";

/** Bornes de vraisemblance d'un salaire ANNUEL en dollars : en dehors, c'est une faute de saisie. */
const ANNUEL_MIN = 10_000;
const ANNUEL_MAX = 1_000_000;

const FACTEUR_ANNUEL: Record<string, number> = {
  hourly: HEURES_PAR_ANNEE,
  daily: 260,
  weekly: 52,
  "bi-weekly": 26,
  biweekly: 26,
  monthly: 12,
  annually: 1,
  yearly: 1,
};

const MONTANT = String.raw`\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)`;
const RE_SALAIRE = new RegExp(
  String.raw`^${MONTANT}(?:\s+to\s+${MONTANT})?\s+(hourly|daily|weekly|bi-weekly|biweekly|monthly|annually|yearly)\b`,
  "i",
);

function nombre(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/**
 * Le salaire annuel (en dollars, arrondi) d'un texte de salaire du flux, ou `null`.
 *
 * `null` pour : texte vide, « to be negotiated » seul, unité inconnue, montant illisible, résultat hors
 * de [10 000 ; 1 000 000] $ par an.
 */
export function lireSalaireAnnuel(texte: string | null | undefined): number | null {
  if (!texte) return null;
  const m = RE_SALAIRE.exec(texte.trim());
  if (!m) return null;
  const a = nombre(m[1] ?? "");
  const b = m[2] === undefined ? a : nombre(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const facteur = FACTEUR_ANNUEL[(m[3] ?? "").toLowerCase()];
  if (facteur === undefined) return null;

  const bas = Math.min(a, b);
  const haut = Math.max(a, b);
  const retenu =
    EXTREMITE_FOURCHETTE === "basse" ? bas : EXTREMITE_FOURCHETTE === "haute" ? haut : (bas + haut) / 2;
  const annuel = Math.round(retenu * facteur);
  return annuel >= ANNUEL_MIN && annuel <= ANNUEL_MAX ? annuel : null;
}

/** Le texte de salaire tel qu'on l'affiche : rogné, borné à la limite du schéma (80), `null` si vide. */
export function salaireAffichable(texte: string | null | undefined): string | null {
  const t = (texte ?? "").trim();
  return t === "" ? null : t.slice(0, 80);
}

const EXPERIENCE_CONNUE: Record<string, number> = {
  "no experience (will train)": 0,
  "will train": 0,
  "experience an asset": 0,
  "1 to less than 7 months": 1,
  "7 months to less than 1 year": 7,
  "1 year to less than 2 years": 12,
  "2 years to less than 3 years": 24,
  "3 years to less than 5 years": 36,
  "5 years or more": 60,
};

/**
 * L'expérience MINIMALE exigée, en mois, d'un texte du flux ; `null` si on ne la reconnaît pas.
 *
 * ⚠️ « Experience an asset » et « will train » valent 0 : aucune exigence. C'est une LECTURE, pas
 * un défaut — le champ existe et dit que rien n'est exigé. `null` reste réservé à « on ne sait pas ».
 */
export function lireExperienceMois(texte: string | null | undefined): number | null {
  const t = (texte ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "") return null;
  const connu = EXPERIENCE_CONNUE[t];
  if (connu !== undefined) return connu;
  // Formes non vues mais de la même famille : « N year(s) to less than M years », « N to less than M months ».
  const annees = /^(\d+)\s+years?\b/.exec(t);
  if (annees) return Number(annees[1]) * 12;
  const mois = /^(\d+)\s+(?:to less than \d+ )?months?\b/.exec(t);
  if (mois) return Number(mois[1]);
  return null;
}
