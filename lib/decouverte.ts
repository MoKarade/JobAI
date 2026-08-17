// lib/decouverte.ts — la découverte de pages carrières, et l'état qu'on peut en montrer.
//
// POURQUOI CE MODULE EXISTE
// La découverte vivait à l'intérieur de la passe de veille, sous forme d'un bloc. Elle a
// maintenant DEUX déclencheurs : le cron quotidien, et un bouton dans l'app (demande de
// Marc, 2026-08-17 — « j'aimerais pouvoir lancer la recherche moi-même, avec une barre de
// progression et un rapport »). Recopier le bloc aurait donné deux implémentations d'une
// même règle, c'est-à-dire une règle et demie : le lot manuel et le lot automatique
// auraient fini par ne plus borner pareil, ni écrire le même état.
//
// CE QU'IL NE FAIT PAS : décider. `planifierDecouverte` ordonne, `verifierAts` juge, et ce
// module ne fait que les brancher sur l'état persisté et rendre de quoi l'afficher.
//
// ⚠️ LA PROGRESSION EST UN COMPTE, PAS UNE ESTIMATION. `faites / total` se dérive de l'état
// réel (les paires déjà essayées, les entreprises déjà résolues), jamais d'un compteur
// incrémenté au fil de l'eau qu'un rechargement remettrait à zéro. C'est ce qui permet à
// Marc de fermer l'onglet et de revenir : la barre repart où elle en était.

import { lireEtat, ecrireEtat } from "./etat";
import { CANDIDATS_ATS } from "./ingest/atsCandidats";
import { jetonProbable, verifierAts, recuperer } from "./ingest/sources";
import {
  FAMILLES_ATS,
  type AtsEntreprise,
  type FamilleAts,
} from "./ingest/types";
import {
  planifierDecouverte,
  executerDecouverte,
  MAX_ESSAIS_PAR_FAMILLE,
  type CompteDecouverte,
  type EssaiAts,
} from "./ingest/decouverteAts";

export const CLE_ATS = "veille-ats";
export const CLE_ESSAIS_ATS = "veille-ats-essais";

/**
 * Plafond d'essais d'un lot MANUEL.
 *
 * Plus haut que celui de la passe quotidienne (12), et la raison est arithmétique : la
 * passe partage son mur de 60 s avec l'ingestion, la localisation et les bornes, alors
 * qu'un lot manuel ne fait QUE de la découverte. Le pire cas reste borné par le même
 * plafond par hôte — `MAX_ESSAIS_PAR_FAMILLE × DELAI_MAX_MS`, soit 3 × 8 s = 24 s — parce
 * que les cinq familles s'interrogent en parallèle entre elles et en série chez chacune.
 *
 * Quinze, donc : cinq familles × trois. Monter au-delà n'ajouterait aucun essai (le
 * plafond par hôte mord le premier) — c'est le piège du « plafond configurable » rendu
 * inopérant par un cap plus bas en aval, déjà vécu sur `MAX_SITUATIONS_CRON`.
 */
export const MAX_ESSAIS_LOT_MANUEL =
  FAMILLES_ATS.length * MAX_ESSAIS_PAR_FAMILLE;

/**
 * Budget de temps d'un lot manuel.
 *
 * Le budget de la passe quotidienne est de 10 s parce qu'elle doit laisser la place aux
 * autres étapes. Ici il n'y a pas d'autre étape : on peut aller jusqu'au pire cas réel
 * (24 s) plus une marge pour les écritures d'état, sous le mur de 60 s de la fonction.
 */
export const BUDGET_LOT_MANUEL_MS = 30_000;

/** Ce qu'on affiche : où on en est, et ce qui a été vu. */
export interface EtatDecouverte {
  /** Paires (entreprise × famille) à couvrir en tout. */
  total: number;
  /** Paires déjà tranchées — essayées, ou appartenant à une entreprise résolue. */
  faites: number;
  /** Les pages carrières trouvées, celles qui alimentent la veille. */
  inscrites: AtsEntreprise[];
  /** Ce que chaque essai non concluant a appris, motif compris. */
  essais: EssaiAts[];
  /** Reste-t-il quelque chose à tenter aujourd'hui ? Un balayage fini n'a plus de neuf. */
  aTenter: number;
}

