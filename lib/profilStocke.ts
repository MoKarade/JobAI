// lib/profilStocke.ts — relire un profil écrit AVANT que le barème ne grandisse.
//
// ── LA PANNE, MESURÉE ────────────────────────────────────────────────────────────────
//
// Journaux Vercel du 2026-09-14, page `/references` : le profil enregistré ne passe plus
// `ProfilSchema`. Quatre champs manquent — `ponderation.conditions`, `pointsConditions`,
// `facteurHorsDomaine`, `termesParJour` —, tous ajoutés au MÊME commit (ADR-0014 D2). Le
// document n'est donc pas corrompu : il a été validé AVANT que ces champs n'existent, et
// rien ne l'a jamais relu depuis.
//
// Conséquences constatées, et elles ne se voient pas d'elles-mêmes :
//   · `/profil` et `/references` affichent le barème et le SWOT DU CODE, pas ceux tirés du
//     CV de Marc ;
//   · `validerProfil` (`lib/cv/actions.ts`) REFUSE — Marc ne peut plus valider un nouveau
//     CV du tout, avec un message qui dit « illisible » sans dire pourquoi.
//
// ⚠️ CE QUI N'EST PAS TOUCHÉ, et il fallait le vérifier avant de crier au feu : la NOTATION
// n'utilise pas ce document. `lib/scoring.ts` prend `PROFIL_DEFAUT` par défaut, et le rayon
// comme les métiers vivent dans leurs propres lignes d'état (`CLE_RAYON`, `CLE_METIERS`),
// pas dans le profil. Les notes de Marc n'ont donc jamais été calculées avec un barème
// fantôme — c'est sa FICHE, pas son classement, qui était tombée.
//
// ── POURQUOI ON MIGRE, ET POURQUOI ON N'ASSOUPLIT PAS ────────────────────────────────
//
// Rendre les quatre champs optionnels dans `ProfilSchema` aurait réparé l'écran en une
// ligne — et fait de CHAQUE ajout futur une dérive silencieuse : un document qui n'a jamais
// entendu parler d'un réglage se relirait sans un mot, et personne ne saurait plus lesquels
// de ses réglages sont les siens. La stricture du schéma est la ceinture qui SIGNALE ; on
// répare le document, jamais la garde qui alerte.
//
// ⚠️ ET LA LISTE DES CHAMPS À COMBLER SE DÉRIVE DU DÉFAUT, elle ne s'écrit pas à la main.
// Une liste écrite à la main est fausse au chantier suivant — ce dépôt l'a payé cinq fois
// (quatre listes de colonnes d'insertion, l'empreinte du seed, la liste des tables du script
// de migration). Ici, le remède est structurel : on comble ce que `PROFIL_DEFAUT` a et que
// le document n'a pas, récursivement. Le prochain champ ajouté au barème est couvert le jour
// où il entre dans le défaut, sans que personne n'y pense.
//
// ── CE QUE LA MIGRATION NE FAIT PAS ──────────────────────────────────────────────────
//
// Elle n'écrase JAMAIS une valeur présente : un réglage que Marc a choisi reste le sien,
// même s'il diffère du défaut. Elle ne répare pas non plus une valeur présente mais FAUSSE
// (mauvais type, hors bornes) — ça, c'est de la corruption, et le schéma doit continuer de
// la refuser. « Ce champ n'existait pas encore » et « ce champ est cassé » sont deux
// situations opposées, et les confondre ferait passer la seconde pour la première.
//
// ── ET ELLE NE RÉÉCRIT PAS LA BASE ───────────────────────────────────────────────────
//
// Migrer à la LECTURE, pas à l'écriture : un chemin de lecture qui écrit se met à courir
// contre les vraies écritures, et une page consultée deux fois en parallèle écrirait deux
// fois. Ce n'est pas nécessaire ici parce que la dérive se soigne d'elle-même : la prochaine
// validation de CV part du profil MIGRÉ (`appliquerEcarts`) et persiste la forme complète.

import { PROFIL_DEFAUT, ProfilSchema, type Profil } from "./profil";

