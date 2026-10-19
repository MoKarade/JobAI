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
   * Ce qu'une phrase de preuve doit nommer pour être une preuve DE CETTE compétence (écrit à la
   * main, comparé à mots entiers). Sans lui, n'importe quelle phrase du CV prouverait n'importe
   * quelle compétence : la phrase existe, mais elle ne parle pas de la compétence.
   */
  readonly indices: readonly string[];
  /**
   * Cette compétence règle-t-elle la note (axe technique du rôle) ? Faux = elle figure sur la
   * fiche et sert à l'entrevue, sans déplacer une seule note. Le cœur de cible de Marc
   * (automatisation, robotique, contrôle) règle la note ; un langage de programmation ou un
   * outil de bureau ne la règle pas — sinon tout poste de développeur deviendrait « technique ».
   */
  readonly reglaNote: boolean;
}

const note = (
  id: string,
  libelle: string,
  expressions: readonly string[],
  indicesEnPlus: readonly string[] = [],
): DefinitionCompetence => ({
  id,
  libelle,
  expressions,
  indices: [...expressions, ...indicesEnPlus],
  reglaNote: true,
});
const fiche = (id: string, libelle: string, indices: readonly string[]): DefinitionCompetence => ({
  id,
  libelle,
  expressions: [],
  indices,
  reglaNote: false,
});

/** Le vocabulaire fermé. Ajouter une ligne ici est le seul moyen d'élargir ce qu'une fiche peut dire. */
export const VOCABULAIRE_COMPETENCES: readonly DefinitionCompetence[] = [
  note("automates-programmables", "Automates programmables (PLC)", [
    "plc", "plcs", "automate programmable", "automates programmables", "programmable logic controller",
  ]),
  note("scada", "SCADA", ["scada"]),
  note("robotique-industrielle", "Robotique industrielle", [
    "robotique", "robotic", "robot industriel", "robots industriels", "industrial robot", "cellule robotique",
    "robotic cell",
  ], ["robot", "robots"]),
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
  fiche("cablage-electrique", "Câblage électrique", ["cablage", "wiring"]),
  fiche("cao-3d", "Conception 3D (CAO)", ["cao", "cad", "3d", "solidworks", "autocad", "inventor", "catia"]),
  fiche("soudure", "Soudure", ["soudure", "soudage", "weld", "welding"]),
  fiche("travail-du-metal", "Travail du métal", ["metal", "tole", "usinage"]),
  fiche("python", "Python", ["python"]),
  fiche("java", "Java", ["java"]),
  fiche("cpp", "C++", ["c++", "cpp"]),
  fiche("unity", "Unity", ["unity"]),
  fiche("iot", "Internet des objets (IoT)", ["iot", "internet des objets", "internet of things"]),
  fiche("developpement-jeux", "Développement de jeux", ["jeu", "jeux", "game", "games", "unity", "unreal"]),
  fiche("gestion-de-projet-outils", "Outils de gestion de projet (Gantt, WBS, Trello)", ["gantt", "wbs", "trello", "jira", "ms project"]),
  fiche("agile-scrum", "Méthodes agiles (Scrum)", ["scrum", "agile", "kanban"]),
  fiche("analyse-des-risques", "Analyse des risques", ["risque", "risques", "risk", "amdec", "fmea"]),
  fiche("tests-de-validation", "Tests de validation", ["test", "tests", "validation", "essais"]),
  fiche("bureautique", "Bureautique (Office 365)", ["office", "excel", "word", "powerpoint", "bureautique", "o365", "microsoft"]),
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
    // NFKD : une ligature de PDF (« ﬁ ») redevient « fi ». Les caractères invisibles (espace de
    // largeur nulle, trait d'union conditionnel) sont retirés AVANT, pour ne pas couper un mot.
    .replace(/\p{Cf}/gu, "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** La phrase nomme-t-elle la compétence ? Un indice de l'entrée du vocabulaire, à mots entiers. */
export function phraseMontre(phrase: string, d: DefinitionCompetence): boolean {
  const repliee = replier(phrase);
  const brut = phrase.toLowerCase();
  return d.indices.some((i) => {
    // Un indice avec un signe (« c++ ») se cherche tel quel : le repli le réduirait à « c ».
    if (/[^a-z0-9 ]/.test(i)) return brut.includes(i);
    const r = replier(i);
    return repliee.includes(r) || repliee.includes(`${r.trimEnd()}s `);
  });
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
  const cvSerre = cv.replace(/ /g, "");
  const postes = titresDuParcours
    .map((titre) => ({ titre, replie: replier(titre) }))
    .filter((t) => t.replie.trim().length >= 3);
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
    // Mots contigus d'abord ; sinon sans les espaces, qui absorbe un mot coupé en fin de ligne par le PDF.
    if (!cv.includes(phraseRepliee) && !cvSerre.includes(phraseRepliee.replace(/ /g, ""))) {
      rejeter("phrase introuvable dans le CV");
      continue;
    }
    // ⚠️ LA PHRASE EXISTE, MAIS PARLE-T-ELLE DE LA COMPÉTENCE ? Sans cette porte, une phrase
    // quelconque du CV « prouverait » SCADA, et la ligne ferait basculer des notes.
    if (!phraseMontre(phrase, PAR_ID.get(id) as DefinitionCompetence)) {
      rejeter("phrase sans rapport avec la compétence");
      continue;
    }
    // ⚠️ LE POSTE ÉCRIT SUR LA LIGNE EST LE TITRE DU PARCOURS, JAMAIS LE TEXTE DU MODÈLE. On retient
    // le plus long titre du parcours (5 caractères au moins) que le poste du modèle égale, raccourcit
    // ou complète (« Technicien, Usine, 2022 ») : le texte autour est jeté, rien de libre n'entre
    // dans le profil.
    const posteReplie = replier(poste);
    let trouve: { titre: string; replie: string } | undefined;
    if (posteReplie.trim().length > 0) {
      for (const p of postes) {
        const lie =
          p.replie === posteReplie ||
          (posteReplie.trim().length >= 5 && p.replie.includes(posteReplie)) ||
          (p.replie.trim().length >= 5 && posteReplie.includes(p.replie));
        if (lie && (trouve === undefined || p.replie.length > trouve.replie.length)) trouve = p;
      }
    }
    if (trouve === undefined) {
      rejeter("poste absent du parcours");
      continue;
    }

    const ligne: CompetenceProuvee = { id, niveau: o.niveau, phrase, poste: trouve.titre };
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
  const parRaison = new Map<string, number>();
  for (const r of rejetees) parRaison.set(r.raison, (parRaison.get(r.raison) ?? 0) + 1);
  const detail = [...parRaison].map(([raison, k]) => `${k} × ${raison}`).join(", ");
  return ` ${n} compétence${n > 1 ? "s" : ""} proposée${n > 1 ? "s" : ""} par le modèle ${n > 1 ? "ont" : "a"} été écartée${n > 1 ? "s" : ""} (${detail}).`;
}
