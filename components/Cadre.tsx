// components/Cadre.tsx — l'en-tête et la navigation, partagés par les pages de session.
//
// Les destinations sont de vraies ROUTES, pas un état client (ADR-0003) : chaque onglet a
// une URL, donc il se met en signet, le bouton Retour fonctionne, et chaque page ne charge
// que ce qu'elle affiche. Un onglet en `useState` aurait imposé de tout rendre pour n'en
// montrer qu'un.
//
// ⚠️ LA NAVIGATION A QUITTÉ CE FICHIER (refonte téléphone, 2026-09-13) : elle vit dans
// `BarreNav`, fixée en bas de l'écran sur téléphone et remontée en haut sur grand écran.
// Ce qui reste ici est le CADRE au sens strict — la marque, le titre pour lecteur d'écran,
// et `<main>`.
//
// La page de connexion n'utilise PAS ce cadre : hors session, il n'y a aucune destination à
// proposer, et en afficher donnerait l'illusion d'un accès.

import Link from "next/link";
import { BarreNav } from "./BarreNav";

export { ONGLETS } from "@/lib/navigation";

export function Cadre({
  actif,
  titre,
  pleinEcran = false,
  children,
}: {
  /** `href` de l'onglet courant, ou `null` pour une page hors onglets (le détail d'une offre). */
  actif: string | null;
  /**
   * Titre de niveau 1 de la page.
   *
   * Rendu POUR LES LECTEURS D'ÉCRAN seulement : à l'écran, l'onglet actif dit déjà où l'on
   * est, et un titre visible qui répète l'onglet ne fait qu'allonger la page. Mais une page
   * sans `<h1>` n'a pas de point d'entrée pour qui navigue par titres — et la marque
   * « JOB_AI », répétée sur chaque page, est une identité de site, pas un titre de page.
   *
   * Omis quand la page porte son propre `<h1>` (le détail d'une offre : l'entreprise).
   */
  titre?: string;
  /**
   * La page REMPLIT l'écran, sans défilement en dehors de son propre contenu scrollable
   * (demande de Marc, 2026-08-21 : « je veux pas pouvoir scroll sous la map »). Seule la
   * carte s'en sert : l'en-tête garde sa taille NATURELLE, `<main>` absorbe tout le reste
   * en flex — aucun chiffre de réserve à deviner, qui dériverait au premier ajout de barre
   * d'outils (vécu : `100vh - 13rem` était déjà trop court).
   */
  pleinEcran?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`page${pleinEcran ? " page--pleine" : ""}`}>
      <header className="entete">
        <Link href="/" className="entete__marque">
          {/* Le même motif que `app/icon.svg` : l'invite `>_`. Ici il est DESSINÉ plutôt
              qu'importé, pour suivre la couleur du texte au survol — une image figée
              resterait ambre là où l'encre change.
              `aria-hidden` : le texte « JOB_AI » juste à côté donne déjà le nom du lien. */}
          <svg
            className="entete__mark"
            viewBox="0 0 32 32"
            aria-hidden="true"
            focusable="false"
          >
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 10.5 L14.5 16 L9 21.5" />
              <path d="M18.5 22.5 L24 22.5" />
            </g>
          </svg>
          <span>
            JOB<span className="entete__accent">_</span>AI
          </span>
        </Link>
      </header>

      {/* `<main>` ne contient QUE le contenu de l'onglet : l'en-tête et la navigation
          restent en dehors, pour que « aller au contenu principal » saute bien la barre. */}
      <main>
        {titre ? <h1 className="hors-ecran">{titre}</h1> : null}
        {children}
      </main>

      {/* En DERNIER dans le DOM, même si elle s'affiche en bas de l'écran : l'ordre de
          tabulation suit le DOM, et personne ne veut traverser cinq onglets avant
          d'atteindre la liste qu'il est venu lire. */}
      <BarreNav actif={actif} />
    </div>
  );
}
