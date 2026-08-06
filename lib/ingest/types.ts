// lib/ingest/types.ts — le contrat commun à toutes les sources d'offres.
//
// `lib/ingest/` est le SEUL endroit de l'app autorisé à contacter une source d'offres
// (garde-fou n°4). Tout ce qui en sort est une `OffreBrute` : ce que la source a dit, sans
// interprétation. La note, la distance et le jugement viennent APRÈS, ailleurs.
//
// CE QU'ON INTERROGE, ET POURQUOI SEULEMENT ÇA
// Uniquement des flux et API que les sites PUBLIENT pour être consommés : le RSS du
// Guichet-Emplois, et les API d'ATS (Greenhouse, Lever, Recruitee…) que les entreprises
// exposent pour diffuser leurs propres postes. Jamais le HTML d'Indeed, LinkedIn, Jobboom
// ou Jobillico : leurs conditions l'interdisent, ils bloquent activement, et un moissonneur
// banni ne rapporte plus rien — en silence. Décision de Marc, 2026-07-30.
//
// LE `fetch` EST INJECTÉ, ET LE PARSING EST PUR
// Même raison que `lib/geocodage.ts`, en plus impérieux encore : la session qui a écrit ce
// code n'a AUCUN accès réseau (proxy fermé, vérifié). Sans séparation stricte entre
// « aller chercher » et « comprendre ce qu'on a reçu », rien ici ne serait vérifiable avant
// la production. Les analyseurs se testent donc sur des échantillons de format.

/** Une offre telle que la source l'a rendue. Aucun champ calculé, aucun jugement. */
export interface OffreBrute {
  /** Identifiant chez la source. Sert à fabriquer un id stable et à dédoublonner. */
  refSource: string;
  titre: string;
  entreprise: string;
  /** Ville telle qu'annoncée. Peut être vide : on ne devine pas. */
  ville: string;
  /**
   * Adresse civique du poste, VERBATIM de l'annonce. Vide si l'annonce n'en donne pas.
   *
   * ⚠️ JAMAIS RECONSTITUÉE. Une adresse tirée de la mémoire d'un modèle ou d'une fiche
   * entreprise est plausible et fausse — mesuré : la fiche Indeed d'AMETEK rend son siège
   * social de Pennsylvanie pour son usine de Lévis. Vide vaut mieux.
   */
  adresse?: string;
  /** URL publique de l'offre. Une offre sans lien n'est pas retenue. */
  lien: string;
  /** Texte de l'annonce, quand la source le donne. Sert à la note, jamais affiché brut. */
  description: string;
  /** Date de publication annoncée (AAAA-MM-JJ), ou null si la source n'en donne pas. */
  publieeLe: string | null;
}

/** Ce qu'une passe sur UNE source a donné. Un échec est dit, jamais confondu avec un vide. */
export type ResultatSource =
  | { ok: true; source: string; offres: OffreBrute[] }
  | { ok: false; source: string; erreur: string };

/**
 * Une source interrogeable.
 *
 * `id` sert au diagnostic et aux journaux : quand la veille ne ramène rien, il faut pouvoir
 * dire LAQUELLE des six sources est muette, sinon on ne débogue rien.
 */
export interface Source {
  id: string;
  /** Nom lisible, pour l'écran de diagnostic. */
  nom: string;
  interroger: (recuperer: Recuperateur) => Promise<ResultatSource>;
}

/** L'accès réseau, injecté. Rend le corps en texte, ou lève. */
export type Recuperateur = (url: string, entetes?: Record<string, string>) => Promise<string>;

/** Familles d'ATS dont l'API publique est documentée et stable. */
export const FAMILLES_ATS = [
  "greenhouse",
  "lever",
  "recruitee",
  "workable",
  "smartrecruiters",
] as const;
export type FamilleAts = (typeof FAMILLES_ATS)[number];

/**
 * Le rattachement d'une entreprise à son ATS.
 *
 * `jeton` est l'identifiant de l'entreprise CHEZ l'ATS (« robotiq » dans
 * `boards-api.greenhouse.io/v1/boards/robotiq/jobs`). Il ne se devine pas de façon fiable :
 * il se DÉCOUVRE en interrogeant, et ne s'inscrit que si la réponse est valide. Inscrire un
 * jeton supposé ferait échouer la source à chaque passe, sans qu'on sache pourquoi.
 */
export interface AtsEntreprise {
  entreprise: string;
  famille: FamilleAts;
  jeton: string;
}
