// lib/ingest/sourceGuichetFlux.ts — le flux XML complet du Guichet, comme source de veille.
//
// POURQUOI CETTE SOURCE EXISTE À CÔTÉ DES RECHERCHES RSS
// `sources.ts` interroge le RSS du Guichet avec une poignée de mots-clés français. C'est
// précis et pauvre : ce qui n'est pas dans la liste de mots n'existe pas. Le flux XML complet
// publie TOUT le Guichet — ~67 000 offres, tout le Canada — avec un `noc2021` sur chacune.
// Trier par ce code au lieu de mots-clés, c'est trier sur un classement NORMALISÉ : ça marche
// sur les annonces anglophones sans traduire le vocabulaire du barème (ADR-0012).
//
// C'est la source qui permet à la veille de l'app de remplacer la Routine quotidienne, et
// c'est la raison pour laquelle elle est écrite : rendre Marc autonome, pas ajouter un flux.
//
// ⚠️ ELLE N'EST INTERROGÉE QUE SI MARC A CHOISI DES MÉTIERS. Liste vide ⇒ la source n'est pas
// construite du tout (`selectionnerSources`). Sans ce garde, allumer ce fichier ferait entrer
// des milliers d'offres au premier cron — personne ne l'aurait demandé, et le suivi serait
// noyé avant qu'on ait le temps de le remarquer.
//
// ⚠️ ELLE IGNORE LE `Recuperateur` QU'ON LUI PASSE, ET C'EST DÉLIBÉRÉ. Le contrat `Source`
// injecte un accès réseau qui rend le corps EN TEXTE : appliqué ici, il chargerait 130 Mo
// dans une chaîne — exactement ce que `guichetFlux.ts` existe pour ne pas faire. Le `fetch`
// brut est donc injecté À LA FABRIQUE, ce qui garde la source testable sans réseau et garde
// le garde-fou n°4 (le `fetch` sortant vit dans `lib/ingest/`). Élargir `Recuperateur` pour
// « faire propre » reviendrait à casser la seule propriété qui rend ce flux lisible.

import { jugerProfession } from "../nocProfession";
import {
  BUDGET_MS_DEFAUT,
  lireChamp,
  lireFluxGuichet,
  type FinLecture,
} from "./guichetFlux";
import { situer } from "./region";
import type { OffreBrute, ResultatSource, Source } from "./types";

/** L'identifiant de la source, pour les journaux et l'écran de diagnostic. */
export const ID_SOURCE_FLUX_GUICHET = "guichet-flux";

/**
 * Offres rapportées au maximum par passe.
 *
 * ⚠️ CE N'EST PAS LE PLAFOND DU DIAGNOSTIC (5 000). Là-bas on cherche à VOIR le flux entier ;
 * ici on produit, et chaque retenue coûte un tri, une note, et potentiellement une insertion
 * dans la même fonction de 60 s. Deux cents laissent la passe respirer. L'atteindre est dit
 * (`plafond-retenues` part dans la note) : une passe partielle qui se présenterait comme
 * complète ferait croire que le flux ne porte que ça.
 */
export const MAX_RETENUES_FLUX = 200;

/**
 * Plafond en mode « tout » (ADR-0013, D3).
 *
 * La mesure du 2026-08-20 donne **1 290 régionales** sur une lecture complète. 1 600 laisse
 * la marge d'une bonne journée sans plafonner en silence — et `plafond-retenues` reste dit
 * dans la note quand il est atteint, parce qu'une passe partielle qui se présenterait comme
 * complète ferait croire que le marché s'est vidé.
 *
 * ⚠️ CE PLAFOND N'EST PAS LE VRAI MUR. Le vrai mur est la durée de la fonction : la route du
 * cron passe à 300 s et les insertions se font par LOTS, sans quoi 1 300 allers-retours
 * séquentiels vers la base épuiseraient le budget avant la fin de l'ingestion.
 */
export const MAX_RETENUES_FLUX_TOUT = 1_600;

