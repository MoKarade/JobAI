// lib/candidature.ts — le brouillon de CV et de lettre pour UNE offre : tout ce qui n'est pas
// l'appel au modèle. PUR, aucune I/O (l'appel vit dans `lib/candidatureLlm.ts`).
//
// ⚠️ LE MODÈLE NE PRODUIT PAS LE CV, IL LE CIBLE. Les postes, les employeurs, les dates, les
// langues et les diplômes sortent du profil que Marc a VALIDÉ (ADR-0009), recopiés par le
// code. Le modèle ne fournit que ce qui se rédige : une accroche, le choix et la reformulation
// des réalisations, la lettre. Un employeur ou une date ne peuvent donc pas être inventés
// (garde-fou n°3) : le modèle désigne un poste par son numéro, et un numéro qui n'existe pas
// est écarté ET DIT.
//
// ⚠️ CE QUE LE CODE NE PEUT PAS GARANTIR, IL LE SIGNALE. Une réalisation reformulée peut
// contenir un chiffre que le profil ne porte pas (« +30 % »). `chiffresNonSources` le repère
// et l'écran l'affiche en tête : Marc relit avant usage, et on lui dit OÙ regarder.

import { z } from "zod";
import type { Faits } from "./profil";
import type { Offre } from "./types";

/**
 * Les plafonds de listes, écrits UNE seule fois : le schéma Zod et le schéma d'outil les
 * lisent tous les deux (même leçon que `PLAFONDS` de l'extraction de CV : une borne tenue
 * dans deux langages diverge, et rejeter toute la réponse pour un élément de trop perd un
 * appel déjà facturé).
 */
export const PLAFONDS_BROUILLON = {
  competences: 15,
  postes: 6,
  puces: 5,
  paragraphes: 5,
} as const;

const PuceSchema = z.string().min(1).max(400);

/** Ce que le modèle a le droit de rendre. */
export const ReponseBrouillonSchema = z.object({
  accroche: z.string().min(1).max(600),
  competences: z.array(z.string().min(1).max(80)).max(PLAFONDS_BROUILLON.competences).default([]),
  postes: z
    .array(
      z.object({
        /** Le numéro du poste dans le profil (0 = le plus récent). Jamais un titre libre. */
        indice: z.number().int().min(0),
        puces: z.array(PuceSchema).max(PLAFONDS_BROUILLON.puces).default([]),
      }),
    )
    .max(PLAFONDS_BROUILLON.postes)
    .default([]),
  lettre: z.object({
    objet: z.string().min(1).max(200),
    paragraphes: z.array(z.string().min(1).max(1200)).min(1).max(PLAFONDS_BROUILLON.paragraphes),
    formule: z.string().max(160).default(""),
  }),
});
export type ReponseBrouillon = z.infer<typeof ReponseBrouillonSchema>;

/** Le schéma d'outil : c'est lui qui force une sortie structurée. */
export const OUTIL_BROUILLON = {
  name: "rendre_brouillon",
  description: "Rend le brouillon de CV ciblé et la lettre de présentation.",
  input_schema: {
    type: "object" as const,
    properties: {
      accroche: {
        type: "string",
        description: "Deux ou trois phrases de présentation, ciblées sur l'offre, tirées du profil.",
      },
      competences: {
        type: "array",
        items: { type: "string" },
        maxItems: PLAFONDS_BROUILLON.competences,
        description: "Outils et compétences DU PROFIL qui répondent à l'offre, recopiés tels quels.",
      },
      postes: {
        type: "array",
        maxItems: PLAFONDS_BROUILLON.postes,
        description: "Les postes du profil à mettre en avant, par numéro, du plus pertinent au moins.",
        items: {
          type: "object" as const,
          properties: {
            indice: { type: "integer", description: "Le numéro du poste, tel que donné dans le profil." },
            puces: {
              type: "array",
              items: { type: "string" },
              maxItems: PLAFONDS_BROUILLON.puces,
              description: "Réalisations de CE poste, reformulées pour l'offre. Aucun fait nouveau.",
            },
          },
          required: ["indice", "puces"],
        },
      },
      lettre: {
        type: "object" as const,
        properties: {
          objet: { type: "string" },
          paragraphes: {
            type: "array",
            items: { type: "string" },
            maxItems: PLAFONDS_BROUILLON.paragraphes,
            description: "Trois ou quatre paragraphes, sans salutation ni signature.",
          },
          formule: { type: "string", description: "La formule de politesse finale, sans nom." },
        },
        required: ["objet", "paragraphes"],
      },
    },
    required: ["accroche", "postes", "lettre"],
  },
};

/**
 * Ramène chaque liste à son plafond. PURE, TOLÉRANTE sur son entrée (c'est ce que le modèle a
 * rendu, donc n'importe quoi) : seule la LONGUEUR des listes est corrigée, jamais leur type —
 * c'est le rôle du schéma Zod, juste après. Rend aussi ce qu'elle a coupé, pour le DIRE.
 */
