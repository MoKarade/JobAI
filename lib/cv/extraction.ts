// lib/cv/extraction.ts — lire un CV, en PROPOSER un profil, ne rien affirmer.
//
// ⚠️ CE MODULE NE DÉCIDE RIEN. Il rend une PROPOSITION que Marc valide (ADR-0009), et c'est
// ce qui rend acceptable de faire lire un document par un modèle : une extraction fausse
// coûte un décochage à l'écran, jamais une note faussée en silence.
//
// TROIS RÈGLES, ET ELLES SE TIENNENT
//
//   1. **Chaque fait porte sa provenance.** « 3 ans » sans « §Expérience, 2023-2026 » est
//      invérifiable : Marc ne peut ni confirmer ni infirmer, il ne peut que faire confiance.
//      C'est précisément ce qu'on refuse. Un champ sans provenance est présenté comme une
//      SUPPOSITION, pas comme un fait.
//   2. **L'absence se rend absente.** Un CV qui ne dit pas les années rend `null`, jamais
//      une estimation plausible. C'est le garde-fou n°3 au point où il compte le plus : un
//      nombre inventé ici déplace TOUTES les notes.
//   3. **Les coordonnées sont retirées avant stockage.** Le profil circule dans les écrans
//      et les exports ; le nom, l'adresse, le téléphone et le courriel n'ont rien à y faire
//      et ne servent à rien pour noter une offre. Ce qu'on ne garde pas ne peut pas fuir.
//
// CE QUI N'EST PAS ICI : les arbitrages du barème. Le modèle ne propose ni pondération, ni
// rayon, ni plafond — aucun CV ne contient ça, et lui demander de le deviner reviendrait à
// laisser un modèle régler le classement de Marc. Il propose des FAITS ; c'est l'écran de
// revue qui montre ce que ces faits FERAIENT au barème, et Marc qui trancherait.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { baliserDonnees, CONSIGNE_DONNEES, sanitizePromptText } from "../promptSafety";
import { FaitsSchema, type Faits } from "../profil";

/**
 * Haiku suffit : l'extraction structurée d'un document court est exactement ce qu'il fait
 * bien, et le budget du projet ne supporterait pas de faire lire chaque offre par un modèle
 * plus cher (ADR-0009, impact coût).
 */
const MODELE = "claude-haiku-4-5-20251001";

/** Un CV plus long que ça n'est pas un CV. Borne de coût, pas de sécurité. */
const LONGUEUR_MAX_CV = 60_000;

/**
 * Un fait proposé, avec ce qui permet de le vérifier.
 *
 * `provenance` est OBLIGATOIRE côté schéma mais peut être vide côté modèle — et c'est
 * justement le signal : un fait sans provenance est affiché comme non sourcé.
 */
export const FaitSourceSchema = z.object({
  valeur: z.union([z.string(), z.number(), z.null()]),
  /** Où ça se lit dans le document. Vide = le modèle a supposé. */
  provenance: z.string().default(""),
});

/**
 * Ce que le modèle a le droit de rendre.
 *
 * ⚠️ CHAQUE CHAMP EST OPTIONNEL, ET LES BORNES SONT DES BORNES, PAS DES SUGGESTIONS. Un
 * modèle qui rend 200 langues ou 900 ans d'expérience n'est pas un cas d'école : c'est ce
 * qui arrive quand un document part en vrille (PDF mal décodé, texte répété). Le schéma
 * refuse, l'extraction échoue honnêtement, et rien de fabriqué n'atteint le profil.
 *
 * `.finite()` sur les années : `z.number()` accepte `Infinity`, qui deviendrait `null` en
 * JSON — un « je ne sais pas » né d'un débordement, impossible à distinguer d'un vrai.
 */
