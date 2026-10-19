// lib/comparaisonOffre.ts — comparer ce qu'une offre exige à la fiche de compétences (JobAI#157, ADR-0034).
//
// PUR : aucune lecture, aucun appel. L'appel au modèle est dans `lib/comparaisonOffreLlm.ts`.
//
// ⚠️ LE MODÈLE EXTRAIT, LE CODE COMPARE. Le modèle ne voit pas la fiche de Marc : il rend les exigences de
// l'annonce, chacune avec la phrase qui la porte et un identifiant du vocabulaire fermé (ou `autre`). Le verdict
// « tu as / il te manque » est calculé ici, à partir de la fiche, jamais deviné par le modèle.
//
// ⚠️ UNE EXIGENCE SANS SOURCE DANS L'ANNONCE N'EXISTE PAS. Sa phrase doit se retrouver dans le texte que le modèle a lu.

import {
  IDS_COMPETENCES,
  VOCABULAIRE_COMPETENCES,
  definition,
  phraseMontre,
  replier,
  type CompetenceProuvee,
  type Niveau,
} from "./competences";
import type { Offre } from "./types";

/** Seules les offres de ce rang (ou mieux) se comparent : « jamais sur toutes les offres » (JobAI#157). */
export const MEILLEURES_OFFRES = 100;
/** Au plus autant d'exigences par annonce : de quoi lire une annonce, pas de quoi la recopier. */
export const EXIGENCES_MAX = 15;
/** Longueur d'une phrase d'exigence : une ligne d'annonce, pas un paragraphe. */
export const PHRASE_EXIGENCE_MIN = 8;
export const PHRASE_EXIGENCE_MAX = 200;
/** En dessous, l'extrait n'est pas une annonce (un titre, une ligne) : rien de sérieux à comparer. */
export const ANNONCE_MIN = 150;

/** `autre` : l'annonce le demande, le vocabulaire fermé ne sait pas le nommer. */
export const AUTRE = "autre";

export type StatutExigence = "tu-as" | "notions" | "manque" | "hors-fiche";

export interface LigneComparaison {
  /** La phrase de l'annonce, recopiée. */
  exigence: string;
  /** Le libellé du vocabulaire, ou `null` pour `hors-fiche`. */
  competence: string | null;
  statut: StatutExigence;
  /** La preuve de la fiche (niveau, phrase du CV, poste) pour `tu-as` et `notions`, sinon `null`. */
  preuve: { niveau: Niveau; phrase: string; poste: string } | null;
}

export interface ExigenceLue {
  phrase: string;
  /** Un identifiant du vocabulaire, ou `AUTRE`. */
  competence: string;
}

export interface ExigenceEcartee {
  competence: string;
  raison: string;
}

/** L'extrait d'annonce gardé avec l'offre, ou `""`. Le repli sur la note de provenance n'est PAS une annonce. */
export function texteAnnonce(offre: Pick<Offre, "texteNote">): string {
  return (offre.texteNote ?? "").trim();
}

export type Eligibilite = { ok: true } | { ok: false; raison: string };

export interface EntreeEligibilite {
  fiche: readonly CompetenceProuvee[];
  texteNote: string | null | undefined;
  score: number | null;
  histo: boolean;
  perimeeLe: string | null;
  /** Rang parmi les offres ouvertes (1 = la meilleure), ou `null` si inconnu. */
  rang: number | null;
}

/**
 * Peut-on comparer cette offre ? Chaque refus se dit, avec le geste qui le lève. PURE.
 *
 * Appelée par la page (pour montrer la raison au lieu d'un bouton) ET par l'action serveur (qui ne se fie jamais au
 * client) : une seule règle, jamais deux qui divergent.
 */
export function eligibiliteComparaison(e: EntreeEligibilite): Eligibilite {
  if (e.histo || e.perimeeLe !== null) {
    return { ok: false, raison: "Offre périmée ou archivée : rien à comparer." };
  }
  if (e.score === null || e.rang === null) {
    return { ok: false, raison: "Offre sans note : la comparaison est réservée aux meilleures offres." };
  }
  if (e.rang > MEILLEURES_OFFRES) {
    return {
      ok: false,
      raison: `Offre au rang ${e.rang} : la comparaison est réservée aux ${MEILLEURES_OFFRES} meilleures offres.`,
    };
  }
  if (e.fiche.length === 0) {
    return {
      ok: false,
      raison:
        "Ta fiche de compétences n'existe pas encore. Dans Profil : « Relancer l'analyse » sur ton CV, vérifie la fiche proposée, puis applique.",
    };
  }
  if ((e.texteNote ?? "").trim().length < ANNONCE_MIN) {
    return { ok: false, raison: "Aucun texte d'annonce n'a été gardé pour cette offre : rien à comparer à ta fiche." };
  }
  return { ok: true };
}

