// lib/cv/depot.ts — lire et écrire les CV en base, sans jamais faire circuler le fichier.
//
// ⚠️ AUCUNE FONCTION D'ICI NE REND LE BLOB, sauf `lireContenuPourAnalyse`, dont le nom le
// dit et dont l'usage est unique. Partout ailleurs, on projette par `colonnesCv`.
//
// Ce n'est pas une précaution de poids — quoique ramener un PDF entier à chaque affichage
// de page serait déjà idiot. C'est une précaution de PORTÉE : plus une donnée personnelle
// circule, plus elle a d'occasions de finir dans une trace d'erreur, un journal de requêtes
// ou une réponse d'API. Ce qu'on ne charge pas ne peut pas fuir.

import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { colonnesCv, cvs } from "../db/schema";
import { assurerMigrations } from "../migrations";
import { ProfilSchema, type Profil, PROFIL_DEFAUT } from "../profil";
import { ReponseExtractionSchema, type ReponseExtraction } from "./extraction";

/** Un CV tel qu'on l'affiche : tout sauf le fichier et son texte. */
export interface CvResume {
  id: number;
  nomFichier: string;
  typeMime: string;
  tailleOctets: number;
  actif: boolean;
  erreurExtraction: string | null;
  aUneProposition: boolean;
  televerseLe: string;
  valideLe: string | null;
}

function enResume(l: {
  id: number;
  nomFichier: string;
  typeMime: string;
  tailleOctets: number;
  actif: boolean;
  erreurExtraction: string | null;
  profilPropose: string | null;
  televerseLe: Date;
  valideLe: Date | null;
}): CvResume {
  return {
    id: l.id,
    nomFichier: l.nomFichier,
    typeMime: l.typeMime,
    tailleOctets: l.tailleOctets,
    actif: l.actif,
    erreurExtraction: l.erreurExtraction,
    aUneProposition: l.profilPropose !== null,
    // Chaîne ISO plutôt qu'objet `Date` : un `Date` ne traverse pas proprement la
    // frontière serveur/client d'un Server Component.
    televerseLe: l.televerseLe.toISOString(),
    valideLe: l.valideLe ? l.valideLe.toISOString() : null,
  };
}

/** Les CV téléversés, du plus récent au plus ancien. Jamais le fichier. */
export async function listerCvs(): Promise<CvResume[] | null> {
  if (!process.env.DATABASE_URL) return null;
  await assurerMigrations();
  const lignes = await db.select(colonnesCv).from(cvs).orderBy(desc(cvs.televerseLe));
  return lignes.map(enResume);
}

/**
 * Le profil qui NOTE aujourd'hui.
 *
 * Aucun CV validé → celui du code. C'est ce qui permet à toute l'app de fonctionner avant
 * qu'un seul document n'ait été téléversé, et c'est aussi ce qui rend le lot 1 utile seul.
 *
 * ⚠️ NE RATTRAPE PAS un profil illisible : `profilCourantOuDefaut` lève, et c'est voulu.
 * Retomber sur le défaut ferait changer toutes les notes en silence, avec un écran qui
 * aurait l'air normal.
 */
export async function profilActif(): Promise<Profil> {
  if (!process.env.DATABASE_URL) return PROFIL_DEFAUT;
  await assurerMigrations();
  const [ligne] = await db
    .select({ profilValide: cvs.profilValide })
    .from(cvs)
    .where(eq(cvs.actif, true))
    .limit(1);
  if (!ligne?.profilValide) return PROFIL_DEFAUT;
  return ProfilSchema.parse(JSON.parse(ligne.profilValide));
}

/** L'extraction proposée par un CV, si elle a abouti. */
export async function propositionDe(
  id: number,
): Promise<{ extraction: ReponseExtraction; nomFichier: string } | null> {
  if (!process.env.DATABASE_URL) return null;
  const [ligne] = await db
    .select({ profilPropose: cvs.profilPropose, nomFichier: cvs.nomFichier })
    .from(cvs)
    .where(eq(cvs.id, id))
    .limit(1);
  if (!ligne?.profilPropose) return null;
  const analyse = ReponseExtractionSchema.safeParse(JSON.parse(ligne.profilPropose));
  if (!analyse.success) return null;
  return { extraction: analyse.data, nomFichier: ligne.nomFichier };
}

/**
 * Le texte d'un CV, pour le ré-analyser.
 *
 * ⚠️ SEULE FONCTION QUI RAMÈNE UNE DONNÉE SENSIBLE. Son unique appelant est la
 * ré-extraction, déclenchée par un geste de Marc. Ne pas l'utiliser pour afficher quoi que
 * ce soit : ce texte contient son nom, son adresse et son téléphone.
 */
export async function lireContenuPourAnalyse(
  id: number,
): Promise<{ texte: string | null; contenu: string; typeMime: string } | null> {
  if (!process.env.DATABASE_URL) return null;
  const [ligne] = await db
    .select({ texte: cvs.texte, contenu: cvs.contenu, typeMime: cvs.typeMime })
    .from(cvs)
    .where(eq(cvs.id, id))
    .limit(1);
  return ligne ?? null;
}

/** Enregistre un CV téléversé et ce que l'extraction en a tiré (ou pourquoi elle a échoué). */
export async function enregistrerCv(entree: {
  nomFichier: string;
  typeMime: string;
  octets: Uint8Array;
  texte: string | null;
  extraction: ReponseExtraction | null;
  erreur: string | null;
}): Promise<number> {
  await assurerMigrations();
  const [ligne] = await db
    .insert(cvs)
    .values({
      nomFichier: entree.nomFichier,
      typeMime: entree.typeMime,
      tailleOctets: entree.octets.byteLength,
      contenu: Buffer.from(entree.octets).toString("base64"),
      texte: entree.texte,
      // Un échec reste `null`, jamais un objet vide qui se ferait passer pour un résultat.
      profilPropose: entree.extraction ? JSON.stringify(entree.extraction) : null,
      erreurExtraction: entree.erreur,
    })
    .returning({ id: cvs.id });
  if (!ligne) throw new Error("Le CV n'a pas pu être enregistré.");
  return ligne.id;
}

/** Remplace l'extraction d'un CV existant (ré-analyse). */
export async function majExtraction(
  id: number,
  entree: { texte: string | null; extraction: ReponseExtraction | null; erreur: string | null },
): Promise<void> {
  await db
    .update(cvs)
    .set({
      texte: entree.texte,
      profilPropose: entree.extraction ? JSON.stringify(entree.extraction) : null,
      erreurExtraction: entree.erreur,
    })
    .where(eq(cvs.id, id));
}

/**
 * Rend un profil ACTIF : c'est lui qui notera désormais.
 *
 * ⚠️ DÉSACTIVE LES AUTRES D'ABORD, dans cet ordre. L'index unique partiel de la base
 * refuse deux CV actifs — activer avant de désactiver ferait échouer la transaction. Le
 * verrou est en base plutôt qu'ici parce qu'une discipline d'appel finit toujours par se
 * relâcher, et que deux profils actifs voudrait dire deux barèmes appliqués au hasard.
 */
export async function activerProfil(id: number, profil: Profil): Promise<void> {
  await db.update(cvs).set({ actif: false }).where(eq(cvs.actif, true));
  await db
    .update(cvs)
    .set({ actif: true, profilValide: JSON.stringify(profil), valideLe: new Date() })
    .where(eq(cvs.id, id));
}

/** Supprime un CV, fichier compris. */
export async function supprimerCv(id: number): Promise<void> {
  await db.delete(cvs).where(eq(cvs.id, id));
}
