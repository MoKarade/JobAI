// lib/ingest/pipeline.ts — de ce que les sources ont dit à ce qui entre dans le suivi.
//
// Fonctions PURES. Ce fichier ne contacte rien : il reçoit les récoltes, les met en forme,
// les dédoublonne, les note, et décide de ce qui mérite d'être suivi.
//
// TROIS DÉCISIONS, TOUTES RÉVERSIBLES ET TOUTES COMPTÉES
//   1. Dédoublonnage — la même offre paraît sur plusieurs sources ; une seule doit entrer.
//   2. Note — calculée par le barème existant, jamais estimée à l'œil.
//   3. Seuil — sous une note plancher, l'offre n'entre pas dans le suivi (décision de Marc,
//      2026-07-30). Elle est COMPTÉE et son motif est dit : une liste qui rétrécit sans
//      explication est pire qu'une liste longue.

import { computeScore } from "../scoring";
import { normaliserLieu, situer } from "./region";
import { texteVilleAnnoncee, villeDepuisRaisons } from "../raisons";
import { aJuger, verdictsFermes, type RegistreLieux } from "./lieux";
import type { Offre } from "../types";
import type { OffreBrute } from "./types";

/**
 * Plancher d'ADÉQUATION AU RÔLE — la composante `fitRole` du barème, sur 40.
 *
 * ⚠️ POURQUOI PAS UN PLANCHER SUR LA NOTE TOTALE
 * Parce qu'il ne filtrerait rien. Mesuré : « Caissier », « Commis d'entrepôt » et
 * « Préposé à l'entretien ménager » notent tous 48 sur 100 — au-dessus d'un plancher à 45.
 * Les points accordés aux INCONNUES (distance non mesurée 10/20, salaire non affiché 9/15,
 * aucune exigence détectée 11/15) s'accumulent quel que soit le métier, et une offre sans
 * le moindre rapport avec le profil part déjà avec 40 points. Seul `fitRole` mesure
 * réellement l'adéquation.
 *
 * 14 sur 40 = au moins UN signal de rôle : du contenu technique, ou de la coordination.
 * C'est exactement la note d'un poste de technicien technique — le plancher de ce qui
 * mérite un regard. En dessous (8), il n'y a plus aucun signal.
 */
export const FIT_ROLE_PLANCHER = 14;

/** Ce qu'une passe a fait de chaque offre trouvée. */
export interface Tri {
  /** Prêtes à entrer dans le suivi : dédoublonnées, notées, au-dessus du plancher. */
  retenues: Offre[];
  /** Écartées faute de note. Comptées, pour que le rétrécissement soit visible. */
  souslePlancher: number;
  /** Doublons entre sources ou avec le suivi existant. */
  doublons: number;
  /** Écartées parce que trop loin — un compte DISTINCT du plancher. */
  horsRegion: number;
  /** Écartées faute de lieu exploitable. Distinct de « trop loin » : si ce compte
   *  explose, c'est qu'une source a cessé d'indiquer les villes, pas que le marché
   *  s'est éloigné. */
  lieuInconnu: number;
  /**
   * CE QUI A ÉTÉ ÉCARTÉ, NOMMÉMENT.
   *
   * Un compte seul ne se vérifie pas : « 5 écartées » ne dit pas si le filtre a bien
   * travaillé ou s'il vient de jeter la meilleure offre du jour. Le déposant l'a signalé
   * dès le premier vrai lot — il ne pouvait pas dire laquelle était dans quelle catégorie.
   * Chaque refus porte donc son motif, et le compte reste pour la lecture rapide.
   *
   * ⚠️ `ville` AJOUTÉE LE 2026-08-17, ET C'EST LE MOTIF QUI L'EXIGEAIT DEPUIS LE DÉBUT.
   *
   * Le compte rendu du jour disait « 47 lieu inconnu » — quarante-sept offres jetées parce
   * que `situer()` ne reconnaît pas leur ville, sans qu'aucune trace ne dise LAQUELLE. Or
   * c'est exactement l'information qui décide de la suite : quarante-sept fois « Remote »
   * appelle un traitement, quarante-sept municipalités québécoises absentes de la liste
   * blanche en appellent un autre, et rien ne permettait de trancher. Le motif était nommé,
   * son OBJET ne l'était pas — la règle « compter un refus ne suffit pas, il faut le
   * NOMMER » n'était donc tenue qu'à moitié pour le seul motif qui porte sur un champ.
   */
  refusees: { entreprise: string; titre: string; ville: string; motif: MotifRefus }[];

