// lib/ingest/sondeEmployeurs.ts — quelles sources OUVERTES sur les employeurs répondent, et combien
// des employeurs de Marc on y retrouve (JobAI#160, plan « analyse du CV et dossier employeur », B2).
//
// ⚠️ ELLE MESURE, ELLE N'INGÈRE RIEN, ET ELLE N'ÉCRIT RIEN. Aucune ligne en base, aucun nom
// d'entreprise dans la réponse, aucune note touchée. C'est la différence entre « puis-je joindre ce
// service, et que contient-il de nos employeurs ? » et « je moissonne ce service » (garde-fou n°4 :
// un ADR AVANT toute nouvelle source — celui-ci, ADR-0030, tranche à partir de cette mesure).
//
// ⚠️ DEPUIS L'APP DÉPLOYÉE, PAS DEPUIS UNE SESSION. La passerelle d'une session Claude refuse la
// plupart des hôtes et ne dit rien du monde (voir `sondeSources.ts`). Le registre des entreprises
// est derrière Cloudflare, qui a refusé l'IP des runners GitHub : seule Vercel dit si Vercel passe.
//
// TROIS SOURCES, TOUTES PUBLIQUES ET OFFICIELLES (exception nommée du garde-fou n°4) :
//   · le Registre des entreprises du Québec (REQ), fichier de données ouvertes : un ZIP de ~270 Mo
//     dont on ne lit QUE `Nom.csv` (NEQ, dénominations), en lisant la fin du ZIP puis la seule plage
//     d'octets de cette entrée — jamais le ZIP entier, jamais les administrateurs ni les actionnaires
//     (garde-fou n°1) ;
//   · le Registre des entreprises non admissibles aux contrats publics (RENA), un JSON de ~1,6 Mo ;
//   · le catalogue de données ouvertes du Canada (CKAN), pour savoir où se trouvent les salaires par
//     code de profession. La clé de ces salaires est le CODE DE PROFESSION, pas l'employeur : on
//     mesure donc la part des offres qui portent un code, jamais un « taux d'employeurs ».
//
// ⚠️ UN RATTACHEMENT PAR NOM EST UN INDICE, PAS UNE IDENTITÉ. On compare des noms normalisés (même
// règle que la liste et la carte, `normaliserNomEmployeur` : accents, casse, forme juridique), à
// l'ÉGALITÉ — jamais de sous-chaîne (`apparier` se trompe : « Robert » / « Groupe Robert »). Un nom
// qui répond à PLUSIEURS NEQ est compté « ambigu », pas « trouvé ». Deux sociétés distinctes peuvent
// porter le même nom : le taux dit ce qu'on retrouve, pas ce qu'on sait.
//
// ⚠️ UNE MESURE INCOMPLÈTE NE CONCLUT PAS. Chaque source rend un `fin` ; seul « termine » autorise un
// taux. Un budget de temps épuisé rend les comptes partiels sous un autre `fin`, jamais un pourcentage.

import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";
import { cleGroupement, normaliserNomEmployeur } from "../employeurs";
import { decouperCsv, indicesColonnes, retirerBom } from "../registre";
import type { Offre } from "../types";

const URL_REQ_ZIP =
  "https://www.registreentreprises.gouv.qc.ca/RQAnonymeGR/GR/GR03/GR03A2_22A_PIU_RecupDonnPub_PC/FichierDonneesOuvertes.aspx";
const URL_RENA =
  "https://www.donneesquebec.ca/recherche/dataset/14d93d62-16bf-48da-ae4f-4be21a32e2ad/resource/c8843f2e-16ef-4dfe-a5e3-4b4089fc3f9e/download/rena.json";
const URL_CKAN_SALAIRES =
  "https://open.canada.ca/data/api/3/action/package_search?q=job+bank+wages&rows=5";