export function bornerBrouillon(brut: unknown): { valeur: unknown; tronquees: string[] } {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) {
    return { valeur: brut, tronquees: [] };
  }
  const source = brut as Record<string, unknown>;
  const sortie: Record<string, unknown> = { ...source };
  const tronquees: string[] = [];

  const borner = (liste: unknown, plafond: number, nom: string): unknown => {
    if (!Array.isArray(liste) || liste.length <= plafond) return liste;
    tronquees.push(`${nom} ${liste.length}->${plafond}`);
    return liste.slice(0, plafond);
  };

  sortie.competences = borner(source.competences, PLAFONDS_BROUILLON.competences, "competences");
  const postes = borner(source.postes, PLAFONDS_BROUILLON.postes, "postes");
  if (Array.isArray(postes)) {
    // Les puces sont une liste DANS une liste : la borne doit y descendre (leçon de l'extraction).
    sortie.postes = postes.map((p, i) => {
      if (p === null || typeof p !== "object" || Array.isArray(p)) return p;
      const poste = p as Record<string, unknown>;
      return { ...poste, puces: borner(poste.puces, PLAFONDS_BROUILLON.puces, `puces du poste ${i + 1}`) };
    });
  }
  const lettre = source.lettre;
  if (lettre !== null && typeof lettre === "object" && !Array.isArray(lettre)) {
    const l = lettre as Record<string, unknown>;
    sortie.lettre = { ...l, paragraphes: borner(l.paragraphes, PLAFONDS_BROUILLON.paragraphes, "paragraphes") };
  }
  return { valeur: sortie, tronquees };
}

/** Le brouillon tel qu'on l'affiche et le copie. */
export interface Brouillon {
  cv: {
    accroche: string;
    competences: string[];
    langues: string[];
    diplomes: string[];
    postes: { titre: string; employeur: string; debut: string; fin: string; puces: string[] }[];
  };
  lettre: { objet: string; paragraphes: string[]; formule: string };
  /** Ce que le code a écarté ou coupé, en toutes lettres. Vide = rien. */
  avertissements: string[];
  /** Nombres du texte rédigé que ni le profil ni l'offre ne portent. À vérifier par Marc. */
  chiffresNonSources: string[];
}

/** Le profil porte-t-il de quoi bâtir un CV ? Sans parcours, on ne paie pas l'appel. */
export function profilSuffisant(faits: Faits): boolean {
  return faits.parcours.length > 0;
}

/** Le profil, mis en texte pour le prompt : chaque poste porte son numéro. PURE. */
export function profilEnTexte(faits: Faits): string {
  const lignes: string[] = [];
  lignes.push(
    `Années d'expérience : ${faits.anneesExperience === null ? "non établi" : faits.anneesExperience}`,
  );
  lignes.push(`Langues : ${faits.langues.join(", ") || "non établi"}`);
  lignes.push(`Diplômes : ${faits.diplomes.join(", ") || "non établi"}`);
  lignes.push(`Outils et compétences : ${faits.outils.join(", ") || "non établi"}`);
  lignes.push("", "Parcours (du plus récent au plus ancien) :");
  faits.parcours.forEach((p, i) => {
    const periode = [p.debut, p.fin].filter((x) => x !== "").join(" – ");
    lignes.push(
      `[${i}] ${p.titre}${p.employeur ? ` — ${p.employeur}` : ""}${periode ? ` (${periode})` : ""}`,
    );
    for (const f of p.faits) lignes.push(`    - ${f}`);
  });
  return lignes.join("\n");
}

/**
 * L'offre, mise en texte pour le prompt. PURE.
 *
 * ⚠️ CE QUE L'APP SAIT D'UNE OFFRE EST MINCE : poste, employeur, salaire affiché, les notes
 * de recherche (600 caractères au plus) et les raisons de la note. Pas l'annonce complète.
 * Le prompt le dit au modèle, pour qu'il n'invente pas les exigences d'une annonce qu'il n'a
 * pas lue. `userNote` (les notes de Marc) ne part pas : c'est à lui, et ça ne sert pas ici.
 */
export function offreEnTexte(offre: Offre): string {
  const lignes = [`Poste : ${offre.poste}`, `Employeur : ${offre.entreprise}`];
  if (offre.salaireAffiche) lignes.push(`Salaire affiché : ${offre.salaireAffiche}`);
  if (offre.notes) lignes.push(`Notes de recherche : ${offre.notes}`);
  for (const r of offre.raisons) {
    lignes.push(`${r.ton === "atout" ? "Point favorable" : "Réserve"} : ${r.texte}`);
  }
  return lignes.join("\n");
}

const NOMBRE = /\d+(?:[.,]\d+)?/g;

