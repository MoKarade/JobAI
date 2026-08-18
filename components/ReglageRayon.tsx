"use client";

// components/ReglageRayon.tsx — le critère n°1 de Marc, enfin réglable sans commit.
//
// Le rayon décide de DEUX choses, et l'écran doit le dire : quelles offres entrent (une ville
// hors rayon est refusée) et quelle note elles reçoivent (au-delà du rayon, la composante
// distance tombe à zéro). Un réglage dont on ne comprend pas la portée se règle au hasard.
//
// ⚠️ CE QU'IL AFFICHE APRÈS COUP EST LA PARTIE QUI COMPTE. Changer le rayon périme les
// verdicts de lieu déjà rendus, et l'action les re-juge. Le nombre de bascules est rapporté
// ici parce que « 0 bascule sur 0 lieu » et « 0 bascule sur 40 lieux » sont deux situations
// opposées : la première dit qu'il n'y avait rien à re-juger, la seconde que le réglage n'a
// libéré aucune ville. Sans le second nombre, un réglage sans effet passerait pour un succès.

import { useState, useTransition } from "react";
import { reglerRayon } from "@/lib/actionsRayon";
import { RAYON_MAX_REGLABLE_KM, RAYON_MIN_KM } from "@/lib/rayon";

export function ReglageRayon({ rayonInitial }: { rayonInitial: number }) {
  const [saisie, setSaisie] = useState(String(rayonInitial));
  const [applique, setApplique] = useState(rayonInitial);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <form
      className="rayon"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        setErreur(null);
        demarrer(async () => {
          const r = await reglerRayon(saisie);
          if (!r.ok) {
            setErreur(r.erreur);
            return;
          }
          setApplique(r.rayonKm);
          setMessage(
            r.lieux === 0
              ? `Rayon réglé à ${r.rayonKm} km. Aucun lieu mesuré à re-juger pour l’instant.`
              : r.bascules === 0
                ? `Rayon réglé à ${r.rayonKm} km. Aucun des ${r.lieux} lieux déjà mesurés ne change de verdict.`
                : `Rayon réglé à ${r.rayonKm} km. ${r.bascules} lieu(x) sur ${r.lieux} changent de verdict — la prochaine passe en tiendra compte.`,
          );
        });
      }}
    >
      <label className="rayon__label" htmlFor="rayon-km">
        Rayon de recherche
      </label>
      <div className="rayon__ligne">
        <input
          id="rayon-km"
          className="rayon__champ"
          type="number"
          inputMode="numeric"
          min={RAYON_MIN_KM}
          max={RAYON_MAX_REGLABLE_KM}
          step={5}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          disabled={enCours}
        />
        <span className="rayon__unite">km</span>
        <button type="submit" className="bouton" disabled={enCours || saisie === String(applique)}>
          {enCours ? "Réglage…" : "Appliquer"}
        </button>
      </div>

      <p className="rayon__aide">
        À vol d’oiseau depuis chez toi. Il décide de deux choses : une offre dont la ville est
        au-delà n’entre pas, et une offre mesurée au-delà perd toute sa note de distance.
        Entre {RAYON_MIN_KM} et {RAYON_MAX_REGLABLE_KM} km.
      </p>

      <p className="rayon__message" role="status">
        {erreur ?? message ?? ""}
      </p>
    </form>
  );
}
