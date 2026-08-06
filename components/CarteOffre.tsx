// components/CarteOffre.tsx — une offre dans la liste.
//
// Composant de PRÉSENTATION pur : il reçoit une offre et l'affiche. Aucune logique de
// notation ni de filtrage ici — elles vivent dans `lib/scoring.ts`, testées.
//
// ⚠️ CE QUE LA LISTE MONTRE, ET CE QU'ELLE NE MONTRE PLUS (choix de Marc, 2026-08-05).
// Quatre informations : la note, l'entreprise, le poste, la distance. Plus UN signal, et
// seulement s'il change la décision — le salaire quand il est affiché, ou « périmée ».
// Les raisons de la note, les dates et les liens externes vivent désormais sur la fiche
// (`/offre/<id>`), où on les lit quand on a décidé de s'y intéresser.
//
// Ce qui RESTE malgré la coupe : `ControlesOffre`. Changer un statut est une ACTION, pas
// une information — l'enterrer derrière un clic ajouterait un aller-retour à chaque geste
// de suivi, ce qui est le contraire de simplifier. Et `notes`, parce que c'est le texte de
// Marc : il n'apparaît que s'il l'a écrit lui-même.

import Link from "next/link";
import type { Offre } from "@/lib/types";
import { palier } from "@/lib/scoring";
import { couleurNote, encreSurNote } from "@/lib/couleurNote";
import { Fait } from "./Icone";
import { ControlesOffre } from "./ControlesOffre";

/** Les distances s'écrivent à la française : 3,5 km. */
function formaterKm(km: number): string {
  return `${km.toString().replace(".", ",")} km`;
}

export function CarteOffre({ offre }: { offre: Offre }) {
  const p = palier(offre.score);
  const perimee = offre.perimeeLe !== null;

  return (
    <article
      className={`carte carte--${p}${offre.histo ? " carte--histo" : ""}${
        perimee ? " carte--perimee" : ""
      }`}
    >
      {/* Le « /100 » a disparu du cercle : sur trois centimètres il n'ajoute rien qu'on
          ne sache déjà. Il reste dans l'infobulle et sur la fiche. */}
      {/* ⚠️ LA COULEUR EST CALCULÉE, PAS CHOISIE (demande de Marc : « de plus en plus
          verte plus ça se rapproche de 100 »). Elle vient d'une fonction pure et testée —
          une couleur qui encode une donnée est un calcul, pas du style. Le nombre reste
          écrit dedans : qui ne distingue pas le vert de l'ambre lit « 82 » et sait tout. */}
      <div
        className={`note note--${p}`}
        style={{ background: couleurNote(offre.score), color: encreSurNote() }}
        title={offre.score === null ? "Jamais notée" : `${offre.score} sur 100`}
      >
        {offre.score ?? "–"}
      </div>

      <div className="carte__tete">
        <Link href={`/offre/${offre.id}`} className="carte__entreprise">
          {offre.entreprise}
        </Link>
        <span className="carte__poste">{offre.poste}</span>
        {/* UN signal, et un seul. « Périmée » l'emporte sur le salaire : savoir qu'une
            offre est fermée change la décision plus que savoir ce qu'elle payait. */}
        {perimee ? (
          <span className="badge-perimee">périmée</span>
        ) : offre.salaireAffiche ? (
          <span className="carte__signal">{offre.salaireAffiche}</span>
        ) : null}
      </div>

      {/* La distance est le critère n°1 de Marc : elle garde sa colonne, alignée à
          droite, en chiffres tabulaires pour que les lignes se comparent d'un coup d'œil.
          « — » quand elle n'est pas mesurée : jamais un zéro plausible (garde-fou n°3). */}
      <p className="carte__km">
        <Fait genre="route" discret={offre.km === null}>
          {offre.km !== null ? formaterKm(offre.km) : "—"}
        </Fait>
      </p>

      {offre.notes ? <p className="carte__notes">{offre.notes}</p> : null}

      <ControlesOffre offre={offre} />
    </article>
  );
}
