// lib/mcp/lectureAnnonces.spec.ts — quelles annonces l'outil `lire_annonces` fait lire, et comment il rend le résultat.
//
// ⚠️ AUCUN IMPORT DU SDK MCP, AUCUN IMPORT DE LA BASE. Les fonctions d'ici reçoivent les offres et les lectures déjà lues :
// elles CHOISISSENT et MONTRENT, elles n'appellent rien (l'appel payant est injecté dans `serveur.ts`). Verrou :
// `tests/mcpSurface.test.ts`.
//
// ⚠️ LE LOT EST BORNÉ, parce que chaque lecture est un appel payant : un lot de `LIRE_MAX` annonces coûte de l'ordre de
// quelques millièmes de dollar (Haiku 5.5, ADR-0035). Un modèle qui boucle sur l'outil dépense donc lentement, et le bloc
// `usage` du hub le montre.

import { z } from "zod";
import { mettreEnRegard, type LectureAnnonce } from "../lectureAnnonce";
import { sanitizePromptText } from "../promptSafety";
import type { Profil } from "../profil";
import type { Offre } from "../types";

export const LIRE_MAX = 20;

export const LireAnnoncesSchema = z.object({
  /** Des offres précises à lire. Sans elles : les mieux notées qui n'ont pas encore été lues. */
  ids: z.array(z.string().min(1).max(200)).min(1).max(LIRE_MAX).optional(),
  /** Taille du lot quand aucun identifiant n'est donné. `.finite()` : `Infinity` traverserait un simple `.max()`. */
  limite: z.number().finite().int().min(1).max(LIRE_MAX).default(10),
  /** Relire une annonce déjà lue (payant). Sans effet sans `ids`. */
  relire: z.boolean().default(false),
});
export type LireAnnonces = z.infer<typeof LireAnnoncesSchema>;

export interface ChoixDeLecture {
  aLire: Offre[];
  dejaLues: Offre[];
  /** Offres demandées par identifiant qui n'ont aucun texte d'annonce gardé : rien à lire. */
  sansTexte: string[];
  introuvables: string[];
  /** Offres ouvertes avec un texte et sans lecture, AVANT la limite : ce qui reste à lire. */
  nonLues: number;
}

const aUnTexte = (o: Offre): boolean => (o.texteNote ?? "").trim() !== "";

/** Le choix des annonces à lire. PURE. */
export function choisirALire(
  offres: readonly Offre[],
  gardees: ReadonlyMap<string, LectureAnnonce>,
  demande: LireAnnonces,
): ChoixDeLecture {
  const ouvertes = offres.filter((o) => o.perimeeLe === null && !o.histo);
  const nonLues = ouvertes.filter((o) => aUnTexte(o) && !gardees.has(o.id)).length;

  if (demande.ids !== undefined) {
    const parId = new Map(offres.map((o) => [o.id, o]));
    const choix: ChoixDeLecture = { aLire: [], dejaLues: [], sansTexte: [], introuvables: [], nonLues };
    for (const id of new Set(demande.ids)) {
      const o = parId.get(id);
      if (o === undefined) choix.introuvables.push(id);
      else if (!aUnTexte(o)) choix.sansTexte.push(id);
      else if (gardees.has(id) && !demande.relire) choix.dejaLues.push(o);
      else choix.aLire.push(o);
    }
    return choix;
  }

  const aLire = ouvertes
    .filter((o) => aUnTexte(o) && !gardees.has(o.id))
    // Les mieux notées d'abord : ce sont elles qu'on veut comparer, et celles où une erreur de la note coûte le plus.
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.id < b.id ? -1 : 1))
    .slice(0, demande.limite);
  return { aLire, dejaLues: [], sansTexte: [], introuvables: [], nonLues };
}

/** Une offre lue, telle que Claude la voit. Les textes de tiers (intitulé, raisons) passent par `sanitizePromptText`. */
export function ligneLecture(offre: Offre, lecture: LectureAnnonce, profil: Profil) {
  const regard = mettreEnRegard(lecture, { poste: offre.poste, texte: offre.texteNote ?? "" }, profil);
  return {
    id: offre.id,
    poste: sanitizePromptText(offre.poste),
    scoreStocke: offre.score,
    roleMotsCles: regard.roleMotsCles,
    roleModele: regard.roleModele,
    accord: regard.accord,
    adequation: lecture.adequation,
    raisons: lecture.raisons.map(sanitizePromptText),
    luLe: lecture.luLe,
    caracteresLus: lecture.caracteresLus,
  };
}
