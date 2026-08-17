"use client";

// components/BoutonVeille.tsx — relancer la veille, autant de fois qu'on veut.
//
// Ce bouton aurait été un DÉFAUT il y a une heure. Le compteur d'absences montait à chaque
// passe : trois clics périmaient tout le stock. Il n'est devenu possible qu'une fois les
// absences comptées par JOUR — le balayage est idempotent dans la journée, donc relancer ne
// coûte que du temps, jamais des offres.

import { useState, useTransition } from "react";
import { lancerVeille } from "@/lib/actionsVeille";

export function BoutonVeille() {
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <div className="veille">
      <button
        type="button"
        className="bouton"
        disabled={enCours}
        onClick={() => {
          setMessage(null);
          demarrer(async () => {
            const r = await lancerVeille();
            if (!r.ok) {
              setMessage(r.erreur);
              return;
            }
            // Le compte rendu porte les mêmes nombres que la trace serveur : « 0 sur 0 » et
            // « 0 sur 161 » sont deux situations opposées, et un simple « c'est fait » les
            // confondrait. Le détail PAR SOURCE est ce qui manquait le plus — un total de
            // zéro ne dit pas laquelle des sources s'est tue.
            const muettes = r.sources.filter((s) => !s.ok);
            // ⚠️ LE COMPTE DOIT S'ADDITIONNER. Sans « hors région » ni « lieu inconnu »,
            // 74 offres sur 100 disparaissaient de l'écran sans motif — un total dont les
            // parties ne font pas la somme se lit comme une panne, alors que le tri
            // travaillait très bien. Le reliquat est affiché explicitement : s'il n'est pas
            // nul, c'est qu'un motif de rejet nous échappe encore, et il faut le voir.
            const explique =
              r.nouvelles + r.doublons + r.ecartees + r.horsRegion + r.lieuInconnu;
            const reste = r.trouvees - explique;
            setMessage(
              `${r.trouvees} trouvée(s) · ${r.nouvelles} nouvelle(s) · ` +
                `${r.doublons} déjà connue(s) · ${r.ecartees} sous le plancher · ` +
                `${r.horsRegion} hors région · ${r.lieuInconnu} lieu inconnu · ` +
                (reste !== 0 ? `${reste} SANS MOTIF · ` : "") +
                `${r.perimees} périmée(s) · ${r.enSursis} en sursis. ` +
                `Sources : ${
                  r.sources.length === 0
                    ? "aucune"
                    : r.sources.map((s) => `${s.id} ${s.ok ? s.offres : "EN ÉCHEC"}`).join(" · ")
                }` +
                (muettes.length > 0 ? ` — ${muettes.map((s) => s.erreur ?? "?").join(" · ")}` : ""),
            );
          });
        }}
      >
        {enCours ? "Veille en cours…" : "Lancer la veille maintenant"}
      </button>

      <p className="veille__message" role="status">
        {enCours ? "Veille en cours — sources, tri, péremption, distances." : message}
      </p>

      <p className="veille__note">
        Relançable autant de fois que tu veux : une offre absente n’est comptée absente
        qu’une fois par jour, jamais une fois par passe. Rien ne vieillit parce que tu
        recliques.
      </p>
    </div>
  );
}
