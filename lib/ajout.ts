// lib/ajout.ts — construction d'une offre saisie à la main.
//
// Tout ce qui suit est PUR : aucune I/O, aucune lecture d'horloge. La date du jour et
// l'identifiant sont des PARAMÈTRES — une fonction qui lit `Date.now()` ne se teste pas, et
// une fonction qui interroge la base pour vérifier l'unicité ne se teste pas non plus.
// L'action serveur (`lib/actions.ts`) fournit les deux et fait l'écriture.
//
// Deux choix assumés, écrits ici plutôt que devinés à la lecture :
//
//   1. La note est MANUELLE ou CALCULÉE, jamais un mélange. Si Marc entre une note, elle
//      fait foi (`scoreSource: "manuel"`). S'il n'en entre pas, `computeScore` la déduit des
//      champs structurés et elle est plafonnée à 85 — une note calculée ne doit jamais
//      passer devant une offre lue et vérifiée à la main. C'est le premier consommateur
//      réel de `scoreSource` : jusqu'ici la colonne n'était remplie que par le jeu de départ.
//
//   2. Le SALAIRE n'entre pas dans la note calculée. `salaireAffiche` est du texte libre
//      (« 40 $/h+ (~83 k$) », « 52 260 – 120 727 $ ») ; en tirer un annuel exige un parseur
//      dont les arbitrages — quelle extrémité d'une fourchette ? quel taux horaire annualisé ? —
//      changent la note d'une offre. C'est une modification de la logique de notation, donc
//      soumise au protocole de précision du CLAUDE.md §8 (ADR + tableau avant/après sur les
//      38 offres de référence). `scoreSalaire(null)` rend sa valeur NEUTRE, pas zéro : une
//      offre saisie à la main n'est ni avantagée ni pénalisée sur ce critère.

import { z } from "zod";
import { computeScore } from "./scoring";
import { OffreSchema, PrioriteSchema, type Offre } from "./types";

/**
 * Longueur maximale d'un identifiant. Doit rester alignée sur `OffreSchema.id` — un
 * test vérifie l'alignement, plutôt que de faire confiance à cette ligne.
 */
const MAX_ID = 80;

/**
 * Le fuseau de Marc. `America/Toronto` est la zone IANA canonique du Québec
 * (`America/Montreal` n'en est qu'un alias, absent de certaines distributions ICU réduites).
 */
export const FUSEAU = "America/Toronto";

/**
 * Réduit un texte à un fragment d'identifiant : minuscules, chiffres et tirets.
 *
 * Les ligatures sont traitées AVANT la décomposition Unicode : `œ` et `æ` ne se décomposent
 * pas en NFD, donc « Cœur » donnerait « c-ur » — un identifiant illisible et instable.
 */