/** Un objet simple — ni tableau, ni null, ni instance. */
function estObjetSimple(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Copie profonde d'une valeur du défaut, pour ne jamais partager une référence. */
function copier<T>(v: T): T {
  return structuredClone(v);
}

export interface MigrationProfil {
  /** Le document, complété. Toujours un objet — même entrée inexploitable rendue telle quelle. */
  document: unknown;
  /**
   * Les chemins comblés, en notation pointée (`ponderation.conditions`), triés.
   *
   * ⚠️ RENDUS, PAS SEULEMENT COMPTÉS. « 4 champs comblés » ne se vérifie pas : ça ne dit pas
   * si la migration a rattrapé un ajout légitime ou si elle vient d'écraser la moitié du
   * barème de Marc par des valeurs qu'il n'a pas choisies. Même exigence que les refus
   * d'ingestion et les fermetures d'office : un traitement automatique nomme son objet.
   */
  combles: string[];
}

/**
 * Comble ce que le défaut a et que le document n'a pas. PURE.
 *
 * Récursive dans les objets simples SEULEMENT. Un tableau présent est gardé tel quel — on ne
 * fusionne jamais élément par élément : les paliers de distance de Marc sont les siens, et
 * y injecter les échelons du défaut fabriquerait un barème que personne n'a écrit.
 */
export function migrerProfil(
  stocke: unknown,
  defaut: Readonly<Record<string, unknown>> = PROFIL_DEFAUT as unknown as Record<string, unknown>,
): MigrationProfil {
  const combles: string[] = [];
  if (!estObjetSimple(stocke)) {
    // Ni objet, ni rien à combler : le schéma refusera, et il aura raison. On ne fabrique
    // pas un profil complet à partir de rien — ce serait rendre le défaut sous l'apparence
    // d'un profil validé.
    return { document: stocke, combles };
  }
  return { document: combler(stocke, defaut, "", combles), combles };
}

function combler(
  doc: Record<string, unknown>,
  defaut: Readonly<Record<string, unknown>>,
  prefixe: string,
  combles: string[],
): Record<string, unknown> {
  const sortie: Record<string, unknown> = { ...doc };
  for (const [cle, valeurDefaut] of Object.entries(defaut)) {
    const chemin = prefixe === "" ? cle : `${prefixe}.${cle}`;
    const presente = Object.prototype.hasOwnProperty.call(doc, cle) && doc[cle] !== undefined;

    if (!presente) {
      sortie[cle] = copier(valeurDefaut);
      combles.push(chemin);
      continue;
    }

    // Présente ET les deux côtés sont des objets simples : on descend, pour attraper un
    // champ ajouté DANS un objet existant (`ponderation.conditions`, le cas réel).
    const valeur = doc[cle];
    if (estObjetSimple(valeur) && estObjetSimple(valeurDefaut)) {
      sortie[cle] = combler(valeur, valeurDefaut, chemin, combles);
    }
    // Sinon on ne touche à rien : une valeur présente est la sienne, y compris quand elle
    // est fausse — c'est au schéma de la refuser, pas à la migration de la maquiller.
  }
  return sortie;
}

/**
 * Relit un profil persisté : migration puis schéma STRICT. PURE.
 *
 * ⚠️ UN SEUL POINT DE LECTURE POUR TOUS LES CONSOMMATEURS. Deux parses écrits séparément —
 * `profilActif` d'un côté, `profilCourantOuDefaut` de l'autre — auraient fini par migrer
 * l'un et pas l'autre : la fiche se serait affichée pendant que la validation refusait, ou
 * l'inverse. Ce dépôt a déjà payé exactement cette divergence sur la classification des
 * pannes de base de données.
 *
 * Lève sur tout ce que la migration ne couvre pas : JSON illisible, document qui n'est pas
 * un objet, valeur présente mais invalide. C'est voulu — retomber sur le défaut ferait
 * changer une fiche en silence, avec un écran qui aurait l'air normal.
 */
export function parserProfilStocke(json: string): { profil: Profil; combles: string[] } {
  const { document, combles } = migrerProfil(JSON.parse(json));
  const analyse = ProfilSchema.safeParse(document);
  if (!analyse.success) {
    const premier = analyse.error.issues[0];
    const ou = premier?.path.join(".") ?? "?";
    throw new Error(
      `Profil enregistré illisible : ${premier?.message ?? "?"} (${ou}). ` +
        `${combles.length} champ${combles.length > 1 ? "s" : ""} comblé${combles.length > 1 ? "s" : ""} depuis le défaut avant ce refus.`,
    );
  }
  return { profil: analyse.data, combles };
}
