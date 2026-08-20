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
import { enregistrerUsageLlm } from "../coutLlmStore";
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
/**
 * Les plafonds de listes, écrits UNE seule fois.
 *
 * ⚠️ ILS SERVENT DEUX FOIS, ET C'EST TOUT LE PROBLÈME QU'ILS RÈGLENT. Le schéma Zod
 * ci-dessous valide la réponse du modèle ; le schéma d'outil plus bas est ce que le modèle
 * REÇOIT. Le 2026-08-14, le second ne portait aucun `maxItems` : on demandait une liste
 * libre, puis on rejetait TOUTE l'analyse parce qu'elle contenait neuf forces au lieu de
 * huit. Le modèle n'avait aucun moyen de connaître la limite — la faute était de notre côté.
 *
 * Une même règle tenue dans deux langages diverge toujours. Ici elle n'est écrite qu'une
 * fois, les deux schémas la lisent, et `tests/cvExtraction.test.ts` refuse qu'ils s'écartent.
 */
export const PLAFONDS = {
  langues: 12,
  diplomes: 12,
  outils: 60,
  titresOccupes: 30,
  recherchesSuggerees: 20,
  forces: 8,
  manques: 8,
  /** Postes du parcours. Un CV en porte rarement plus ; au-delà, c'est du remplissage. */
  parcours: 12,
  /** Réalisations retenues par poste. Assez pour préparer une entrevue, pas un roman. */
  faitsParPoste: 10,
} as const;

/**
 * Un poste du parcours.
 *
 * ⚠️ LES DATES SONT DU TEXTE, PAS DES DATES. Un CV écrit « Avril 2024 », « 2023 »,
 * « Présent », parfois rien. Les convertir obligerait à DEVINER un jour et un mois — donc à
 * fabriquer une précision que le document ne porte pas, et à afficher « 01/04/2024 » là où
 * le CV dit « Avril 2024 ». On garde ce qui est écrit.
 *
 * `employeur` peut être vide : certains CV décrivent une mission sans nommer le client.
 */
