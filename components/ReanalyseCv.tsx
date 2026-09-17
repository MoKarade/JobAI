"use client";

// components/ReanalyseCv.tsx — relancer l'analyse d'un CV déjà déposé.
//
// ⚠️ POURQUOI CE COMPOSANT EXISTE : L'ÉCRAN DEMANDAIT UN GESTE QU'IL N'OFFRAIT PAS.
//
// `reanalyserCv` (lib/cv/actions.ts) est écrite, testée, et n'était appelée par AUCUN
// composant. Pendant ce temps, deux endroits de l'écran `/profil` disaient à Marc de s'en
// servir : la liste affiche la raison de l'échec « sans ça, il re-téléverse le même fichier
// en boucle sans savoir ce qui cloche », et le bloc « À valider » écrit noir sur blanc
// « Relance l'analyse de ce CV ». Aucun bouton nulle part. Le seul chemin restant était
// justement celui que le premier commentaire voulait éviter : re-déposer le fichier.
//
// C'est la classe `[FERMETURE-03]` du dépôt — calculé juste, jamais livré — et elle devenait
// coûteuse maintenant : Marc vient de décider de poser `ANTHROPIC_API_KEY`, et c'est
// EXACTEMENT le moment où `[CV-07]` promet « le CV reste stocké pour être ré-analysé d'un
// clic ensuite ». Sans ce bouton, la clé arrive et ne débloque rien de ce qui est déjà là.

import { useState, useTransition } from "react";
import { reanalyserCv } from "@/lib/cv/actions";

export function ReanalyseCv({ id }: { id: number }) {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  function relancer() {
    demarrer(async () => {
      const r = await reanalyserCv(id);
      setRetour(
        r.ok ? { ok: true, texte: r.message ?? "Analyse refaite." } : { ok: false, texte: r.erreur },
      );
    });
  }

  return (
    <>
      <button type="button" className="bouton bouton--discret" onClick={relancer} disabled={enCours}>
        {enCours ? "Analyse…" : "Relancer l’analyse"}
      </button>
      {/* La RAISON telle quelle, jamais réduite à « une erreur est survenue » : c'est elle
          qui dit quoi faire (clé absente, PDF sans texte, réponse hors schéma). */}
      {retour ? (
        <span className={retour.ok ? "revue__retour" : "revue__retour revue__retour--echec"}>
          {retour.texte}
        </span>
      ) : null}
    </>
  );
}
