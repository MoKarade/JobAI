// lib/rayon.ts — le rayon de recherche, réglable par Marc.
//
// POURQUOI IL NE VIT PLUS SEULEMENT DANS `PROFIL_DEFAUT`
// Le rayon est le critère n°1 de Marc, et c'était la seule valeur du barème qu'il ne pouvait
// pas toucher sans un commit. Il est passé de 50 à 75 km le 2026-08-17 — par une modification
// du code, doublée d'un rallongement à la main de la liste blanche des municipalités, parce
// que les deux décrivaient la même aire chacun de son côté. Ce couplage a disparu depuis que
// les lieux se MESURENT (`lib/ingest/lieux.ts`) : il n'y a plus qu'un nombre à changer.
//
// ⚠️ LE POINT DÉLICAT N'EST PAS DE RÉGLER LE RAYON, C'EST CE QU'IL PÉRIME.
// Chaque verdict du registre des lieux a été rendu SOUS un rayon donné : « Baie-Comeau, hors
// région » veut dire « à plus de 75 + 15 km ». Changer le rayon sans retoucher le registre
// laisserait ces verdicts en place — et une ville qui vient d'entrer dans le rayon resterait
// refusée à vie, sans que rien ne le signale. C'est mot pour mot la leçon déjà consignée :
// « un délai de retente encode une PRÉMISSE : quand elle tombe, le délai doit tomber avec ».
//
// Ce qui sauve la mise : le registre stocke la DISTANCE mesurée, pas seulement le verdict.
// Re-juger ne coûte donc AUCUNE requête — c'est une fonction pure sur des nombres déjà en
// base. Sans ce champ, il aurait fallu re-géocoder des dizaines de villes à chaque réglage.

import { deciderLieu, type RegistreLieux } from "./ingest/lieux";
import { PROFIL_DEFAUT, type Profil } from "./profil";

/** Clé sous laquelle le rayon réglé par Marc est conservé. */
export const CLE_RAYON = "veille-rayon";

/**
 * Bornes du réglage.
 *
 * Le plancher à 5 km : en dessous, le rayon n'attrape plus que le quartier, et une liste
 * vide se lirait comme une panne de la veille. Le plafond à 300 km : au-delà, « la région de
 * Québec » ne veut plus rien dire — Montréal entre, et avec elle un volume qui noierait le
 * suivi. Ce ne sont pas des limites techniques mais des garde-fous de sens ; le formulaire
 * les dit à l'écran plutôt que de refuser en silence.
 */
export const RAYON_MIN_KM = 5;
export const RAYON_MAX_REGLABLE_KM = 300;

/** Le rayon du profil, quand Marc n'a rien réglé. */
export const RAYON_DEFAUT_KM = PROFIL_DEFAUT.rayonMaxKm;

/**
 * Ramène une valeur saisie dans les bornes, ou rend `null` si elle n'est pas un nombre.
 *
 * PURE. `null` plutôt qu'un repli silencieux sur le défaut : une saisie illisible est une
 * erreur de l'utilisateur, et la lui dire vaut mieux que d'appliquer un rayon qu'il n'a pas
 * demandé et qu'il croira être le sien.
 */
export function normaliserRayon(saisie: unknown): number | null {
  const n = typeof saisie === "number" ? saisie : Number(String(saisie ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const arrondi = Math.round(n);
  if (arrondi < RAYON_MIN_KM || arrondi > RAYON_MAX_REGLABLE_KM) return null;
  return arrondi;
}

/** Le profil du barème, avec le rayon réglé. Tout le reste est inchangé. */
export function profilAvecRayon(rayonMaxKm: number, base: Profil = PROFIL_DEFAUT): Profil {
  return { ...base, rayonMaxKm };
}

/**
 * Re-juge TOUT le registre des lieux sous un nouveau rayon.
 *
 * PURE, et sans réseau : chaque entrée porte déjà sa distance mesurée. C'est ce qui rend le
 * réglage instantané et gratuit — et c'est la raison pour laquelle `appliquerJugements`
 * stocke `km` au lieu du seul verdict.
 *
 * Les `introuvable` sont laissés tels quels : leur problème n'est pas la distance, c'est
 * qu'on n'a pas pu la mesurer. Les re-juger à partir d'un `km` nul inventerait un verdict.
 * Ils repasseront par le géocodeur à leur palier de retente, comme toujours.
 *
 * `le` et `essais` sont CONSERVÉS : re-juger n'est pas re-mesurer. Remettre la date à
 * aujourd'hui ferait croire à une mesure fraîche, et remettre les essais à zéro rendrait
 * son palier de retente à un nom qui n'en a pas gagné un.
 */
export function rejugerRegistre(registre: RegistreLieux, rayonMaxKm: number): RegistreLieux {
  const suivant: RegistreLieux = {};
  for (const [nom, juge] of Object.entries(registre)) {
    if (juge.verdict === "introuvable" || juge.km === null) {
      suivant[nom] = juge;
      continue;
    }
    suivant[nom] = { ...juge, verdict: deciderLieu(juge.km, rayonMaxKm) };
  }
  return suivant;
}

/** Combien de verdicts un re-jugement ferait changer. Sert à le DIRE à l'écran. */
export function compterBascules(registre: RegistreLieux, rayonMaxKm: number): number {
  const apres = rejugerRegistre(registre, rayonMaxKm);
  return Object.keys(registre).filter((nom) => registre[nom]?.verdict !== apres[nom]?.verdict)
    .length;
}
