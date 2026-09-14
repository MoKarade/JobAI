// lib/fraicheurVeille.ts — ce que le hub peut dire du RYTHME de la veille, et rien de plus.
//
// ── LE TROU QUE ÇA BOUCHE ───────────────────────────────────────────────────────────
//
// JobAI ne publiait AUCUN `dataAsOf`. Le hub pouvait donc afficher ses chiffres, jamais
// dire depuis quand ils sont vrais — et encore moins qu'ils ont cessé de bouger. C'est
// exactement la panne du 12 au 14 août 2026 : le cron `/api/cron/veille` est resté absent
// des journaux TROIS JOURS pendant que celui de géocodage tournait (cf. `CLE_VEILLE`).
// Le suivi affichait ses compteurs de la veille, inchangés, avec l'aplomb d'une mesure.
//
// ── LA SOURCE : LA FIN D'UNE PASSE RÉUSSIE, JAMAIS SON DÉBUT ────────────────────────
//
// On lit `CLE_RAPPORT`, écrit à la FIN d'une passe complète. Deux candidats plus évidents
// ont été écartés, chacun pour une raison :
//
//   - `sync_state["veille-auto"].majLe` — c'est le jeton de RÉSERVATION (`reserverPasse`),
//     posé AVANT le travail. Une passe qui démarre puis échoue l'avance quand même : le hub
//     annoncerait une donnée fraîche que personne n'a produite. Une fraîcheur qui ne prouve
//     que la tentative est pire qu'aucune fraîcheur, parce qu'on la croit.
//   - `CLE_HISTORIQUE` — il porte bien un `fini`, mais son écriture a son PROPRE try/catch
//     (une trace ne doit pas casser une passe) : il peut rester en arrière d'une passe qui,
//     elle, a réussi. Ses nombres restent la bonne source pour la tendance ; pas pour dire
//     l'âge du suivi.
//
// ── CE QUI SORT D'ICI EST DU NOMBRE, ET C'EST STRUCTUREL ────────────────────────────
//
// Dépôt PUBLIC, garde-fou n°1 : aucune donnée personnelle. Les sections de détail publiées
// ici ne portent que des COMPTES et une date — jamais un employeur, un poste, une ville.
// Le rapport, lui, contient `meilleure.entreprise` : il n'est pas republié tel quel, on en
// extrait champ par champ. C'est la même discipline que `lib/historiqueVeille.ts` (« des
// nombres, pas des offres ») : ce qui n'y est pas ne peut pas fuir.

import type { HubAlert, HubDetailSection, HubSummary } from "@mokarade/hub-contract";
import { lireEtatBrut } from "./etat";
import { CLE_RAPPORT } from "./rapportVeille";

/**
 * Cadence du cron de veille, en heures — `"0 11 * * *"` dans `vercel.json`, donc QUOTIDIEN.
 *
 * ⚠️ Deux sources pour un seul fait, faute de pouvoir importer le cron à l'exécution. Un test
 * lit `vercel.json` et refuse la divergence : changer le planning sans toucher cette constante
 * publierait un seuil de fraîcheur faux — et un seuil faux est exactement ce qu'on répare ici.
 */
export const CADENCE_VEILLE_HEURES = 24;

/**
 * Marge au-dessus de la cadence, avant de déclarer la donnée en retard.
 *
 * Six heures, et le choix se juge aux deux erreurs qu'il évite. À la cadence NUE (24 h), le
 * moindre décalage du planificateur Vercel ferait crier « donnée figée » chaque jour — et une
 * alerte permanente n'est plus une alerte. Au double (48 h), la panne du 12-14 août serait
 * passée inaperçue un jour de plus. Six heures laissent glisser un retard et attrapent une
 * journée MANQUÉE, qui est le mode de panne réellement observé.
 */
export const MARGE_VEILLE_HEURES = 6;

/** Âge maximal attendu du suivi, publié au hub (`expectedMaxAgeSec`, contrat v1.3). */
export const AGE_MAX_VEILLE_SEC = (CADENCE_VEILLE_HEURES + MARGE_VEILLE_HEURES) * 3600;

/** Ce que la dernière passe permet de dire — ou la raison nommée de ne rien dire. */
export type VeillePubliee =
  | {
    etat: "connue";
    /** Instant de FIN de la passe, ISO. C'est lui qui devient `dataAsOf`. */
    finiLe: string;
    /** Ce qui a lancé la passe (`cron-veille`, `bouton-app`…) — le premier diagnostic. */
    declencheur: string;
    trouvees: number;
    nouvelles: number;
    perimees: number;
    revenues: number;
    /** Trouvées moins tout ce qu'on sait expliquer. DOIT valoir 0 — c'est tout son intérêt. */
    sansMotif: number;
  }
  /** Aucune passe enregistrée : l'app tourne, la veille n'a jamais abouti. Pas une panne. */
  | { etat: "jamais" }
  /** L'état existe et ne se lit pas. On le DIT, au lieu de publier un âge inventé. */
  | { etat: "illisible" };

/** Nombre fini ≥ 0, ou 0. Un compteur négatif est une corruption, pas une mesure. */
function compte(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}

