// lib/domicile.ts — le point de référence des distances, et rien d'autre.
//
// ⚠️ POURQUOI CE FICHIER EXISTE, ALORS QUE `lib/actions.ts` FAISAIT DÉJÀ LE TRAVAIL.
//
// Il le faisait dans un fichier `"use server"`. Or dans un tel fichier, TOUTE fonction async
// exportée devient un point d'entrée HTTP appelable depuis n'importe où — c'est le principe
// des Server Actions, et c'est écrit en tête de `lib/actions.ts`. `domicile()` y était privée,
// donc sans danger ; mais elle n'était protégée que par l'absence d'un mot-clé. Le jour où
// quelqu'un aurait ajouté `export` pour la réutiliser — exactement ce que j'ai essayé de faire
// le 2026-08-17 —, les coordonnées du domicile de Marc seraient devenues récupérables par une
// requête POST anonyme. Le garde-fou n°1 aurait sauté sans qu'aucun test ne tombe : la
// fonction est correcte, c'est le FICHIER qui la publie.
//
// Ici, aucun `export` ne peut faire ça. La frontière est portée par la nature du module, pas
// par la vigilance de celui qui l'édite.
//
// GARDE-FOU N°1 — ces coordonnées ne quittent jamais le serveur. Seule la DISTANCE calculée
// est écrite en base et affichée. Elles ne partent ni au navigateur, ni vers un service tiers,
// ni dans un fichier versionné : `tests/piiGuard.test.ts` ferait échouer tout commit qui en
// contiendrait, et un dépôt garde son historique pour toujours.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { syncState } from "./db/schema";
import { geocoderPlusieurs } from "./geocodage";

/** Clé sous laquelle les coordonnées du domicile sont conservées, une fois géocodées. */
const CLE_DOMICILE = "domicile-coord";

/** Les outils Nominatim, identiques à ceux du reste de l'app. */
function outilsNominatim() {
  return { recuperer: fetch, courrielContact: process.env.AUTHORIZED_EMAIL };
}

/**
 * Le domicile lu directement depuis l'environnement.
 *
 * `null` si les variables ne sont pas posées — auquel cas aucune distance n'est mesurée, et
 * `km` reste honnêtement inconnu plutôt que faux.
 */
function domicileConfigure(): { lat: number; lon: number } | null {
  const lat = Number(process.env.DOMICILE_LAT);
  const lon = Number(process.env.DOMICILE_LON);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/**
 * Le domicile de référence, par coordonnées OU par adresse.
 *
 * DEUX FAÇONS DE LE POSER, ET C'EST VOULU
 * `DOMICILE_LAT`/`DOMICILE_LON` si Marc a les coordonnées ; sinon `DOMICILE_ADRESSE`, que
 * l'app géocode UNE fois et conserve en base. Demande du 2026-07-31 : ne plus avoir à
 * chercher des coordonnées ni à lancer quoi que ce soit à la main.
 *
 * L'adresse ne part vers Nominatim qu'une seule fois — la position est ensuite relue en
 * base. C'est le minimum : sans géocodage, aucune adresse ne devient une distance.
 */
export async function domicile(): Promise<{ lat: number; lon: number } | null> {
  const direct = domicileConfigure();
  if (direct) return direct;

  const adresse = process.env.DOMICILE_ADRESSE?.trim();
  if (!adresse) return null;

  // Déjà géocodée ? On ne redemande pas : la position d'un domicile ne change pas, et
  // chaque appel évité est un appel de moins vers un service bénévole.
  const [ligne] = await db.select().from(syncState).where(eq(syncState.cle, CLE_DOMICILE));
  if (ligne) {
    try {
      const p = JSON.parse(ligne.valeur) as { lat: number; lon: number };
      if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return p;
    } catch {
      // Valeur illisible : on regéocode plutôt que de rester bloqué.
    }
  }

  const r = await geocoderPlusieurs([adresse], outilsNominatim());
  const trouve = r.trouvees[0];
  if (!trouve) {
    console.error("[domicile] introuvable par géocodage :", r.panne ?? "aucun résultat");
    return null;
  }

  const coord = { lat: trouve.lat, lon: trouve.lon };
  await db
    .insert(syncState)
    .values({ cle: CLE_DOMICILE, valeur: JSON.stringify(coord) })
    .onConflictDoNothing();
  return coord;
}