/**
 * Offres au lieu INCONNU laissées passer par passe.
 *
 * ⚠️ CE N'EST PAS UNE TOLÉRANCE, C'EST CE QUI EMPÊCHE LE FILTRE DE S'AUTO-AVEUGLER.
 * La mesure des lieux (`lieuxAMesurer`) apprend les noms de ville à partir des offres que
 * les sources RAPPORTENT. Un pré-filtre régional qui jetterait ici les `lieu-inconnu` ne
 * laisserait jamais leur nom atteindre le géocodeur : ces villes ne seraient jamais
 * mesurées, donc jamais connues, donc jetées à vie — un filtre qui affame la boucle censée
 * l'élargir, et dont l'échec est parfaitement silencieux (il rend simplement moins).
 *
 * Elles sont donc rapportées, en nombre borné : le pipeline les refusera (`lieuInconnu`) et
 * les comptera, mais leur NOM aura servi. Quarante par passe suffisent largement — la
 * mesure n'en consomme que six, triés par fréquence — et ça s'éteint tout seul : un nom
 * mesuré ne se redemande jamais.
 */
export const MAX_LIEUX_INCONNUS_FLUX = 40;

/** Codes distincts nommés dans la note. Au-delà, la ligne ne se lit plus. */
const CODES_NOMMES = 6;

export interface OptionsSourceFlux {
  /** Les codes de profession retenus (`lib/metiersRetenus.ts`). Vide = rien ne passe. */
  metiers: readonly string[];
  /**
   * Les lieux déjà jugés PAR LA MESURE, pour que le pré-filtre régional voie aussi loin que
   * le tri qui suivra. Sans eux, le flux jetterait ici des villes que le pipeline saurait
   * accepter deux étapes plus loin — et elles ne reviendraient jamais.
   */
  verdicts?: ReadonlyMap<string, "dans-la-region" | "hors-region">;
  /** Le `fetch` brut. Injecté : voir l'en-tête. */
  recuperer?: typeof fetch;
  budgetMs?: number;
  maxRetenues?: number;
  /**
   * Ce que la source fait des offres HORS des métiers retenus (ADR-0013, D3).
   *
   * `"domaine"` (défaut) — elles sont refusées à la lecture. C'est le comportement d'origine,
   * et il reste le défaut sûr : une option qui n'a pas été réglée ne doit pas ouvrir les
   * vannes.
   *
   * `"tout"` — elles sont RETENUES, avec leur code, et c'est la NOTE qui les range
   * (facteur de domaine). Décision Marc du 2026-08-20 : « je veux voir toutes les offres
   * dispos ». ⚠️ Le compte des écartées par code continue d'être tenu dans les deux modes :
   * il dit ce que le filtre AURAIT retiré, ce qui reste l'information utile pour régler la
   * liste.
   */
  mode?: "domaine" | "tout";
}

/** Ce que la lecture a refusé, et pourquoi. Rendu en une ligne lisible. */
export interface BilanFlux {
  fin: FinLecture;
  vues: number;
  /** Offres rapportées au pipeline, lieux inconnus compris. */
  retenues: number;
  /** Offres rapportées dont le lieu est CONNU et régional. Les seules qui peuvent entrer. */
  regionales: number;
  horsRegion: number;
  /** Lieux inconnus rapportés pour que la mesure apprenne leur nom. */
  lieuInconnuRapporte: number;
  /** Lieux inconnus laissés de côté, le quota de la passe étant atteint. */
  lieuInconnuIgnore: number;
  /** Écartées par leur code de profession, par code. Borné par `MAX_CLASSES` en amont. */
  ecarteesParCode: Record<string, number>;
  /** Offres régionales dont le `noc2021` n'est pas lisible. Un AVEU, pas une décision. */
  codeIllisible: number;
}

/**
 * La ligne de compte rendu. PURE.
 *
 * ⚠️ ELLE NOMME LES CODES LES PLUS REFUSÉS, pas seulement leur total. « 1 794 écartées » ne
 * dit pas quoi corriger ; « 1 794 écartées, surtout 65 (402), 75 (311) » dit à Marc quels
 * domaines il laisse de côté, et lui permet de décider s'il les veut. C'est la même règle que
 * pour les villes inconnues du diagnostic : compter ne suffit pas, il faut nommer l'objet.
 */
