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
import { entreprisesLieux, offers, villes } from "./db/schema";
import { exigerSession } from "./session";
import { MiseAJourOffreSchema } from "./types";
import { NouvelleOffreSchema, aujourdhui, construireOffre, identifiantPour } from "./ajout";
import {
  deciderPrecision,
  distanceKm,
  geocoderEntreprises,
  geocoderPlusieurs,
  villeGeocodable,
} from "./geocodage";
import { ENTREPRISES_CIBLES } from "./reference";
import { employeursASituer, planifierDistances } from "./distances";
import { lireOffres } from "./donnees";

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
 * Situe les entreprises cibles qui n'ont pas encore de position, une passe à la fois.
 *
 * Déclenchée par un GESTE de Marc, jamais automatiquement : Nominatim est un service
 * bénévole (une requête par seconde, usage parcimonieux).
 *
 * ORDRE DE LA PASSE — les VILLES d'abord, puis les entreprises. La revue adversariale a
 * montré que l'ordre inverse coinçait : une entreprise introuvable dont la ville n'était
 * pas encore géocodée ne recevait AUCUNE position, restait « à situer » à vie, et
 * re-payait sa recherche à chaque passe en affamant les suivantes. Ici, une entreprise
 * n'est tentée que si le centre de sa ville est connu : quoi qu'il arrive, elle reçoit une
 * position — la sienne si Nominatim la connaît ET la place à distance plausible de sa
 * ville (`deciderPrecision`), le centre-ville DIT sinon.
 *
 * BUDGET DE LA PASSE — 4 requêtes réseau au total, chacune bornée à 4 s. Le pire cas
 * (~4 × 5,1 s + cadence + base) tient sous le mur des 30 s de la Server Action : un mur
 * atteint tuerait le processus AVANT l'enregistrement de l'acquis, ce qui est pire qu'une
 * passe courte.
 */
export type ResultatPasse =
  | {
      ok: true;
      exactes: number;
      approximatives: number;
      restantes: number;
      /** Villes que Nominatim ne connaît pas : leurs entreprises resteront à situer. */
      insituables: string[];
      panne: string | null;
    }
  | { ok: false; erreur: string };

/** Le clic du bouton « Situer » : la garde de session, puis la passe. */
export async function situerEntreprises(): Promise<ResultatPasse> {
  try {
    await exigerSession();
  } catch {
    return { ok: false, erreur: "Authentification requise." };
  }
  const r = await passeGeocodage();
  if (r.ok) revalidatePath("/carte");
  return r;
}

/**
 * La passe elle-même, SANS garde de session.
 *
 * Extraite pour que la carte puisse la lancer en arrière-plan après son propre rendu (elle
 * a déjà exigé la session et redirigé sinon), sans que Marc ait à cliquer. Tout appelant
 * doit donc avoir vérifié la session AVANT — c'est la contrepartie de l'extraction, et
 * elle se vérifie à l'œil sur deux appelants, pas plus.
 *
 * N'a AUCUN effet destructif : elle n'écrit que des positions, en `onConflictDoNothing`.
 * C'est ce qui rend son passage à l'automatique sûr — une opération irréversible n'aurait
 * pas eu le droit de quitter le chemin manuel.
 */