/**
 * Lit le rapport BRUT de l'état. PURE — l'I/O est dans `chargerVeillePubliee`.
 *
 * `finiLe` est le seul champ dont l'absence disqualifie tout : sans lui il n'y a pas de
 * fraîcheur à publier, et republier les compteurs d'une passe dont on ignore la date les
 * ferait passer pour ceux d'à l'instant. Les compteurs, eux, retombent à 0 individuellement
 * — même tolérance par champ que `lireHistorique`.
 */
export function lireVeillePubliee(brut: string | null): VeillePubliee {
  if (brut === null) return { etat: "jamais" };
  let o: unknown;
  try {
    o = JSON.parse(brut);
  } catch {
    return { etat: "illisible" };
  }
  if (typeof o !== "object" || o === null) return { etat: "illisible" };
  const r = o as Record<string, unknown>;
  const fini = typeof r.fini === "string" ? r.fini : "";
  if (fini === "" || Number.isNaN(Date.parse(fini))) return { etat: "illisible" };
  return {
    etat: "connue",
    finiLe: new Date(fini).toISOString(),
    declencheur: typeof r.declencheur === "string" ? r.declencheur.slice(0, 40) : "inconnu",
    trouvees: compte(r.trouvees),
    nouvelles: compte(r.nouvelles),
    perimees: compte(r.perimees),
    revenues: compte(r.revenues),
    sansMotif: compte(r.sansMotif),
  };
}

/**
 * Le seul point IMPUR, et il NE JETTE JAMAIS.
 *
 * La route du hub convertit toute exception en `status: "error"` (ADR-0001). Ce serait juste
 * pour une panne du suivi ; ce serait faux ici — ne pas savoir DEPUIS QUAND les chiffres sont
 * vrais n'empêche pas de les publier. L'échec se dégrade donc en « illisible », qui est une
 * réponse, et une alerte le dit.
 */
export async function chargerVeillePubliee(): Promise<VeillePubliee> {
  if (!process.env.DATABASE_URL) return { etat: "jamais" };
  try {
    return lireVeillePubliee(await lireEtatBrut(CLE_RAPPORT));
  } catch (err) {
    console.error("[hub/summary] fraîcheur de la veille illisible", err);
    return { etat: "illisible" };
  }
}

/**
 * `dataAsOf` + `expectedMaxAgeSec`, ou RIEN. PURE.
 *
 * ⚠️ LES DEUX ENSEMBLE OU AUCUN DES DEUX — le contrat v1.3 rejette un âge attendu sans
 * horodatage à comparer, et il a raison : un seuil orphelin donnerait au producteur la
 * certitude d'être surveillé alors que rien ne le serait. C'est un objet unique, et pas deux
 * champs voisins, précisément pour qu'on ne puisse pas en publier un seul par distraction.
 */
export function blocFraicheur(
  v: VeillePubliee,
): Pick<HubSummary, "dataAsOf" | "expectedMaxAgeSec"> | Record<string, never> {
  if (v.etat !== "connue") return {};
  return { dataAsOf: v.finiLe, expectedMaxAgeSec: AGE_MAX_VEILLE_SEC };
}

/** Le contrat borne les libellés à 40 et les précisions à 80 — on tronque plutôt qu'être rejeté. */
function borne(texte: string, max: number): string {
  const t = texte.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * La dernière passe, en chiffres. PURE. `null` quand il n'y a pas de passe à raconter.
 *
 * « Inexpliquées » est la ligne qui justifie la section. Le rapport la calcule comme
 * « trouvées moins tout ce qu'on sait expliquer », et son commentaire d'origine dit tout :
 * ce nombre DOIT valoir zéro. Le 17 août, l'app affichait « 100 trouvées · 0 nouvelle · 26
 * déjà connues » — soixante-quatorze offres disparues sans qu'aucun écran ne le dise.
 * `severity: "warn"` dès qu'il dépasse 0 ; rien sinon, parce qu'un zéro sain n'est pas un
 * état à signaler.
 */
export function sectionVeille(v: VeillePubliee): HubDetailSection | null {
  if (v.etat !== "connue") return null;
  return {
    title: "Dernière passe de veille",
    items: [
      { label: "Offres vues", value: v.trouvees, format: "number", hint: borne(`passe ${v.declencheur}`, 80) },
      { label: "Retenues", value: v.nouvelles, format: "number" },
      { label: "Périmées", value: v.perimees, format: "number" },
      { label: "Revenues", value: v.revenues, format: "number" },
      {
        label: "Inexpliquées",
        value: v.sansMotif,
        format: "number",
        ...(v.sansMotif > 0 ? { severity: "warn" as const } : {}),
        hint: "vues, ni retenues ni refusées — devrait valoir 0",
      },
    ],
  };
}

/**
 * Ce que l'absence de fraîcheur oblige à dire. PURE.
 *
 * Les deux cas ne se confondent pas, et c'est tout l'objet de ce module : « jamais » dit que
 * la veille n'a pas encore abouti (l'app va bien), « illisible » dit que l'état est là et ne
 * se lit pas (quelque chose à regarder). Les fondre en un seul message rendrait le premier
 * inquiétant et le second banal.
 */
export function alertesVeille(v: VeillePubliee): HubAlert[] {
  if (v.etat === "illisible") {
    return [{ label: "Fraîcheur de la veille illisible", severity: "warn" }];
  }
  if (v.etat === "jamais") {
    return [{ label: "Aucune passe de veille enregistrée", severity: "info" }];
  }
  return [];
}
