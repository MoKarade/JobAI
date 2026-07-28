"use client";

// components/ListeOffres.tsx — la liste et ses filtres.
//
// Composant client parce que les filtres sont interactifs. Il reçoit TOUTES les offres et
// filtre en mémoire : le volume est de quelques dizaines de lignes, un aller-retour serveur
// par frappe au clavier serait plus lent et plus fragile pour zéro bénéfice.
//
// La logique de filtrage vit dans `lib/filtres.ts` (pure, testée) — ici, seulement l'état
// et le rendu.

import { useMemo, useState } from "react";
import type { Offre } from "@/lib/types";
import { FILTRES_VIDES, SEUIL_PROCHE_KM, filtrer, type EtatFiltres } from "@/lib/filtres";
import { CarteOffre } from "./CarteOffre";
import { BoutonExport } from "./BoutonExport";

const BOUTONS: readonly { cle: keyof Omit<EtatFiltres, "texte">; libelle: string }[] = [
  { cle: "activesSeules", libelle: "Actives" },
  { cle: "notees80Plus", libelle: "Note 80+" },
  { cle: "proches", libelle: `≤ ${SEUIL_PROCHE_KM} km` },
  { cle: "historique", libelle: "Historique 2025" },
  { cle: "avecPerimees", libelle: "Voir les périmées" },
];

export function ListeOffres({ offres }: { offres: Offre[] }) {
  const [filtres, setFiltres] = useState<EtatFiltres>(FILTRES_VIDES);
  const visibles = useMemo(() => filtrer(offres, filtres), [offres, filtres]);

  function basculer(cle: keyof Omit<EtatFiltres, "texte">) {
    setFiltres((f) => ({ ...f, [cle]: !f[cle] }));
  }

  return (
    <>
      <div className="controles">
        <input
          type="search"
          className="controles__recherche"
          placeholder="Filtrer (entreprise, poste, note)…"
          aria-label="Filtrer les offres"
          value={filtres.texte}
          onChange={(e) => setFiltres((f) => ({ ...f, texte: e.target.value }))}
        />
        {BOUTONS.map(({ cle, libelle }) => (
          <button
            key={cle}
            type="button"
            className={`filtre${filtres[cle] ? " filtre--actif" : ""}`}
            aria-pressed={filtres[cle]}
            onClick={() => basculer(cle)}
          >
            {libelle}
          </button>
        ))}
        {/* L'export suit les filtres : ce qu'on télécharge est ce qu'on voit. */}
        <BoutonExport offres={visibles} />
      </div>

      {/* Le compte est annoncé aux lecteurs d'écran : sans lui, un filtre qui vide la liste
          est un changement silencieux. */}
      <p className="controles__compte" role="status">
        {visibles.length} offre{visibles.length > 1 ? "s" : ""} affichée
        {visibles.length > 1 ? "s" : ""} sur {offres.length}
      </p>

      {visibles.length === 0 ? (
        <p className="vide">Aucune offre ne correspond aux filtres.</p>
      ) : (
        <div className="liste">
          {visibles.map((o) => (
            <CarteOffre key={o.id} offre={o} />
          ))}
        </div>
      )}
    </>
  );
}
