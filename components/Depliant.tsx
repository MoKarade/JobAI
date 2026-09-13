// components/Depliant.tsx — un bloc qu'on ouvre quand on en a besoin.
//
// ⚠️ `<details>` NATIF, PAS UN `useState` (refonte téléphone, 2026-09-13). Trois raisons,
// et la première suffit : c'est un Server Component, donc le bloc replié ne coûte aucun
// JavaScript au chargement — sur un téléphone en 4G, c'est ce qui décide de la vitesse
// d'ouverture. Ensuite le clavier, le lecteur d'écran et la recherche dans la page
// fonctionnent sans qu'on ait à les recoder. Enfin l'état ouvert/fermé survit au rendu
// React sans qu'on le porte nulle part.
//
// CE QU'IL N'EST PAS : un tiroir à fourre-tout. On y range ce qui est UTILE mais pas
// PERMANENT — le détail du suivi, le formulaire d'ajout. Ce qu'on lit à chaque ouverture
// (les offres, les trois chiffres du bandeau) reste à l'air libre : replier ce qu'on
// consulte tous les jours ajoute un geste quotidien pour gagner une ligne.

export function Depliant({
  titre,
  indice,
  children,
  ouvertParDefaut = false,
}: {
  titre: string;
  /**
   * Ce que le bloc contient, dit en deux mots sur la ligne repliée (« 6 en attente »).
   *
   * Sans lui, un dépliant fermé est une porte sans étiquette : on l'ouvre pour savoir s'il
   * fallait l'ouvrir. L'indice est ce qui permet de NE PAS l'ouvrir.
   */
  indice?: string;
  children: React.ReactNode;
  ouvertParDefaut?: boolean;
}) {
  return (
    <details className="depliant" open={ouvertParDefaut}>
      <summary className="depliant__tete">
        <span className="depliant__titre">{titre}</span>
        {indice ? <span className="depliant__indice">{indice}</span> : null}
        {/* Le chevron tourne à l'ouverture. `aria-hidden` : `<summary>` annonce déjà son
            état plié/déplié, une seconde annonce ne ferait que répéter. */}
        <svg
          className="depliant__chevron"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="depliant__corps">{children}</div>
    </details>
  );
}
