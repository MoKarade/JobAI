// components/AFaire.tsx — l'entrée en matière : quoi faire maintenant.
//
// La page s'ouvrait sur la liste complète triée par note, ce qui répond à « quelles sont
// les meilleures offres » mais pas à « par où je commence aujourd'hui ». Ce bloc répond à
// la seconde question, et rien d'autre.
//
// Composant SERVEUR : que des liens, aucun état. Chaque action mène au détail de l'offre
// concernée, où se trouvent les contrôles qui permettent de la traiter.
//
// Le motif est affiché SOUS le titre, toujours : une suggestion dont on ne voit pas le fait
// déclencheur ne peut pas être contestée, et une liste qu'on ne peut pas contester finit
// par être ignorée en bloc.

import Link from "next/link";
import type { Action, GenreAction } from "@/lib/aFaire";

/** Un mot, pas une icône : il est lu par les lecteurs d'écran et se traduit. */
const ETIQUETTE: Record<GenreAction, string> = {
  entrevue: "Entrevue",
  relancer: "Relance",
  postuler: "Candidature",
  verifier: "À vérifier",
};

export function AFaire({ actions }: { actions: readonly Action[] }) {
  // Rien à faire est un vrai résultat, pas un vide à masquer : le dire évite de chercher
  // un bloc qui n'aurait pas chargé.
  if (actions.length === 0) {
    return (
      <section className="afaire afaire--vide" aria-labelledby="afaire-titre">
        <h2 id="afaire-titre" className="afaire__titre">
          À faire maintenant
        </h2>
        <p className="afaire__rien">
          Rien qui appelle une action aujourd’hui : aucune entrevue à préparer, aucune
          relance échue, aucune offre bien notée en attente.
        </p>
      </section>
    );
  }

  return (
    <section className="afaire" aria-labelledby="afaire-titre">
      <h2 id="afaire-titre" className="afaire__titre">
        À faire maintenant
      </h2>
      <ol className="afaire__liste">
        {actions.map((a) => (
          <li key={`${a.genre}-${a.offreId}`} className={`afaire__item afaire__item--${a.genre}`}>
            <span className="afaire__genre">{ETIQUETTE[a.genre]}</span>
            <Link href={`/offre/${a.offreId}`} className="afaire__lien">
              {a.titre}
            </Link>
            <span className="afaire__motif">{a.motif}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
