// lib/competences.ts — la fiche de compétences prouvées par le CV (ADR-0033, JobAI#155).
//
// ── CE QUE FAIT CE MODULE ───────────────────────────────────────────────────────────
//
// Il remplace « les outils lus dans le CV, ajoutés tels quels au vocabulaire du barème » par
// une FICHE : chaque ligne est une compétence d'un vocabulaire FERMÉ, avec un niveau et sa
// preuve (une phrase du CV et le poste où elle se lit). Fonctions pures : ni base, ni réseau.
//
// ⚠️ POURQUOI UN VOCABULAIRE FERMÉ. Un outil libre (« ROS », « Unity ») entrait dans
// `motsTechnique` et se comparait aux offres PAR MORCEAUX DE MOTS : « ros » se retrouvait dans
// « prosthesis », « unity » dans « community ». Le 17/10/2026, la meilleure note enregistrée
// (77) était un laboratoire dentaire, pour la seule raison que « prosthesis » contient « ros ».
// Ici le modèle ne choisit que parmi des identifiants connus ; les expressions qui servent à
// lire une offre sont écrites UNE fois, ci-dessous, par un humain, et se comparent par MOTS
// ENTIERS (`contientMot`, lib/scoring.ts).
//
// ⚠️ « AUCUNE COMPÉTENCE SANS SOURCE » SE TIENT DANS LE CODE, pas dans la consigne au modèle.
// `verifierCompetences` retrouve la phrase citée DANS le texte du CV et le poste dans le
// parcours ; ce qu'il ne retrouve pas est rejeté, et le rejet est rendu (jamais avalé).

import { z } from "zod";

/** Ce que le CV montre de la compétence. Seuls « pratique » et « maitrise » règlent la note. */
export const NIVEAUX = ["notions", "pratique", "maitrise"] as const;
export type Niveau = (typeof NIVEAUX)[number];

export interface DefinitionCompetence {
  readonly id: string;
  readonly libelle: string;
  /**
   * Ce qui se lit dans une offre quand elle demande cette compétence. Comparé par MOTS ENTIERS
   * (le pluriel simple passe), jamais par morceaux de mots. Vide pour les compétences de fiche seule.
   */
  readonly expressions: readonly string[];
  /**
   * Cette compétence règle-t-elle la note (axe technique du rôle) ? Faux = elle figure sur la
   * fiche et sert à l'entrevue, sans déplacer une seule note. Le cœur de cible de Marc
   * (automatisation, robotique, contrôle) règle la note ; un langage de programmation ou un
   * outil de bureau ne la règle pas — sinon tout poste de développeur deviendrait « technique ».
   */
  readonly reglaNote: boolean;
}

const note = (id: string, libelle: string, expressions: readonly string[]): DefinitionCompetence => ({
  id,
  libelle,
  expressions,
  reglaNote: true,
});
const fiche = (id: string, libelle: string): DefinitionCompetence => ({
  id,
  libelle,
  expressions: [],
  reglaNote: false,
});

/** Le vocabulaire fermé. Ajouter une ligne ici est le seul moyen d'élargir ce qu'une fiche peut dire. */
export const VOCABULAIRE_COMPETENCES: readonly DefinitionCompetence[] = [
  note("automates-programmables", "Automates programmables (PLC)", [
    "plc", "automate programmable", "automates programmables", "programmable logic controller",
  ]),
  note("scada", "SCADA", ["scada"]),
  note("robotique-industrielle", "Robotique industrielle", [
    "robotique", "robotic", "robot industriel", "robots industriels", "industrial robot", "cellule robotique",
    "robotic cell",
  ]),
  note("ros", "ROS (Robot Operating System)", ["ros", "robot operating system"]),
  note("vision-industrielle", "Vision industrielle", [
    "vision industrielle", "machine vision", "systeme de vision", "vision system",
  ]),
  note("robots-mobiles", "Robots mobiles (AGV, AMR)", ["agv", "amr", "robot mobile", "robots mobiles", "mobile robot"]),
  note("mecatronique", "Mécatronique", ["mecatronique", "mechatronics"]),
  note("instrumentation-controle", "Instrumentation et contrôle", ["instrumentation", "controls engineer"]),
  note("mise-en-service", "Mise en service", ["mise en service", "commissioning"]),
  note("schemas-electriques", "Schémas électriques", [
    "schema electrique", "schemas electriques", "electrical schematic", "electrical drawing",
  ]),
  fiche("cablage-electrique", "Câblage électrique"),
  fiche("cao-3d", "Conception 3D (CAO)"),
  fiche("soudure", "Soudure"),
  fiche("travail-du-metal", "Travail du métal"),
  fiche("python", "Python"),
  fiche("java", "Java"),
  fiche("cpp", "C++"),
  fiche("unity", "Unity"),
  fiche("iot", "Internet des objets (IoT)"),
  fiche("developpement-jeux", "Développement de jeux"),
  fiche("gestion-de-projet-outils", "Outils de gestion de projet (Gantt, WBS, Trello)"),
  fiche("agile-scrum", "Méthodes agiles (Scrum)"),
  fiche("analyse-des-risques", "Analyse des risques"),
  fiche("tests-de-validation", "Tests de validation"),
  fiche("bureautique", "Bureautique (Office 365)"),
];

const PAR_ID: ReadonlyMap<string, DefinitionCompetence> = new Map(
  VOCABULAIRE_COMPETENCES.map((c) => [c.id, c]),
);

export const IDS_COMPETENCES: readonly string[] = VOCABULAIRE_COMPETENCES.map((c) => c.id);

export function definition(id: string): DefinitionCompetence | undefined {
  return PAR_ID.get(id);
}

