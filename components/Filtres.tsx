"use client";

// components/Filtres.tsx — la barre de filtres, une seule fois.
//
// POURQUOI CE COMPOSANT EXISTE
// Demande de Marc (2026-07-31) : « je veux que les filtres soient les mêmes partout ». Ils
// vivaient dans `ListeOffres`, donc la carte n'en avait aucun. Les recopier là-bas aurait
// donné deux barres qui se ressemblent le premier jour et divergent au troisième — c'est
// exactement ce qui est arrivé aux quatre listes de colonnes ce matin, et à l'appariement
// des noms d'employeur cet après-midi.
//
// La DÉCISION (`filtrer`) vit dans `lib/filtres.ts`, pure et testée ; ce fichier n'est que
// le rendu et l'état. Deux surfaces, une règle, une barre.

import {
  PALIERS_DISTANCE_KM,
  PALIERS_JOURS,
  PALIERS_NOTE,
  type EtatFiltres,
} from "@/lib/filtres";
import { CATEGORIES, CATEGORIE_LIBELLES } from "@/lib/categorie";

/** Les bascules, dans l'ordre où elles se lisent. Le seuil de distance est à part. */
const BASCULES: readonly { cle: BasculeFiltre; libelle: string }[] = [
  { cle: "activesSeules", libelle: "Actives" },
  { cle: "historique", libelle: "Historique 2025" },
  { cle: "avecPerimees", libelle: "Voir les périmées" },
];

/**
 * Les filtres BOOLÉENS — les seuils et la recherche ont leurs propres contrôles.
 *
 * ⚠️ DÉRIVÉ DU TYPE, PAS D'UNE LISTE D'EXCLUSION. C'était `Exclude<keyof EtatFiltres,
 * "texte" | "distanceMaxKm" | "noteMinimale">` : une liste à tenir à la main, qui a dérivé
 * dès qu'on a ajouté les filtres de date et de catégorie — leurs clés se sont retrouvées
 * dans les bascules, où elles n'ont aucun sens. Sélectionner par la FORME (ce qui est
 * booléen) se met à jour tout seul.
 */
type BasculeFiltre = {
  [K in keyof EtatFiltres]: EtatFiltres[K] extends boolean ? K : never;
}[keyof EtatFiltres];

