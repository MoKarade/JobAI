// lib/gmail/proposition.ts — proposer un statut à partir d'un courriel de réponse de recruteur. (JobAI#218, ADR-0042)
//
// Fonction PURE, mots-clés d'abord (aucun appel de modèle, coût IA nul). Elle PROPOSE, elle n'écrit jamais : `lib/suivi.ts` ne bouge que sur le
// geste de Marc (garde-fou n°2). Le texte d'un courriel est une DONNÉE (garde-fou n°6) : il est lu, jamais obéi ; l'extrait arrive déjà expurgé
// (`lireCourriels`), le sujet l'est ici avant de sortir.
//
// ⚠️ S'ABSTENIR VAUT MIEUX QUE DEVINER. Chaque courriel écarté est compté avec sa raison (`abstentions`) : c'est ce chiffre, relu sur de vrais
// courriels, qui dira si les phrases-clés sont trop étroites ou trop larges. Sens incertain = aucune proposition :
//   - refus + accusé de réception → refus (les refus recopient la formule d'accusé) ;
//   - refus + entrevue/offre, ou entrevue + offre → incertain ;
//   - accusé + entrevue → entrevue ; accusé + offre → incertain.
// Une proposition ne fait jamais reculer un statut : « Refusée » ou « Offre » ne se remplacent pas par un accusé, et un refus ne remplace pas une offre.

import { expurgerPII } from "../ingest/expurger";
import type { Offre, Statut } from "../types";
import type { CourrielLu } from "./lecture";
import { expediteurDe, normaliserTexte, rapprocherCourriel } from "./rapprochement";

export type Sens = "accuse" | "entrevue" | "refus" | "offre";

/** Phrases-clés en français et en anglais (les annonces de la région sont bilingues), sur texte normalisé (sans accents ni ponctuation). */
const MOTIFS: Record<Sens, RegExp> = {
  refus: /nous (?:avons le regret|regrettons)|regrets? de vous informer|ne retenons pas|pas en mesure de donner suite|candidature n a pas ete retenue|n a pas ete retenue|poursuivre avec d autres candidat|poste (?:a ete|est) comble|unfortunately|regret to inform|not been selected|not selected|not moving forward|will not be moving forward|(?:moving forward|proceed|proceeding|pursue|pursuing) with other candidates|selected other candidates|position has been filled/,
  entrevue: /entrevue|interview|aimerions vous rencontrer|souhaitons vous rencontrer|would like to (?:meet|speak|schedule)|screening call|phone screen|appel de selection/,
  offre: /heureux de vous offrir|plaisir de vous offrir|lettre d offre|offer letter|pleased to offer|happy to offer|offer of employment|promesse d embauche/,
  accuse: /bien recu votre candidature|avons recu votre candidature|reception de votre candidature|votre candidature a (?:bien )?ete (?:recue|soumise|transmise)|merci d avoir postule|merci de votre interet|thank you for applying|thanks for applying|we received your application|application (?:has been )?(?:received|submitted)|your application was (?:received|submitted)/,
};

const STATUT_DE: Record<Sens, Statut> = { accuse: "CVenvoye", entrevue: "Entrevue", refus: "Refusee", offre: "Offre" };

export interface LectureSens {
  sens: Sens | null;
  /** `true` quand des signaux contradictoires empêchent de trancher (≠ aucun signal). */
  incertain: boolean;
  /** La phrase du courriel qui justifie le sens, ou `null`. */
  phrase: string | null;
}

function phraseQuiPorte(sens: Sens, textes: readonly string[]): string | null {
  for (const texte of textes) {
    for (const segment of texte.split(/(?<=[.!?])\s+/)) {
      if (MOTIFS[sens].test(normaliserTexte(segment))) return segment.replace(/\s+/g, " ").trim().slice(0, 200);
    }
  }
  return null;
}

