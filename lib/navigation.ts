// lib/navigation.ts — les destinations de l'app, en UN exemplaire.
//
// Elles vivaient dans `components/Cadre.tsx`, qui rendait aussi les onglets. Depuis la
// refonte téléphone (2026-09-13) DEUX rendus les consomment — la barre fixée en bas sur
// téléphone et la même barre remontée en haut sur grand écran — et un troisième lecteur
// existe déjà : le test qui vérifie que chaque route rendue est bien gardée. Une liste
// recopiée à trois endroits perd la destination suivante sans que rien ne le signale :
// c'est la classe de défaut que ce dépôt a déjà payée quatre fois sur des listes de
// colonnes, une fois sur l'empreinte du seed, une fois sur les tables du migrateur.

import type { GenreNav } from "@/components/Icone";

export interface Onglet {
  href: string;
  libelle: string;
  icone: GenreNav;
  /**
   * Visible D'EMBLÉE sur téléphone, plutôt que derrière « Plus ».
   *
   * ⚠️ LE CRITÈRE EST LA FRÉQUENCE D'USAGE, PAS L'IMPORTANCE. Le suivi s'ouvre tous les
   * jours, la carte quand on prépare une tournée ; le profil se touche quelques fois par
   * an (un CV change rarement) et les sources encore moins — elles ne servent qu'à
   * répondre à « pourquoi si peu d'offres aujourd'hui ? ». Trois cibles larges valent
   * mieux que cinq étroites : sur 375 px, cinq onglets alignés mesuraient 431 px, donc
   * débordaient l'écran de 56 px — mesuré avant la refonte.
   */
  principal: boolean;
}

export const ONGLETS: readonly Onglet[] = [
  { href: "/", libelle: "Suivi", icone: "suivi", principal: true },
  { href: "/carte", libelle: "Carte", icone: "carte", principal: true },
  { href: "/references", libelle: "Références", icone: "references", principal: false },
  { href: "/profil", libelle: "Profil", icone: "profil", principal: false },
  { href: "/sources", libelle: "Sources", icone: "sources", principal: false },
];

/** Les onglets rangés derrière « Plus » sur téléphone. */
export const SECONDAIRES: readonly Onglet[] = ONGLETS.filter((o) => !o.principal);

/**
 * L'onglet « Plus » est-il l'onglet courant ?
 *
 * PURE, et c'est ce qui la rend testable : une pastille d'état calculée dans le rendu ne
 * se vérifie qu'à l'œil, sur l'écran qu'on n'a pas rouvert.
 */
export function plusEstActif(actif: string | null): boolean {
  return SECONDAIRES.some((o) => o.href === actif);
}
