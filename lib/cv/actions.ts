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
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { offers } from "../db/schema";
import { exigerSession } from "../session";
import { lireOffres } from "../donnees";
import { lireMetiers } from "../actionsMetiers";
import { extraireTexte, TAILLE_MAX_OCTETS } from "./texte";
import { extraireFaits } from "./extraction";
import {
  activerProfil,
  cvActifId,
  enregistrerCv,
  lireContenuPourAnalyse,
  majExtraction,
  profilActif,
  propositionDe,
  supprimerCv,
} from "./depot";
import { aujourdhui as jourDansLeFuseau } from "../ajout";
import { appliquerEcarts, calculerEcarts } from "./proposition";
import { planifierRenotation, resumerPlan, type PlanRenotation } from "./renotation";
import { appliquerNouveauBareme, dejaApplique } from "../nouveauBareme";

export type Resultat<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { message?: string } : { valeur: T; message?: string }))
  | { ok: false; erreur: string };

/**
 * La date du jour, au format des dates du projet.
 *
 * ⚠️ DÉLÈGUE À `lib/ajout.ts` — MESURÉ le 2026-08-19. Ce module recalculait la date en UTC
 * (`toISOString`), alors que Vercel tourne en UTC et que Marc vit à UTC−4 : une modification
 * de profil faite après 20 h locale datait du lendemain. La règle est écrite depuis
 * longtemps (« toute date que l'app ÉCRIT se calcule dans le fuseau de Marc ») et deux
 * chemins d'écriture y échappaient encore — trouvés en corrigeant le premier, jamais avant.
 */
function aujourdhui(): string {
  return jourDansLeFuseau(new Date());
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
  // Illisible ≠ absente : le premier se répare par une ré-analyse, le second non.
  if (!prop.ok) return { ok: false, erreur: `${prop.raison} Relance l'analyse de ce CV.` };

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
  // Le MÊME barème que l'ingestion et la mesure de distance : le profil qu'on va activer ET les
  // métiers retenus (JobAI#149). Sans les métiers, le domaine ne pèserait rien ici et la note
  // recalculée ne ressemblerait plus à celle d'une offre fraîche.
  let metiers: string[];
  try {
    metiers = await lireMetiers();
  } catch (e) {
    return { ok: false, erreur: `Métiers retenus illisibles : ${(e as Error).message}` };
  }
  const plan = planifierRenotation(offres, { profil: nouveau, metiers });

  try {
    await activerProfil(cvId, nouveau);
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }

  // Les notes ensuite : si l'activation échoue, aucune note n'aura bougé. L'inverse
  // laisserait des notes calculées par un profil que la base ne connaît pas.
  const echecs = await ecrireNotes(plan, nouveau.version);

  revalidatePath("/");
  revalidatePath("/profil");
  revalidatePath("/references");

  if (echecs > 0) {
    return {
      ok: false,
      erreur:
        `Profil appliqué, mais ${echecs} note${echecs > 1 ? "s" : ""} sur ` +
        `${plan.changements.length} n'${echecs > 1 ? "ont" : "a"} pas pu être recalculée${
          echecs > 1 ? "s" : ""
        }. Relance la validation : ce qui est déjà à jour ne sera pas retouché.`,
    };
  }

  return { ok: true, valeur: { resume: resumerPlan(plan) }, message: "Profil appliqué." };
}

/**
 * Écrit les notes d'un plan, une par une. Rend le nombre d'échecs.
 *
 * ⚠️ CETTE BOUCLE N'EST PAS ATOMIQUE, et elle ne peut pas l'être : le driver `neon-http`
 * n'a pas de transaction. Chaque UPDATE est un aller-retour réseau ; une coupure au
 * quinzième laisserait un lot mi-ancien mi-nouveau. On ne peut pas l'empêcher — on peut
 * refuser que ça passe inaperçu. D'où : chaque note porte la version de profil qui l'a
 * produite (`scoreProfilVersion`), le compte des échecs est REMONTÉ à l'écran, et le
 * remède est dit. Relancer est sans danger : le plan est déterministe, les offres déjà à
 * jour ressortiront simplement « inchangées ».
 */
/** Identifiants par UPDATE : assez petit pour une requête raisonnable, assez grand pour ~100 lots. */
const TAILLE_LOT = 500;