export function slug(texte: string): string {
  return texte
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tronque sans laisser de tiret orphelin en fin de chaîne. */
function tronquer(texte: string, max: number): string {
  return texte.length <= max ? texte : texte.slice(0, max).replace(/-+$/, "");
}

/**
 * Un identifiant stable, lisible et libre.
 *
 * Il dérive de l'entreprise et du poste — comme ceux du jeu de départ — pour rester
 * diffable et reconnaissable dans une URL. En cas de collision (deux offres du même poste
 * chez le même employeur, ce qui arrive quand une offre est republiée), un suffixe
 * numérique est ajouté ; la base tranche en dernier ressort par sa clé primaire.
 */
export function identifiantPour(
  entreprise: string,
  poste: string,
  deja: ReadonlySet<string> = new Set(),
): string {
  // Un titre entièrement non-latin (« 現場監督 ») donnerait un slug vide : l'identifiant ne
  // doit jamais être une chaîne vide, que `OffreSchema` refuserait.
  const base = tronquer(slug(`${entreprise} ${poste}`), MAX_ID) || "offre";
  if (!deja.has(base)) return base;

  for (let n = 2; n <= 200; n += 1) {
    const suffixe = `-${n}`;
    const candidat = `${tronquer(base, MAX_ID - suffixe.length)}${suffixe}`;
    if (!deja.has(candidat)) return candidat;
  }
  // 200 offres du même poste chez le même employeur : ce n'est plus une collision, c'est un
  // bug. Lever est honnête ; boucler indéfiniment ou rendre un doublon ne le serait pas.
  throw new Error(`Impossible de former un identifiant libre à partir de « ${base} ».`);
}

/**
 * Ce que le formulaire envoie.
 *
 * Un champ laissé vide vaut `null` — jamais `0` ni `""` déguisé en valeur : une distance
 * inconnue et une distance nulle sont deux choses différentes, et le barème les traite
 * différemment (`scoreDistance(null)` est neutre, `scoreDistance(0)` est le maximum).
 */
export const NouvelleOffreSchema = z.object({
  entreprise: z.string().trim().min(1, "L’entreprise est obligatoire.").max(120),
  poste: z.string().trim().min(1, "Le poste est obligatoire.").max(200),
  lien: z
    .string()
    .trim()
    .url("Lien invalide — une adresse complète, https://…")
    .or(z.literal(""))
    .default(""),
  // 500 km : très au-delà du rayon de 50 km, mais une saisie doit pouvoir être aberrante
  // et rejetée honnêtement plutôt que silencieusement acceptée à 4 chiffres.
  km: z.number().finite().min(0).max(500, "Distance invraisemblable.").nullable().default(null),
  /**
   * Ville de l'employeur. Facultative, mais c'est elle qui rend l'offre SITUABLE.
   *
   * Sans elle, une offre saisie à la main pour un employeur absent des entreprises cibles
   * ne peut pas être géocodée — « ISS » seul est une recherche mondiale — et reste donc
   * sans distance et hors de la carte, à vie. Le formulaire ne la demandait pas ; l'offre
   * partait avec `ville: null` et personne ne pouvait plus la corriger, `ville` n'étant
   * pas non plus un champ modifiable. C'était un cul-de-sac silencieux.
   */
  ville: z.string().trim().max(120).nullable().default(null),
  salaireAffiche: z.string().trim().max(80).nullable().default(null),
  priorite: PrioriteSchema.default("Moyenne"),
  /** Note vérifiée à la main. `null` = « calcule-la pour moi ». */
  note: z
    .number()
    .int("La note est un entier.")
    .min(0)
    .max(100, "La note va de 0 à 100.")
    .nullable()
    .default(null),
  userNote: z.string().trim().max(2000).default(""),
});
export type NouvelleOffre = z.infer<typeof NouvelleOffreSchema>;

/**
 * Assemble l'offre complète à partir de la saisie.
 *
 * Le résultat repasse par `OffreSchema` : il est donc IMPOSSIBLE que cette fonction rende
 * une offre hors contrat (identifiant mal formé, note hors bornes). C'est la même frontière
 * que pour une réponse de LLM — la validation ne se fait pas confiance à elle-même.
 */
export function construireOffre(
  saisie: NouvelleOffre,
  contexte: { id: string; aujourdhui: string },
): Offre {
  const manuelle = saisie.note !== null;

  return OffreSchema.parse({
    id: contexte.id,
    source: "user",
    dateReperage: contexte.aujourdhui,
    entreprise: saisie.entreprise,
    poste: saisie.poste,
    lien: saisie.lien,
    km: saisie.km,
    // Une chaîne vide vaut « pas de ville » : le géocodage ne doit pas recevoir « » à
    // chercher, et la carte doit pouvoir dire honnêtement « pas de lieu annoncé ».
    ville: saisie.ville === null || saisie.ville === "" ? null : saisie.ville,
    salaireAffiche: saisie.salaireAffiche,
    priorite: saisie.priorite,
    // Une offre qu'on vient de repérer n'a rien d'envoyé : le statut initial n'est pas un
    // choix du formulaire, il est déduit du fait même de l'ajout.
    statut: "Identifiee",
    dateEnvoi: "",
    score: saisie.note ?? computeScore({ titre: saisie.poste, km: saisie.km }).total,
    scoreSource: manuelle ? "manuel" : "calcule",
    // Aucune justification : elle viendrait d'une lecture de l'annonce, que personne n'a
    // faite ici. En fabriquer une depuis le barème donnerait à un calcul l'apparence d'une
    // analyse. La provenance de la note est affichée, c'est ce qui est vrai.
    raisons: [],
    notes: "",
    userNote: saisie.userNote,
    histo: false,
    perimeeLe: null,
  });
}

/**
 * Le jour courant CHEZ MARC, au format AAAA-MM-JJ.
 *
 * ⚠️ Surtout pas `toISOString().slice(0, 10)` : c'est de l'UTC. Le serveur Vercel tourne en
 * UTC et Marc est à UTC−4 — toute offre ajoutée après 20 h locale serait datée du LENDEMAIN.
 * `en-CA` rend précisément `AAAA-MM-JJ`, ce qui évite de recomposer la date à la main.
 *
 * L'instant reste un paramètre : c'est ce qui permet de tester le passage de minuit.
 */
export function aujourdhui(maintenant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maintenant);
}
