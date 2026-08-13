"use server";

// lib/cv/actions.ts — les écritures du chantier CV, et les SEULES.
//
// Même discipline que `lib/actions.ts` : chaque action REVÉRIFIE la session avant de
// toucher quoi que ce soit. Un point d'entrée POST généré par Next est appelable
// directement — le middleware ne le couvre pas, et une route qui manipule un CV est
// exactement celle qu'on ne veut pas laisser ouverte.
//
// Les actions rendent un résultat plutôt que de lever : l'écran doit pouvoir dire ce qui
// n'a pas marché. Une erreur AVALÉE, en revanche, serait pire que l'échec — un téléversement
// qui ne dit rien laisse Marc recommencer avec le même fichier.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { offers } from "../db/schema";
import { exigerSession } from "../session";
import { lireOffres } from "../donnees";
import { extraireTexte, TAILLE_MAX_OCTETS } from "./texte";
import { extraireFaits } from "./extraction";
import {
  activerProfil,
  enregistrerCv,
  lireContenuPourAnalyse,
  majExtraction,
  profilActif,
  propositionDe,
  supprimerCv,
} from "./depot";
import { appliquerEcarts, calculerEcarts } from "./proposition";
import { planifierRenotation, resumerPlan } from "./renotation";

export type Resultat<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { message?: string } : { valeur: T; message?: string }))
  | { ok: false; erreur: string };

/** La date du jour, au format des dates du projet. Isolée pour rester testable ailleurs. */
function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

async function session(): Promise<string | null> {
  try {
    await exigerSession();
    return null;
  } catch {
    return "Authentification requise.";
  }
}

/**
 * Téléverse un CV, en extrait le texte puis les faits, et enregistre le tout.
 *
 * ⚠️ RIEN N'EST APPLIQUÉ ICI. Le CV est stocké avec sa PROPOSITION ; le profil de l'app ne
 * bouge pas d'un cran tant que Marc n'a pas validé (`validerProfil`). C'est le choix qu'il
 * a tranché à l'ADR-0009, et c'est ce qui rend acceptable de faire lire un document par un
 * modèle : une extraction fausse coûte un décochage, pas une note faussée en silence.
 *
 * ⚠️ UN ÉCHEC D'EXTRACTION N'EMPÊCHE PAS L'ENREGISTREMENT. Le fichier est conservé avec la
 * RAISON de l'échec, pour que Marc puisse ré-analyser après avoir posé la clé API sans
 * re-téléverser. Jeter le fichier parce que le modèle n'a pas répondu punirait Marc d'une
 * panne qui n'est pas la sienne.
 */
export async function televerserCv(donnees: FormData): Promise<Resultat<{ id: number }>> {
  const refus = await session();
  if (refus) return { ok: false, erreur: refus };

  const fichier = donnees.get("cv");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { ok: false, erreur: "Aucun fichier reçu." };
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return { ok: false, erreur: "Fichier trop lourd (maximum 8 Mo)." };
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const lecture = await extraireTexte(octets);
  if (!lecture.ok) {
    // Le fichier n'est pas stocké : sans texte, il n'y a rien à ré-analyser plus tard.
    return { ok: false, erreur: lecture.raison };
  }

  const faits = await extraireFaits(lecture.texte);
  const id = await enregistrerCv({
    // Le nom d'origine contient souvent le nom de Marc : il s'affiche, il ne se journalise pas.
    nomFichier: fichier.name.slice(0, 200),
    typeMime: octets[0] === 0x25 ? "application/pdf" : "text/plain",
    octets,
    texte: lecture.texte,
    extraction: faits.ok ? faits.brut : null,
    erreur: faits.ok ? null : faits.raison,
  });

  revalidatePath("/profil");
  return faits.ok
    ? { ok: true, valeur: { id }, message: "CV lu. Vérifie ce qu'il propose avant d'appliquer." }
    : { ok: true, valeur: { id }, message: `CV enregistré, mais l'analyse a échoué : ${faits.raison}` };
}

/** Relance l'extraction sur un CV déjà stocké — utile après avoir posé la clé API. */
export async function reanalyserCv(id: number): Promise<Resultat> {
  const refus = await session();
  if (refus) return { ok: false, erreur: refus };

  const stocke = await lireContenuPourAnalyse(id);
  if (!stocke) return { ok: false, erreur: "CV introuvable." };

  let texte = stocke.texte;
  if (!texte) {
    const lecture = await extraireTexte(new Uint8Array(Buffer.from(stocke.contenu, "base64")));
    if (!lecture.ok) return { ok: false, erreur: lecture.raison };
    texte = lecture.texte;
  }

  const faits = await extraireFaits(texte);
  await majExtraction(id, {
    texte,
    extraction: faits.ok ? faits.brut : null,
    erreur: faits.ok ? null : faits.raison,
  });

  revalidatePath("/profil");
  return faits.ok ? { ok: true, message: "Analyse refaite." } : { ok: false, erreur: faits.raison };
}

/**
 * Valide les écarts RETENUS, active le profil, et recalcule les notes.
 *
 * C'est le seul point où le barème de l'app change, et il est déclenché par un geste
 * explicite de Marc. Deux règles s'y appliquent, dans cet ordre :
 *
 *   1. seuls les écarts qu'il a cochés entrent dans le nouveau profil ;
 *   2. la re-notation qui suit ne touche JAMAIS une note manuelle.
 *
 * La seconde n'était pas dans la question qu'on lui a posée, parce qu'elle ne se négocie
 * pas : un recalcul de masse est précisément l'occasion de perdre une note posée à la main.
 */
export async function validerProfil(
  cvId: number,
  ecartsRetenus: readonly string[],
): Promise<Resultat<{ resume: string }>> {
  const refus = await session();
  if (refus) return { ok: false, erreur: refus };

  const prop = await propositionDe(cvId);
  if (!prop) return { ok: false, erreur: "Ce CV n'a pas de proposition à valider." };

  let courant;
  try {
    courant = await profilActif();
  } catch (e) {
    // Un profil enregistré illisible ne doit pas être contourné en silence : on le DIT.
    return { ok: false, erreur: `Profil actif illisible : ${(e as Error).message}` };
  }

  const ecarts = calculerEcarts(courant, prop.extraction);
  const nouveau = appliquerEcarts(courant, ecarts, ecartsRetenus, aujourdhui());

  const offres = (await lireOffres()) ?? [];
  const plan = planifierRenotation(offres, nouveau);

  await activerProfil(cvId, nouveau);

  // Les notes ensuite : si l'activation échoue, aucune note n'aura bougé. L'inverse
  // laisserait des notes calculées par un profil que la base ne connaît pas.
  for (const c of plan.changements) {
    await db.update(offers).set({ score: c.apres }).where(eq(offers.id, c.id));
  }

  revalidatePath("/");
  revalidatePath("/profil");
  revalidatePath("/references");
  return { ok: true, valeur: { resume: resumerPlan(plan) }, message: "Profil appliqué." };
}

/** Supprime un CV et son fichier. */
export async function retirerCv(id: number): Promise<Resultat> {
  const refus = await session();
  if (refus) return { ok: false, erreur: refus };
  await supprimerCv(id);
  revalidatePath("/profil");
  return { ok: true, message: "CV supprimé." };
}
