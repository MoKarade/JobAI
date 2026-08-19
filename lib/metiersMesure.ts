// lib/metiersMesure.ts — transformer la mesure du flux en tableau DÉCIDABLE. PURE.
//
// POURQUOI CE FICHIER EXISTE
// Choisir les métiers retenus est une décision de Marc, et jusqu'ici elle passait par moi :
// il fallait me demander de lancer le diagnostic, puis lire un JSON de plusieurs centaines
// de lignes. Un réglage qui exige une session Claude n'est pas un réglage.
//
// ⚠️ CE QUI REND UN CODE DÉCIDABLE N'EST PAS SON COMPTE, C'EST SON COMPTE AVEC DES TITRES.
// « 63200 : 123 offres » ne dit pas si ce métier concerne Marc — il faut connaître la norme
// par cœur. « 63200 : 123 offres — Cook, Kitchen helper, Chef de partie » se tranche d'un
// coup d'œil. C'est la règle déjà écrite pour les refus d'ingestion, appliquée à un choix :
// compter ne suffit pas, il faut NOMMER l'objet.
//
// ⚠️ ET UNE LECTURE PARTIELLE NE DÉCIDE RIEN. Si le flux s'est arrêté sur son budget ou son
// plafond, les comptes ne sont pas une mesure mais le DÉBUT d'une mesure — conclure dessus,
// c'est conclure sur un préfixe, la faute déjà payée trois fois en une journée. Le drapeau
// `concluante` existe pour que l'écran le dise au lieu de présenter un tableau qui a l'air
// complet.

/** Une classe de profession, avec de quoi la juger. */
export interface LigneMetier {
  /** Le code : deux chiffres (domaine + niveau) ou cinq (métier précis). */
  code: string;
  /** Offres RÉGIONALES portant ce code pendant la lecture. */
  offres: number;
  /** Titres réels rencontrés. C'est ce qui rend le code décidable. */
  titres: string[];
}

export interface MesureMetiers {
  /**
   * La lecture est-elle allée au bout du flux ?
   *
   * `false` ⇒ tous les comptes ci-dessous sont des PRÉFIXES. Ils se montrent quand même —
   * une mesure partielle vaut mieux que rien — mais jamais sans le dire.
   */
  concluante: boolean;
  /** Le motif d'arrêt, tel que le lecteur l'a rendu. Dit à l'écran. */
  fin: string;
  /** Offres régionales vues pendant la lecture. Le dénominateur du tableau. */
  regionales: number;
  /**
   * Groupé par DOMAINE + NIVEAU (deux chiffres). L'unité utile : « sciences et génie,
   * niveau universitaire » sans énumérer les quarante codes qui s'y rangent.
   */
  niveaux: LigneMetier[];
  /** Métiers précis (cinq chiffres). Pour les exceptions. */
  metiers: LigneMetier[];
}

/** Le compte d'une classe, tel que l'inventaire le rend. */
interface EntreeInventaire {
  distinctes?: unknown;
  top?: unknown;
}

function lignes(inventaire: unknown, exemples: unknown, cle: string): LigneMetier[] {
  const inv = (inventaire as Record<string, EntreeInventaire> | undefined)?.[cle];
  const top = Array.isArray(inv?.top) ? inv.top : [];
  const ex = (exemples as Record<string, Record<string, unknown>> | undefined)?.[cle] ?? {};

  const sorties: LigneMetier[] = [];
  for (const brut of top) {
    if (typeof brut !== "object" || brut === null) continue;
    const { nom, n } = brut as { nom?: unknown; n?: unknown };
    if (typeof nom !== "string" || typeof n !== "number" || !Number.isFinite(n)) continue;
    const titres = ex[nom];
    sorties.push({
      code: nom,
      offres: n,
      titres: Array.isArray(titres) ? titres.filter((t): t is string => typeof t === "string") : [],
    });
  }
  return sorties;
}

/**
 * Lit la réponse du diagnostic. `null` si elle n'est pas exploitable.
 *
 * ⚠️ `null` VEUT DIRE « JE N'AI PAS SU LIRE », jamais « le flux ne porte aucun métier ». Un
 * tableau vide rendu sur une réponse incompréhensible ferait croire à Marc qu'il n'y a rien
 * à retenir, et il conclurait que la source ne vaut rien.
 */
export function lireMesureMetiers(brut: unknown): MesureMetiers | null {
  if (typeof brut !== "object" || brut === null) return null;
  const r = brut as Record<string, unknown>;
  if (r.ok !== true) return null;
  if (typeof r.fin !== "string") return null;

  const niveaux = lignes(r.inventaireRetenues, r.exemplesRetenues, "noc2021-niveau");
  const metiers = lignes(r.inventaireRetenues, r.exemplesRetenues, "noc2021");
  // Aucune ligne des DEUX côtés : le rapport existe mais ne porte pas ce qu'on est venu
  // chercher. Le dire par `null` plutôt que d'afficher deux tableaux vides.
  if (niveaux.length === 0 && metiers.length === 0) return null;

  return {
    concluante: r.fin === "flux-termine",
    fin: r.fin,
    regionales: typeof r.retenues === "number" ? r.retenues : 0,
    niveaux,
    metiers,
  };
}