  /**
   * Ce que le LIEU a dit de chaque offre — et elles sont TOUTES entrées (ADR-0019).
   *
   * ⚠️ LISTE SÉPARÉE DE `refusees`, ET C'EST TOUT LE POINT. Jusqu'au 2026-09-18, ces deux
   * motifs vivaient dans `refusees` parce qu'ils REFUSAIENT. Ils ne refusent plus : les
   * laisser là ferait mentir un champ qui s'appelle « refusées », et l'écran annoncerait
   * « écartées » des offres qu'il vient d'inscrire.
   *
   * ⚠️ ET ELLE NE DISPARAÎT PAS AVEC LE REFUS, parce que son OBJET n'a jamais été le refus.
   * C'est elle qui produit « inconnus : sherrington×7 · gaspe×5 · … » dans le journal — la
   * liste de travail du géocodeur, et la seule façon de savoir si `situer` progresse. La
   * supprimer avec le filtre aurait coûté l'observabilité en même temps que la restriction.
   */
  lieux: { entreprise: string; titre: string; ville: string; motif: MotifLieu }[];
}

/** Les deux verdicts de lieu qui ne refusent plus, mais se disent toujours. */
export type MotifLieu = Extract<MotifRefus, "hors-region" | "lieu-inconnu">;

/**
 * Les noms de lieu de ce lot sur lesquels ni la liste blanche, ni le registre mesuré n'ont
 * quoi que ce soit à dire — c'est-à-dire la liste de travail du géocodeur.
 *
 * PURE, et c'est ce qui permet de la borner sans rien deviner : l'appelant en prend les
 * `n` premiers, les fait mesurer, et le reste attend la passe suivante. Triée par
 * FRÉQUENCE : quand le budget ne suffit pas pour tout, il doit servir au nom qui débloque
 * le plus d'offres, pas au premier de l'ordre alphabétique.
 *
 * `aJuger` décide de l'inclusion, pour que la règle de retente vive à UN seul endroit
 * (`lib/ingest/lieux.ts`) — un lieu déjà tranché ne coûte jamais une requête, un lieu
 * introuvable en recoûte une quand son palier est écoulé.
 */