function nombresDe(texte: string): Set<string> {
  return new Set((texte.match(NOMBRE) ?? []).map((n) => n.replace(",", ".")));
}

/**
 * Les nombres de `redige` absents de `sources`. PURE.
 *
 * Un nombre ne se « reformule » pas : s'il apparaît dans le texte rédigé, il vient du profil
 * ou de l'offre, ou le modèle l'a inventé. Cette fonction ne tranche pas, elle désigne.
 */
export function chiffresNonSources(redige: string, sources: string): string[] {
  const connus = nombresDe(sources);
  const vus = new Set<string>();
  for (const brut of redige.match(NOMBRE) ?? []) {
    if (!connus.has(brut.replace(",", "."))) vus.add(brut);
  }
  return [...vus];
}

/**
 * Compose le brouillon : le texte du modèle, les faits du profil. PURE.
 *
 * - Un numéro de poste inexistant ou répété est écarté et dit.
 * - Une compétence que le profil ne porte pas est écartée et dite.
 * - Le modèle ne choisit ni employeur, ni date, ni langue, ni diplôme.
 */
export function assemblerBrouillon(
  reponse: ReponseBrouillon,
  faits: Faits,
  offre: Offre,
  tronquees: readonly string[] = [],
): Brouillon {
  const avertissements: string[] = [];
  if (tronquees.length > 0) {
    avertissements.push(`Listes coupées au plafond : ${tronquees.join(", ")}.`);
  }

  const vus = new Set<number>();
  const postes: Brouillon["cv"]["postes"] = [];
  for (const p of reponse.postes) {
    const source = faits.parcours[p.indice];
    if (!source) {
      avertissements.push(`Poste n° ${p.indice} inexistant dans ton profil : écarté.`);
      continue;
    }
    if (vus.has(p.indice)) {
      avertissements.push(`Poste n° ${p.indice} cité deux fois : la seconde mention est écartée.`);
      continue;
    }
    vus.add(p.indice);
    postes.push({
      titre: source.titre,
      employeur: source.employeur,
      debut: source.debut,
      fin: source.fin,
      puces: p.puces,
    });
  }
  if (postes.length === 0) {
    avertissements.push("Aucun poste retenu : le CV n'a pas de section expérience.");
  }

  const connus = new Map(faits.outils.map((o) => [o.trim().toLowerCase(), o]));
  const competences: string[] = [];
  for (const c of reponse.competences) {
    const profil = connus.get(c.trim().toLowerCase());
    if (!profil) {
      avertissements.push(`Compétence « ${c} » absente de ton profil : écartée.`);
      continue;
    }
    if (!competences.includes(profil)) competences.push(profil);
  }

  const brouillon: Brouillon = {
    cv: {
      accroche: reponse.accroche,
      competences,
      langues: [...faits.langues],
      diplomes: [...faits.diplomes],
      postes,
    },
    lettre: {
      objet: reponse.lettre.objet,
      paragraphes: reponse.lettre.paragraphes,
      formule: reponse.lettre.formule,
    },
    avertissements,
    chiffresNonSources: [],
  };

  // Les sources sont ce que le modèle a LU : le profil (employeurs et dates compris, qui
  // portent des nombres) et l'offre.
  brouillon.chiffresNonSources = chiffresNonSources(
    [cvEnTexte(brouillon), lettreEnTexte(brouillon)].join("\n"),
    `${profilEnTexte(faits)}\n${offreEnTexte(offre)}`,
  );
  return brouillon;
}

/** Le CV en texte brut, prêt à copier. PURE. */
export function cvEnTexte(b: Brouillon): string {
  const blocs: string[] = [b.cv.accroche];
  if (b.cv.competences.length > 0) blocs.push(`Compétences : ${b.cv.competences.join(", ")}`);
  if (b.cv.langues.length > 0) blocs.push(`Langues : ${b.cv.langues.join(", ")}`);
  if (b.cv.diplomes.length > 0) blocs.push(`Formation : ${b.cv.diplomes.join(", ")}`);
  if (b.cv.postes.length > 0) {
    const lignes = ["Expérience"];
    for (const p of b.cv.postes) {
      const periode = [p.debut, p.fin].filter((x) => x !== "").join(" – ");
      lignes.push(`${p.titre}${p.employeur ? ` — ${p.employeur}` : ""}${periode ? ` (${periode})` : ""}`);
      for (const puce of p.puces) lignes.push(`- ${puce}`);
    }
    blocs.push(lignes.join("\n"));
  }
  return blocs.join("\n\n");
}

/** La lettre en texte brut, prêt à copier. Sans signature : le nom de Marc n'est pas dans l'app. */
export function lettreEnTexte(b: Brouillon): string {
  const blocs = [`Objet : ${b.lettre.objet}`, "Madame, Monsieur,", ...b.lettre.paragraphes];
  if (b.lettre.formule) blocs.push(b.lettre.formule);
  return blocs.join("\n\n");
}