export async function passeGeocodage(): Promise<ResultatPasse> {
  try {
    const [dejaSituees, villesConnues] = await Promise.all([
      db.select({ nom: entreprisesLieux.nom }).from(entreprisesLieux),
      db.select().from(villes),
    ]);
    const deja = new Set(dejaSituees.map((l) => l.nom));
    const coordVilles = new Map(villesConnues.map((v) => [v.nom, { lat: v.lat, lon: v.lon }]));

    const aSituer = ENTREPRISES_CIBLES.filter((c) => !deja.has(c.nom)).map((c) => ({
      nom: c.nom,
      ville: villeGeocodable(c.ville) ?? c.ville,
    }));
    if (aSituer.length === 0) {
      return { ok: true, exactes: 0, approximatives: 0, restantes: 0, insituables: [], panne: null };
    }

    let budget = 4;
    const pannes: string[] = [];
    const insituables: string[] = [];

    // 1. Les villes inconnues des entreprises en attente, dans la limite du budget.
    const villesRequises = [...new Set(aSituer.map((e) => e.ville))].filter(
      (v) => !coordVilles.has(v),
    );
    if (villesRequises.length > 0) {
      const passeVilles = villesRequises.slice(0, budget);
      const rv = await geocoderPlusieurs(passeVilles, outilsNominatim());
      budget -= rv.trouvees.length + rv.introuvables.length + (rv.panne ? 1 : 0);

      if (rv.trouvees.length > 0) {
        await db
          .insert(villes)
          .values(rv.trouvees.map((v) => ({ nom: v.nom, lat: v.lat, lon: v.lon })))
          .onConflictDoNothing();
        for (const v of rv.trouvees) coordVilles.set(v.nom, { lat: v.lat, lon: v.lon });
      }
      // Une ville que Nominatim ne connaît pas est NOMMÉE dans le compte-rendu : ses
      // entreprises resteront « à situer », et un état qui ne peut pas converger doit se
      // voir, pas se déduire. (Panne ≠ introuvable : une panne n'inscrit rien.)
      insituables.push(...rv.introuvables);
      if (rv.panne) pannes.push(rv.panne);
    }

    // 2. Les entreprises dont le centre-ville est connu, dans le budget restant.
    const lignes: { nom: string; lat: number; lon: number; precision: "exacte" | "ville" }[] = [];
    let exactes = 0;

    const tentables = aSituer.filter((e) => coordVilles.has(e.ville));
    if (budget > 0 && tentables.length > 0 && pannes.length === 0) {
      const passe = tentables.slice(0, budget);
      const r = await geocoderEntreprises(passe, outilsNominatim());
      if (r.panne) pannes.push(r.panne);

      // TOUT résultat passe par `deciderPrecision` (pure, testée) : « exacte » seulement
      // si Nominatim a rendu un lieu ponctuel À DISTANCE PLAUSIBLE du centre de sa ville.
      // La revue a prouvé qu'un homonyme DANS les bornes régionales (la brasserie Labatt
      // de Montréal, à ~247 km) serait sinon inscrit exact à vie.
      const resolues = new Map(r.trouvees.map((t) => [t.nom, { lat: t.lat, lon: t.lon }]));
      for (const e of passe) {
        // Une entreprise que la panne a empêché d'interroger n'est PAS un « introuvable » :
        // elle n'apparaît ni dans trouvees ni dans introuvables, et ne s'inscrit pas.
        if (!resolues.has(e.nom) && !r.introuvables.includes(e.nom)) continue;
        const centre = coordVilles.get(e.ville);
        if (!centre) continue;
        const d = deciderPrecision(resolues.get(e.nom) ?? null, centre);
        lignes.push({ nom: e.nom, ...d });
        if (d.precision === "exacte") exactes += 1;
      }
    }

    // L'acquis s'enregistre MÊME en cas de panne en cours de passe : jeter le travail
    // déjà fait garantirait de rebuter sur le même obstacle à chaque tentative.
    if (lignes.length > 0) {
      await db.insert(entreprisesLieux).values(lignes).onConflictDoNothing();
    }

    return {
      ok: true,
      exactes,
      approximatives: lignes.length - exactes,
      restantes: Math.max(0, aSituer.length - lignes.length),
      insituables,
      panne: pannes.length > 0 ? pannes.join(" · ") : null,
    };
  } catch (err) {
    console.error("[actions] localisation des entreprises impossible", err);
    return { ok: false, erreur: "Localisation impossible. Réessaie plus tard." };
  }
}

/**
 * Le domicile de référence, lu depuis l'environnement.
 *
 * GARDE-FOU N°1 — c'est le SEUL endroit de l'app qui lit ces coordonnées, et elles ne
 * quittent jamais cette fonction : seule la DISTANCE calculée est écrite et affichée.
 * `null` si les variables ne sont pas posées — auquel cas aucune distance n'est mesurée,
 * et `km` reste honnêtement inconnu plutôt que faux.
 */
