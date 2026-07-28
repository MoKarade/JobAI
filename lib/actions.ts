"use server";

// lib/actions.ts — les écritures, et les SEULES.
//
// Garde-fou n°2 : ce fichier est le seul autorisé à modifier les champs qui appartiennent
// à Marc. Chaque action commence par revérifier la session, puis valide son entrée par Zod
// avant de toucher la base — un point d'entrée POST généré par Next est appelable
// directement, le middleware ne le couvre pas.
//
// Ces actions renvoient un résultat plutôt que de lever : l'interface doit pouvoir afficher
// « ça n'a pas marché » sans se casser. Une erreur avalée en silence, en revanche, serait
// pire que l'échec — d'où le journal côté serveur.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { offers, villes } from "./db/schema";
import { exigerSession } from "./session";
import { MiseAJourOffreSchema, type Offre } from "./types";
import { NouvelleOffreSchema, aujourdhui, construireOffre, identifiantPour } from "./ajout";
import { villesNecessaires } from "./carte";
import { geocoderPlusieurs } from "./geocodage";
import { ENTREPRISES_CIBLES } from "./reference";

export type Resultat = { ok: true } | { ok: false; erreur: string };

/**
 * Comme `Resultat`, mais l'échec peut désigner LE champ fautif.
 *
 * Un formulaire qui répond « saisie invalide » sans dire lequel des huit champs est en cause
 * oblige à deviner. Les messages viennent des schémas Zod, pas d'une seconde liste tenue à
 * la main qui dériverait.
 */
export type ResultatAjout =
  | { ok: true; id: string }
  | { ok: false; erreur: string; champs?: Record<string, string> };

/**
 * Géocode les villes des offres qui n'en ont pas encore, une passe à la fois.
 *
 * Déclenchée par un GESTE de Marc, jamais automatiquement : Nominatim est un service
 * bénévole qui demande un usage parcimonieux, et une app qui le sollicite à chaque
 * chargement de page se fait bannir — ce qui casserait la carte pour de bon.
 *
 * Le résultat DIT ce qui s'est passé, y compris quand rien n'a été trouvé. Un bouton qui
 * ne répond rien laisse croire qu'il n'a pas fonctionné.
 */
export async function geocoderVillesManquantes(): Promise<
  | { ok: true; ajoutees: number; introuvables: string[]; restantes: number; panne: string | null }
  | { ok: false; erreur: string }
> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  try {
    const [lignes, connues] = await Promise.all([
      db.select().from(offers),
      db.select({ nom: villes.nom }).from(villes),
    ]);

    const dejaConnues = new Set(connues.map((v) => v.nom));
    const aFaire = villesNecessaires(lignes as unknown as Offre[], ENTREPRISES_CIBLES).filter(
      (v) => !dejaConnues.has(v),
    );

    if (aFaire.length === 0) {
      return { ok: true, ajoutees: 0, introuvables: [], restantes: 0, panne: null };
    }

    const r = await geocoderPlusieurs(aFaire, {
      recuperer: fetch,
      courrielContact: process.env.AUTHORIZED_EMAIL,
    });

    // On enregistre ce qui a été trouvé MÊME en cas de panne en cours de passe : jeter le
    // travail déjà fait garantirait de rebuter sur le même obstacle à chaque tentative.
    if (r.trouvees.length > 0) {
      await db
        .insert(villes)
        .values(r.trouvees.map((v) => ({ nom: v.nom, lat: v.lat, lon: v.lon })))
        .onConflictDoNothing();
    }

    revalidatePath("/carte");
    return {
      ok: true,
      ajoutees: r.trouvees.length,
      introuvables: r.introuvables,
      restantes: Math.max(0, aFaire.length - r.trouvees.length - r.introuvables.length),
      panne: r.panne,
    };
  } catch (err) {
    console.error("[actions] géocodage impossible", err);
    return { ok: false, erreur: "Géocodage impossible. Réessaie plus tard." };
  }
}

/**
 * Ajoute une offre saisie à la main.
 *
 * Tout ce qui décide (identifiant, note, statut initial) vit dans `lib/ajout.ts`, pur et
 * testé ; ici il ne reste que la session, les deux valeurs que seul le serveur connaît
 * — l'heure et les identifiants déjà pris — et l'écriture.
 */