/** Le vocabulaire fermé, une compétence par ligne, tel que le modèle le reçoit. */
export function vocabulaireEnTexte(): string {
  return VOCABULAIRE_COMPETENCES.map((c) => `- ${c.id} : ${c.libelle}`).join("\n");
}

/** Le schéma d'outil : l'identifiant est un choix dans la liste fermée (ou `autre`), jamais du texte libre. */
export const OUTIL_COMPARAISON = {
  name: "rendre_exigences",
  description: "Rend les exigences de l'annonce, chacune avec la phrase de l'annonce qui la porte.",
  input_schema: {
    type: "object" as const,
    properties: {
      exigences: {
        type: "array",
        maxItems: EXIGENCES_MAX,
        description: "Les compétences, outils ou expériences que l'annonce demande ou valorise. Aucune qui n'y est écrite.",
        items: {
          type: "object",
          properties: {
            phrase: {
              type: "string",
              maxLength: PHRASE_EXIGENCE_MAX,
              description: "Le passage de l'annonce qui porte l'exigence, recopié mot pour mot (une phrase ou un bout de phrase).",
            },
            competence: {
              type: "string",
              enum: [...IDS_COMPETENCES, AUTRE],
              description: "L'identifiant de la compétence de la liste que l'exigence demande, ou « autre » si aucune ne convient.",
            },
          },
          required: ["phrase", "competence"],
        },
      },
    },
    required: ["exigences"],
  },
};

export const CONSIGNE = [
  "Tu lis l'extrait d'une annonce d'emploi et tu en relèves les EXIGENCES : les compétences, outils,",
  "technologies, méthodes ou expériences que l'annonce demande ou valorise.",
  "",
  "Règles strictes :",
  "- Chaque exigence porte la phrase de l'annonce qui la dit, recopiée MOT POUR MOT (200 caractères au plus).",
  "  Tu ne reformules pas, tu ne résumes pas : le code vérifie que la phrase se lit dans l'annonce.",
  "- Rattache chaque exigence à UNE compétence de la liste ci-dessous par son identifiant. Si aucune ne convient",
  "  clairement, réponds « autre ». Mieux vaut « autre » qu'un rattachement forcé.",
  "- Relève ce que l'annonce DEMANDE (compétences, outils, expérience). Pas la description de l'entreprise, pas les",
  "  avantages, pas le salaire, pas l'horaire.",
  "- Tu ne juges personne et tu ne sais rien du candidat : tu lis l'annonce, rien d'autre.",
  "- Si l'extrait ne demande rien de précis, rends une liste vide.",
  "",
  "Liste des compétences (identifiant : libellé) :",
  vocabulaireEnTexte(),
].join("\n");

/**
 * Garde ce que le modèle propose SEULEMENT si l'annonce le porte. PURE.
 *
 * `texteLu` est EXACTEMENT le texte que le modèle a reçu (après assainissement). Une ligne est retenue quand sa phrase
 * a 8 à 200 caractères, se retrouve dans ce texte (mise en page, casse et accents ignorés), et — pour un identifiant du
 * vocabulaire — nomme la compétence (ses `indices`). Une compétence citée deux fois compte une fois ; `autre` se
 * dédouble sur la phrase.
 */