export const ReponseExtractionSchema = z.object({
  anneesExperience: z.number().finite().min(0).max(60).nullable(),
  anneesExperienceProvenance: z.string().max(300).default(""),
  langues: z.array(z.string().min(1).max(60)).max(12).default([]),
  diplomes: z.array(z.string().min(1).max(200)).max(12).default([]),
  outils: z.array(z.string().min(1).max(80)).max(60).default([]),
  titresOccupes: z.array(z.string().min(1).max(120)).max(30).default([]),
  /** Termes de recherche que le modèle déduit des postes occupés. */
  recherchesSuggerees: z.array(z.string().min(1).max(80)).max(20).default([]),
  /** Ce que le CV établit et qui joue en faveur — matière à SWOT, jamais le SWOT lui-même. */
  forces: z.array(z.string().min(1).max(300)).max(8).default([]),
  /** Ce que le CV révèle comme manque OBJECTIF (une compétence absente, pas un jugement). */
  manques: z.array(z.string().min(1).max(300)).max(8).default([]),
});
export type ReponseExtraction = z.infer<typeof ReponseExtractionSchema>;

/** Le résultat d'une extraction : un succès sourcé, ou un échec qui se nomme. */
export type ResultatExtraction =
  | { ok: true; faits: Faits; brut: ReponseExtraction; provenances: Record<string, string> }
  | { ok: false; raison: string };

/**
 * Motifs de COORDONNÉES, retirés du texte avant qu'il n'atteigne quoi que ce soit de
 * durable.
 *
 * ⚠️ CE N'EST PAS UN ANONYMISEUR, et il ne faut pas le prendre pour tel. Il retire des
 * FORMES connues (courriel, téléphone nord-américain, adresse municipale, code postal
 * canadien) — la même approche que `tests/piiGuard.test.ts`, avec les mêmes limites
 * avouées : un nom de personne isolé lui échappe, et un motif générique de patronyme est
 * inutilisable en français.
 *
 * Il sert à ce que les coordonnées ne se retrouvent pas dans un champ qui circule, pas à
 * garantir qu'aucune donnée personnelle ne subsiste. Ce qui garantit ça, c'est de ne
 * demander au modèle QUE des faits professionnels.
 */
const MOTIFS_COORDONNEES: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // courriel
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, // téléphone
  /\b[A-Z]\d[A-Z][\s-]?\d[A-Z]\d\b/g, // code postal canadien
  /\b\d{1,5},?\s+(?:rue|avenue|av\.|boul(?:evard)?\.?|chemin|ch\.|route|rang|place)\s+[^\n,;]{2,40}/gi,
];

/** Retire les formes de coordonnées d'une chaîne. */
export function expurgerCoordonnees(s: string): string {
  let t = s;
  for (const m of MOTIFS_COORDONNEES) t = t.replace(m, "[retiré]");
  return t;
}

const CONSIGNE = [
  "Tu lis un CV et tu en extrais des FAITS PROFESSIONNELS VÉRIFIABLES.",
  CONSIGNE_DONNEES,
  "",
  "N'EXTRAIS JAMAIS : nom, adresse, téléphone, courriel, date de naissance, statut",
  "matrimonial, photo. Ils ne servent pas à évaluer une offre d'emploi et ne doivent pas",
  "sortir de ce document.",
  "",
  "Pour anneesExperience : compte les années d'expérience professionnelle PERTINENTE,",
  "stages et études exclus. Si le document ne permet pas de trancher, rends null —",
  "une estimation plausible est pire qu'une absence, parce qu'elle sera crue.",
  "Dans anneesExperienceProvenance, cite l'endroit exact du CV qui justifie le nombre",
  "(intitulé de section et dates). Si tu as supposé, laisse la provenance vide.",
  "",
  "forces : ce que le CV ÉTABLIT et qui joue en faveur d'une candidature.",
  "manques : une compétence ou une exigence courante du métier que le CV ne montre PAS.",
  "Ce sont des constats sur le document, pas des conseils de carrière.",
  "",
  "Réponds UNIQUEMENT par un objet JSON conforme au schéma fourni. Aucun texte autour.",
].join("\n");