/**
 * Les essais du jour, pris dans la liste des candidats VÉRIFIÉS.
 *
 * ⚠️ ON NE DEVINE PLUS. `planifierDecouverte` sait ordonner et borner ; ce qu'elle ne peut
 * pas faire, c'est savoir si une entreprise a la moindre chance d'être là. Le premier lot
 * réel a répondu : quinze essais, quinze échecs, parce que le catalogue de cinq familles ne
 * correspond pas aux employeurs visés (voir `atsCandidats.ts`). On ne lui donne donc plus
 * la liste complète des entreprises, mais celle des paires qu'une observation désigne — et
 * tant qu'elle est vide, il n'y a rien à tenter, ce qui est un résultat honnête.
 */
function planifierCandidats(
  essais: readonly EssaiAts[],
  ats: readonly AtsEntreprise[],
  jour: string,
  max: number,
): { entreprise: string; famille: FamilleAts }[] {
  const resolues = new Set(ats.map((a) => a.entreprise.toLowerCase()));
  const parFamille = new Map<FamilleAts, string[]>();
  for (const c of CANDIDATS_ATS) {
    if (resolues.has(c.entreprise.toLowerCase())) continue;
    const liste = parFamille.get(c.famille) ?? [];
    liste.push(c.entreprise);
    parFamille.set(c.famille, liste);
  }

  // Le planificateur reste seul juge de l'ordre, des délais de retente et des plafonds : on
  // ne fait que restreindre l'ensemble qu'il regarde, famille par famille.
  return [...parFamille.entries()]
    .flatMap(([famille, noms]) =>
      planifierDecouverte(noms, [famille], essais, [...resolues], jour, max),
    )
    .slice(0, max);
}

/**
 * Où en est le balayage : paires tranchées sur paires à couvrir.
 *
 * PURE, et c'est délibéré — c'est le seul calcul de cet écran qui peut MENTIR sans que rien
 * ne le signale (une barre à 140 %, ou bloquée à 0 % sur un balayage bien avancé).
 *
 * ⚠️ LE DÉNOMINATEUR EST LA LISTE DES CANDIDATS, PAS LE PRODUIT ENTREPRISES × FAMILLES.
 * C'est le changement du 2026-08-17 : on ne tente plus toutes les combinaisons, seulement
 * les paires qu'une observation désigne. Un dénominateur resté au produit afficherait « 15
 * / 180 » alors qu'il n'y a que quinze paires au programme — une barre qui n'atteindrait
 * jamais 100 % sur un travail pourtant terminé.
 *
 * ⚠️ DEUX PIÈGES DANS LE NUMÉRATEUR.
 * · Une entreprise RÉSOLUE tranche TOUTES ses paires d'un coup : on ne cherche jamais ses
 *   autres pages carrières. Les compter une par une laisserait du travail « à faire » qui
 *   ne se fera pas.
 * · Un essai mémorisé pour une paire qui n'est plus candidate ne compte pas : il gonflerait
 *   le numérateur sans dénominateur en face.
 */
export function progression(
  candidats: readonly { entreprise: string; famille: string }[],
  resolues: readonly string[],
  essais: readonly { entreprise: string; famille: string }[],
): { faites: number; total: number } {
  const resolu = new Set(resolues.map((n) => n.toLowerCase()));
  const cle = (p: { entreprise: string; famille: string }) =>
    `${p.entreprise.toLowerCase()}|${p.famille}`;

  const auProgramme = new Map(candidats.map((c) => [cle(c), c]));
  const tranchees = new Set<string>();

  for (const [k, c] of auProgramme) {
    if (resolu.has(c.entreprise.toLowerCase())) tranchees.add(k);
  }
  for (const e of essais) {
    const k = cle(e);
    if (auProgramme.has(k)) tranchees.add(k);
  }

  return { faites: tranchees.size, total: auProgramme.size };
}

/**
 * Où en est le balayage, et ce qu'il a vu.
 *
 * ⚠️ ON NE COMPTE QUE CE QUI EST ENCORE AU PROGRAMME. Un essai mémorisé pour une entreprise
 * qui a disparu de la liste (une offre périmée, une cible retirée) ne doit pas gonfler le
 * numérateur — sinon la barre dépasserait 100 % sans que rien ne le signale.
 */