/** Ce que dit un courriel, par ses phrases-clés. PURE. */
export function lireSens(sujet: string, extrait: string): LectureSens {
  const norm = normaliserTexte(`${sujet} ${extrait}`);
  const trouves = (Object.keys(MOTIFS) as Sens[]).filter((s) => MOTIFS[s].test(norm));
  const a = new Set(trouves);

  let sens: Sens | null = null;
  if (a.size === 1) sens = trouves[0] ?? null;
  else if (a.size > 1) {
    const fortes = trouves.filter((s) => s !== "accuse");
    const seule = fortes[0] ?? null;
    if (fortes.length === 0) sens = "accuse";
    else if (fortes.length === 1) sens = a.has("accuse") && seule === "offre" ? null : seule;
  }
  if (sens === null) return { sens: null, incertain: a.size > 0, phrase: null };
  return { sens, incertain: false, phrase: phraseQuiPorte(sens, [extrait, sujet]) };
}

/** Le statut proposé fait-il avancer l'offre, jamais reculer ? */
export function faitAvancer(actuel: Statut, sens: Sens): boolean {
  switch (sens) {
    case "accuse":
      return actuel === "Identifiee";
    case "entrevue":
      return actuel === "Identifiee" || actuel === "CVenvoye" || actuel === "Relance";
    case "refus":
      return actuel !== "Refusee" && actuel !== "Offre";
    case "offre":
      return actuel !== "Offre";
  }
}

interface Proposition {
  courrielId: string;
  recuLe: string | null;
  offreId: string;
  statutActuel: Statut;
  statutPropose: Statut;
  sens: Sens;
  /** La phrase du courriel qui justifie le statut (déjà expurgée). */
  phrase: string;
  sujet: string;
  /** Nom d'affichage de l'expéditeur, sinon son domaine. Jamais l'adresse. */
  expediteur: string;
  indices: string[];
}

type Abstention = "sans-signal" | "sens-incertain" | "aucune-offre" | "plusieurs-offres" | "deja-a-jour" | "courriel-plus-recent";

export interface BilanPropositions {
  courrielsLus: number;
  propositions: Proposition[];
  abstentions: Record<Abstention, number>;
}

/**
 * Les propositions de statut pour des courriels reçus (du plus récent au plus ancien). PURE.
 * Par offre, seul le courriel le plus récent qui propose quelque chose est gardé : les autres sont comptés `courriel-plus-recent`.
 */
export function proposerStatuts(courriels: readonly CourrielLu[], offres: readonly Offre[]): BilanPropositions {
  const abstentions: Record<Abstention, number> = {
    "sans-signal": 0,
    "sens-incertain": 0,
    "aucune-offre": 0,
    "plusieurs-offres": 0,
    "deja-a-jour": 0,
    "courriel-plus-recent": 0,
  };
  const parOffre = new Map<string, Proposition>();

  for (const c of courriels) {
    const lu = lireSens(c.sujet, c.extrait);
    if (lu.sens === null) {
      abstentions[lu.incertain ? "sens-incertain" : "sans-signal"]++;
      continue;
    }
    const rap = rapprocherCourriel(c, offres);
    if (rap.etat === "aucune") {
      abstentions["aucune-offre"]++;
      continue;
    }
    if (rap.etat === "ambigu") {
      abstentions["plusieurs-offres"]++;
      continue;
    }
    if (!faitAvancer(rap.offre.statut, lu.sens)) {
      abstentions["deja-a-jour"]++;
      continue;
    }
    const existante = parOffre.get(rap.offre.id);
    if (existante !== undefined && (existante.recuLe ?? "") >= (c.recuLe ?? "")) {
      abstentions["courriel-plus-recent"]++;
      continue;
    }
    if (existante !== undefined) abstentions["courriel-plus-recent"]++;
    const exp = expediteurDe(c.de);
    parOffre.set(rap.offre.id, {
      courrielId: c.id,
      recuLe: c.recuLe,
      offreId: rap.offre.id,
      statutActuel: rap.offre.statut,
      statutPropose: STATUT_DE[lu.sens],
      sens: lu.sens,
      phrase: lu.phrase ?? expurgerPII(c.sujet).texte.slice(0, 200),
      sujet: expurgerPII(c.sujet).texte.replace(/\s+/g, " ").trim(),
      expediteur: exp.nom !== "" ? exp.nom : exp.domaine,
      indices: rap.indices,
    });
  }
  return { courrielsLus: courriels.length, propositions: [...parOffre.values()], abstentions };
}