/** Budget total de la sonde. Le mur de la route MCP est de 60 s : on garde de la marge. */
const BUDGET_MS_SONDE = 45_000;
/** Délai d'une petite requête (plage d'octets, JSON, catalogue). */
const DELAI_PETITE_REQUETE_MS = 10_000;
/** Plafond de lecture du JSON du RENA (1,6 Mo mesuré le 2026-10-16). */
const PLAFOND_RENA_OCTETS = 8 * 1024 * 1024;
/** Une identification honnête : la sonde ne se fait pas passer pour un navigateur. */
const AGENT = "JobAI-sonde/1.0 (usage personnel; mesure de disponibilité)";

type FinMesure =
  | "termine"
  | "temps-ecoule"
  | "injoignable"
  | "refuse"
  | "format-inattendu"
  | "trop-gros";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// ── Les employeurs de Marc ──────────────────────────────────────────────────

export interface Population {
  /** Employeurs distincts (même clé que la liste), hors noms vides. */
  employeurs: number;
  /** Offres suivies hors historique 2025. */
  offresSuivies: number;
  /** Offres suivies qui portent un code de profession. */
  offresAvecCode: number;
  /** Les formes normalisées à chercher. */
  formes: ReadonlySet<string>;
}

/** Ce qu'il faut retrouver : les employeurs des offres suivies, et la couverture des codes. PURE. */
export function populationDe(offres: readonly Offre[]): Population {
  const suivies = offres.filter((o) => !o.histo);
  const formes = new Set<string>();
  for (const o of suivies) {
    const cle = cleGroupement(o.entreprise, o.id);
    // Un employeur sans nom exploitable (clé de repli) ne se cherche pas : on ne devine pas.
    if (!cle.startsWith("\u0000")) formes.add(cle);
  }
  return {
    employeurs: formes.size,
    offresSuivies: suivies.length,
    offresAvecCode: suivies.filter((o) => typeof o.noc === "string" && o.noc.trim() !== "").length,
    formes,
  };
}

/** Un pourcentage à une décimale, ou `null` s'il n'y a rien à diviser. */
export function pourcent(partie: number, total: number): number | null {
  return total > 0 ? Math.round((partie / total) * 1000) / 10 : null;
}

// ── Lire la fin d'un ZIP, sans le télécharger ───────────────────────────────

export interface EntreeZip {
  nom: string;
  methode: number;
  tailleCompressee: number;
  tailleBrute: number;
  decalageLocal: number;
}

const U32_ZIP64 = 0xffffffff;