export async function etatDecouverte(jour: string): Promise<EtatDecouverte> {
  const [ats, essais] = await Promise.all([
    lireEtat<AtsEntreprise[]>(CLE_ATS, []),
    lireEtat<EssaiAts[]>(CLE_ESSAIS_ATS, []),
  ]);

  const candidat = new Set(
    CANDIDATS_ATS.map((c) => `${c.entreprise.toLowerCase()}|${c.famille}`),
  );
  const resolues = new Set(ats.map((a) => a.entreprise.toLowerCase()));

  return {
    ...progression(
      CANDIDATS_ATS,
      ats.map((a) => a.entreprise),
      essais,
    ),
    inscrites: ats,
    // Seuls les essais encore au programme : un essai laissé par une paire retirée de la
    // liste des candidats ne dit plus rien de ce qu'on tente, il encombrerait le rapport.
    essais: essais.filter(
      (e) =>
        candidat.has(`${e.entreprise.toLowerCase()}|${e.famille}`) &&
        !resolues.has(e.entreprise.toLowerCase()),
    ),
    aTenter: planifierCandidats(essais, ats, jour, MAX_ESSAIS_LOT_MANUEL)
      .length,
  };
}

/** Ce qu'un lot vient de faire, en plus de l'état d'après. */
export interface LotDecouverte {
  compte: CompteDecouverte;
  /** Les entreprises inscrites PAR CE LOT — ce que Marc vient de gagner. */
  trouvees: AtsEntreprise[];
  /** Ce que ce lot a écarté, avec le motif. Un rejet sans motif ne se vérifie pas. */
  ecartees: EssaiAts[];
  etat: EtatDecouverte;
}

/**
 * Fait avancer le balayage d'UN lot, et persiste.
 *
 * Le même code sert la passe quotidienne et le bouton : seuls le plafond et le budget
 * changent, parce que le contexte d'exécution n'est pas le même (voir les deux constantes).
 *
 * `verifier` est injecté pour que la fonction s'éprouve sans réseau.
 */
export async function avancerDecouverte(
  jour: string,
  options: {
    max?: number;
    budgetMs?: number;
    verifier?: (
      famille: FamilleAts,
      jeton: string,
      entreprise: string,
    ) => Promise<{
      verdict: "confirme" | "refute" | "indecis" | "absent";
      raison?: string;
    }>;
  } = {},
): Promise<LotDecouverte> {
  const max = options.max ?? MAX_ESSAIS_LOT_MANUEL;
  const budgetMs = options.budgetMs ?? BUDGET_LOT_MANUEL_MS;
  const verifier =
    options.verifier ??
    (async (famille, jeton, entreprise) => {
      const r = await verifierAts(famille, jeton, entreprise, recuperer);
      return r.verdict === "refute"
        ? { verdict: r.verdict, raison: r.raison }
        : { verdict: r.verdict };
    });

  const [ats, essais] = await Promise.all([
    lireEtat<AtsEntreprise[]>(CLE_ATS, []),
    lireEtat<EssaiAts[]>(CLE_ESSAIS_ATS, []),
  ]);

  const aFaire = planifierCandidats(essais, ats, jour, max);

  if (aFaire.length === 0) {
    return {
      compte: {
        essais: 0,
        confirmees: 0,
        refutees: 0,
        indecis: 0,
        absentes: 0,
        sautes: 0,
      },
      trouvees: [],
      ecartees: [],
      etat: await etatDecouverte(jour),
    };
  }

  const d = await executerDecouverte(
    aFaire,
    essais,
    ats,
    jour,
    verifier,
    jetonProbable,
    budgetMs,
  );

  // ⚠️ L'ORDRE DES DEUX ÉCRITURES COMPTE. `veille-ats` d'abord : c'est lui qui fait entrer
  // une entreprise dans la veille quotidienne. Si la coupure tombe entre les deux, on aura
  // au pire un essai re-tenté (coût : une requête) plutôt qu'une page carrières trouvée
  // puis perdue. Le même principe que « l'inscription Index se pose en dernier ».
  await ecrireEtat(CLE_ATS, d.ats);
  await ecrireEtat(CLE_ESSAIS_ATS, d.essais);

  const dejaLa = new Set(
    ats.map((a) => `${a.entreprise.toLowerCase()}|${a.famille}`),
  );
  const cle = (e: { entreprise: string; famille: FamilleAts }) =>
    `${e.entreprise.toLowerCase()}|${e.famille}`;
  const duLot = new Set(aFaire.map(cle));

  return {
    compte: d.compte,
    trouvees: d.ats.filter((a) => !dejaLa.has(cle(a))),
    ecartees: d.essais.filter((e) => e.le === jour && duLot.has(cle(e))),
    etat: await etatDecouverte(jour),
  };
}
