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
import { FILTRES_VIDES, filtrer, sansDistanceMesuree, type EtatFiltres } from "@/lib/filtres";
import { CarteOffre } from "./CarteOffre";
import { BoutonExport } from "./BoutonExport";
import { CompteFiltre, Filtres } from "./Filtres";

export function ListeOffres({ offres }: { offres: Offre[] }) {
  const [filtres, setFiltres] = useState<EtatFiltres>(FILTRES_VIDES);
  const visibles = useMemo(() => filtrer(offres, filtres), [offres, filtres]);

  const sansDistance = useMemo(() => sansDistanceMesuree(offres, filtres), [offres, filtres]);

  return (
    <>
      {/* La MÊME barre que la carte (`components/Filtres.tsx`) : deux copies auraient
          divergé, et Marc a demandé des filtres identiques partout. */}
      <Filtres
        filtres={filtres}
        onChange={setFiltres}
        etiquetteRecherche="Filtrer (entreprise, poste, note)…"
      >
        {/* L'export suit les filtres : ce qu'on télécharge est ce qu'on voit. */}
        <BoutonExport offres={visibles} />
      </Filtres>

      <CompteFiltre
        affichees={visibles.length}
        total={offres.length}
        sansDistance={sansDistance}
        nom="offre"
      />

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
