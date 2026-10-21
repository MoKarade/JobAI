// lib/gmail/rapprochement.ts — rattacher un courriel de réponse à UNE offre suivie, ou à aucune. (JobAI#218, ADR-0042)
//
// Fonction PURE : elle reçoit les courriels déjà lus et les offres, elle ne lit ni n'écrit rien.
//
// ⚠️ LE DOUTE SE DIT, IL NE SE DEVINE PAS (protocole de précision). Un rapprochement n'est rendu que si UNE offre ressort ; sinon l'état
// est `aucune` ou `ambigu`, et la proposition de statut s'abstient. Une heuristique peut SIGNALER ce qu'on regarde, jamais décider ce
// qu'on écrit (ADR-0022) : ce module ne décide de rien, il désigne une offre que Marc confirmera.
//
// Les signaux, du plus sûr au plus faible : (1) l'enseigne (`cleEnseigne`, mot entier, 4 caractères au moins) dans le nom d'affichage, le
// sujet ou l'extrait, ou égale à un segment du domaine de l'expéditeur ; (2) entre plusieurs offres de la même enseigne, le titre du poste
// repris dans le sujet ou l'extrait (deux mots significatifs au moins, un seul meilleur score) ; (3) à défaut, l'unique offre dont le CV est
// déjà parti.

import { cleEnseigne } from "../enseigne";
import { LONGUEUR_MIN_APPARIEMENT } from "../employeurs";
import type { Offre } from "../types";
import { STATUTS_ENVOYES } from "../types";
import type { CourrielLu } from "./lecture";

export type Rapprochement =
  | { etat: "offre"; offre: Offre; indices: string[] }
  | { etat: "aucune" }
  | { etat: "ambigu"; candidates: number };

/** Minuscules, sans accents ni ponctuation : « Désjardins, inc. » → « desjardins inc ». */
export function normaliserTexte(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le nom d'affichage et le domaine d'un en-tête From (« Nom <a@b.ca> », « a@b.ca »). L'adresse complète n'est jamais gardée. */
export function expediteurDe(de: string): { nom: string; domaine: string } {
  const m = /^(.*?)<([^>]*)>\s*$/.exec(de.trim());
  const nom = (m?.[1] ?? "").replace(/["']/g, "").trim();
  const adresse = (m?.[2] ?? de).trim();
  const domaine = adresse.includes("@") ? adresse.slice(adresse.lastIndexOf("@") + 1).toLowerCase().replace(/[^a-z0-9.-]/g, "") : "";
  return { nom, domaine };
}

const MOTS_VIDES = new Set([
  "pour", "avec", "dans", "chez", "dune", "des", "les", "aux", "the", "and", "for", "with", "from", "poste", "emploi", "job", "temps", "plein", "partiel",
]);

function motsSignificatifs(poste: string): string[] {
  return normaliserTexte(poste)
    .split(" ")
    .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));
}

function contientMotEntier(hay: string, cle: string): boolean {
  return cle !== "" && ` ${hay} `.includes(` ${cle} `);
}

function segmentsDomaine(domaine: string): string[] {
  const parts = domaine.split(".");
  // Le dernier segment est le suffixe (« ca », « com ») ; il ne dit rien de l'employeur.
  return parts.slice(0, -1).map((p) => p.replace(/[^a-z0-9]/g, ""));
}

export function rapprocherCourriel(courriel: CourrielLu, offres: readonly Offre[]): Rapprochement {
  const exp = expediteurDe(courriel.de);
  const hay = normaliserTexte(`${exp.nom} ${courriel.sujet} ${courriel.extrait}`);
  const segments = segmentsDomaine(exp.domaine);

  const memeEnseigne: { offre: Offre; indice: string }[] = [];
  for (const offre of offres) {
    const cle = normaliserTexte(cleEnseigne(offre.entreprise, offre.id));
    if (cle.length < LONGUEUR_MIN_APPARIEMENT) continue;
    if (contientMotEntier(hay, cle)) memeEnseigne.push({ offre, indice: "enseigne dans le texte" });
    else if (segments.includes(cle.replace(/ /g, ""))) memeEnseigne.push({ offre, indice: "enseigne dans le domaine" });
  }
  if (memeEnseigne.length === 0) return { etat: "aucune" };
  const unique = memeEnseigne[0];
  if (unique !== undefined && memeEnseigne.length === 1) return { etat: "offre", offre: unique.offre, indices: [unique.indice] };

  // Plusieurs offres : on départage par le titre du poste, sans jamais forcer.
  const texteTitre = normaliserTexte(`${courriel.sujet} ${courriel.extrait}`);
  const notes = memeEnseigne.map((c) => ({ ...c, score: motsSignificatifs(c.offre.poste).filter((m) => contientMotEntier(texteTitre, m)).length }));
  const meilleur = Math.max(...notes.map((n) => n.score));
  const tetes = notes.filter((n) => n.score === meilleur);
  const tete = tetes[0];
  if (tete !== undefined && meilleur >= 2 && tetes.length === 1) return { etat: "offre", offre: tete.offre, indices: [tete.indice, "titre du poste repris"] };

  const envoyees = memeEnseigne.filter((c) => STATUTS_ENVOYES.includes(c.offre.statut));
  const envoyee = envoyees[0];
  if (envoyee !== undefined && envoyees.length === 1) return { etat: "offre", offre: envoyee.offre, indices: [envoyee.indice, "seule offre de l'enseigne dont le CV est parti"] };

  return { etat: "ambigu", candidates: memeEnseigne.length };
}
