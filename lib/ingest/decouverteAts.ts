// lib/ingest/decouverteAts.ts — QUI essayer aujourd'hui, et quand y revenir.
//
// POURQUOI CE FICHIER EXISTE
// Les analyseurs d'ATS (Greenhouse, Lever, Recruitee, Workable, SmartRecruiters), `sourceAts`
// et `jetonProbable` existent depuis longtemps. Rien ne produit pourtant la moindre offre :
// la liste d'entreprises résolues (`veille-ats`) vaut `[]` depuis le premier jour, et aucun
// code ne la remplit. C'est ce qui explique le `sources=1` de chaque trace de passe.
//
// Remplir cette liste demande de DEVINER un jeton par entreprise et par famille d'ATS, puis
// de le vérifier. Deviner coûte un aller-retour réseau à chaque essai : une centaine
// d'entreprises par cinq familles font cinq cents requêtes, ce qu'aucune passe ne peut ni ne
// doit tenter. D'où ce module : il ne contacte RIEN, il décide seulement quoi tenter
// aujourd'hui, et il se souvient de ce qui a déjà été essayé pour ne pas le repayer demain.
//
// CE QU'IL NE FAIT PAS : juger. Le verdict vient de `verifierAts`, qui confronte le contenu
// à la région. Ici on ne fait qu'ordonner et borner.

import type { FamilleAts } from "./types";

/** Ce qu'on retient d'un essai, pour ne pas le refaire à l'aveugle. */
export interface EssaiAts {
  entreprise: string;
  famille: FamilleAts;
  /** Le verdict rendu par `verifierAts`, hors « confirme » — celui-là quitte cette liste. */
  verdict: "refute" | "indecis" | "absent";
  /** Le jour de l'essai, AAAA-MM-JJ dans le fuseau de Marc. */
  le: string;
  /** Ce qui a été vu. Un rejet sans motif ne se vérifie pas. */
  raison?: string;
}

/**
 * Combien de jours avant de retenter, selon ce qu'on a appris.
 *
 * ⚠️ CES TROIS DÉLAIS ENCODENT TROIS QUESTIONS DIFFÉRENTES, et c'est pour ça qu'ils
 * diffèrent. La leçon est déjà écrite en §7 : « un délai de retente encode une PRÉMISSE ».
 *
 * · `indecis` — « cette entreprise a-t-elle un poste ouvert ? » La réponse change souvent,
 *   donc on revient vite. C'est le seul état qui doit CONVERGER : sans retente rapprochée,
 *   une entreprise réelle resterait indéfiniment non résolue parce qu'elle n'embauchait pas
 *   le jour où on a regardé.
 *
 * · `absent` — « cette entreprise utilise-t-elle cet ATS ? » La réponse ne change presque
 *   jamais. Revenir chaque semaine, ce serait cinq cents requêtes par mois pour rien.
 *
 * · `refute` — « ce jeton désigne-t-il bien cette entreprise-ci ? » La réponse ne change
 *   pas du tout : le jeton appartient à quelqu'un d'autre. On retente très rarement, et
 *   seulement parce qu'un homonyme peut libérer son identifiant.
 */
export const DELAIS_RETENTE_JOURS = {
  indecis: 3,
  absent: 30,
  refute: 90,
} as const;

/**
 * Plafond d'essais par passe.
 *
 * Chaque essai est un aller-retour vers un service tiers qui ne nous doit rien. Six, c'est
 * l'ordre de grandeur déjà retenu pour le géocodage, et ça résorbe une centaine
 * d'entreprises en quelques semaines sans jamais peser sur une passe.
 *
 * ⚠️ Ce plafond ne sert à rien si un cap plus bas existe en aval — vérifier avant de le
 * monter (leçon `[CARTE-03]` : un plafond « configurable » masqué par un cap interne).
 */
export const MAX_ESSAIS_PAR_PASSE = 6;

/** Une tentative à faire : une entreprise, une famille d'ATS. */
export interface EssaiAFaire {
  entreprise: string;
  famille: FamilleAts;
}

