"use server";

// lib/actionsComparaison.ts — le bouton « comparer à ma fiche », côté serveur (JobAI#157, ADR-0034).
//
// ⚠️ FICHIER À PART, comme `actionsCandidature` : `lib/actions.ts` importe les modules du barème, et l'import inverse
// ferait un cycle ESM.
//
// ⚠️ UN APPEL PAYANT NE SE DÉCLENCHE JAMAIS TOUT SEUL : uniquement au clic de Marc, jamais au chargement d'une fiche ni
// par la veille. L'éligibilité (fiche, texte d'annonce, rang) est RECALCULÉE ici : le client peut envoyer n'importe quel
// identifiant. Le résultat n'est pas conservé et ne touche ni la note ni le suivi (statut, priorité, date d'envoi, note).

import { exigerSession } from "./session";
import { lireOffre, rangParNote } from "./donnees";
import { profilActif } from "./cv/depot";
import { comparerOffreALaFiche } from "./comparaisonOffreLlm";
import { eligibiliteComparaison, type LigneComparaison, type ExigenceEcartee } from "./comparaisonOffre";

export type ResultatComparaisonAction =
  | { ok: true; lignes: LigneComparaison[]; ecartees: ExigenceEcartee[]; caracteresLus: number }
  | { ok: false; erreur: string };

/** Compare ce que l'offre `id` exige à la fiche de compétences de Marc. */
export async function comparerExigences(id: string): Promise<ResultatComparaisonAction> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  // Un point d'entrée POST généré par Next reçoit n'importe quoi : on borne avant de lire.
  if (typeof id !== "string" || id.length === 0 || id.length > 80) {
    return { ok: false, erreur: "Offre introuvable." };
  }

  let offre;
  let rang;
  try {
    offre = await lireOffre(id);
    rang = offre ? await rangParNote(offre) : null;
  } catch (err) {
    console.error("[comparaison] lecture de l'offre impossible", { id, err });
    return { ok: false, erreur: "La base n'a pas répondu. Voir les journaux." };
  }
  if (!offre) return { ok: false, erreur: "Offre introuvable." };

  let fiche;
  try {
    fiche = (await profilActif()).faits.competences;
  } catch (err) {
    // `profilActif` lève sur un profil illisible, et c'est voulu : on ne compare pas à la fiche du défaut en faisant
    // croire que c'est celle de Marc.
    console.error("[comparaison] profil illisible", err);
    return { ok: false, erreur: "Le profil n'a pas pu être lu. Voir les journaux." };
  }

  const eligible = eligibiliteComparaison({
    fiche,
    texteNote: offre.texteNote,
    score: offre.score,
    histo: offre.histo,
    perimeeLe: offre.perimeeLe,
    rang,
  });
  if (!eligible.ok) return { ok: false, erreur: eligible.raison };

  const r = await comparerOffreALaFiche(offre, fiche);
  if (!r.ok) return { ok: false, erreur: r.raison };
  return { ok: true, lignes: r.lignes, ecartees: r.ecartees, caracteresLus: r.caracteresLus };
}