export function verifierExigences(
  brutes: readonly unknown[],
  texteLu: string,
): { retenues: ExigenceLue[]; ecartees: ExigenceEcartee[] } {
  const annonce = replier(texteLu);
  const retenues: ExigenceLue[] = [];
  const ecartees: ExigenceEcartee[] = [];
  const vus = new Set<string>();

  for (const brute of brutes) {
    const o = (brute ?? {}) as Record<string, unknown>;
    const competence = typeof o.competence === "string" ? o.competence : "?";
    const def = definition(competence);
    // Ce qui sort d'ici est journalisé : un identifiant que le modèle a inventé n'y entre pas, il devient « ? ».
    const nom = def !== undefined || competence === AUTRE ? competence : "?";
    const ecarter = (raison: string) => ecartees.push({ competence: nom, raison });


    if (competence !== AUTRE && def === undefined) {
      ecarter("hors vocabulaire");
      continue;
    }
    const phrase = typeof o.phrase === "string" ? o.phrase.trim() : "";
    const repliee = replier(phrase);
    if (repliee.trim().length < PHRASE_EXIGENCE_MIN || phrase.length > PHRASE_EXIGENCE_MAX) {
      ecarter("phrase absente ou hors longueur");
      continue;
    }
    // Le texte lu est déjà aplati (`extraitPourNote`) : `replier` borne le texte d'espaces, donc la phrase se retrouve à des frontières de MOT.
    if (!annonce.includes(repliee)) {
      ecarter("phrase introuvable dans l'annonce");
      continue;
    }
    // ⚠️ LA PHRASE EXISTE, MAIS PARLE-T-ELLE DE LA COMPÉTENCE ? Sans cette porte, un rattachement forcé passerait.
    if (def !== undefined && !phraseMontre(phrase, def)) {
      ecarter("phrase sans rapport avec la compétence");
      continue;
    }
    const cle = competence === AUTRE ? `${AUTRE}:${repliee.trim()}` : competence;
    if (vus.has(cle)) {
      ecarter("déjà relevée");
      continue;
    }
    vus.add(cle);
    retenues.push({ phrase, competence });
  }

  // Ce qui dépasse la borne est DIT, pas coupé en silence : une exigence tronquée n'est ni « tu as » ni « il te manque ».
  for (const r of retenues.slice(EXIGENCES_MAX)) {
    ecartees.push({ competence: r.competence, raison: `au-delà de ${EXIGENCES_MAX} exigences` });
  }
  return { retenues: retenues.slice(0, EXIGENCES_MAX), ecartees };
}

/**
 * Pose chaque exigence à côté de la fiche. PURE.
 *
 * Le verdict est ICI : pratique ou maîtrise → `tu-as` ; notions → `notions` ; absent de la fiche → `manque` ;
 * `autre` → `hors-fiche` (jamais rangé parmi les deux premiers).
 */
export function comparerALaFiche(
  exigences: readonly ExigenceLue[],
  fiche: readonly CompetenceProuvee[],
): LigneComparaison[] {
  const parId = new Map(fiche.map((c) => [c.id, c]));
  return exigences.map((x): LigneComparaison => {
    if (x.competence === AUTRE) {
      return { exigence: x.phrase, competence: null, statut: "hors-fiche", preuve: null };
    }
    const libelle = definition(x.competence)?.libelle ?? x.competence;
    const ligne = parId.get(x.competence);
    if (ligne === undefined) {
      return { exigence: x.phrase, competence: libelle, statut: "manque", preuve: null };
    }
    return {
      exigence: x.phrase,
      competence: libelle,
      statut: ligne.niveau === "notions" ? "notions" : "tu-as",
      preuve: { niveau: ligne.niveau, phrase: ligne.phrase, poste: ligne.poste },
    };
  });
}

export interface ResumeComparaison {
  tuAs: number;
  notions: number;
  manque: number;
  horsFiche: number;
}

export function resumeComparaison(lignes: readonly LigneComparaison[]): ResumeComparaison {
  const r: ResumeComparaison = { tuAs: 0, notions: 0, manque: 0, horsFiche: 0 };
  for (const l of lignes) {
    if (l.statut === "tu-as") r.tuAs++;
    else if (l.statut === "notions") r.notions++;
    else if (l.statut === "manque") r.manque++;
    else r.horsFiche++;
  }
  return r;
}

/** Une phrase pour l'écran quand le modèle a proposé plus que l'annonce n'en porte ; vide sinon. */
export function resumeDesEcarts(ecartees: readonly ExigenceEcartee[]): string {
  if (ecartees.length === 0) return "";
  const n = ecartees.length;
  const parRaison = new Map<string, number>();
  for (const e of ecartees) parRaison.set(e.raison, (parRaison.get(e.raison) ?? 0) + 1);
  const detail = [...parRaison].map(([raison, k]) => `${k} × ${raison}`).join(", ");
  return `${n} exigence${n > 1 ? "s" : ""} proposée${n > 1 ? "s" : ""} par le modèle ${n > 1 ? "ont" : "a"} été écartée${n > 1 ? "s" : ""} (${detail}).`;
}