async function ecrireNotes(plan: PlanRenotation, version: number): Promise<number> {
  // ⚠️ PAR LOTS, PAS UNE REQUÊTE PAR OFFRE : un barème qui déplace presque toutes les notes de ~8 600
  // offres ferait ~8 600 allers-retours `neon-http` dans une Server Action au temps borné. Les offres
  // qui reçoivent la MÊME note partagent un UPDATE (au plus une centaine de valeurs), découpé par
  // paquets de `TAILLE_LOT` identifiants. Un lot qui échoue compte tous ses identifiants en échec.
  const parNote = new Map<number, string[]>();
  for (const c of plan.changements) {
    const ids = parNote.get(c.apres);
    if (ids) ids.push(c.id);
    else parNote.set(c.apres, [c.id]);
  }
  let echecs = 0;
  for (const [note, ids] of parNote) {
    for (let i = 0; i < ids.length; i += TAILLE_LOT) {
      const lot = ids.slice(i, i + TAILLE_LOT);
      try {
        await db
          .update(offers)
          .set({ score: note, scoreProfilVersion: version })
          .where(inArray(offers.id, lot));
      } catch (e) {
        echecs += lot.length;
        console.error(`[cv] ${lot.length} note(s) non écrite(s) (lot à ${note})`, e);
      }
    }
  }
  return echecs;
}

/**
 * Applique le nouveau barème (ADR-0032, JobAI#152) : le salaire passe en premier dans la note.
 *
 * ⚠️ UN GESTE DE MARC, APRÈS L'APERÇU. Le bouton de `/profil` affiche l'écart avant de proposer
 * d'appliquer ; cette action ne le recalcule pas pour décider, elle recalcule pour ÉCRIRE. Elle
 * repart du profil ACTIF (ses paliers de séniorité sont ceux de son CV), le met à l'échelle des
 * nouveaux poids, l'active avec une version de plus, puis re-note — sans jamais toucher une note
 * manuelle (`planifierRenotation`).
 */
export async function appliquerBaremeSalaire(): Promise<Resultat<{ resume: string }>> {
  const refus = await session();
  if (refus) return { ok: false, erreur: refus };

  let courant;
  try {
    courant = await profilActif();
  } catch (e) {
    return { ok: false, erreur: `Profil actif illisible : ${(e as Error).message}` };
  }
  // ⚠️ UN PROFIL DÉJÀ APPLIQUÉ N'ARRÊTE PAS L'ACTION : c'est le chemin de la relance. L'écriture des
  // notes n'est pas atomique (voir `ecrireNotes`) ; après une coupure, le profil est écrit et des
  // notes ne suivent pas. Relancer recalcule le plan sur ce profil, saute l'activation et n'écrit
  // que ce qui diffère — sans quoi « Relance » rendrait un succès sans rien réparer.
  const dejaEnPlace = dejaApplique(courant);

  let id: number | null = null;
  if (!dejaEnPlace) {
    try {
      id = await cvActifId();
    } catch (e) {
      return { ok: false, erreur: `CV actif illisible : ${(e as Error).message}` };
    }
    if (id === null) {
      return {
        ok: false,
        erreur:
          "Aucun CV actif : le barème en vigueur est celui du code. Valide d'abord un CV ; si une " +
          "activation précédente a été interrompue, revalide-le depuis la liste des CV.",
      };
    }
  }

  let metiers: string[];
  let offres;
  try {
    metiers = await lireMetiers();
    offres = (await lireOffres()) ?? [];
  } catch (e) {
    return { ok: false, erreur: `Offres ou métiers illisibles : ${(e as Error).message}` };
  }
  const nouveau = appliquerNouveauBareme(courant, aujourdhui());
  const plan = planifierRenotation(offres, { profil: nouveau, metiers });

  if (id !== null) {
    try {
      await activerProfil(id, nouveau);
    } catch (e) {
      return { ok: false, erreur: (e as Error).message };
    }
  }
  const echecs = await ecrireNotes(plan, nouveau.version);

  revalidatePath("/");
  revalidatePath("/profil");
  revalidatePath("/references");

  if (echecs > 0) {
    return {
      ok: false,
      erreur:
        `Barème appliqué, mais ${echecs} note${echecs > 1 ? "s" : ""} sur ` +
        `${plan.changements.length} n'${echecs > 1 ? "ont" : "a"} pas pu être recalculée${
          echecs > 1 ? "s" : ""
        }. Relance : le bouton reste là tant que des notes ne suivent pas le barème, et ce qui est déjà à jour n'est pas retouché.`,
    };
  }
  return {
    ok: true,
    valeur: { resume: resumerPlan(plan) },
    message: dejaEnPlace ? "Notes remises d'aplomb." : "Nouveau barème appliqué.",
  };
}

/** Supprime un CV et son fichier. */
export async function retirerCv(id: number): Promise<Resultat> {
  const refus = await session();
  if (refus) return { ok: false, erreur: refus };
  await supprimerCv(id);
  revalidatePath("/profil");
  return { ok: true, message: "CV supprimé." };
}