export function resumerBilanFlux(b: BilanFlux): string {
  const parts = [`${b.vues} vues`, `${b.regionales} régionales`];

  const ecartees = Object.values(b.ecarteesParCode).reduce((a, n) => a + n, 0);
  if (ecartees > 0) {
    const top = Object.entries(b.ecarteesParCode)
      .sort((a, x) => x[1] - a[1] || a[0].localeCompare(x[0]))
      .slice(0, CODES_NOMMES)
      .map(([code, n]) => `${code} (${n})`)
      .join(", ");
    parts.push(`${ecartees} écartées par métier — surtout ${top}`);
  }
  if (b.horsRegion > 0) parts.push(`${b.horsRegion} hors région`);
  // ⚠️ LES DEUX COMPTES DE LIEUX INCONNUS SE DISENT ENSEMBLE. « 40 rapportés » seul ferait
  // croire qu'on les a tous vus ; « 40 rapportés, 812 ignorés » dit que la mesure a de quoi
  // travailler pour des jours — et que ce chiffre doit baisser passe après passe. S'il ne
  // baisse pas, c'est la mesure qui est en panne, pas le flux.
  if (b.lieuInconnuRapporte > 0 || b.lieuInconnuIgnore > 0) {
    parts.push(
      b.lieuInconnuIgnore > 0
        ? `${b.lieuInconnuRapporte} lieux inconnus rapportés pour mesure (+${b.lieuInconnuIgnore} en attente)`
        : `${b.lieuInconnuRapporte} lieux inconnus rapportés pour mesure`,
    );
  }
  if (b.codeIllisible > 0) parts.push(`${b.codeIllisible} sans code lisible`);

  // ⚠️ LA FIN DE LECTURE EST DITE DÈS QU'ELLE N'EST PAS COMPLÈTE. Sous `budget-depasse`, un
  // « 0 retenue » ne dit rien du flux : la lecture s'est arrêtée avant la fin. Confondre les
  // deux, c'est conclure sur un préfixe — la faute déjà payée au premier diagnostic.
  if (b.fin !== "flux-termine") parts.push(`lecture partielle (${b.fin})`);

  return parts.join(" · ");
}

/**
 * La source du flux complet, prête à interroger.
 *
 * L'ORDRE DES TROIS DÉCISIONS COMPTE, et chacune pour une raison différente :
 *
 * 1. **Hors région ⇒ dehors, tout de suite.** Le flux est pancanadien : ce test élimine
 *    l'immense majorité pour le prix d'une comparaison de chaînes. Le faire en second
 *    ferait lire un code de profession sur des dizaines de milliers d'offres déjà perdues.
 * 2. **Le métier ensuite.** Ce qu'il refuse est compté PAR CODE — donc sur la population
 *    régionale, jamais canadienne. Compter les refus de métier avant d'avoir écarté le
 *    reste du Canada décrirait le Canada : c'est mot pour mot l'erreur de population du
 *    premier diagnostic, qui lisait l'inventaire des vues pour celui des retenues.
 * 3. **Le lieu inconnu en dernier, et il PASSE (en nombre borné).** Voir
 *    `MAX_LIEUX_INCONNUS_FLUX` : le jeter ici affamerait la mesure des lieux, qui apprend
 *    les noms de ville à partir de ce que les sources rapportent.
 */
