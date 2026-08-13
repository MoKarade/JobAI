"use client";

// components/CarteOffre.tsx — une offre dans la liste, qui se DÉPLIE sur place.
//
// ⚠️ CLIQUER AGRANDIT, ÇA NE NAVIGUE PLUS (demande de Marc, 2026-08-06 : « quand je clique
// sur une carte je veux que ça l'agrandisse, pas que ça l'ouvre dans une autre page »).
// Ouvrir `/offre/<id>` faisait perdre la position dans la liste, les filtres en cours et le
// contexte des offres voisines — pour lire trois lignes. Le dépliage garde tout ça.
//
// CE QUE LA LISTE MONTRE, REPLIÉE (choix de Marc, 2026-08-05) : la note, l'entreprise, le
// poste, la distance, plus UN signal s'il change la décision. Le reste — raisons de la note,
// dates, liens, salaire — apparaît au dépliage, au même endroit.
//
// Ce qui reste visible en toutes circonstances : `ControlesOffre`. Changer un statut est une
// ACTION, pas une information ; la mettre sous un pli ajouterait un geste à chaque suivi.
//
// LA FICHE `/offre/<id>` EXISTE TOUJOURS, et c'est voulu : elle se met en signet, se partage
// et s'imprime. Elle est atteignable par le lien « fiche complète » du bloc déplié — un
// second chemin, plus un détour obligatoire.

import { useId, useState } from "react";
import Link from "next/link";
import type { Offre } from "@/lib/types";
import { palier, PALIERS_DISTANCE_KM } from "@/lib/scoring";
import { couleurNote, encreSurNote } from "@/lib/couleurNote";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { Fait } from "./Icone";
import { ControlesOffre } from "./ControlesOffre";

/** Les distances s'écrivent à la française : 3,5 km. */
function formaterKm(km: number): string {
  return `${km.toString().replace(".", ",")} km`;
}

/**
 * Un lien n'est rendu cliquable que s'il est en http(s) — même règle que le hub.
 * Un `javascript:` ou un `data:` dans un champ de données ne doit jamais devenir un lien.
 */
function lienSur(brut: string): string | null {
  if (!brut) return null;
  try {
    const u = new URL(brut);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function CarteOffre({ offre }: { offre: Offre }) {
  const [ouverte, setOuverte] = useState(false);
  const idDetail = useId();

  const p = palier(offre.score);
  const perimee = offre.perimeeLe !== null;
  const href = lienSur(offre.lien);
  const trajet = lienTrajetGoogleMaps(offre.entreprise);

  return (
    <article
      className={`carte carte--${p}${offre.histo ? " carte--histo" : ""}${
        perimee ? " carte--perimee" : ""
      }${ouverte ? " carte--ouverte" : ""}`}
    >
      {/* ⚠️ LA COULEUR EST CALCULÉE, PAS CHOISIE (« de plus en plus verte plus ça se
          rapproche de 100 »). Elle vient d'une fonction pure et testée — une couleur qui
          encode une donnée est un calcul, pas du style. Le nombre reste écrit dedans : qui
          ne distingue pas le vert de l'ambre lit « 82 » et sait tout. */}
      <div
        className={`note note--${p}`}
        style={{ background: couleurNote(offre.score), color: encreSurNote() }}
        title={offre.score === null ? "Jamais notée" : `${offre.score} sur 100`}
      >
        {offre.score ?? "–"}
      </div>

      {/* Un vrai `<button>`, pas un `div` cliquable : il est atteignable au clavier, il
          s'annonce comme un contrôle, et `aria-expanded` dit son état — trois choses qu'un
          gestionnaire de clic posé sur une carte ne donne pas. */}
      <button
        type="button"
        className="carte__tete"
        aria-expanded={ouverte}
        aria-controls={idDetail}
        onClick={() => setOuverte((o) => !o)}
      >
        <span className="carte__entreprise">{offre.entreprise}</span>
        <span className="carte__poste">{offre.poste}</span>
        {/* UN signal, et un seul. « Périmée » l'emporte sur le salaire : savoir qu'une
            offre est fermée change la décision plus que savoir ce qu'elle payait. */}
        {perimee ? (
          <span className="badge-perimee">périmée</span>
        ) : offre.salaireAffiche ? (
          <span className="carte__signal">{offre.salaireAffiche}</span>
        ) : null}
      </button>

      {/* La distance est le critère n°1 de Marc : elle garde sa colonne, alignée à droite,
          en chiffres tabulaires pour que les lignes se comparent d'un coup d'œil.
          « — » quand elle n'est pas mesurée : jamais un zéro plausible (garde-fou n°3). */}
      <p className="carte__km">
        <Fait genre="route" discret={offre.km === null}>
          {offre.km !== null ? formaterKm(offre.km) : "—"}
        </Fait>
        {/* La jauge REND VISIBLE ce que le barème fait déjà du kilométrage : un segment
            allumé par palier atteint. Les seuils viennent de `PALIERS_DISTANCE_KM`, pas
            d'une copie locale — sinon l'écran finirait par décrire un calcul périmé.

            `aria-hidden` : elle ne dit rien de plus que la distance juste au-dessus, qui
            est déjà lue. La répéter n'informerait pas, elle encombrerait. */}
        {offre.km !== null ? (
          <span className="jauge-km" aria-hidden="true">
            {PALIERS_DISTANCE_KM.map((p) => (
              <span
                key={p.max}
                className={offre.km !== null && offre.km <= p.max ? "jauge-km__on" : undefined}
              />
            ))}
          </span>
        ) : null}
      </p>

      {/* Le bloc déplié est TOUJOURS dans le DOM, simplement masqué : `hidden` le retire du
          rendu ET de l'arbre d'accessibilité, ce qui est exactement ce qu'annonce
          `aria-expanded={false}`. Le monter/démonter ferait perdre l'état à chaque bascule. */}
      <div id={idDetail} className="carte__detail" hidden={!ouverte}>
        {offre.raisons.length > 0 ? (
          <ul className="carte__raisons">
            {offre.raisons.map((r, i) => (
              <li key={i} className={`raison raison--${r.ton}`}>
                {r.texte}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="carte__meta">
          {offre.salaireAffiche && !perimee ? null : offre.salaireAffiche ? (
            <span className="etiquette etiquette--salaire">{offre.salaireAffiche}</span>
          ) : null}
          <span className="carte__date">
            {offre.histo ? "envoyée" : "vue"} {offre.dateEnvoi || offre.dateReperage}
          </span>
        </p>

        <p className="carte__liens">
          <Link href={`/offre/${offre.id}`}>fiche complète</Link>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              offre ↗
            </a>
          ) : null}
          {/* Le trajet s'ouvre DANS Google Maps, où Marc est connecté : sa maison, ses
              endroits et la durée réelle y sont — sans que l'app transmette l'origine. */}
          {trajet ? (
            <a href={trajet} target="_blank" rel="noopener noreferrer">
              trajet ↗
            </a>
          ) : null}
        </p>
      </div>

      {offre.notes ? <p className="carte__notes">{offre.notes}</p> : null}

      <ControlesOffre offre={offre} />
    </article>
  );
}
