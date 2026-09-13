// components/BandeauResume.tsx — trois chiffres, et rien d'autre.
//
// ⚠️ CE QU'IL REMPLACE, ET POURQUOI (choix de Marc, 2026-09-13). L'accueil s'ouvrait sur
// quatre blocs empilés — relances, entonnoir, formulaire d'ajout, barre de seize filtres —
// avant la première offre. Mesuré sur le rendu réel à 390 px : la liste commençait à
// 1 267 px du haut, soit UN ÉCRAN ET DEMI de défilement pour voir ce qu'on est venu voir.
// Chacun de ces blocs était justifié pris seul ; empilés sur un téléphone, ils repoussaient
// le contenu hors de vue.
//
// Les trois chiffres retenus répondent aux trois questions qu'on se pose en ouvrant l'app :
// combien je suis, qu'est-ce qui traîne, et qu'est-ce qui vaut la peine. Le reste — le
// détail de l'entonnoir, la liste des relances, le formulaire — n'a pas disparu : il est
// derrière un dépliant, à un geste.
//
// ⚠️ UN CHIFFRE QUI MÉRITE UN GESTE SE SIGNALE, LES AUTRES NON. « À relancer » vire à
// l'ambre quand il n'est pas nul : c'est le seul des trois qui appelle une action. Un
// bandeau où tout est coloré ne signale plus rien — la leçon que ce dépôt a déjà payée
// quand trois signaux empilés sur chaque offre ne hiérarchisaient plus rien.

export function BandeauResume({
  suivies,
  aRelancer,
  notees80Plus,
}: {
  suivies: number;
  aRelancer: number;
  notees80Plus: number;
}) {
  return (
    <div className="resume" role="group" aria-label="Résumé du suivi">
      <div className="resume__case">
        <span className="resume__n">{suivies}</span>
        <span className="resume__l">suivies</span>
      </div>
      <div className={`resume__case${aRelancer > 0 ? " resume__case--alerte" : ""}`}>
        <span className="resume__n">{aRelancer}</span>
        <span className="resume__l">à relancer</span>
      </div>
      <div className="resume__case">
        <span className="resume__n">{notees80Plus}</span>
        <span className="resume__l">notées 80+</span>
      </div>
    </div>
  );
}
