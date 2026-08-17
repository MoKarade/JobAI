// components/Cadre.tsx — l'en-tête et les onglets, partagés par les pages de session.
//
// Les onglets sont de vraies ROUTES, pas un état client (ADR-0003) : chaque onglet a une
// URL, donc il se met en signet, le bouton Retour fonctionne, et chaque page ne charge que
// ce qu'elle affiche. Un onglet en `useState` aurait imposé de tout rendre pour n'en
// montrer qu'un.
//
// La page de connexion n'utilise PAS ce cadre : hors session, il n'y a aucun onglet à
// proposer, et en afficher donnerait l'illusion d'un accès.

import Link from "next/link";

export interface Onglet {
  href: string;
  libelle: string;
}

export const ONGLETS: readonly Onglet[] = [
  { href: "/", libelle: "Suivi" },
  { href: "/carte", libelle: "Carte" },
  { href: "/references", libelle: "Références" },
  // Le profil vient EN DERNIER : on l'ouvre quelques fois par an (un CV change rarement),
  // alors que le suivi s'ouvre tous les jours. L'ordre des onglets suit la fréquence
  // d'usage, jamais l'ordre dans lequel les pages ont été écrites.
  { href: "/profil", libelle: "Profil" },
  // Même règle, appliquée jusqu'au bout : les sources s'ouvrent encore moins souvent que le
  // profil — quelques fois pour lancer le balayage des pages carrières, puis presque jamais.
  // Elles sont pourtant la seule réponse à « pourquoi si peu d'offres aujourd'hui ? ».
  { href: "/sources", libelle: "Sources" },
];

export function Cadre({
  actif,
  titre,
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
  children: React.ReactNode;
}) {
  return (
    <div className="page">
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
        <p className="entete__sous">Coordination technique et automatisation · rayon 50 km</p>
      </header>

      {/* `aria-current="page"` et non une simple classe : c'est ce qui annonce l'onglet
          courant à un lecteur d'écran. La couleur seule ne porte jamais l'information. */}
      <nav className="onglets" aria-label="Sections">
        {ONGLETS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className={`onglet${actif === o.href ? " onglet--actif" : ""}`}
            aria-current={actif === o.href ? "page" : undefined}
          >
            {o.libelle}
          </Link>
        ))}
      </nav>

      {/* `<main>` ne contient QUE le contenu de l'onglet : l'en-tête et la navigation
          restent en dehors, pour que « aller au contenu principal » saute bien les onglets. */}
      <main>
        {titre ? <h1 className="hors-ecran">{titre}</h1> : null}
        {children}
      </main>
    </div>
  );
}