export function sourceGuichetFlux(options: OptionsSourceFlux): {
  source: Source;
  /** Ce que la dernière lecture a refusé. `null` tant qu'elle n'a pas eu lieu. */
  bilan: () => BilanFlux | null;
} {
  const {
    metiers,
    verdicts = new Map(),
    recuperer = fetch,
    budgetMs = BUDGET_MS_DEFAUT,
    mode = "domaine",
  } = options;
  // Le plafond suit le MODE : filtrer rend quelques dizaines d'offres, tout ingérer en rend
  // plus de mille. Un plafond unique servirait mal les deux.
  const maxRetenues =
    options.maxRetenues ?? (mode === "tout" ? MAX_RETENUES_FLUX_TOUT : MAX_RETENUES_FLUX);

  let dernierBilan: BilanFlux | null = null;

  const source: Source = {
    id: ID_SOURCE_FLUX_GUICHET,
    nom: "Guichet-Emplois — flux complet",
    interroger: async (): Promise<ResultatSource> => {
      let horsRegion = 0;
      let regionales = 0;
      let lieuInconnuRapporte = 0;
      let lieuInconnuIgnore = 0;
      /** Le code lu pour chaque offre retenue, à rattacher après la lecture (ADR-0013). */
      const codesParRef = new Map<string, string | null>();
      let codeIllisible = 0;
      const ecarteesParCode: Record<string, number> = {};

      try {
        const rapport = await lireFluxGuichet(recuperer, {
          budgetMs,
          maxRetenues,
          garder: (offre: OffreBrute, brut: string) => {
            const lieu = situer(offre.ville, offre.description, verdicts);
            if (lieu === "hors-region") {
              horsRegion++;
              return false;
            }

            const code = lireChamp(brut, "noc2021");
            // ⚠️ ENREGISTRÉ ICI PARCE QUE C'EST LE SEUL ENDROIT QUI VOIT LE BLOC BRUT.
            // `OffreBrute` est un contrat fermé et `garder` reçoit le bloc pour cette raison
            // exacte. Le code repart avec l'offre (ADR-0013) : sans lui, le facteur de
            // domaine n'aurait rien à lire et le barème resterait aveugle à l'anglais.
            codesParRef.set(offre.refSource, code.trim() === "" ? null : code.trim());
            const verdict = jugerProfession(code, metiers);
            const garderQuandMeme = mode === "tout";
            if (verdict === "code-illisible") {
              // ⚠️ UN CODE ILLISIBLE N'EST PAS UN REFUS DE MÉTIER, et il ne se compte pas
              // avec eux. C'est un défaut de la SOURCE — et le jour où le Guichet cesserait
              // de coder ses offres, ce compteur monterait en flèche pendant que « écartées
              // par métier » resterait à zéro. Les mélanger ferait passer une panne de flux
              // pour un tri qui fonctionne.
              codeIllisible++;
              // ⚠️ EN MODE « TOUT », UN CODE ILLISIBLE NE REFUSE PLUS — mais il se compte
              // toujours. L'offre part avec `noc: null`, donc un domaine INCONNU, donc un
              // facteur neutre : elle ne sera ni pénalisée ni favorisée par un défaut de la
              // source. C'est la même règle que partout ailleurs — une ignorance n'est pas
              // un refus.
              if (!garderQuandMeme) return false;
            } else if (verdict === "ecartee") {
              const cle = code.trim() === "" ? "(vide)" : code.trim();
              ecarteesParCode[cle] = (ecarteesParCode[cle] ?? 0) + 1;
              if (!garderQuandMeme) return false;
            }

            // ⚠️ LE MÉTIER EST JUGÉ AVANT LE LIEU INCONNU, ET C'EST CE QUI BORNE LE QUOTA.
            // Rapporter des lieux inconnus sert à faire APPRENDRE leurs noms à la mesure ;
            // les rapporter avant d'avoir filtré le métier remplirait le quota de villes
            // portées par des postes que Marc ne veut pas — la mesure travaillerait des
            // jours pour débloquer des offres qui seraient refusées ensuite.
            if (lieu === "lieu-inconnu") {
              if (lieuInconnuRapporte >= MAX_LIEUX_INCONNUS_FLUX) {
                lieuInconnuIgnore++;
                return false;
              }
              lieuInconnuRapporte++;
              return true;
            }

            regionales++;
            return true;
          },
        });

        dernierBilan = {
          fin: rapport.fin,
          vues: rapport.vues,
          retenues: rapport.retenues.length,
          regionales,
          horsRegion,
          lieuInconnuRapporte,
          lieuInconnuIgnore,
          ecarteesParCode,
          codeIllisible,
        };

        return {
          ok: true,
          source: ID_SOURCE_FLUX_GUICHET,
          // ⚠️ LE CODE EST RATTACHÉ ICI, PAS DANS `garder`. Le prédicat DÉCIDE, il ne
          // fabrique pas l'offre : muter son argument ferait dépendre le résultat de
          // l'ordre d'évaluation d'un filtre. On recolle après, quand la lecture est finie.
          offres: rapport.retenues.map((o) => ({ ...o, noc: codesParRef.get(o.refSource) ?? null })),
          // La date de construction du flux : c'est CE que la source peut offrir de plus
          // frais. Sans elle, un flux figé depuis trois jours se lirait comme un marché calme.
          ...(rapport.construitLe !== null ? { dernierJour: rapport.construitLe } : {}),
          note: resumerBilanFlux(dernierBilan),
        };
      } catch (err) {
        // ⚠️ UNE SOURCE INJOIGNABLE NE REND PAS UN VIDE. `lireFluxGuichet` LÈVE sur une
        // réponse non-2xx ou sans corps, précisément pour que l'échec porte son nom jusqu'ici
        // — et pour que la passe ne compte pas d'absences sur un empêchement d'infrastructure
        // (incident du 2026-08-12 : 40 offres périmées par un bundle incomplet).
        return {
          ok: false,
          source: ID_SOURCE_FLUX_GUICHET,
          erreur: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };

  return { source, bilan: () => dernierBilan };
}
