// lib/ingest/depotSchema.ts — ce qu'un déposant a le droit d'envoyer. UNE SEULE FOIS.
//
// POURQUOI CE FICHIER EXISTE
// Deux canaux déposent des offres : `POST /api/ingest/depot` (la Routine claude.ai) et
// `data/depot/*.json` (une session qui a le connecteur Indeed mais pas d'accès réseau vers
// l'app). Ils portent EXACTEMENT le même contenu. Écrit deux fois, ce schéma aurait dérivé
// — et c'est le canal le moins relu qui aurait gardé la version la plus permissive.
//
// VOLONTAIREMENT PAUVRE : ni note, ni priorité, ni statut. Ce sont des JUGEMENTS, et ils
// appartiennent à `trier()` et à Marc. Zod retire les clés inconnues au parse : un déposant
// ne peut donc pas se fabriquer une place en tête de liste, même en l'écrivant dans le lot.

import { z } from "zod";

/**
 * Un lien d'offre — et il doit être en http(s).
 *
 * ⚠️ `z.string().url()` NE SUFFIT PAS, et c'est ce qu'un test a montré : il s'appuie sur
 * `new URL()`, qui accepte parfaitement `javascript:alert(1)` et `data:…`. Le lien finit en
 * `href` à l'écran ; le rendu se défend déjà de son côté (`lienSur`, même règle que le hub),
 * mais laisser entrer en base une URL qu'on n'affichera jamais n'a aucun intérêt — et la
 * prochaine surface qui lira ce champ n'aura pas forcément la même prudence. On refuse à
 * l'entrée, là où c'est vrai une fois pour toutes.
 */
export const LienOffre = z
  .string()
  .max(500)
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "lien invalide : http(s) uniquement" },
  );

/** Une offre telle qu'un déposant peut la décrire. */
export const OffreDeposeeSchema = z.object({
  titre: z.string().min(1).max(200),
  entreprise: z.string().max(120).default(""),
  ville: z.string().max(120).default(""),
  /**
   * L'adresse civique du poste, VERBATIM de l'annonce. Vide si l'annonce n'en donne pas.
   *
   * Pas de validation forte ici — c'est `adresseUtilisable` qui juge la FORME, et le
   * géocodeur qui tranche pour de bon (il exige déjà un numéro civique ET une voie, sans
   * quoi Nominatim remonte la municipalité, laquelle passerait pour une adresse exacte).
   */
  adresse: z.string().max(200).default(""),
  lien: LienOffre,
  description: z.string().max(20_000).default(""),
  publieeLe: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  refSource: z.string().max(200).default(""),
});

/** Un lot complet : d'où il vient, de quel jour il date, ce qu'il porte. */
export const LotDeposeSchema = z.object({
  /** D'où vient ce lot. Tracé, jamais interprété. */
  source: z.string().min(1).max(60),
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // 300 : le plafond que portait déjà la route HTTP. Le partage d'un schéma ne doit
  // jamais être l'occasion d'un assouplissement discret — c'est la valeur la plus SERRÉE
  // des deux qui gagne, sinon consolider revient à relâcher.
  offres: z.array(OffreDeposeeSchema).max(300),
});

export type LotDepose = z.infer<typeof LotDeposeSchema>;

/**
 * Cette adresse d'annonce vaut-elle la peine d'être retenue ?
 *
 * PURE, et volontairement GROSSIÈRE : le vrai juge est le géocodeur, qui exige déjà un
 * numéro civique ET une voie avant d'accepter de déplacer une épingle. Ce filtre-ci écarte
 * seulement ce qui n'a aucune chance — « En présentiel », « Télétravail », « Québec » seul —
 * pour ne pas envoyer à Nominatim des requêtes dont on sait qu'elles rendront la
 * municipalité, laquelle passerait ensuite pour une adresse exacte.
 *
 * Trois conditions, et elles se justifient chacune :
 *   · un CHIFFRE, parce qu'une adresse civique en porte toujours un ;
 *   · des LETTRES, parce qu'un code postal ou un numéro seul ne situe rien ;
 *   · une longueur plancher, parce que « 8 » n'est pas une adresse.
 */
export function adresseUtilisable(brut: string): boolean {
  const t = brut.trim();
  if (t.length < 8 || t.length > 200) return false;
  if (!/\d/.test(t)) return false;
  // Au moins trois lettres consécutives : un nom de voie, pas « 12 A ».
  return /\p{L}{3}/u.test(t);
}