/** Le schéma d'outil : c'est lui qui force une sortie structurée plutôt qu'à la prière. */
const OUTIL_EXTRACTION = {
  name: "rendre_profil",
  description: "Rend les faits professionnels extraits du CV.",
  input_schema: {
    type: "object" as const,
    properties: {
      anneesExperience: {
        type: ["number", "null"],
        description: "Années d'expérience pertinente, ou null si indéterminable.",
      },
      anneesExperienceProvenance: {
        type: "string",
        description: "Où ça se lit dans le CV. Vide si tu as supposé.",
      },
      langues: { type: "array", items: { type: "string" } },
      diplomes: { type: "array", items: { type: "string" } },
      outils: {
        type: "array",
        items: { type: "string" },
        description: "Outils, technologies, méthodes, certifications.",
      },
      titresOccupes: { type: "array", items: { type: "string" } },
      recherchesSuggerees: {
        type: "array",
        items: { type: "string" },
        description: "Intitulés de poste à rechercher, déduits du parcours.",
      },
      forces: { type: "array", items: { type: "string" } },
      manques: { type: "array", items: { type: "string" } },
    },
    required: ["anneesExperience"],
  },
};

/**
 * Extrait les faits d'un CV.
 *
 * ⚠️ NE LÈVE PAS. Elle rend un échec NOMMÉ, parce que l'appelant a besoin de le montrer à
 * l'écran : « clé API absente » et « le PDF ne contient pas de texte » appellent des gestes
 * différents de la part de Marc, et les réduire tous les deux à « ça n'a pas marché » le
 * laisserait sans issue.
 */
export async function extraireFaits(
  texteCv: string,
  options: { cle?: string | undefined } = {},
): Promise<ResultatExtraction> {
  const cle = options.cle ?? process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    // Échec fermé, et DIT. Surtout pas un profil vide qui passerait pour un résultat.
    return { ok: false, raison: "ANTHROPIC_API_KEY absente : l'extraction est désactivée." };
  }

  const texte = texteCv.slice(0, LONGUEUR_MAX_CV).trim();
  if (texte.length < 100) {
    return {
      ok: false,
      raison:
        "Le document ne contient presque pas de texte. S'il s'agit d'un PDF scanné, " +
        "il faudrait une version texte : la lecture d'image n'est pas branchée.",
    };
  }

  let reponse;
  try {
    const client = new Anthropic({ apiKey: cle });
    reponse = await client.messages.create({
      model: MODELE,
      max_tokens: 2000,
      system: CONSIGNE,
      tools: [OUTIL_EXTRACTION],
      tool_choice: { type: "tool", name: "rendre_profil" },
      messages: [
        {
          role: "user",
          // Le CV est de la DONNÉE : balisé, assaini, et annoncé comme tel.
          content: baliserDonnees("cv", texte),
        },
      ],
    });
  } catch (e) {
    // Une panne de PLATEFORME ne s'impute pas au document (leçon DriveAI) : le message
    // doit permettre de distinguer « recharge ton crédit » de « ce CV est illisible ».
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, raison: `Appel à l'API refusé ou indisponible : ${msg}` };
  }

  const bloc = reponse.content.find((c) => c.type === "tool_use");
  if (!bloc || bloc.type !== "tool_use") {
    return {
      ok: false,
      raison: `Le modèle n'a pas rendu de résultat structuré (fin : ${reponse.stop_reason}).`,
    };
  }

  const analyse = ReponseExtractionSchema.safeParse(bloc.input);
  if (!analyse.success) {
    // Le schéma a refusé : c'est le filet qui fonctionne, pas un incident à masquer.
    const details = analyse.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" · ");
    return { ok: false, raison: `Réponse hors schéma : ${details}` };
  }

  const brut = analyse.data;
  const netto = (xs: readonly string[]) =>
    xs.map((x) => expurgerCoordonnees(sanitizePromptText(x)).trim()).filter((x) => x.length > 0);

  const faits: Faits = FaitsSchema.parse({
    anneesExperience: brut.anneesExperience,
    langues: netto(brut.langues),
    diplomes: netto(brut.diplomes),
    outils: netto(brut.outils),
    titresOccupes: netto(brut.titresOccupes),
  });

  return {
    ok: true,
    faits,
    brut: {
      ...brut,
      recherchesSuggerees: netto(brut.recherchesSuggerees),
      forces: netto(brut.forces),
      manques: netto(brut.manques),
    },
    provenances: { anneesExperience: brut.anneesExperienceProvenance.slice(0, 300) },
  };
}
