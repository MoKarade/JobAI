"use client";

// components/BoutonVeille.tsx — relancer la veille, autant de fois qu'on veut.
//
// Ce bouton aurait été un DÉFAUT il y a peu. Le compteur d'absences montait à chaque passe :
// trois clics périmaient tout le stock. Il n'est devenu possible qu'une fois les absences
// comptées par JOUR — le balayage est idempotent dans la journée, donc relancer ne coûte que
// du temps, jamais des offres.
//
// ⚠️ IL N'ASSEMBLE PLUS SON COMPTE RENDU, ET C'ÉTAIT LE DÉFAUT. Le rapport vivait ici, dans
// une chaîne concaténée à la main : il n'existait donc QUE quand Marc cliquait, alors que la
// veille tourne surtout toute seule. Il est désormais construit par `lib/rapportVeille.ts`
// DANS la passe, écrit en base, et rendu par le même composant que sur `/sources`. Ce bouton
// ne fait plus que deux choses : lancer, et montrer ce que la passe a rendu.

import { useState, useTransition } from "react";
import { lancerVeille } from "@/lib/actionsVeille";
import { RapportVeilleVue } from "@/components/RapportVeille";
import type { RapportVeille } from "@/lib/rapportVeille";

export function BoutonVeille() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<RapportVeille | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <div className="veille">
      <button
        type="button"
        className="bouton"
        disabled={enCours}
        onClick={() => {
          setErreur(null);
          demarrer(async () => {
            const r = await lancerVeille();
            if (!r.ok) {
              setErreur(r.erreur);
              return;
            }
            setRapport(r.rapport);
          });
        }}
      >
        {enCours ? "Veille en cours…" : "Passer la veille maintenant"}
      </button>

      <p className="veille__message" role="status">
        {enCours ? "Sources, tri, péremption, localisation." : (erreur ?? "")}
      </p>

      {/* `Date.now()` est lu au rendu CLIENT, ici : ce composant est déjà `"use client"`,
          il n'y a donc aucun rendu serveur à faire diverger. La page, elle, passe un
          instant figé côté serveur — même composant, deux sources d'horloge, aucune
          erreur d'hydratation. */}
      {rapport !== null && !enCours ? (
        <RapportVeilleVue rapport={rapport} maintenant={Date.now()} titre="Cette passe" />
      ) : null}

      <p className="veille__note">
        Relançable autant de fois que tu veux : une offre absente n’est comptée absente
        qu’une fois par jour, jamais une fois par passe. Rien ne vieillit parce que tu
        recliques.
      </p>
    </div>
  );
}