function joursEcoules(depuis: string, aujourdhui: string): number {
  const a = Date.parse(`${depuis}T00:00:00Z`);
  const b = Date.parse(`${aujourdhui}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Que tenter aujourd'hui ?
 *
 * PURE. Elle ne sait ni ce qui répondra, ni ce qui existe : elle ordonne des essais.
 *
 * L'ordre n'est pas arbitraire — les entreprises JAMAIS essayées passent avant les retentes.
 * Sans cette priorité, une poignée d'`indecis` qui reviennent tous les trois jours
 * mangeraient tout le budget et le reste de la liste ne serait jamais exploré : le même
 * piège de famine que la veille a déjà connu entre ses étapes.
 *
 * @param entreprises  Les noms à résoudre (cibles + employeurs déjà vus en offre).
 * @param familles     Les familles d'ATS à tenter.
 * @param essais       Ce qu'on a déjà appris.
 * @param dejaResolues Les entreprises déjà inscrites : on ne les retente jamais.
 * @param aujourdhui   AAAA-MM-JJ, dans le fuseau de Marc — un PARAMÈTRE, jamais l'horloge.
 * @param max          Plafond d'essais.
 */
export function planifierDecouverte(
  entreprises: readonly string[],
  familles: readonly FamilleAts[],
  essais: readonly EssaiAts[],
  dejaResolues: readonly string[],
  aujourdhui: string,
  max: number = MAX_ESSAIS_PAR_PASSE,
): EssaiAFaire[] {
  const resolues = new Set(dejaResolues.map((n) => n.toLowerCase()));
  const parCle = new Map(essais.map((e) => [`${e.entreprise.toLowerCase()}|${e.famille}`, e]));

  const neufs: EssaiAFaire[] = [];
  const retentes: { essai: EssaiAFaire; anciennete: number }[] = [];

  for (const entreprise of entreprises) {
    // Une entreprise déjà résolue chez UNE famille n'a plus rien à donner : on ne cherche
    // pas ses éventuelles autres pages carrières, ce serait payer pour un doublon.
    if (resolues.has(entreprise.toLowerCase())) continue;

    for (const famille of familles) {
      const connu = parCle.get(`${entreprise.toLowerCase()}|${famille}`);
      if (connu === undefined) {
        neufs.push({ entreprise, famille });
        continue;
      }
      const ecoules = joursEcoules(connu.le, aujourdhui);
      if (ecoules >= DELAIS_RETENTE_JOURS[connu.verdict]) {
        retentes.push({ essai: { entreprise, famille }, anciennete: ecoules });
      }
    }
  }

  // Parmi les retentes, les plus anciennes d'abord : c'est ce qui garantit qu'aucune ne
  // reste au fond de la file indéfiniment.
  retentes.sort((a, b) => b.anciennete - a.anciennete);

  return [...neufs, ...retentes.map((r) => r.essai)].slice(0, Math.max(0, max));
}

/**
 * Inscrit ce qu'un essai a appris.
 *
 * Rend une NOUVELLE liste : la mémoire d'essais est une donnée d'état, et la muter en place
 * rendrait intestable l'ordre des écritures.
 *
 * ⚠️ `confirme` RETIRE l'entrée au lieu d'en poser une : l'entreprise passe dans
 * `veille-ats` et n'a plus rien à faire dans la mémoire des échecs. La laisser des deux
 * côtés ferait diverger les deux listes au premier oubli.
 */
export function appliquerVerdict(
  essais: readonly EssaiAts[],
  entreprise: string,
  famille: FamilleAts,
  verdict: "confirme" | "refute" | "indecis" | "absent",
  jour: string,
  raison?: string,
): EssaiAts[] {
  const autres = essais.filter(
    (e) => !(e.entreprise.toLowerCase() === entreprise.toLowerCase() && e.famille === famille),
  );
  if (verdict === "confirme") return autres;
  return [...autres, { entreprise, famille, verdict, le: jour, ...(raison ? { raison } : {}) }];
}
