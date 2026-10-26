import { after } from "next/server";
import { expurgerPII } from "./ingest/expurger";
import type { Offre, Statut } from "./types";

const URL_DEFAUT = "https://memoryai.hubperso.com";
const DELAI_MS = 2_500;

export type EvenementSortie = {
  type: "statut_change" | "reponse_recruteur" | "offre_suivie";
  date: string;
  titre: string;
  resume?: string;
  ref?: string;
};

type OffreSortie = Pick<Offre, "id" | "poste" | "entreprise">;

function dateValide(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(date)
    && Number.isFinite(Date.parse(date));
}

function nettoyer(texte: string, maximum: number): string {
  let sortie = "";
  for (const caractere of expurgerPII(texte).texte.replace(/\s+/g, " ").trim()) {
    if (sortie.length + caractere.length > maximum) break;
    sortie += caractere;
  }
  return sortie;
}

function creerEvenement(
  type: EvenementSortie["type"],
  offre: OffreSortie,
  date: string,
  resume?: string,
): EvenementSortie | null {
  const titre = nettoyer(`${offre.poste} — ${offre.entreprise}`, 120);
  if (
    !dateValide(date)
    || titre.length === 0
    || !/^[\x21-\x7E]{1,80}$/.test(offre.id)
  ) {
    return null;
  }

  return {
    type,
    date,
    titre,
    resume: resume ? nettoyer(resume, 600) : undefined,
    ref: offre.id,
  };
}

export function creerEvenementOffreSuivie(
  offre: OffreSortie,
  date: string,
): EvenementSortie | null {
  return creerEvenement("offre_suivie", offre, date, "Offre ajoutée au suivi.");
}

export function creerEvenementStatutChange(
  offre: OffreSortie,
  statut: Statut,
  date: string,
): EvenementSortie | null {
  return creerEvenement("statut_change", offre, date, `Statut mis à jour : ${statut}.`);
}

export function creerEvenementReponseRecruteur(
  offre: OffreSortie,
  date: string,
): EvenementSortie | null {
  return creerEvenement("reponse_recruteur", offre, date, "Réponse de recruteur enregistrée.");
}

export function planifierSortie(evenement: EvenementSortie): void {
  try {
    after(() => envoyerSorties([evenement]));
  } catch {
    console.warn("[sorties] envoi impossible", { raison: "planification" });
  }
}

export async function envoyerSorties(evenements: readonly EvenementSortie[]): Promise<void> {
  const jeton = process.env.MEMORYAI_SORTIES_TOKEN?.trim();
  if (!jeton) {
    console.info("[sorties] envoi ignoré", { raison: "jeton_absent" });
    return;
  }

  if (evenements.length === 0 || evenements.length > 50) return;

  const base = (process.env.MEMORYAI_URL?.trim() || URL_DEFAUT).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(`${base}/api/sorties`);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    console.warn("[sorties] envoi impossible", { raison: "url_invalide" });
    return;
  }

  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + jeton,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "sorties", evenements }),
      signal: controleur.signal,
    });
    if (!reponse.ok) {
      console.warn("[sorties] envoi impossible", {
        raison: "reponse_http",
        statut: reponse.status,
      });
    }
  } catch {
    console.warn("[sorties] envoi impossible", {
      raison: controleur.signal.aborted ? "delai_depasse" : "reseau",
    });
  } finally {
    clearTimeout(minuterie);
  }
}