function domicile(): { lat: number; lon: number } | null {
  const lat = Number(process.env.DOMICILE_LAT);
  const lon = Number(process.env.DOMICILE_LON);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/**
 * Mesure la distance des offres qui n'en ont pas, et met leur note à jour.
 *
 * POURQUOI ÇA MANQUAIT : les offres ingérées arrivent avec `km: null` — un déposant ne peut
 * pas mesurer une distance, et il a raison de ne pas en inventer. Mais le barème accorde 10
 * points sur 20 à une distance INCONNUE, autant qu'à 25 km : une offre hors rayon pouvait
 * donc figurer haut dans la liste, sur le critère que Marc place en premier.
 *
 * Ne touche ni les distances déjà connues, ni les notes manuelles (`lib/distances.ts`).
 */
export async function mesurerDistances(): Promise<
  { ok: true; mesurees: number; situees: number } | { ok: false; erreur: string }
> {
  const chezMoi = domicile();
  if (!chezMoi) {
    return { ok: false, erreur: "DOMICILE_LAT / DOMICILE_LON non configurés." };
  }

  try {
    const offres = await lireOffres();
    if (offres === null) return { ok: false, erreur: "Base non configurée." };

    const lignes = await db.select().from(entreprisesLieux);
    const positions = new Map(
      lignes.map((l) => [l.nom, { lat: l.lat, lon: l.lon, precision: l.precision }]),
    );

    // 1. Situer les employeurs manquants — y compris ceux qui ne sont PAS des entreprises
    //    cibles : l'ingestion en amène (ISS, LSM…), et sans position leur distance reste
    //    inconnue à vie. La ville vient de l'offre elle-même, sinon des cibles.
    const villeDe = (nom: string): string | null => {
      const cible = ENTREPRISES_CIBLES.find((c) => c.nom === nom);
      if (cible) return villeGeocodable(cible.ville) ?? cible.ville;
      const avecVille = offres.find((o) => o.entreprise === nom && o.ville);
      return avecVille?.ville ? (villeGeocodable(avecVille.ville) ?? avecVille.ville) : null;
    };

    const manquants = employeursASituer(offres, positions, villeDe);
    let situees = 0;
    if (manquants.length > 0) {
      const r = await situerLot(manquants.slice(0, 4), positions);
      situees = r;
      const relues = await db.select().from(entreprisesLieux);
      positions.clear();
      for (const l of relues) {
        positions.set(l.nom, { lat: l.lat, lon: l.lon, precision: l.precision });
      }
    }

    // 2. Mesurer. Le domicile ne sort pas de cette closure.
    const majs = planifierDistances(offres, positions, (p) => distanceKm(chezMoi, p));
    for (const m of majs) {
      const valeurs: { km: number; majLe: Date; score?: number } = { km: m.km, majLe: new Date() };
      if (m.score !== null) valeurs.score = m.score;
      await db.update(offers).set(valeurs).where(eq(offers.id, m.id));
    }

    revalidatePath("/");
    revalidatePath("/carte");
    return { ok: true, mesurees: majs.length, situees };
  } catch (err) {
    console.error("[actions] mesure des distances impossible", err);
    return { ok: false, erreur: "Mesure impossible. Réessaie plus tard." };
  }
}

/** Situe un petit lot d'employeurs. Rend le nombre réellement inscrit. */
async function situerLot(
  aSituer: readonly { nom: string; ville: string }[],
  positions: ReadonlyMap<string, { lat: number; lon: number; precision: "exacte" | "ville" }>,
): Promise<number> {
  const villesConnues = await db.select().from(villes);
  const coordVilles = new Map(villesConnues.map((v) => [v.nom, { lat: v.lat, lon: v.lon }]));

  const villesRequises = [...new Set(aSituer.map((e) => e.ville))].filter(
    (v) => !coordVilles.has(v),
  );
  if (villesRequises.length > 0) {
    const rv = await geocoderPlusieurs(villesRequises.slice(0, 2), outilsNominatim());
    if (rv.trouvees.length > 0) {
      await db
        .insert(villes)
        .values(rv.trouvees.map((v) => ({ nom: v.nom, lat: v.lat, lon: v.lon })))
        .onConflictDoNothing();
      for (const v of rv.trouvees) coordVilles.set(v.nom, { lat: v.lat, lon: v.lon });
    }
  }

  const tentables = aSituer.filter((e) => coordVilles.has(e.ville) && !positions.has(e.nom));
  if (tentables.length === 0) return 0;

  const r = await geocoderEntreprises(tentables.slice(0, 2), outilsNominatim());
  const resolues = new Map(r.trouvees.map((t) => [t.nom, { lat: t.lat, lon: t.lon }]));
  const inscrire: { nom: string; lat: number; lon: number; precision: "exacte" | "ville" }[] = [];

  for (const e of tentables.slice(0, 2)) {
    if (!resolues.has(e.nom) && !r.introuvables.includes(e.nom)) continue;
    const centre = coordVilles.get(e.ville);
    if (!centre) continue;
    // La MÊME validation que la carte : une résolution trop loin du centre-ville est un
    // homonyme, et on retombe honnêtement sur le centre plutôt que d'inscrire un faux.
    inscrire.push({ nom: e.nom, ...deciderPrecision(resolues.get(e.nom) ?? null, centre) });
  }

  if (inscrire.length > 0) {
    await db.insert(entreprisesLieux).values(inscrire).onConflictDoNothing();
  }
  return inscrire.length;
}

/** Les outils réseau de Nominatim — un seul endroit, pour que rien ne diverge. */
function outilsNominatim() {
  return { recuperer: fetch, courrielContact: process.env.AUTHORIZED_EMAIL };
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
