"use client";

// components/BarreNav.tsx — la navigation, au pouce.
//
// ⚠️ EN BAS SUR TÉLÉPHONE (choix de Marc, 2026-09-13). Les cinq onglets vivaient en haut,
// alignés : mesuré sur le rendu réel, ils faisaient 431 px de large sur un écran de 375 —
// donc l'app s'ouvrait avec un défilement latéral, le grief exact de Marc. Les remettre en
// haut « mais plus petits » aurait échangé un défaut contre un autre : une cible de 40 px
// à l'endroit le plus éloigné du pouce.
//
// Trois cibles larges en bas, la quatrième (« Plus ») ouvre le reste. Sur grand écran, la
// même barre remonte dans le flux et déplie tout — aucun composant en double, c'est le CSS
// qui décide : deux implémentations de la même navigation auraient divergé au premier
// onglet ajouté.
//
// Composant CLIENT pour une seule raison : l'état ouvert/fermé de « Plus ». Les
// destinations restent de vraies routes (`<Link>`), donc le bouton Retour fonctionne et
// chaque onglet se met en signet — ce que ce dépôt a tranché dès l'ADR-0003.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ONGLETS, SECONDAIRES, plusEstActif } from "@/lib/navigation";
import { IconeNav } from "./Icone";

export function BarreNav({ actif }: { actif: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  const barre = useRef<HTMLElement>(null);

  // Le panneau se referme quand on touche ailleurs ou qu'on appuie sur Échap. Sans ça, il
  // reste ouvert par-dessus la liste et il faut viser à nouveau le bouton pour s'en sortir —
  // un cul-de-sac, et le plus agaçant qui soit puisqu'il masque ce qu'on voulait lire.
  useEffect(() => {
    if (!ouvert) return;

    const dehors = (e: PointerEvent) => {
      if (!barre.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };

    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  return (
    <nav className="barre" aria-label="Sections" ref={barre}>
      {ONGLETS.filter((o) => o.principal).map((o) => (
        <Link
          key={o.href}
          href={o.href}
          className={`barre__lien${actif === o.href ? " barre__lien--actif" : ""}`}
          aria-current={actif === o.href ? "page" : undefined}
          onClick={() => setOuvert(false)}
        >
          <IconeNav genre={o.icone} />
          <span className="barre__libelle">{o.libelle}</span>
        </Link>
      ))}

      {/* `display: contents` sur grand écran : ces trois-là rejoignent la rangée au lieu
          d'être un panneau. Le DOM ne change pas, seule la mise en page. */}
      <div className="barre__secondaires" data-ouvert={ouvert ? "oui" : "non"}>
        {SECONDAIRES.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className={`barre__lien${actif === o.href ? " barre__lien--actif" : ""}`}
            aria-current={actif === o.href ? "page" : undefined}
            onClick={() => setOuvert(false)}
          >
            <IconeNav genre={o.icone} />
            <span className="barre__libelle">{o.libelle}</span>
          </Link>
        ))}
      </div>

      {/* `aria-expanded` dit l'état, `aria-controls` dit quoi : un bouton qui ouvre un
          panneau sans l'annoncer laisse qui n'a pas l'écran sous les yeux sans repère. */}
      <button
        type="button"
        className={`barre__lien barre__plus${plusEstActif(actif) ? " barre__lien--actif" : ""}`}
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <IconeNav genre="plus" />
        <span className="barre__libelle">Plus</span>
      </button>
    </nav>
  );
}