export async function ajouterOffre(saisie: unknown): Promise<ResultatAjout> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  const parse = NouvelleOffreSchema.safeParse(saisie);
  if (!parse.success) {
    const champs: Record<string, string> = {};
    for (const issue of parse.error.issues) {
      const cle = issue.path[0];
      // Premier message par champ : au-delà, on empile des reformulations du même problème.
      if (typeof cle === "string" && !(cle in champs)) champs[cle] = issue.message;
    }
    return { ok: false, erreur: "Vérifie les champs signalés.", champs };
  }

  try {
    // Tous les identifiants, pas seulement ceux qui ressemblent : le suivi fait quelques
    // dizaines de lignes, et un filtre par préfixe raterait une collision après troncature.
    const pris = await db.select({ id: offers.id }).from(offers);
    const offre = construireOffre(parse.data, {
      id: identifiantPour(parse.data.entreprise, parse.data.poste, new Set(pris.map((l) => l.id))),
      aujourdhui: aujourdhui(new Date()),
    });

    await db.insert(offers).values({
      id: offre.id,
      source: offre.source,
      dateReperage: offre.dateReperage,
      entreprise: offre.entreprise,
      poste: offre.poste,
      lien: offre.lien,
      km: offre.km,
      salaireAffiche: offre.salaireAffiche,
      priorite: offre.priorite,
      statut: offre.statut,
      dateEnvoi: offre.dateEnvoi,
      score: offre.score,
      scoreSource: offre.scoreSource,
      notes: offre.notes,
      userNote: offre.userNote,
      histo: offre.histo,
      perimeeLe: null,
    });

    revalidatePath("/");
    return { ok: true, id: offre.id };
  } catch (err) {
    console.error("[actions] ajout impossible", err);
    // 23505 = violation d'unicité. Le seul cas réaliste est une double soumission : le
    // dire permet à Marc de vérifier au lieu de re-saisir une offre déjà enregistrée.
    const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code
      ?? (err as { code?: string })?.code;
    if (code === "23505") {
      return { ok: false, erreur: "Cette offre semble déjà enregistrée. Vérifie la liste." };
    }
    return { ok: false, erreur: "Enregistrement impossible. Réessaie." };
  }
}

/**
 * Marque une offre comme périmée, ou la rouvre.
 *
 * Une offre périmée sort des compteurs d'offres actives et ne peut plus être « la
 * meilleure » du widget — mais elle n'est PAS supprimée : le suivi n'efface rien, et
 * savoir qu'une piste s'est fermée fait partie de l'historique de la recherche.
 *
 * L'opération est réversible dans les deux sens : une offre peut être rouverte si elle a
 * été marquée à tort, ou si l'employeur republie.
 */
export async function marquerPerimee(id: string, perimee: boolean): Promise<Resultat> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  try {
    const [avant] = await db
      .select({ perimeeLe: offers.perimeeLe })
      .from(offers)
      .where(eq(offers.id, id))
      .limit(1);

    if (!avant) return { ok: false, erreur: "Offre introuvable." };

    // Re-marquer une offre déjà périmée ne doit pas réécrire la date : « périmée depuis
    // quand » est l'information utile, et l'écraser la perdrait.
    if (perimee && avant.perimeeLe) return { ok: true };

    await db
      .update(offers)
      .set({ perimeeLe: perimee ? new Date() : null, majLe: new Date() })
      .where(eq(offers.id, id));

    revalidatePath("/");
    revalidatePath(`/offre/${id}`);
    return { ok: true };
  } catch (err) {
    console.error("[actions] marquage périmé impossible", { id, err });
    return { ok: false, erreur: "Enregistrement impossible. Réessaie." };
  }
}

/**
 * Modifie une offre. Seuls les champs de `MiseAJourOffreSchema` peuvent bouger : un
 * appelant qui tenterait de changer un score ou une justification par ce chemin n'a aucun
 * effet, parce que ces clés ne survivent pas au parse.
 */
export async function modifierOffre(
  id: string,
  patch: unknown,
): Promise<Resultat> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }

  const parse = MiseAJourOffreSchema.safeParse(patch);
  if (!parse.success) {
    return { ok: false, erreur: "Modification invalide." };
  }

  const champs = parse.data;
  if (Object.keys(champs).length === 0) return { ok: true };

  try {
    const [avant] = await db
      .select({ dateEnvoi: offers.dateEnvoi })
      .from(offers)
      .where(eq(offers.id, id))
      .limit(1);

    if (!avant) return { ok: false, erreur: "Offre introuvable." };

    // Date d'envoi posée automatiquement au passage à « CV envoyé », et SEULEMENT si elle
    // est encore vide : réappliquer le statut ne doit pas réécrire une date déjà connue.
    const dateEnvoi =
      champs.statut === "CVenvoye" && !avant.dateEnvoi && !champs.dateEnvoi
        ? new Date().toISOString().slice(0, 10)
        : champs.dateEnvoi;

    await db
      .update(offers)
      .set({
        ...champs,
        ...(dateEnvoi === undefined ? {} : { dateEnvoi }),
        majLe: new Date(),
      })
      .where(eq(offers.id, id));

    // Le tableau de bord et le widget dérivent des mêmes lignes : ils doivent changer
    // ensemble, sinon un compteur reste faux jusqu'au prochain rechargement.
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("[actions] modification impossible", { id, err });
    return { ok: false, erreur: "Enregistrement impossible. Réessaie." };
  }
}
