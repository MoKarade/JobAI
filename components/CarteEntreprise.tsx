"use client";

// components/CarteEntreprise.tsx — une entreprise regroupée, qui se DÉPLIE sur ses offres.
//
// MÊME GESTE QUE `CarteOffre` (clic agrandit, ça ne navigue pas) : demande de Marc,
// 2026-08-21 — « permettre de cliquer sur la carte entreprise pour avoir plus d'info sur
// l'entreprise et voir toutes les offres avec notes, possible de cliquer chaque offre pour
// avoir la même carte que les offres actuelles ». Dépliée, elle rend CHAQUE offre avec le
// MÊME composant que la liste plate d'avant (`CarteOffre`) — aucune seconde implémentation
// d'une carte d'offre, qui aurait fini par diverger de celle-ci.
//
// Le classement des groupes ET des offres à l'intérieur vient de `lib/groupesEntreprise.ts`
// (pur, testé) : ce composant ne trie rien, il affiche.

import { useId, useState } from "react";
import type { GroupeEntreprise } from "@/lib/groupesEntreprise";
import { palier } from "@/lib/scoring";
import { couleurNote, encreSurNote } from "@/lib/couleurNote";
import { Fait } from "./Icone";
import { CarteOffre } from "./CarteOffre";

export function CarteEntreprise({ groupe }: { groupe: GroupeEntreprise }) {
  const [ouverte, setOuverte] = useState(false);
  const idDetail = useId();
  const p = palier(groupe.noteMoyenne);
  const plusieurs = groupe.offres.length > 1;

  return (
    <article className={`carte carte--${p}${ouverte ? " carte--ouverte" : ""}`}>
      {/* Même calcul de couleur que `CarteOffre` — un même score doit se dire de la même
          façon partout, sinon la liste plate et la liste groupée se contredisent. */}
      <div
        className={`note note--${p}`}
        style={{ background: couleurNote(groupe.noteMoyenne), color: encreSurNote() }}
        title={
          groupe.noteMoyenne === null
            ? "Aucune offre notée"
            : plusieurs
              ? `${groupe.noteMoyenne} sur 100 — moyenne de ${groupe.notees} offre${groupe.notees > 1 ? "s" : ""} notée${groupe.notees > 1 ? "s" : ""} sur ${groupe.offres.length}`
              : `${groupe.noteMoyenne} sur 100`
        }
      >
        {groupe.noteMoyenne ?? "–"}
      </div>

      <button
        type="button"
        className="carte__tete"
        aria-expanded={ouverte}
        aria-controls={idDetail}
        onClick={() => setOuverte((o) => !o)}
      >
        <span className="carte__entreprise">{groupe.nom}</span>
        <span className="carte__poste">
          {groupe.offres.length} offre{plusieurs ? "s" : ""}
          {groupe.notees === 0
            ? " · pas encore notée"
            : plusieurs && groupe.meilleureNote !== groupe.noteMoyenne
              ? ` · meilleure ${groupe.meilleureNote}`
              : ""}
        </span>
      </button>

      <p className="carte__km">
        <Fait genre="route" discret={groupe.kmMin === null}>
          {groupe.kmMin !== null ? `${groupe.kmMin.toString().replace(".", ",")} km` : "—"}
        </Fait>
      </p>

      {/* Toujours dans le DOM, masqué par `hidden` — même raison que `CarteOffre` : le
          monter/démonter au clic ferait perdre l'état déplié de chaque offre à l'intérieur. */}
      <div id={idDetail} className="carte__detail" hidden={!ouverte}>
        <div className="liste liste--groupee">
          {groupe.offres.map((o) => (
            <CarteOffre key={o.id} offre={o} />
          ))}
        </div>
      </div>
    </article>
  );
}
