"use client";

// components/BoutonExport.tsx — télécharge le suivi en CSV.
//
// Le fichier est fabriqué dans le navigateur à partir des offres DÉJÀ chargées : pas de
// requête, pas de route à protéger, et surtout l'export correspond exactement à ce qui est
// affiché — filtres compris. Un export qui ne correspond pas à l'écran est une source de
// confusion garantie.
//
// Toute la mise en forme vit dans `lib/export.ts` (pure et testée) ; ici, seulement le
// téléchargement.

import { nomFichierExport, versCsv } from "@/lib/export";
import type { Offre } from "@/lib/types";

export function BoutonExport({ offres }: { offres: readonly Offre[] }) {
  function telecharger() {
    const csv = versCsv(offres);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichierExport(new Date().toISOString());
    a.click();

    // Sans cette libération, chaque export laisse le fichier en mémoire jusqu'au
    // rechargement de la page.
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      className="filtre"
      onClick={telecharger}
      disabled={offres.length === 0}
      title="Télécharge exactement les offres affichées, filtres compris"
    >
      Export CSV ({offres.length})
    </button>
  );
}
