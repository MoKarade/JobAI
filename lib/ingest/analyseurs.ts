// lib/ingest/analyseurs.ts — comprendre ce qu'une source a répondu.
//
// Fonctions PURES : elles prennent le corps d'une réponse et rendent des offres. Aucun
// réseau, aucune horloge, aucune base. C'est ce qui les rend testables depuis une session
// qui n'a aucun accès sortant — et c'est la seule partie de l'ingestion qu'on peut prouver
// avant la production.
//
// PRINCIPE : UN CHAMP MANQUANT N'EST JAMAIS INVENTÉ
// Pas de ville « probable », pas de date « à peu près ». Un champ absent reste vide ou
// `null`, et le reste de l'app sait déjà traiter l'inconnu (`km: null`, distance non
// mesurable). Une offre sans TITRE ou sans LIEN, elle, est écartée : elle ne pourrait ni
// s'afficher ni s'ouvrir, et une ligne qu'on ne peut pas ouvrir n'aide personne.
//
// ROBUSTESSE : une réponse malformée rend une liste vide ou lève — jamais des offres à
// moitié remplies. Une seule offre douteuse qui passe, et c'est le jeu de données entier
// qui perd sa valeur de référence.

import type { OffreBrute } from "./types";

/** Retire les balises HTML d'une description. Les annonces d'ATS en sont pleines. */
/**
 * Un point de code en caractère, ou `null` s'il n'en est pas un.
 *
 * Rendre `null` fait laisser l'entité TELLE QUELLE plutôt que de lever : un flux qui porte
 * `&#999999999;` est mal formé, ce n'est pas une raison pour perdre l'annonce entière.
 */
function pointDeCode(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) return null;
  // Les demi-codets isolés ne forment aucun caractère : `fromCodePoint` les accepte et
  // produit une chaîne invalide qui casserait la normalisation en aval.
  if (n >= 0xd800 && n <= 0xdfff) return null;
  return String.fromCodePoint(n);
}