export function lieuxAMesurer(
  recoltes: readonly OffreBrute[],
  registre: RegistreLieux,
  aujourdhui: string,
): string[] {
  const compte = new Map<string, number>();
  // Calculé UNE fois : la carte des verdicts fermes ne dépend pas de l'offre courante, et
  // la reconstruire à chaque tour ferait un balayage complet du registre par offre.
  const fermes = verdictsFermes(registre);
  for (const b of recoltes) {
    // Le même filtre que `trier`, dans le même ordre : un nom que `situer` sait déjà
    // trancher — par la liste blanche OU par un verdict ferme du registre — n'a rien à
    // faire ici. Sans ce partage, la liste de travail et la décision divergeraient, et on
    // paierait des requêtes pour des noms qui ne changent rien.
    if (situer(b.ville, b.description, fermes, b.codePostal) !== "lieu-inconnu") continue;
    const nom = normaliserLieu(b.ville);
    if (nom === "") continue;
    if (!aJuger(registre[nom], aujourdhui)) continue;
    compte.set(nom, (compte.get(nom) ?? 0) + 1);
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
}

/**
 * Les villes refusées sous un motif donné, avec leur nombre, de la plus fréquente à la
 * moins fréquente.
 *
 * PURE. Elle existe parce qu'une liste de quarante-sept lignes ne se lit pas, alors que
 * « quebec city 31 · remote 9 · saguenay 4 » se lit en une seconde et DÉSIGNE le correctif.
 * Regrouper sur la forme NORMALISÉE (celle que `situer` compare) et non sur la chaîne
 * brute : « Québec » et « Quebec, QC » sont le même problème, et les compter à part ferait
 * croire à deux cas rares là où il y en a un gros.
 */
export function villesRefusees(
  // ⚠️ ÉLARGI AU 2026-09-18 : la fonction ne lit que `ville` et `motif`, et elle sert
  // désormais AUSSI la liste `lieux`, qui n'est plus une liste de refus. Le type dit
  // exactement ce qu'elle consomme plutôt que de nommer un champ qui a changé de sens.
  refusees: readonly { ville: string; motif: MotifRefus }[],
  motif: MotifRefus,
): { ville: string; n: number }[] {
  const par = new Map<string, number>();
  for (const r of refusees) {
    if (r.motif !== motif) continue;
    // Une ville vide est une information : la source n'a rien dit. La nommer « (vide) »
    // vaut mieux que de la fondre dans les autres — le remède n'est pas le même.
    const cle = normaliserLieu(r.ville) || "(vide)";
    par.set(cle, (par.get(cle) ?? 0) + 1);
  }
  return [...par.entries()]
    .map(([ville, n]) => ({ ville, n }))
    .sort((a, b) => b.n - a.n || a.ville.localeCompare(b.ville));
}

/** Pourquoi une offre n'est pas entrée. */
export type MotifRefus = "hors-region" | "lieu-inconnu" | "sous-le-plancher" | "doublon";

/**
 * Identifiant stable et lisible, dérivé de l'entreprise et du titre.
 *
 * Pas la référence de la source : la MÊME offre a des références différentes chez Lever et
 * au Guichet-Emplois, et elle entrerait deux fois. Pas l'URL non plus, pour la même raison.
 */
export function idOffre(entreprise: string, titre: string): string {
  const propre = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const base = `${propre(entreprise)}-${propre(titre)}`.slice(0, 80).replace(/-+$/g, "");
  // Le schéma exige au moins un caractère : un titre entièrement non latin ne doit pas
  // produire un identifiant vide, qui ferait échouer l'insertion sans rien expliquer.
  return base || `offre-${propre(titre).slice(0, 20) || "sans-titre"}`;
}

/** Clé de rapprochement : deux annonces du même poste chez le même employeur. */
function cleDoublon(entreprise: string, titre: string): string {
  return idOffre(entreprise, titre);
}

/**
 * Les suffixes juridiques qu'une raison sociale traîne — et que deux sources n'écrivent pas
 * pareil.
 *
 * Liste FERMÉE, et c'est ce qui rend le rapprochement sûr. Un suffixe juridique n'est pas une
 * heuristique : `X inc.` et `X` sont la même entité, en droit comme en fait. Tout ce qui
 * ressemblerait à du rapprochement flou (préfixe « Groupe », distance d'édition, sous-chaîne)
 * en est exclu — `apparier("Robert", "Groupe Robert")` est vrai, et fusionner ces deux-là
 * ferait entrer une offre sous le mauvais employeur, avec la mauvaise distance.
 */
const SUFFIXES_JURIDIQUES = [
  "inc", "ltee", "ltd", "ltd-a", "corporation", "corp", "enr", "senc", "sencrl", "srl", "cie",
] as const;

/**
 * Clé de comparaison INSENSIBLE aux variantes de raison sociale.
 *
 * ⚠️ CE N'EST PAS UN IDENTIFIANT, et la distinction est vitale. `idOffre` produit la clé
 * PRIMAIRE des offres en base ; la toucher changerait l'identité de tout l'existant, ferait
 * échouer le rapprochement avec `dejaSuivies`, et recréerait le suivi entier en double — en
 * perdant au passage le lien vers les champs qui appartiennent à Marc (garde-fou n°2).
 * Cette clé-ci ne sert QU'À COMPARER : rien ne l'écrit, rien ne la stocke. Voir ADR-0006.
 *
 * Née le 2026-08-12, en branchant ZipRecruiter à côté d'Indeed : le même employeur y est
 * « EllisDon Corporation » d'un côté et « Ellisdon » de l'autre. Une seule source ne pouvait
 * pas produire ce défaut.
 */
export function cleCanonique(entreprise: string, titre: string): string {
  const mots = idOffre(entreprise, "").split("-").filter(Boolean);
  // Uniquement EN FIN de raison sociale : « Corporation Untel » garde son premier mot, sans
  // quoi on fusionnerait des entreprises qui n'ont en commun qu'un mot de forme juridique.
  while (mots.length > 1 && SUFFIXES_JURIDIQUES.includes(mots[mots.length - 1] as never)) {
    mots.pop();
  }
  return idOffre(mots.join(" "), titre);
}

/**
 * Les identifiants STOCKÉS des offres suivies qu'un lot de brutes vient de re-présenter.
 *
 * ⚠️ NÉE D'UN BUG TROUVÉ PAR REVUE ADVERSARIALE LE JOUR MÊME D'ADR-0006. Le marquage
 * « vue » calculait l'id de la BRUTE et le cherchait dans `dejaSuivies` — qui contient
 * aussi les clés canoniques. Pour une brute « Ellisdon » face à une base « EllisDon
 * Corporation », le test passait (la canonique matchait) mais l'id ajouté était celui de
 * la VARIANTE : aucune offre stockée ne le porte, donc l'offre prenait +1 absence PENDANT
 * que le lot la contenait — péremption à tort en trois jours, l'exact défaut qu'ADR-0006
 * venait de fermer côté doublons. La route POST avait le même trou sous une autre forme
 * (comparaison entreprise+titre en minuscules STRICTES, aveugle aux variantes) : deux
 * copies d'une même règle, déjà divergentes — d'où CETTE fonction, partagée.
 *
 * Résout dans LES DEUX SENS : base longue/brute courte (l'id de la brute EST la canonique
 * de la stockée) et base courte/brute longue (la canonique de la brute EST l'id stocké).
 */
export function brutesParIdStocke(
  brutes: readonly OffreBrute[],
  connues: readonly { id: string; entreprise: string; poste: string }[],
): Map<string, OffreBrute> {
  const idStockeParCle = new Map<string, string>();
  for (const o of connues) {
    idStockeParCle.set(o.id, o.id);
    idStockeParCle.set(cleCanonique(o.entreprise, o.poste), o.id);
  }
  const vus = new Map<string, OffreBrute>();
  for (const b of brutes) {
    const entreprise = b.entreprise.trim() || "Employeur non nommé";
    const stocke =
      idStockeParCle.get(idOffre(entreprise, b.titre)) ??
      idStockeParCle.get(cleCanonique(entreprise, b.titre));
    // La PREMIÈRE occurrence gagne, comme pour les doublons de `trier` : les récoltes
    // arrivent dans l'ordre de priorité des sources, et deux annonces du même poste dans un
    // même lot ne doivent pas rendre le résultat dépendant de l'ordre d'itération.
    if (stocke !== undefined && !vus.has(stocke)) vus.set(stocke, b);
  }
  return vus;
}

/** Les identifiants seuls — la moitié dont le balayage a besoin pour compter les absences. */
export function idsStockesVus(
  brutes: readonly OffreBrute[],
  connues: readonly { id: string; entreprise: string; poste: string }[],
): Set<string> {
  return new Set(brutesParIdStocke(brutes, connues).keys());
}

/**
 * Les offres suivies dont le LIEN a changé depuis la dernière fois qu'on les a vues.
 *
 * ⚠️ POURQUOI CETTE FONCTION EXISTE — MARC, 2026-09-17 : « il y a des jobs périmés qui
 * devraient plus être là, tu check pas assez bien à chaque jour ». Mesuré : le balayage
 * confirmait bien ses offres tous les jours, et le compteur d'absences faisait son travail.
 * Ce qui ne bougeait pas, c'était le LIEN : une offre déjà connue est comptée « doublon »
 * par `trier` et RIEN d'elle n'était jamais réécrit. Le Guichet republiant le même poste
 * sous un NOUVEAU numéro d'annonce, l'entrée restait ouverte — à juste titre, la source la
 * publie — mais pointait sur une annonce fermée. Marc cliquait, tombait sur une offre
 * expirée, et concluait que la vérification quotidienne ne marchait pas. Elle marchait ;
 * c'est l'adresse qu'elle ne mettait pas à jour.
 *
 * ⚠️ DEUX REFUS D'ÉCRASEMENT, et ils ne protègent pas la même chose.
 *   · un lien VIDE ne remplace jamais un lien connu — une source qui n'en donne pas ne doit
 *     pas faire perdre celui qu'on avait ;
 *   · un lien IDENTIQUE ne produit aucune ligne — le cas nominal (l'annonce n'a pas bougé)
 *     ne doit rien écrire du tout, sinon la passe quotidienne réécrit tout le suivi pour
 *     rien.
 *
 * ⚠️ ET SEUL LE LIEN. `statut`, `prio`, `dateEnvoi` et `userNote` appartiennent à Marc
 * (garde-fou n°2) ; la ville, la note et la description sont hors de ce lot — changer la
 * ville déplacerait l'épingle et la distance, changer la note relève du protocole §11.
 */
export function liensARafraichir(
  connues: readonly { id: string; lien: string }[],
  vues: ReadonlyMap<string, OffreBrute>,
): { id: string; lien: string }[] {
  const majs: { id: string; lien: string }[] = [];
  for (const o of connues) {
    const brute = vues.get(o.id);
    if (brute === undefined) continue;
    const lien = brute.lien.trim();
    if (lien === "" || lien === o.lien) continue;
    majs.push({ id: o.id, lien });
  }
  return majs;
}

/**
 * Met en forme, dédoublonne, note et filtre.
 *
 * @param recoltes   Ce que les sources ont rendu, dans l'ordre de priorité : la PREMIÈRE
 *                   occurrence d'un doublon gagne, donc placer les sources les plus fiables
 *                   en tête.
 * @param dejaSuivies Identifiants déjà dans le suivi — une offre connue ne se recrée pas.
 * @param aujourdhui  Date du balayage (AAAA-MM-JJ). Paramètre, jamais l'horloge.
 */
export function trier(
  recoltes: readonly OffreBrute[],
  dejaSuivies: ReadonlySet<string>,
  aujourdhui: string,
  /**
   * Les lieux jugés PAR LA MESURE, transmis tels quels à `situer`. Voir `lib/ingest/lieux.ts` :
   * ils remplacent le pari de liste blanche pour les noms qu'elle ne connaît pas. Défaut
   * vide = comportement d'avant, à la ligne près.
   */
  lieuxResolus: ReadonlyMap<string, "dans-la-region" | "hors-region"> = new Map(),
  /**
   * Les codes de métier retenus par Marc (ADR-0013). Vide = le domaine ne pèse rien, et le
   * tri se comporte exactement comme avant — c'est ce qui rend l'ajout non régressif.
   */
  metiers: readonly string[] = [],
): Tri {
  const retenues: Offre[] = [];
  const vues = new Set<string>();
  let souslePlancher = 0;
  let doublons = 0;
  let horsRegion = 0;
  let lieuInconnu = 0;
  const refusees: Tri["refusees"] = [];
  const lieux: Tri["lieux"] = [];

  for (const brute of recoltes) {
    const entreprise = brute.entreprise.trim() || "Employeur non nommé";
    const cle = cleDoublon(entreprise, brute.titre);
    // ⚠️ DEUX CLÉS, PAS UNE (ADR-0006). `cle` est l'identité telle qu'elle sera ÉCRITE ;
    // `canon` ne sert qu'à reconnaître le même employeur écrit autrement par une autre
    // source (« EllisDon Corporation » chez Indeed, « Ellisdon » chez ZipRecruiter). On
    // écarte si l'UNE des deux est déjà connue, et on mémorise les DEUX — sans quoi deux
    // variantes du même poste passeraient l'une après l'autre dans le même lot.
    const canon = cleCanonique(entreprise, brute.titre);

    if (vues.has(cle) || vues.has(canon) || dejaSuivies.has(cle) || dejaSuivies.has(canon)) {
      doublons++;
      refusees.push({ entreprise, titre: brute.titre, ville: brute.ville, motif: "doublon" });
      continue;
    }
    vues.add(cle);
    vues.add(canon);

    // ⚠️ LE LIEU NE REFUSE PLUS, IL S'ENREGISTRE (ADR-0019, décision Marc 2026-09-18).
    //
    // Ces deux `continue` jetaient 5 782 offres québécoises par passe — 2 034 « hors région »
    // d'après le nom de la ville, 3 748 « lieu inconnu » — sur les 7 239 que le flux publie.
    // C'est ce qui faisait qu'une passe rendait « 20 de plus » : ce que la source ramenait
    // était déjà en base, et ce qui n'y était pas se faisait refuser ici.
    //
    // ⚠️ CE QU'ILS PROTÉGEAIENT RESTE VRAI, ET C'EST POURQUOI LE VERDICT SE GARDE. Le barème
    // accorde 10 points sur 20 à une distance INCONNUE : « inconnue » et « à 2 000 km » y
    // valent pareil, et c'est ainsi qu'un poste de campement minier au Manitoba est entré à
    // 68/100 lors de la première sonde. Refuser n'était pas la seule réponse possible ; dire
    // la vérité sur le lieu en est une autre, et c'est celle-ci. `situation` porte le verdict
    // jusqu'à l'écran, qui filtrera par la DISTANCE — la seule chose qui répond vraiment à la
    // question que le lieu posait.
    const lieu = situer(brute.ville, brute.description, lieuxResolus, brute.codePostal);
    if (lieu !== "dans-la-region") {
      if (lieu === "hors-region") horsRegion++;
      else lieuInconnu++;
      lieux.push({ entreprise, titre: brute.titre, ville: brute.ville, motif: lieu });
    }

    // La note vient du barème, avec `km: null` : la distance ne se déduit pas d'un nom de
    // ville, elle se mesure. Le barème sait déjà traiter l'inconnu (10 points sur 20).
    const note = computeScore(
      {
        titre: brute.titre,
        description: brute.description,
        km: null,
        noc: brute.noc,
        typePoste: brute.typePoste,
        dureeEmploi: brute.dureeEmploi,
      },
      undefined,
      metiers,
    );
    // ⚠️ LE PLANCHER NE S'APPLIQUE QU'AUX OFFRES SANS CODE DE PROFESSION.
    //
    // Mesuré en production le 2026-08-20 : sur une passe réelle, **1 204 offres régionales
    // sur 1 306** ont été refusées ici. Marc demandait à voir tout le flux ; il a vu 75
    // offres. Le plancher juge par MOTS-CLÉS, et les titres du Guichet sont anglais — ils
    // valent tous `horsSujet` (8/40), donc ils tombaient tous.
    //
    // La raison d'être du plancher tient toujours pour les sources SANS code : là, le
    // barème par mots-clés est le seul juge, et sans lui « Caissier » entrerait (son
    // commentaire d'origine le mesure : les points d'inconnu portent n'importe quel métier
    // à ~48). Mais une offre qui porte un `noc2021` a été classée par une nomenclature
    // OFFICIELLE, indépendante de la langue : le facteur de domaine la range déjà — un
    // hors-domaine tombe à ~28 au lieu de ~56. Le trieur, c'est la NOTE ; l'ingestion n'a
    // plus à refuser ce que la note sait déclasser.
    const jugeParLeCode = brute.noc != null && brute.noc.trim() !== "";
    if (!jugeParLeCode && note.parts.fitRole < FIT_ROLE_PLANCHER) {
      souslePlancher++;
      refusees.push({
        entreprise,
        titre: brute.titre,
        ville: brute.ville,
        motif: "sous-le-plancher",
      });
      continue;
    }

    retenues.push({
      id: cle,
      source: "jobbank",
      dateReperage: aujourdhui,
      entreprise,
      poste: brute.titre,
      lien: brute.lien,
      km: null,
      // La ville est CONSERVÉE : sans elle, un employeur hors des cibles ne peut pas être
      // géocodé plus tard, et sa distance — le critère n°1 — resterait inconnue à vie.
      ville: brute.ville.trim() || null,
      // Le verdict de `situer`, gardé plutôt que jeté. Il ne décide plus rien ici ; il dit à
      // l'écran ce qu'on SAIT du lieu tant que la distance n'est pas mesurée.
      situation: lieu,
      salaireAffiche: null,
      priorite: "Moyenne",
      statut: "Identifiee",
      dateEnvoi: "",
      score: note.total,
      scoreSource: "calcule",
      // Le code repart AVEC l'offre : c'est lui qui rend la catégorie affichée cohérente
      // avec la note. Sans lui en base, l'écran re-déduirait la catégorie du titre seul.
      noc: brute.noc ?? null,
      raisons: raisonsAutomatiques(brute, note.total),
      notes: noteDeProvenance(brute, aujourdhui),
      userNote: "",
      histo: false,
      perimeeLe: null,
    });
  }

  return { retenues, souslePlancher, doublons, horsRegion, lieuInconnu, refusees, lieux };
}


/** Une ville à écrire sur une offre DÉJÀ suivie qui n'en avait pas. */
export interface VilleACompleter {
  id: string;
  ville: string;
}

/**
 * Les offres dont la ville manque en base alors que leurs justifications la portent.
 *
 * C'est le rattrapage qui ne dépend de PERSONNE : ni d'un nouveau dépôt, ni d'un clic, ni
 * du réseau. L'information est déjà là, une colonne plus loin. L'historique est laissé de
 * côté — ce sont des candidatures de 2025, elles n'ont pas à être situées.
 */
export function villesARattraper(offres: readonly Offre[]): VilleACompleter[] {
  const liste: VilleACompleter[] = [];
  for (const o of offres) {
    if (o.histo || o.ville !== null) continue;
    const ville = villeDepuisRaisons(o.raisons);
    if (ville !== null) liste.push({ id: o.id, ville });
  }
  return liste;
}

/**
 * Les villes manquantes qu'un lot permet de rattraper, sur les offres DÉJÀ suivies.
 *
 * POURQUOI ÇA EXISTE
 * Une offre déjà en base est comptée « doublon » et le lot n'en fait plus rien — juste
 * tant que le dépôt n'apporte rien de neuf. Ce n'est plus vrai : les 40 premières offres
 * déposées l'ont été avant que la colonne `ville` soit écrite, et sans ville un employeur
 * hors des cibles ne peut pas être géocodé, donc reste sans distance et hors de la carte.
 * Le même dépôt rejoué porte pourtant la ville manquante.
 *
 * TROIS GARDES, ET CHACUNE A UNE RAISON
 *   1. On COMPLÈTE, on n'écrase jamais : une ville déjà connue vient d'une source
 *      antérieure et n'a pas à être remplacée par un lot plus récent.
 *   2. Un employeur NON NOMMÉ ne rattrape rien. L'appariement passe par
 *      `idOffre(entreprise, titre)` ; avec une entreprise vide, deux annonces d'agence au
 *      titre générique (« Technicien ») produisent le MÊME identifiant. Dans `trier`, une
 *      telle collision coûte une offre non ajoutée — ici elle écrirait la ville de l'un
 *      sur la fiche de l'autre, c'est-à-dire ALTÉRERAIT une donnée existante. Le refus
 *      est plus étroit que le risque, et c'est le bon sens.
 *   3. Une seule écriture par offre, même si le lot la mentionne deux fois.
 *
 * PURE et testable : c'est une décision, et les décisions de ce dépôt vivent hors des I/O.
 */
export function villesACompleter(
  brutes: readonly OffreBrute[],
  connues: readonly Offre[],
): VilleACompleter[] {
  const parId = new Map(connues.map((o) => [o.id, o]));
  const faites = new Set<string>();
  const liste: VilleACompleter[] = [];

  for (const b of brutes) {
    const ville = b.ville.trim();
    const entreprise = b.entreprise.trim();
    if (ville === "" || entreprise === "") continue;

    const id = idOffre(entreprise, b.titre);
    if (faites.has(id)) continue;

    const existante = parId.get(id);
    if (!existante || existante.ville !== null) continue;

    faites.add(id);
    liste.push({ id, ville });
  }

  return liste;
}

/**
 * Justifications d'une offre trouvée automatiquement.
 *
 * Elles disent d'où vient la note et CE QU'ON NE SAIT PAS. Une offre ingérée n'a pas été
 * lue par un humain : le taire la ferait passer pour une offre vérifiée, alors que les
 * notes manuelles de Marc, elles, viennent d'une vraie lecture.
 */
function raisonsAutomatiques(brute: OffreBrute, note: number): Offre["raisons"] {
  const r: Offre["raisons"] = [
    {
      ton: "reserve",
      texte:
        "Trouvée automatiquement : la note vient du seul titre et du texte de l'annonce, sans lecture humaine. À relire avant de postuler.",
    },
  ];
  if (brute.ville.trim() !== "") {
    r.push({
      ton: "reserve",
      // La phrase vient de `lib/raisons.ts`, qui la construit, la relit (`villeDepuisRaisons`)
      // et décide quand l'écran a encore le droit de la montrer (`raisonsAffichables`). Trois
      // gestes sur la même phrase : séparés, ils divergent en silence.
      texte: texteVilleAnnoncee(brute.ville),
    });
  }
  if (note >= 70) {
    r.push({
      ton: "atout",
      texte: "Le titre et l'annonce portent à la fois de la coordination et du contenu technique.",
    });
  }
  return r;
}

function noteDeProvenance(brute: OffreBrute, aujourdhui: string): string {
  const publiee = brute.publieeLe ? ` Publiée le ${brute.publieeLe}.` : "";
  return `Trouvée le ${aujourdhui} par la veille automatique.${publiee} Note calculée, jamais lue par un humain.`.slice(
    0,
    600,
  );
}