export const ExperienceSchema = z.object({
  titre: z.string().min(1).max(120),
  employeur: z.string().max(120).default(""),
  debut: z.string().max(40).default(""),
  fin: z.string().max(40).default(""),
  /** Ce que le poste a comporté, tel que le CV le formule. */
  faits: z.array(z.string().min(1).max(300)).max(PLAFONDS.faitsParPoste).default([]),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const ReponseExtractionSchema = z.object({
  anneesExperience: z.number().finite().min(0).max(60).nullable(),
  anneesExperienceProvenance: z.string().max(300).default(""),
  langues: z.array(z.string().min(1).max(60)).max(PLAFONDS.langues).default([]),
  diplomes: z.array(z.string().min(1).max(200)).max(PLAFONDS.diplomes).default([]),
  outils: z.array(z.string().min(1).max(80)).max(PLAFONDS.outils).default([]),
  titresOccupes: z.array(z.string().min(1).max(120)).max(PLAFONDS.titresOccupes).default([]),
  /** Termes de recherche que le modèle déduit des postes occupés. */
  recherchesSuggerees: z.array(z.string().min(1).max(80)).max(PLAFONDS.recherchesSuggerees).default([]),
  /** Ce que le CV établit et qui joue en faveur — matière à SWOT, jamais le SWOT lui-même. */
  forces: z.array(z.string().min(1).max(300)).max(PLAFONDS.forces).default([]),
  /** Ce que le CV révèle comme manque OBJECTIF (une compétence absente, pas un jugement). */
  manques: z.array(z.string().min(1).max(300)).max(PLAFONDS.manques).default([]),
  /**
   * Le parcours, du plus récent au plus ancien.
   *
   * ⚠️ `default([])` et non requis : un CV illisible sur ce point ne doit pas faire échouer
   * l'extraction entière. Un parcours vide se DIT à l'écran ; une extraction refusée ferait
   * re-téléverser le même fichier en boucle.
   */
  parcours: z.array(ExperienceSchema).max(PLAFONDS.parcours).default([]),
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
  "parcours : les postes occupés, du plus RÉCENT au plus ancien. Pour chacun, recopie",
  "l'intitulé, l'employeur et les dates TELS QU'ÉCRITS — « Avril 2023 », « Présent ».",
  "Ne convertis pas en dates : le CV ne porte pas toujours le jour, et l'inventer donnerait",
  "une précision fausse. Un champ absent du CV reste une chaîne vide, jamais une supposition.",
  "Dans faits, reprends ce que le poste comportait, dans les termes du CV. N'ajoute rien",
  "que le document ne dit pas, et ne reformule pas en mieux : ces phrases serviront à",
  "préparer une entrevue, où c'est le CV qui fera foi.",
  "",
  "forces : ce que le CV ÉTABLIT et qui joue en faveur d'une candidature.",
  "manques : une compétence ou une exigence courante du métier que le CV ne montre PAS.",
  "Ce sont des constats sur le document, pas des conseils de carrière.",
  "",
  "Réponds UNIQUEMENT par un objet JSON conforme au schéma fourni. Aucun texte autour.",
].join("\n");

/** Le schéma d'outil : c'est lui qui force une sortie structurée plutôt qu'à la prière. */
export const OUTIL_EXTRACTION = {
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
      langues: { type: "array", items: { type: "string" }, maxItems: PLAFONDS.langues },
      diplomes: { type: "array", items: { type: "string" }, maxItems: PLAFONDS.diplomes },
      outils: {
        type: "array",
        items: { type: "string" },
        maxItems: PLAFONDS.outils,
        description: "Outils, technologies, méthodes, certifications.",
      },
      titresOccupes: { type: "array", items: { type: "string" }, maxItems: PLAFONDS.titresOccupes },
      recherchesSuggerees: {
        type: "array",
        items: { type: "string" },
        maxItems: PLAFONDS.recherchesSuggerees,
        description: "Intitulés de poste à rechercher, déduits du parcours.",
      },
      parcours: {
        type: "array",
        maxItems: PLAFONDS.parcours,
        description:
          "Les postes occupés, du plus récent au plus ancien. Recopie ce que le CV écrit ; " +
          "n'invente ni date ni employeur manquant.",
        items: {
          type: "object" as const,
          properties: {
            titre: { type: "string", description: "L'intitulé du poste, tel qu'écrit." },
            employeur: { type: "string", description: "Le nom de l'employeur, ou une chaîne vide." },
            debut: { type: "string", description: "Tel qu'écrit : « Avril 2023 », « 2023 », ou vide." },
            fin: { type: "string", description: "Tel qu'écrit : « Présent », « Février 2025 », ou vide." },
            faits: {
              type: "array",
              items: { type: "string" },
              maxItems: PLAFONDS.faitsParPoste,
              description: "Ce que le poste comportait, tel que le CV le formule.",
            },
          },
          required: ["titre"],
        },
      },
      forces: { type: "array", items: { type: "string" }, maxItems: PLAFONDS.forces },
      manques: { type: "array", items: { type: "string" }, maxItems: PLAFONDS.manques },
    },
    required: ["anneesExperience"],
  },
};

/**
 * Ramène chaque liste à son plafond, et dit ce qu'elle a coupé.
 *
 * PURE, et volontairement TOLÉRANTE sur son entrée : elle reçoit ce que le modèle a rendu,
 * c'est-à-dire n'importe quoi. Ce qui n'est pas un tableau passe intact — c'est le rôle du
 * schéma Zod, juste après, de refuser une valeur du mauvais TYPE. Ici on ne corrige qu'une
 * chose : la LONGUEUR, qui est un choix d'affichage et jamais un défaut de correction.
 */
export function bornerListes(brut: unknown): { valeur: unknown; tronquees: string[] } {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) {
    return { valeur: brut, tronquees: [] };
  }

  const source = brut as Record<string, unknown>;
  const sortie: Record<string, unknown> = { ...source };
  const tronquees: string[] = [];

  for (const [champ, plafond] of Object.entries(PLAFONDS)) {
    const valeur = source[champ];
    if (!Array.isArray(valeur) || valeur.length <= plafond) continue;
    sortie[champ] = valeur.slice(0, plafond);
    tronquees.push(`${champ} ${valeur.length}->${plafond}`);
  }

  return { valeur: sortie, tronquees };
}

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
  options: {
    cle?: string | undefined;
    /**
     * Où part le relevé d'usage de l'appel. Injecté, avec un défaut qui écrit vraiment.
     *
     * ⚠️ LA COMPTABILITÉ VIT ICI, PAS CHEZ L'APPELANT, ET C'EST LE POINT. `extraireFaits` a
     * DEUX appelants (téléversement et ré-analyse) : laisser chacun penser à compter, c'est
     * la règle « un outil qu'on peut oublier d'appeler ne protège rien », et le premier
     * oubli produirait un cumul silencieusement amputé. Injecté pour rester testable sans
     * base — le module ne connaît toujours aucune I/O de persistance en propre.
     */
    comptabiliser?: (usage: unknown) => Promise<void>;
  } = {},
): Promise<ResultatExtraction> {
  const comptabiliser = options.comptabiliser ?? enregistrerUsageLlm;
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

  // ⚠️ COMPTÉ ICI, ET PAS PLUS BAS. L'appel est fait et FACTURÉ : ce qui suit peut encore
  // échouer (pas de bloc `tool_use`, réponse hors schéma, listes tronquées) et rendre
  // `ok: false` — mais Anthropic a déjà consommé ses tokens. Placer la comptabilité après
  // les validations ne compterait que les extractions RÉUSSIES, donc sous-estimerait le
  // coût réel exactement les jours où quelque chose ne va pas.
  //
  // `await` plutôt qu'un appel détaché : une promesse orpheline dans une fonction
  // serverless peut être tuée avant d'écrire.
  //
  // ⚠️ ET SOUS UN `try`, MÊME SI L'ÉCRIVAIN PAR DÉFAUT NE LÈVE PAS. La garantie « une panne
  // de comptabilité ne coûte jamais une extraction » ne doit pas dépendre de QUI est
  // injecté : écrite seulement dans `enregistrerUsageLlm`, elle disparaîtrait au premier
  // appelant qui passe le sien. Perdre la mesure d'un appel est regrettable ; perdre
  // l'analyse d'un CV parce que la comptabilité a hoqueté ne l'est pas.
  try {
    await comptabiliser(reponse.usage);
  } catch (e) {
    console.error("[cv] comptabilité de l'appel impossible", e);
  }

  const bloc = reponse.content.find((c) => c.type === "tool_use");
  if (!bloc || bloc.type !== "tool_use") {
    return {
      ok: false,
      raison: `Le modèle n'a pas rendu de résultat structuré (fin : ${reponse.stop_reason}).`,
    };
  }

  // ⚠️ TRONQUER AVANT DE VALIDER — une borne sur une liste ne se REJETTE pas.
  //
  // Le 2026-08-14, une analyse entière a été perdue parce que le modèle avait rendu NEUF
  // forces au lieu de huit. Le CV était lu, les faits étaient bons, et tout est parti à la
  // poubelle pour un élément de trop sur une liste dont le plafond est un choix
  // d'AFFICHAGE, pas une exigence de correction. Un dépassement de liste n'est pas une
  // réponse fausse : c'est une réponse généreuse.
  //
  // Le schéma d'outil annonce désormais les `maxItems`, ce qui devrait suffire — mais un
  // modèle reste un modèle. La ceinture tronque, la bretelle informe, et rien ne se perd
  // en silence : ce qui a été coupé est DIT (voir la règle « un filtre qui peut perdre des
  // résultats dit quand il mord »).
  const { valeur, tronquees } = bornerListes(bloc.input);
  if (tronquees.length > 0) {
    console.warn(`[cv] listes tronquées au plafond : ${tronquees.join(" · ")}`);
  }

  const analyse = ReponseExtractionSchema.safeParse(valeur);
  if (!analyse.success) {
    // Le schéma a refusé : c'est le filet qui fonctionne, pas un incident à masquer.
    const details = analyse.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" · ");
    return { ok: false, raison: `Réponse hors schéma : ${details}` };
  }

  // ⚠️ ON NETTOIE D'ABORD, ON COMPOSE ENSUITE — jamais l'inverse.
  //
  // La première version faisait `{ ...brut, forces: netto(brut.forces), … }` : un étalement
  // de la réponse BRUTE du modèle, avec trois champs seulement ré-écrits par-dessus.
  // `langues`, `diplomes`, `outils`, `titresOccupes` et la provenance restaient donc tels
  // que le modèle les avait rendus, et c'est cet objet-là qui partait en base, puis dans le
  // profil, puis à l'écran.
  //
  // Le scénario n'a rien d'exotique : dans un CV dont les coordonnées sont en colonne
  // latérale, l'extraction PDF les aplatit à côté d'un intitulé de poste — le numéro civique
  // et le téléphone atterrissent alors dans `titresOccupes`, collés au nom du poste.
  // (Exemple volontairement NON écrit ici : `tests/piiGuard.test.ts` scanne les fichiers
  // versionnés et ne distingue pas une illustration d'une vraie coordonnée. Il a raison.)
  // L'en-tête de `lib/profil.ts` promet « PAS DE DONNÉES PERSONNELLES
  // ICI », l'écran de dépôt le promet à Marc en toutes lettres, et le code ne le tenait pas.
  //
  // Un objet nettoyé COMPLET, construit champ par champ, rend la classe de bug impossible :
  // ajouter un champ à `ReponseExtractionSchema` sans l'ajouter ici casse le typage au lieu
  // de laisser passer du texte brut en silence.
  const brut = analyse.data;
  const netto = (xs: readonly string[]) =>
    xs.map((x) => expurgerCoordonnees(sanitizePromptText(x)).trim()).filter((x) => x.length > 0);
  const nettoUn = (s: string) => expurgerCoordonnees(sanitizePromptText(s)).trim();

  const propre: ReponseExtraction = {
    anneesExperience: brut.anneesExperience,
    anneesExperienceProvenance: nettoUn(brut.anneesExperienceProvenance).slice(0, 300),
    langues: netto(brut.langues),
    diplomes: netto(brut.diplomes),
    outils: netto(brut.outils),
    titresOccupes: netto(brut.titresOccupes),
    recherchesSuggerees: netto(brut.recherchesSuggerees),
    // ⚠️ CHAQUE CHAÎNE DU PARCOURS PASSE PAR LE MÊME NETTOYAGE. Un poste porte un employeur
    // et des phrases tirées du CV : c'est là que des coordonnées se glissent le plus
    // volontiers. Un objet imbriqué ne dispense pas du traitement, il le rend juste plus
    // facile à oublier.
    parcours: brut.parcours
      .map((e) => ({
        titre: nettoUn(e.titre).slice(0, 120),
        employeur: nettoUn(e.employeur).slice(0, 120),
        debut: nettoUn(e.debut).slice(0, 40),
        fin: nettoUn(e.fin).slice(0, 40),
        faits: netto(e.faits).map((f) => f.slice(0, 300)),
      }))
      // Un poste sans titre n'est pas un poste : le garder afficherait une carte vide.
      .filter((e) => e.titre.length > 0),
    forces: netto(brut.forces),
    manques: netto(brut.manques),
  };

  const faits: Faits = FaitsSchema.parse({
    anneesExperience: propre.anneesExperience,
    langues: propre.langues,
    diplomes: propre.diplomes,
    outils: propre.outils,
    titresOccupes: propre.titresOccupes,
  });

  return {
    ok: true,
    faits,
    brut: propre,
    provenances: { anneesExperience: propre.anneesExperienceProvenance },
  };
}
