"use client";

// components/AppliquerBareme.tsx — le geste qui applique le nouveau barème (ADR-0032, JobAI#152).
//
// ⚠️ UN BOUTON, PAS UN AUTOMATISME. L'aperçu est affiché juste au-dessus ; ce bouton est le seul
// chemin qui écrit le nouveau profil et re-note les offres. La réponse dit combien de notes ont
// bougé, ou la raison de l'échec telle quelle (même discipline que `ReanalyseCv`).
//
// ⚠️ LE COMPOSANT RESTE MONTÉ APRÈS L'APPLICATION. L'action revalide `/profil` : la page repasse en
// « déjà appliqué », et si ce composant disparaissait avec elle, le message de résultat — ou de
// relance après un échec partiel — partirait avant d'être lu. La page le rend donc à la même place
// dans les deux états ; `reste` dit s'il y a encore quelque chose à faire (bouton visible).

import { useState, useTransition } from "react";
import { appliquerBaremeSalaire } from "@/lib/cv/actions";

export function AppliquerBareme({ reste, libelle }: { reste: boolean; libelle: string }) {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  function appliquer() {
    demarrer(async () => {
      try {
        const r = await appliquerBaremeSalaire();
        setRetour(
          r.ok
            ? { ok: true, texte: `Réussi : ${r.message ?? "barème appliqué."} ${r.valeur.resume}` }
            : { ok: false, texte: `Échec : ${r.erreur}` },
        );
      } catch (e) {
        // Une action qui lève ne doit pas finir en page d'erreur muette : la raison s'affiche ici.
        setRetour({ ok: false, texte: `Échec : ${(e as Error).message}` });
      }
    });
  }

  return (
    <div className="revue__pied">
      {reste ? (
        <button type="button" className="bouton" onClick={appliquer} disabled={enCours}>
          {enCours ? "Application…" : libelle}
        </button>
      ) : null}
      {/* Deux régions toujours montées : une région vivante insérée déjà remplie n'est pas annoncée
          par tous les lecteurs d'écran. L'échec est une alerte, le succès un statut. */}
      <p role="status" className={retour?.ok ? "revue__retour" : undefined}>
        {retour?.ok ? retour.texte : enCours ? "Application en cours…" : ""}
      </p>
      <p role="alert" className={retour && !retour.ok ? "revue__retour revue__retour--echec" : undefined}>
        {retour && !retour.ok ? retour.texte : ""}
      </p>
    </div>
  );
}
