// lib/lectureAnnonce.ts — ce que le modèle rend après avoir lu une annonce, et comment on le vérifie. PUR (JobAI#109, ADR-0039).
//
// ⚠️ CE MODULE NE NOTE RIEN. Il décrit la lecture (schéma, consigne, outil, mise en regard des mots-clés) ; ni
// `computeScore` ni le plafond de 85 ne la lisent. L'entrée dans la note est une autre tâche (JobAI#212), qui ne part
// qu'après la mesure (JobAI#211) : le protocole de précision demande de mesurer avant de changer une note.
//
// ⚠️ LE MODÈLE PROPOSE, LE CODE VÉRIFIE. Son rôle est l'une des CINQ lignes de `profil.pointsRole` (les mêmes que celles
// que lisent les mots-clés : la comparaison se fait ligne pour ligne), son adéquation un entier de 0 à 100, ses raisons
// trois phrases au plus. Tout ce qui sort de ce cadre est refusé en bloc, jamais réparé : une lecture « presque bonne »
// serait une lecture dont on ne sait plus ce qu'elle vaut.
//
// ⚠️ L'ANNONCE EST UNE DONNÉE, PAS UNE CONSIGNE. Elle est écrite par un tiers : elle entre dans le prompt assainie et
// balisée (`promptSafety`), et rien de ce que le modèle écrit n'a d'effet — il n'a aucun outil, sa sortie est bornée.

import { z } from "zod";
import { expurgerPII } from "./ingest/expurger";
import { roleDe, type RoleLu } from "./scoring";
import type { Profil } from "./profil";

export const MODELE_LECTURE = "claude-haiku-5-5";
/** Version du cadre de lecture : une consigne ou un schéma qui change la fait monter, et les lectures d'avant se repèrent. */
export const VERSION_LECTURE = 1;

const ROLES_LUS = ["combinaison", "coordination", "technique", "technicien", "horsSujet"] as const satisfies readonly RoleLu[];

export const RAISONS_MAX = 3;
const RAISON_LONGUEUR_MAX = 160;

/** Ce que le modèle doit rendre. Une phrase de raison vide ou démesurée fait refuser toute la lecture. */
export const LectureModeleSchema = z.object({
  role: z.enum(ROLES_LUS),
  adequation: z.number().int().min(0).max(100),
  raisons: z.array(z.string().trim().min(1).max(RAISON_LONGUEUR_MAX)).min(1).max(RAISONS_MAX),
});

type LectureModele = z.infer<typeof LectureModeleSchema>;

/** Une lecture gardée avec l'offre : ce que le modèle a rendu, plus de quoi la dater et la comparer. */
export interface LectureAnnonce extends LectureModele {
  version: number;
  modele: string;
  /** Instant de la lecture (ISO). */
  luLe: string;
  /** Caractères d'annonce que le modèle a vus : une lecture sur 300 caractères ne vaut pas une sur 2 000. */
  caracteresLus: number;
}

/**
 * La consigne. Elle décrit les cinq rôles avec les MOTS DU PROFIL (ceux que son CV a produits), pour que « coordination »
 * et « technique » veuillent dire pour le modèle ce qu'ils veulent dire pour les mots-clés.
 */
export function consigneLecture(profil: Pick<Profil, "motsCoordination" | "motsTechnique">): string {
  const coord = profil.motsCoordination.slice(0, 20).join(", ");
  const tech = profil.motsTechnique.slice(0, 20).join(", ");
  return [
    "Tu lis UNE annonce d'emploi et tu dis quel rôle elle décrit, pour une personne qui vise un poste de coordination ou de",
    "gestion de projet à contenu technique.",
    "Les cinq rôles possibles :",
    "- combinaison : coordonne une équipe ou des projets ET le poste a un contenu technique réel ;",
    "- coordination : encadre ou gère, sans contenu technique ;",
    "- technique : travail technique sans encadrement ni titre de technicien ;",
    "- technicien : poste de technicien ou d'exécution, sans encadrement ;",
    "- horsSujet : ni l'un ni l'autre (vente, service, restauration, etc.).",
    `Exemples de vocabulaire de coordination : ${coord}.`,
    `Exemples de vocabulaire technique : ${tech}.`,
    "Réponds en appelant l'outil `rendre_lecture` : le rôle, une adéquation de 0 (aucun rapport) à 100 (exactement le poste",
    "visé), et une à trois raisons courtes tirées du TEXTE de l'annonce. Ne déduis rien qui n'y est pas écrit.",
  ].join("\n");
}

/** L'outil que le modèle appelle. Pas de `strict` : Zod valide déjà la sortie (ADR-0035). */
export const OUTIL_LECTURE = {
  name: "rendre_lecture",
  description: "Rend le rôle lu dans l'annonce, son adéquation au poste visé et les raisons.",
  input_schema: {
    type: "object" as const,
    properties: {
      role: { type: "string", enum: [...ROLES_LUS] },
      adequation: { type: "integer", minimum: 0, maximum: 100 },
      raisons: {
        type: "array",
        items: { type: "string", maxLength: RAISON_LONGUEUR_MAX },
        minItems: 1,
        maxItems: RAISONS_MAX,
      },
    },
    required: ["role", "adequation", "raisons"],
  },
};

/**
 * Valide la sortie du modèle et en fait une lecture à garder. PURE : `maintenant` est injecté.
 *
 * ⚠️ LES RAISONS PASSENT PAR `expurgerPII` AVANT D'ÊTRE GARDÉES (garde-fou n°1) : le texte lu l'a déjà été, mais le modèle
 * peut recopier un nom ou un numéro, et ce dépôt est public. Une raison réduite à rien par l'expurgation est retirée ; s'il
 * n'en reste aucune, la lecture est refusée.
 */
export function validerLecture(
  brut: unknown,
  contexte: { caracteresLus: number; maintenant: Date },
): { ok: true; lecture: LectureAnnonce } | { ok: false; raison: string } {
  const lu = LectureModeleSchema.safeParse(brut);
  if (!lu.success) {
    const premiere = lu.error.issues[0];
    return { ok: false, raison: `Réponse hors schéma : ${premiere?.path.join(".") || "racine"} (${premiere?.message ?? "invalide"}).` };
  }
  const raisons = lu.data.raisons
    .map((r) => expurgerPII(r).texte.replace(/\s+/g, " ").trim())
    .filter((r) => r !== "");
  if (raisons.length === 0) return { ok: false, raison: "Aucune raison utilisable après nettoyage." };
  return {
    ok: true,
    lecture: {
      ...lu.data,
      raisons,
      version: VERSION_LECTURE,
      modele: MODELE_LECTURE,
      luLe: contexte.maintenant.toISOString(),
      caracteresLus: contexte.caracteresLus,
    },
  };
}

/** Le relevé d'une offre lue : la lecture du modèle à côté du rôle que les mots-clés lisent dans le même texte. */
export interface MiseEnRegard {
  roleMotsCles: RoleLu;
  roleModele: RoleLu;
  /** Les deux disent le même rôle. */
  accord: boolean;
}

/** Les mots-clés lisent le titre et l'extrait, comme la note (`texteDeNotation`). PURE. */
export function mettreEnRegard(
  lecture: Pick<LectureAnnonce, "role">,
  offre: { poste: string; texte: string },
  profil: Profil,
): MiseEnRegard {
  const roleMotsCles = roleDe(offre.poste, offre.texte, profil);
  return { roleMotsCles, roleModele: lecture.role, accord: roleMotsCles === lecture.role };
}
