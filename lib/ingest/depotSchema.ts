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
import { estDansLaRegion, normaliserLieu } from "./region";

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
  /**
   * D'OÙ vient cette adresse. C'est la question la plus importante du champ précédent.
   *
   * `annonce` = recopiée du texte de l'offre. L'employeur écrit lui-même où est le poste :
   * c'est la source la plus fiable qui existe pour cette question.
   *
   * `recherche` = trouvée par une recherche web, parce que l'annonce n'en donnait pas.
   * ⚠️ C'est la source la plus RISQUÉE du projet, et elle doit être traitée comme telle :
   * une recherche « adresse AMETEK » rend le siège social de Pennsylvanie pour une usine de
   * Lévis. Elle n'est acceptée qu'accompagnée de son `adresseUrl`, et seulement si sa ville
   * concorde avec celle que l'offre annonce (`villeCoherente`).
   */
  adresseSource: z.enum(["annonce", "recherche"]).nullable().default(null),
  /**
   * La page où l'adresse a été trouvée, quand elle vient d'une recherche.
   *
   * ⚠️ EXIGÉE, ET PAS POUR LA FORME. Une adresse sans provenance est invérifiable : ni Marc
   * ni une session future ne peuvent la contrôler, et elle prend pourtant l'autorité d'un
   * fait mesuré. L'URL rend la trouvaille RELISABLE — c'est la seule chose qui distingue
   * une recherche d'une invention.
   */
  adresseUrl: LienOffre.nullable().default(null),
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

/**
 * L'adresse et la ville annoncée parlent-elles du même endroit ?
 *
 * ⚠️ C'EST LA GARDE QUI REND LA RECHERCHE WEB ACCEPTABLE. Sans elle, « trouve l'adresse de
 * X » rend le siège social, le bureau de Montréal, ou l'établissement d'une homonyme —
 * toutes plausibles, toutes fausses, et toutes indiscernables d'une bonne réponse une fois
 * écrites en base. L'offre, elle, DIT dans quelle ville est le poste : c'est un fait
 * indépendant, venu d'une autre source, et deux faits indépendants qui concordent valent
 * infiniment mieux qu'un seul qui affirme.
 *
 * ⚠️ ELLE ACCEPTE LES ARRONDISSEMENTS DEPUIS LE 2026-08-12, et ce paragraphe disait le
 * contraire jusque-là : « Sainte-Foy pour une offre annoncée à Québec sera rejetée ». C'était
 * vrai, et c'était le défaut — Sainte-Foy EST Québec, à sept kilomètres du centre, et on
 * perdait ainsi les adresses mêmes qu'on cherchait. Le second volet de la garde consulte
 * maintenant le référentiel des municipalités de la région (voir le corps de la fonction).
 *
 * Ce qui n'a PAS changé : elle refuse plutôt qu'elle ne devine. Ne pas prendre une bonne
 * adresse fait perdre une épingle ; en prendre une mauvaise envoie Marc à la mauvaise porte.
 * Les deux erreurs ne se valent pas, et l'élargissement ne tient que parce que le géocodeur
 * reste l'arbitre final par la DISTANCE.
 *
 * Sans ville annoncée, il n'y a RIEN à vérifier — donc on refuse. Une adresse invérifiable
 * n'est pas une adresse prudente, c'est une adresse dont on ignore si elle est bonne.
 */
export function villeCoherente(adresse: string, villeAnnoncee: string): boolean {
  const ville = normaliserLieu(villeAnnoncee);
  if (ville === "" || !adresseUtilisable(adresse)) return false;

  // 1. L'adresse nomme la ville annoncée. Cas nominal, inchangé.
  if (normaliserLieu(adresse).includes(ville)) return true;

  // 2. ⚠️ SINON, ELLE DOIT NOMMER UNE MUNICIPALITÉ DE LA RÉGION — élargissement du
  //    2026-08-12 (`[LIEU-06]`, ADR-0005).
  //
  //    La règle « le nom de la ville doit apparaître dans l'adresse » rejetait les
  //    ARRONDISSEMENTS. Exemple mesuré : « 1234 rue de Marly, Sainte-Foy » pour une annonce
  //    à « Québec » était refusée, alors que Sainte-Foy EST Québec, à sept kilomètres du
  //    centre. Idem Beauport et Charlesbourg. On perdait exactement les adresses qu'on
  //    cherchait, et le motif du refus ressemblait à de la prudence.
  //
  //    `situer` est le bon arbitre parce qu'il teste HORS_PORTEE **avant** d'accepter :
  //    l'exemple « 100 rue Sainte-Catherine, Montréal, QC » contient « Québec » (la province)
  //    et reste pourtant rejeté. Une garde écrite à la main ici aurait raté ce piège — et
  //    surtout elle aurait dupliqué un référentiel que le filtre régional tient déjà. Une
  //    seule liste de municipalités, deux consommateurs.
  //
  //    ⚠️ CETTE GARDE N'EST QU'UN PRÉ-FILTRE, et c'est ce qui rend l'élargissement sûr :
  //    l'arbitre FINAL est le géocodeur, qui rejette toute résolution à plus de
  //    `RAYON_VALIDATION_KM` (30 km) du centre de la ville annoncée et retombe alors sur ce
  //    centre SANS conserver l'adresse. Le rôle d'ici est d'éviter une requête inutile, pas
  //    de trancher la vérité géographique — c'est une question de distance, pas de chaînes.
  return estDansLaRegion(adresse);
}