export function Filtres({
  filtres,
  onChange,
  etiquetteRecherche,
  children,
}: {
  filtres: EtatFiltres;
  onChange: (f: EtatFiltres) => void;
  /** Ce que la recherche parcourt ici — le dire évite de chercher dans le vide. */
  etiquetteRecherche: string;
  /** Ce qui s'ajoute à droite de la barre (export, bouton de localisation…). */
  children?: React.ReactNode;
}) {
  return (
    <div className="controles">
      <input
        type="search"
        className="controles__recherche"
        placeholder={etiquetteRecherche}
        aria-label={etiquetteRecherche}
        value={filtres.texte}
        onChange={(e) => onChange({ ...filtres, texte: e.target.value })}
      />

      {BASCULES.map(({ cle, libelle }) => (
        <button
          key={cle}
          type="button"
          className={`filtre${filtres[cle] ? " filtre--actif" : ""}`}
          aria-pressed={filtres[cle]}
          onClick={() => onChange({ ...filtres, [cle]: !filtres[cle] })}
        >
          {libelle}
        </button>
      ))}

      {/* Le seuil de NOTE : mêmes paliers que le barème, même geste que la distance. Un
          second clic sur le palier actif le retire — sinon il n'y aurait aucun moyen de
          revenir à « toutes ». */}
      <span className="controles__groupe" role="group" aria-label="Note minimale">
        {PALIERS_NOTE.map((note) => {
          const actif = filtres.noteMinimale === note;
          return (
            <button
              key={note}
              type="button"
              className={`filtre${actif ? " filtre--actif" : ""}`}
              aria-pressed={actif}
              onClick={() => onChange({ ...filtres, noteMinimale: actif ? null : note })}
            >
              Note ≥ {note}
            </button>
          );
        })}
      </span>

      {/* Le seuil de distance : des paliers plutôt qu'un curseur — on choisit « 25 km »,
          on ne cherche pas « 23 ». Un second clic sur le palier actif le retire, comme
          une bascule : sans ça, il n'y aurait aucun moyen de revenir à « toutes ». */}
      <span className="controles__groupe" role="group" aria-label="Distance maximale">
        {PALIERS_DISTANCE_KM.map((km) => {
          const actif = filtres.distanceMaxKm === km;
          return (
            <button
              key={km}
              type="button"
              className={`filtre${actif ? " filtre--actif" : ""}`}
              aria-pressed={actif}
              onClick={() => onChange({ ...filtres, distanceMaxKm: actif ? null : km })}
            >
              ≤ {km} km
            </button>
          );
        })}
      </span>

      {/* La FRAÎCHEUR. Le libellé dit « depuis », pas « il y a » : « 7 jours » seul se lit
          aussi bien « les sept derniers » que « il y a sept ». */}
      <span className="controles__groupe" role="group" aria-label="Repérées depuis">
        {PALIERS_JOURS.map((j) => {
          const actif = filtres.jours === j;
          return (
            <button
              key={j}
              type="button"
              className={`filtre${actif ? " filtre--actif" : ""}`}
              aria-pressed={actif}
              onClick={() => onChange({ ...filtres, jours: actif ? null : j })}
            >
              {j === 1 ? "Aujourd’hui" : `${j} derniers jours`}
            </button>
          );
        })}
      </span>

      {/* La CATÉGORIE de poste, dérivée du même barème que la note — jamais d'un calcul
          parallèle qui la contredirait à l'écran. */}
      <span className="controles__groupe" role="group" aria-label="Catégorie de poste">
        {CATEGORIES.map((c) => {
          const actif = filtres.categorie === c;
          return (
            <button
              key={c}
              type="button"
              className={`filtre${actif ? " filtre--actif" : ""}`}
              aria-pressed={actif}
              onClick={() => onChange({ ...filtres, categorie: actif ? null : c })}
            >
              {CATEGORIE_LIBELLES[c]}
            </button>
          );
        })}
      </span>

      {children}
    </div>
  );
}

/**
 * Le compte affiché sous la barre, y compris ce qu'un seuil de distance a écarté FAUTE DE
 * MESURE.
 *
 * `role="status"` : un filtre qui vide la liste sans un mot est un changement silencieux
 * pour qui n'a pas la liste sous les yeux.
 */
export function CompteFiltre({
  affichees,
  total,
  sansDistance,
  sansNote = 0,
  nom,
}: {
  affichees: number;
  total: number;
  sansDistance: number;
  /**
   * Écartées par le seuil de NOTE faute d'évaluation.
   *
   * Dit séparément de `sansDistance` : « pas encore notée » et « trop loin » appellent deux
   * gestes opposés — attendre une passe, ou baisser le seuil. Les additionner rendrait un
   * chiffre qu'on ne saurait pas quoi faire.
   */
  sansNote?: number;
  /** « offre » ou « entreprise » — le compte doit nommer ce qu'il compte. */
  nom: string;
}) {
  return (
    <p className="controles__compte" role="status">
      {affichees} {nom}
      {affichees > 1 ? "s" : ""} affichée{affichees > 1 ? "s" : ""} sur {total}
      {sansDistance > 0 ? (
        <>
          {" · "}
          {sansDistance} sans distance mesurée, donc hors du seuil — la mesure se fait toute
          seule, au fil des passages.
        </>
      ) : null}
      {sansNote > 0 ? (
        <>
          {" · "}
          {sansNote} pas encore notée{sansNote > 1 ? "s" : ""}, donc hors du seuil — une note
          absente n&apos;est pas une mauvaise note.
        </>
      ) : null}
    </p>
  );
}