export function texteSimple(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    // ⚠️ LES ENTITÉS NUMÉRIQUES ET `&apos;` SE DÉCODENT, ET CE N'EST PAS COSMÉTIQUE.
    // Mesuré le 2026-08-19 sur le flux du Guichet-Emplois : il écrit « Val-d&apos;Or ».
    // Non décodée, l'entité survit à `normaliserLieu` (« val-d&apos or ») et ne peut plus
    // matcher aucune entrée des listes de lieux — donc `L&apos;Islet` et
    // `Saint-Pierre-de-l&apos;Ile-d&apos;Orleans`, DEUX VILLES DE LA RÉGION, tombaient en
    // « lieu inconnu ». Aucune erreur, aucune trace : des offres régionales simplement
    // absentes. `L&apos;Ancienne-Lorette` ne passait que par accident, la liste portant
    // aussi la forme sans article.
    .replace(/&#(\d+);/g, (t, n: string) => pointDeCode(Number(n)) ?? t)
    .replace(/&#x([0-9a-f]+);/gi, (t, n: string) => pointDeCode(parseInt(n, 16)) ?? t)
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    // `&amp;` EN DERNIER : décodée en premier, elle transformerait `&amp;lt;` (une
    // esperluette littérale suivie de « lt; ») en `<`, un décodage de trop.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    // Une balise devient une espace, ce qui détache la ponctuation qui la suivait :
    // `<b>échéanciers</b>.` donnait « échéanciers . ». On resserre devant les seuls signes
    // qui ne prennent JAMAIS d'espace avant en français — le point-virgule, les deux-points
    // et les points d'exclamation ou d'interrogation en prennent une, eux.
    .replace(/\s+([.,)])/g, "$1")
    .trim();
}

/** Une date ISO ou RFC-822 ramenée à AAAA-MM-JJ. `null` si elle est illisible. */
export function jourDe(valeur: unknown): string | null {
  if (typeof valeur !== "string" || valeur.trim() === "") return null;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Une offre n'est retenue que si elle porte de quoi être affichée ET ouverte. */
function retenir(o: OffreBrute): boolean {
  return o.titre.trim() !== "" && /^https?:\/\//i.test(o.lien);
}

function texteBalise(bloc: string, balise: string): string {
  // CDATA d'abord : le RSS du Guichet-Emplois y met titres et descriptions.
  const cdata = new RegExp(`<${balise}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${balise}>`, "i");
  const brut = new RegExp(`<${balise}[^>]*>([\\s\\S]*?)</${balise}>`, "i");
  const m = cdata.exec(bloc) ?? brut.exec(bloc);
  return m ? texteSimple(m[1] ?? "") : "";
}

/**
 * RSS 2.0 — le format du flux public du Guichet-Emplois.
 *
 * Analyseur volontairement tolérant sur la FORME (ordre des balises, espaces, CDATA) et
 * strict sur le FOND (titre et lien obligatoires) : un flux gouvernemental change de
 * présentation sans prévenir, et casser à chaque retouche de leur gabarit ferait de cette
 * source une panne récurrente.
 */
export function analyserRss(xml: string, entrepriseParDefaut = ""): OffreBrute[] {
  const offres: OffreBrute[] = [];
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const item of items) {
    const titreComplet = texteBalise(item, "title");
    const lien = texteBalise(item, "link");
    const description = texteBalise(item, "description");
    const guid = texteBalise(item, "guid") || lien;

    // Le Guichet-Emplois écrit « Poste - Entreprise - Ville ». On sépare quand c'est net,
    // et on garde le titre entier sinon : mal découper vaut moins que ne pas découper.
    const bouts = titreComplet.split(" - ").map((s) => s.trim());
    const titre = bouts[0] ?? titreComplet;
    const entreprise = bouts.length >= 2 ? (bouts[1] ?? "") : entrepriseParDefaut;
    const ville = bouts.length >= 3 ? (bouts[2] ?? "") : "";

    const o: OffreBrute = {
      refSource: guid || lien,
      titre,
      entreprise: entreprise || entrepriseParDefaut,
      ville,
      lien,
      description,
      publieeLe: jourDe(texteBalise(item, "pubDate")),
    };
    if (retenir(o)) offres.push(o);
  }
  return offres;
}

/** Lit un JSON en refusant proprement ce qui n'en est pas un. */
function json(corps: string): unknown {
  try {
    return JSON.parse(corps);
  } catch {
    // Une page de connexion ou une erreur HTML servie en 200 : cas réel et fréquent.
    // Rendre une liste vide serait dire « cette entreprise n'embauche pas ». On lève.
    throw new Error("réponse illisible : ce n'est pas du JSON");
  }
}

function champ(o: Record<string, unknown>, ...chemin: string[]): unknown {
  let v: unknown = o;
  for (const c of chemin) {
    if (typeof v !== "object" || v === null) return undefined;
    v = (v as Record<string, unknown>)[c];
  }
  return v;
}

function chaine(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** Greenhouse — `boards-api.greenhouse.io/v1/boards/{jeton}/jobs?content=true`. */
export function analyserGreenhouse(corps: string, entreprise: string): OffreBrute[] {
  const d = json(corps) as Record<string, unknown>;
  const jobs = champ(d, "jobs");
  if (!Array.isArray(jobs)) return [];

  return jobs
    .map((j) => {
      const o = j as Record<string, unknown>;
      return {
        refSource: chaine(o.id),
        titre: chaine(o.title).trim(),
        entreprise,
        ville: chaine(champ(o, "location", "name")).trim(),
        lien: chaine(o.absolute_url),
        description: texteSimple(chaine(o.content)),
        publieeLe: jourDe(o.updated_at ?? o.first_published),
      };
    })
    .filter(retenir);
}

/** Lever — `api.lever.co/v0/postings/{jeton}?mode=json`. La racine est un tableau. */
export function analyserLever(corps: string, entreprise: string): OffreBrute[] {
  const d = json(corps);
  if (!Array.isArray(d)) return [];

  return d
    .map((j) => {
      const o = j as Record<string, unknown>;
      return {
        refSource: chaine(o.id),
        titre: chaine(o.text).trim(),
        entreprise,
        ville: chaine(champ(o, "categories", "location")).trim(),
        lien: chaine(o.hostedUrl || o.applyUrl),
        description: texteSimple(chaine(o.descriptionPlain || o.description)),
        publieeLe: jourDe(typeof o.createdAt === "number" ? new Date(o.createdAt).toISOString() : o.createdAt),
      };
    })
    .filter(retenir);
}

/** Recruitee — `{jeton}.recruitee.com/api/offers/`. */
export function analyserRecruitee(corps: string, entreprise: string): OffreBrute[] {
  const d = json(corps) as Record<string, unknown>;
  const offers = champ(d, "offers");
  if (!Array.isArray(offers)) return [];

  return offers
    .map((j) => {
      const o = j as Record<string, unknown>;
      const ville = [chaine(o.city), chaine(o.country)].filter(Boolean).join(", ");
      return {
        refSource: chaine(o.id),
        titre: chaine(o.title).trim(),
        entreprise,
        ville: ville || chaine(o.location).trim(),
        lien: chaine(o.careers_url || o.careers_apply_url),
        description: texteSimple(chaine(o.description)),
        publieeLe: jourDe(o.published_at ?? o.created_at),
      };
    })
    .filter(retenir);
}

/** Workable — `apply.workable.com/api/v1/widget/accounts/{jeton}?details=true`. */
export function analyserWorkable(corps: string, entreprise: string): OffreBrute[] {
  const d = json(corps) as Record<string, unknown>;
  const jobs = champ(d, "jobs");
  if (!Array.isArray(jobs)) return [];

  return jobs
    .map((j) => {
      const o = j as Record<string, unknown>;
      const ville = [chaine(champ(o, "location", "city")), chaine(champ(o, "location", "region"))]
        .filter(Boolean)
        .join(", ");
      return {
        refSource: chaine(o.shortcode || o.id),
        titre: chaine(o.title).trim(),
        entreprise,
        ville: ville || chaine(o.city).trim(),
        lien: chaine(o.url || o.application_url),
        description: texteSimple(chaine(o.description)),
        publieeLe: jourDe(o.published_on ?? o.created_at),
      };
    })
    .filter(retenir);
}

/** SmartRecruiters — `api.smartrecruiters.com/v1/companies/{jeton}/postings`. */
export function analyserSmartRecruiters(corps: string, entreprise: string): OffreBrute[] {
  const d = json(corps) as Record<string, unknown>;
  const content = champ(d, "content");
  if (!Array.isArray(content)) return [];

  return content
    .map((j) => {
      const o = j as Record<string, unknown>;
      const ville = [chaine(champ(o, "location", "city")), chaine(champ(o, "location", "region"))]
        .filter(Boolean)
        .join(", ");
      const id = chaine(o.id);
      return {
        refSource: id,
        titre: chaine(o.name).trim(),
        entreprise,
        ville,
        // L'API des postings ne porte pas d'URL publique : on la compose depuis l'identité
        // du poste, qui est stable et documentée.
        lien: chaine(o.ref) || (id ? `https://jobs.smartrecruiters.com/${chaine(o.company ?? "")}/${id}` : ""),
        description: texteSimple(chaine(champ(o, "jobAd", "sections", "jobDescription", "text"))),
        publieeLe: jourDe(o.releasedDate ?? o.createdOn),
      };
    })
    .filter(retenir);
}