/** Longueur maximale d'une phrase de preuve : assez pour une ligne de CV, pas pour un paragraphe. */
export const PREUVE_MAX = 200;
const PREUVE_MIN = 8;

/** Une ligne de la fiche. Les trois champs de preuve sont obligatoires : pas de ligne sans source. */
export const CompetenceProuveeSchema = z.object({
  id: z.string().refine((s) => PAR_ID.has(s), "compétence hors vocabulaire"),
  niveau: z.enum(NIVEAUX),
  /** La phrase du CV, recopiée. Retrouvée dans le texte du CV avant d'être acceptée. */
  phrase: z.string().min(PREUVE_MIN).max(PREUVE_MAX),
  /** L'intitulé du poste du parcours où la phrase se lit. */
  poste: z.string().min(1).max(120),
});
export type CompetenceProuvee = z.infer<typeof CompetenceProuveeSchema>;

/** Plafond d'une fiche : au moins le vocabulaire entier, une compétence retenue une seule fois. */
export const COMPETENCES_MAX = 25;

export interface CompetenceRejetee {
  id: string;
  raison: string;
}

/**
 * Pour comparer deux textes sans que la mise en page compte : minuscules, accents repliés, toute
 * suite de signes remplacée par UNE espace. Un PDF coupe les lignes n'importe où ; la phrase du
 * modèle reste, elle, une suite de mots contigus.
 */
export function replier(s: string): string {
  return ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const RANG: Record<Niveau, number> = { notions: 0, pratique: 1, maitrise: 2 };

function estNiveau(n: unknown): n is Niveau {
  return typeof n === "string" && (NIVEAUX as readonly string[]).includes(n);
}

/**
 * Garde ce que le modèle propose SEULEMENT si le CV le prouve. PURE.
 *
 * Une ligne est retenue quand : son identifiant est dans le vocabulaire, son niveau est connu, sa
 * phrase se retrouve dans le texte du CV (mots contigus, mise en page ignorée) et son poste est un
 * poste du parcours. Une compétence citée deux fois garde le niveau le plus haut. Tout le reste est
 * rendu dans `rejetees`, avec sa raison.
 */
export function verifierCompetences(
  brutes: readonly unknown[],
  texteCv: string,
  titresDuParcours: readonly string[],
): { retenues: CompetenceProuvee[]; rejetees: CompetenceRejetee[] } {
  const cv = replier(texteCv);
  const postes = titresDuParcours.map(replier).filter((t) => t.trim().length >= 3);
  const parId = new Map<string, CompetenceProuvee>();
  const rejetees: CompetenceRejetee[] = [];

  for (const brute of brutes) {
    const o = (brute ?? {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "?";
    const rejeter = (raison: string) => rejetees.push({ id, raison });

    if (!PAR_ID.has(id)) {
      rejeter("hors vocabulaire");
      continue;
    }
    if (!estNiveau(o.niveau)) {
      rejeter("niveau inconnu");
      continue;
    }
    const phrase = typeof o.phrase === "string" ? o.phrase.trim() : "";
    const poste = typeof o.poste === "string" ? o.poste.trim() : "";
    const phraseRepliee = replier(phrase);
    if (phraseRepliee.trim().length < PREUVE_MIN || phrase.length > PREUVE_MAX) {
      rejeter("phrase absente ou hors longueur");
      continue;
    }
    if (!cv.includes(phraseRepliee)) {
      rejeter("phrase introuvable dans le CV");
      continue;
    }
    const posteReplie = replier(poste);
    if (posteReplie.trim() === "" || !postes.some((p) => p === posteReplie || p.includes(posteReplie) || posteReplie.includes(p))) {
      rejeter("poste absent du parcours");
      continue;
    }

    const ligne: CompetenceProuvee = { id, niveau: o.niveau, phrase, poste };
    const deja = parId.get(id);
    if (deja === undefined || RANG[ligne.niveau] > RANG[deja.niveau]) parId.set(id, ligne);
  }

  return { retenues: [...parId.values()].slice(0, COMPETENCES_MAX), rejetees };
}

/**
 * Les expressions que la fiche ajoute à la lecture d'une offre : celles des compétences qui
 * règlent la note ET que le CV montre au moins en pratique. « Notions » ne suffit pas : une
 * compétence seulement effleurée ne fait pas d'un poste un poste technique.
 */
export function expressionsDeNotation(fiche: readonly CompetenceProuvee[]): string[] {
  const sortie = new Set<string>();
  for (const c of fiche) {
    const d = PAR_ID.get(c.id);
    if (d === undefined || !d.reglaNote || c.niveau === "notions") continue;
    for (const e of d.expressions) sortie.add(e);
  }
  return [...sortie];
}

/** La fiche en une ligne par compétence, preuve comprise — ce que l'écran de revue affiche. */
export function fichePourLecture(fiche: readonly CompetenceProuvee[]): string[] {
  return fiche.map((c) => {
    const d = PAR_ID.get(c.id);
    return `${d?.libelle ?? c.id} — ${c.niveau} — « ${c.phrase} » (${c.poste})`;
  });
}

/** Une phrase pour l'écran quand le CV n'a pas prouvé tout ce que le modèle proposait ; vide sinon. */
export function resumeDesRefus(rejetees: readonly CompetenceRejetee[]): string {
  if (rejetees.length === 0) return "";
  const n = rejetees.length;
  return ` ${n} compétence${n > 1 ? "s" : ""} proposée${n > 1 ? "s" : ""} par le modèle ${n > 1 ? "ont" : "a"} été écartée${n > 1 ? "s" : ""} faute de preuve dans le CV.`;
}