function u16(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8);
}
function u32(b: Uint8Array, i: number): number {
  return (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
}

/** Le repérage de la fin d'un ZIP : où se trouve son répertoire central. `null` = pas un ZIP lisible. */
export function lireFinZip(
  fin: Uint8Array,
): { entrees: number; tailleRepertoire: number; decalageRepertoire: number } | null {
  for (let i = fin.length - 22; i >= 0; i--) {
    if (u32(fin, i) !== 0x06054b50) continue;
    const entrees = u16(fin, i + 10);
    const tailleRepertoire = u32(fin, i + 12);
    const decalageRepertoire = u32(fin, i + 16);
    // ZIP64 : les valeurs sont des marqueurs. On ne le gère pas, et on le dit au lieu de deviner.
    if (tailleRepertoire === U32_ZIP64 || decalageRepertoire === U32_ZIP64 || entrees === 0xffff) {
      return null;
    }
    return { entrees, tailleRepertoire, decalageRepertoire };
  }
  return null;
}

/** Les entrées d'un répertoire central de ZIP. `null` si le répertoire est illisible. */
export function lireRepertoireZip(repertoire: Uint8Array, entrees: number): EntreeZip[] | null {
  const resultat: EntreeZip[] = [];
  let p = 0;
  const decodeur = new TextDecoder("utf-8");
  for (let n = 0; n < entrees; n++) {
    if (p + 46 > repertoire.length || u32(repertoire, p) !== 0x02014b50) return null;
    const longNom = u16(repertoire, p + 28);
    const longExtra = u16(repertoire, p + 30);
    const longCommentaire = u16(repertoire, p + 32);
    if (p + 46 + longNom > repertoire.length) return null;
    resultat.push({
      nom: decodeur.decode(repertoire.subarray(p + 46, p + 46 + longNom)),
      methode: u16(repertoire, p + 10),
      tailleCompressee: u32(repertoire, p + 20),
      tailleBrute: u32(repertoire, p + 24),
      decalageLocal: u32(repertoire, p + 42),
    });
    p += 46 + longNom + longExtra + longCommentaire;
  }
  return resultat;
}

/** Où commencent les données d'une entrée, d'après son en-tête local de 30 octets. `null` si illisible. */
export function debutDonnees(enteteLocal: Uint8Array, decalageLocal: number): number | null {
  if (enteteLocal.length < 30 || u32(enteteLocal, 0) !== 0x04034b50) return null;
  return decalageLocal + 30 + u16(enteteLocal, 26) + u16(enteteLocal, 28);
}

// ── Les requêtes ────────────────────────────────────────────────────────────

async function demander(fetchFn: Fetch, url: string, entetes: Record<string, string> = {}) {
  return fetchFn(url, {
    headers: { "User-Agent": AGENT, ...entetes },
    signal: AbortSignal.timeout(DELAI_PETITE_REQUETE_MS),
    redirect: "follow",
  });
}

async function octets(fetchFn: Fetch, url: string, plage: string): Promise<Uint8Array | number> {
  const r = await demander(fetchFn, url, { Range: `bytes=${plage}` });
  // Un serveur qui ignore `Range` répondrait 200 avec le fichier ENTIER : on ne le lit pas.
  if (r.status !== 206) {
    void r.body?.cancel().catch(() => undefined);
    return r.status;
  }
  return new Uint8Array(await r.arrayBuffer());
}

function codeFin(code: number): FinMesure {
  return code === 403 || code === 401 || code === 429 ? "refuse" : "injoignable";
}

// ── REQ : Nom.csv, par plage d'octets ───────────────────────────────────────

export interface MesureReq {
  source: "req";
  fin: FinMesure;
  detail: string;
  /** Taille de l'entrée `Nom.csv` décompressée, d'après le répertoire du ZIP. */
  tailleNomCsvOctets?: number;
  lignesLues: number;
  /** Employeurs dont le nom normalisé est le nom d'AU MOINS une entité du registre. */
  retrouves: number;
  /** … d'exactement UN NEQ (le rattachement le moins douteux). */
  uniques: number;
  /** … de PLUSIEURS NEQ : un homonyme est possible, on ne tranche pas. */
  ambigus: number;
  /** Retrouvés dont au moins un nom est en vigueur (sans date de fin). */
  nomEnVigueur: number;
  tauxPct: number | null;
  secondes: number;
}

interface Appariement {
  neq: Set<string>;
  vigueur: boolean;
}

/** Une ligne de `Nom.csv` → (NEQ, nom, en vigueur). PURE. `null` si la ligne n'a pas les colonnes. */
export function lireLigneNom(
  ligne: string,
  idx: { NEQ: number; NOM_ASSUJ: number; DAT_FIN_NOM_ASSUJ: number },
): { neq: string; nom: string; vigueur: boolean } | null {
  const champs = ligne.includes('"') ? decouperCsv(ligne) : ligne.split(",");
  const neq = champs[idx.NEQ];
  const nom = champs[idx.NOM_ASSUJ];
  if (neq === undefined || nom === undefined || nom === "") return null;
  return { neq, nom, vigueur: (champs[idx.DAT_FIN_NOM_ASSUJ] ?? "").trim() === "" };
}

export async function mesurerReq(
  fetchFn: Fetch,
  population: Population,
  budgetMs: number,
  maintenant: () => number = Date.now,
): Promise<MesureReq> {
  const debut = maintenant();
  const base: MesureReq = {
    source: "req",
    fin: "injoignable",
    detail: "",
    lignesLues: 0,
    retrouves: 0,
    uniques: 0,
    ambigus: 0,
    nomEnVigueur: 0,
    tauxPct: null,
    secondes: 0,
  };
  const rendre = (m: Partial<MesureReq>): MesureReq => ({
    ...base,
    ...m,
    secondes: Math.round((maintenant() - debut) / 100) / 10,
  });

  try {
    // 1. La fin du ZIP : son répertoire central dit où est `Nom.csv`.
    const fin = await octets(fetchFn, URL_REQ_ZIP, "-65536");
    if (typeof fin === "number") return rendre({ fin: codeFin(fin), detail: `fin du ZIP : HTTP ${fin}` });
    const reperage = lireFinZip(fin);
    if (!reperage) return rendre({ fin: "format-inattendu", detail: "fin de ZIP illisible ou ZIP64" });

    const repertoire = await octets(
      fetchFn,
      URL_REQ_ZIP,
      `${reperage.decalageRepertoire}-${reperage.decalageRepertoire + reperage.tailleRepertoire - 1}`,
    );
    if (typeof repertoire === "number") {
      return rendre({ fin: codeFin(repertoire), detail: `répertoire du ZIP : HTTP ${repertoire}` });
    }
    const entrees = lireRepertoireZip(repertoire, reperage.entrees);
    const nomCsv = entrees?.find((e) => e.nom.toLowerCase() === "nom.csv");
    if (!nomCsv) return rendre({ fin: "format-inattendu", detail: "pas d'entrée Nom.csv dans le ZIP" });
    if (nomCsv.methode !== 8) {
      return rendre({ fin: "format-inattendu", detail: `méthode de compression ${nomCsv.methode} non gérée` });
    }

    // 2. L'en-tête local de l'entrée, pour savoir où commencent ses données.
    const local = await octets(fetchFn, URL_REQ_ZIP, `${nomCsv.decalageLocal}-${nomCsv.decalageLocal + 29}`);
    if (typeof local === "number") return rendre({ fin: codeFin(local), detail: `en-tête local : HTTP ${local}` });
    const depart = debutDonnees(local, nomCsv.decalageLocal);
    if (depart === null) return rendre({ fin: "format-inattendu", detail: "en-tête local illisible" });

    // 3. Les données de CETTE entrée seulement, lues en flux et décompressées au fil de l'eau.
    const reponse = await fetchFn(URL_REQ_ZIP, {
      headers: { "User-Agent": AGENT, Range: `bytes=${depart}-${depart + nomCsv.tailleCompressee - 1}` },
      signal: AbortSignal.timeout(Math.max(1_000, budgetMs - (maintenant() - debut))),
    });
    if (reponse.status !== 206 || !reponse.body) {
      void reponse.body?.cancel().catch(() => undefined);
      return rendre({ fin: codeFin(reponse.status), detail: `données de Nom.csv : HTTP ${reponse.status}` });
    }

    const appariements = new Map<string, Appariement>();
    const decodeur = new TextDecoder("utf-8");
    let reste = "";
    type Indices = { NEQ: number; NOM_ASSUJ: number; DAT_FIN_NOM_ASSUJ: number };
    // Un objet plutôt qu'une variable : TypeScript ne suit pas une affectation faite dans la
    // fermeture `traiter` et croirait `idx` toujours nul.
    const etat: { idx: Indices | null } = { idx: null };
    let lignes = 0;
    let ecoule = false;

    const traiter = (ligne: string): "ok" | "entete-inattendu" => {
      if (etat.idx === null) {
        const i = indicesColonnes(ligne, ["NEQ", "NOM_ASSUJ", "DAT_FIN_NOM_ASSUJ"]);
        if (!i) return "entete-inattendu";
        etat.idx = i as Indices;
        return "ok";
      }
      lignes++;
      const l = lireLigneNom(ligne, etat.idx);
      if (!l) return "ok";
      const forme = normaliserNomEmployeur(l.nom);
      if (!population.formes.has(forme)) return "ok";
      const a = appariements.get(forme);
      if (a) {
        a.neq.add(l.neq);
        a.vigueur ||= l.vigueur;
      } else appariements.set(forme, { neq: new Set([l.neq]), vigueur: l.vigueur });
      return "ok";
    };

    const flux = Readable.fromWeb(reponse.body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(
      createInflateRaw(),
    );
    let enteteMauvais = false;
    for await (const morceau of flux as AsyncIterable<Buffer>) {
      reste += decodeur.decode(morceau, { stream: true });
      let coupe = reste.indexOf("\n");
      let depuis = 0;
      while (coupe !== -1) {
        let ligne = reste.slice(depuis, coupe);
        if (ligne.endsWith("\r")) ligne = ligne.slice(0, -1);
        if (etat.idx === null) ligne = retirerBom(ligne);
        if (ligne !== "" && traiter(ligne) === "entete-inattendu") {
          enteteMauvais = true;
          break;
        }
        depuis = coupe + 1;
        coupe = reste.indexOf("\n", depuis);
      }
      reste = reste.slice(depuis);
      if (enteteMauvais) break;
      if (maintenant() - debut > budgetMs) {
        ecoule = true;
        break;
      }
    }
    flux.destroy();
    if (enteteMauvais) return rendre({ fin: "format-inattendu", detail: "colonnes NEQ/NOM_ASSUJ absentes de Nom.csv" });
    if (!ecoule && reste.trim() !== "") traiter(reste.trim());

    const valeurs = [...appariements.values()];
    const retrouves = valeurs.length;
    const complet = !ecoule;
    return rendre({
      fin: complet ? "termine" : "temps-ecoule",
      detail: complet ? "Nom.csv lu en entier" : "budget de temps épuisé avant la fin de Nom.csv",
      tailleNomCsvOctets: nomCsv.tailleBrute,
      lignesLues: lignes,
      retrouves,
      uniques: valeurs.filter((a) => a.neq.size === 1).length,
      ambigus: valeurs.filter((a) => a.neq.size > 1).length,
      nomEnVigueur: valeurs.filter((a) => a.vigueur).length,
      tauxPct: complet ? pourcent(retrouves, population.employeurs) : null,
    });
  } catch (err) {
    const delai = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return rendre({
      fin: delai ? "temps-ecoule" : "injoignable",
      detail: delai ? "délai dépassé" : "réseau ou décompression en échec",
    });
  }
}

// ── RENA : un JSON de quelques Mo ───────────────────────────────────────────

export interface MesureRena {
  source: "rena";
  fin: FinMesure;
  detail: string;
  octets?: number;
  dateDuFichier?: string;
  inscriptions: number;
  /** Employeurs suivis dont le nom est celui d'une inscription. Un compte, JAMAIS un nom. */
  employeursEnCause: number;
  tauxPct: number | null;
}

/** Les noms d'entreprise d'un JSON du RENA. PURE. `null` si la forme n'est pas celle attendue. */
export function lireRena(json: unknown): { date: string | null; noms: string[] } | null {
  const racine = (json as { rena?: { inscription?: unknown; "@attributes"?: { date?: unknown } } } | null)?.rena;
  const liste = racine?.inscription;
  if (!Array.isArray(liste)) return null;
  const noms: string[] = [];
  for (const i of liste) {
    const nom = (i as { Nom_entreprise?: unknown } | null)?.Nom_entreprise;
    if (typeof nom === "string" && nom.trim() !== "") noms.push(nom);
  }
  const date = racine?.["@attributes"]?.date;
  return { date: typeof date === "string" ? date : null, noms };
}

export async function mesurerRena(fetchFn: Fetch, population: Population): Promise<MesureRena> {
  const base: MesureRena = {
    source: "rena",
    fin: "injoignable",
    detail: "",
    inscriptions: 0,
    employeursEnCause: 0,
    tauxPct: null,
  };
  try {
    const r = await demander(fetchFn, URL_RENA);
    if (r.status !== 200) {
      void r.body?.cancel().catch(() => undefined);
      return { ...base, fin: codeFin(r.status), detail: `HTTP ${r.status}` };
    }
    const tampon = new Uint8Array(await r.arrayBuffer());
    if (tampon.length > PLAFOND_RENA_OCTETS) {
      return { ...base, fin: "trop-gros", octets: tampon.length, detail: "fichier plus gros que prévu" };
    }
    const lu = lireRena(JSON.parse(new TextDecoder("utf-8").decode(tampon)));
    if (!lu) return { ...base, fin: "format-inattendu", octets: tampon.length, detail: "forme JSON inattendue" };
    const formes = new Set(lu.noms.map(normaliserNomEmployeur));
    const enCause = [...population.formes].filter((f) => formes.has(f)).length;
    return {
      ...base,
      fin: "termine",
      detail: "fichier lu en entier",
      octets: tampon.length,
      ...(lu.date ? { dateDuFichier: lu.date } : {}),
      inscriptions: lu.noms.length,
      employeursEnCause: enCause,
      tauxPct: pourcent(enCause, population.employeurs),
    };
  } catch (err) {
    const delai = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ...base, fin: delai ? "temps-ecoule" : "injoignable", detail: delai ? "délai dépassé" : "réseau ou JSON illisible" };
  }
}

// ── Salaires par code de profession : le catalogue ──────────────────────────

export interface MesureSalaires {
  source: "salaires";
  fin: FinMesure;
  detail: string;
  /** Jeux de données que le catalogue rend pour la recherche. */
  jeux: number;
  /** Titres et ressources des premiers jeux : de quoi CHOISIR le fichier dans l'ADR. */
  exemples: { titre: string; ressources: { format: string; url: string }[] }[];
  /** Offres suivies qui portent un code de profession (la clé de ces salaires), sur toutes les offres suivies. */
  offresAvecCode: number;
  offresSuivies: number;
  tauxPct: number | null;
}

export async function mesurerSalaires(fetchFn: Fetch, population: Population): Promise<MesureSalaires> {
  const base: MesureSalaires = {
    source: "salaires",
    fin: "injoignable",
    detail: "",
    jeux: 0,
    exemples: [],
    offresAvecCode: population.offresAvecCode,
    offresSuivies: population.offresSuivies,
    tauxPct: pourcent(population.offresAvecCode, population.offresSuivies),
  };
  try {
    const r = await demander(fetchFn, URL_CKAN_SALAIRES);
    if (r.status !== 200) {
      void r.body?.cancel().catch(() => undefined);
      return { ...base, fin: codeFin(r.status), detail: `HTTP ${r.status}` };
    }
    const j = (await r.json()) as {
      success?: unknown;
      result?: { count?: unknown; results?: unknown };
    };
    const resultats = j.result?.results;
    if (j.success !== true || typeof j.result?.count !== "number" || !Array.isArray(resultats)) {
      return { ...base, fin: "format-inattendu", detail: "réponse CKAN inattendue" };
    }
    const exemples = resultats.slice(0, 5).map((p) => {
      const d = p as { title?: unknown; resources?: unknown };
      const ressources = Array.isArray(d.resources) ? d.resources : [];
      return {
        titre: typeof d.title === "string" ? d.title.slice(0, 120) : "",
        ressources: ressources.slice(0, 4).map((x) => {
          const y = x as { format?: unknown; url?: unknown };
          return {
            format: typeof y.format === "string" ? y.format : "",
            url: typeof y.url === "string" ? y.url.slice(0, 200) : "",
          };
        }),
      };
    });
    return { ...base, fin: "termine", detail: "catalogue interrogé", jeux: j.result.count, exemples };
  } catch (err) {
    const delai = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ...base, fin: delai ? "temps-ecoule" : "injoignable", detail: delai ? "délai dépassé" : "réseau ou JSON illisible" };
  }
}

// ── L'ensemble ──────────────────────────────────────────────────────────────

export interface RapportSonde {
  /** Combien d'employeurs distincts on cherchait. */
  employeursCherches: number;
  rena: MesureRena;
  salaires: MesureSalaires;
  req: MesureReq;
}

/** Mesure les trois sources, la plus lourde (REQ) en dernier avec le budget qui reste. */
export async function sonderEmployeurs(
  offres: readonly Offre[],
  fetchFn: Fetch,
  budgetMs: number = BUDGET_MS_SONDE,
  maintenant: () => number = Date.now,
): Promise<RapportSonde> {
  const debut = maintenant();
  const population = populationDe(offres);
  const rena = await mesurerRena(fetchFn, population);
  const salaires = await mesurerSalaires(fetchFn, population);
  const req = await mesurerReq(fetchFn, population, Math.max(5_000, budgetMs - (maintenant() - debut)), maintenant);
  return { employeursCherches: population.employeurs, rena, salaires, req };
}
