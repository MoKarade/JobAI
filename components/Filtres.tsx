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
  paliersDistance,
  PALIERS_JOURS,
  PALIERS_NOTE,
  type EtatFiltres,
} from "@/lib/filtres";
import { CATEGORIES, CATEGORIE_LIBELLES } from "@/lib/categorie";
import { Depliant } from "./Depliant";

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
  rayonMaxKm,
  children,
}: {
  filtres: EtatFiltres;
  onChange: (f: EtatFiltres) => void;
  /** Ce que la recherche parcourt ici — le dire évite de chercher dans le vide. */
  etiquetteRecherche: string;
  /**
   * Le rayon réglé par Marc, en km — il devient un palier de distance proposé.
   *
   * ⚠️ REQUIS, et pas « optionnel avec 75 par défaut ». Un défaut ici ferait de l'appelant
   * qui n'y pense pas celui qui affiche un rayon qui n'est pas celui de Marc, sans que rien
   * ne rougisse : deux écrans offriraient deux réponses à « mon rayon ». Le compilateur
   * oblige chaque écran à aller chercher l'état.
   */
  rayonMaxKm: number;
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

      <span className="controles__bascules">
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
      </span>

      {children}

      {/* ⚠️ LES QUATRE SEUILS PASSENT SOUS UN PLI (refonte téléphone, 2026-09-13).
          Mesuré sur le rendu réel à 375 px AVANT la refonte : les groupes de seuils
          faisaient 472 px de large — ils débordaient l'écran de près de cent pixels, et
          c'est la cause n°1 du défilement latéral que Marc signalait. Les laisser se
          replier en lignes aurait échangé ce défaut contre une barre de huit lignes
          au-dessus de chaque liste.
          ⚠️ L'INDICE DIT CE QUI EST ACTIF, et c'est ce qui rend le pli honnête : un filtre
          qui agit sans se montrer fait chercher un bug dans les données. */}
      <Depliant titre="Affiner" indice={resumerSeuils(filtres)} classe="depliant--seuils">
        <div className="controles__seuils">
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
        {paliersDistance(rayonMaxKm).map((km) => {
          const actif = filtres.distanceMaxKm === km;
          return (
            <button
              key={km}
              type="button"
              className={`filtre${actif ? " filtre--actif" : ""}`}
              aria-pressed={actif}
              onClick={() => onChange({ ...filtres, distanceMaxKm: actif ? null : km })}
            >
              ≤ {km} km{km === Math.round(rayonMaxKm) ? " (mon rayon)" : ""}
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
        </div>
      </Depliant>
    </div>
  );
}

/**
 * Ce que le pli « Affiner » contient d'ACTIF, dit sur sa ligne repliée.
 *
 * PURE et exportée : c'est ce qui la rend vérifiable par un test plutôt qu'à l'œil, sur
 * l'écran qu'on n'a pas rouvert. « aucun » quand rien n'est posé — jamais une chaîne vide,
 * qui laisserait croire que l'indice est cassé.
 */
export function resumerSeuils(filtres: EtatFiltres): string {
  const actifs: string[] = [];
  if (filtres.noteMinimale !== null) actifs.push(`note ≥ ${filtres.noteMinimale}`);
  if (filtres.distanceMaxKm !== null) actifs.push(`≤ ${filtres.distanceMaxKm} km`);
  if (filtres.jours !== null) {
    actifs.push(filtres.jours === 1 ? "aujourd’hui" : `${filtres.jours} derniers jours`);
  }
  if (filtres.categorie !== null) actifs.push(CATEGORIE_LIBELLES[filtres.categorie]);
  return actifs.length === 0 ? "aucun" : actifs.join(" · ");
}

/**
 * TOUT ce qui filtre, dit en une ligne — pour la barre REPLIÉE de la carte.
 *
 * ⚠️ POURQUOI ELLE EXISTE, ET POURQUOI ELLE DOIT ÊTRE COMPLÈTE. Replier la barre sur la
 * page Carte rend de la hauteur au plan (demande de Marc, 2026-09-15), mais un filtre qui
 * agit sans se montrer fait chercher un bug dans les données — c'est la règle du dépôt
 * « ce qui est masqué se dit, TOUJOURS ». `resumerSeuils` ne couvre que les quatre seuils :
 * repliée, la barre cache AUSSI la recherche et les trois bascules, donc l'indice les dit.
 *
 * PURE et exportée : son exhaustivité est vérifiée par un test qui DÉRIVE ses cas de
 * `FILTRES_VIDES` — un filtre ajouté plus tard sans passer ici fait rougir la suite, au
 * lieu de disparaître en silence derrière un pli.
 */
export function resumerFiltres(filtres: EtatFiltres): string {
  const actifs: string[] = [];

  const texte = filtres.texte.trim();
  if (texte !== "") actifs.push(`« ${texte} »`);

  // Les bascules viennent de la MÊME liste que les boutons rendus plus haut : l'indice ne
  // peut pas nommer autre chose que ce que la barre propose.
  for (const { cle, libelle } of BASCULES) if (filtres[cle]) actifs.push(libelle);

  const seuils = resumerSeuils(filtres);
  if (seuils !== "aucun") actifs.push(seuils);

  return actifs.length === 0 ? "aucun" : actifs.join(" · ");
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
  // ⚠️ LA PHRASE A ÉTÉ COUPÉE, PAS L'INFORMATION (demande de Marc, 2026-09-13 : « moins de
  // texte »). Elle disait « 3 sans distance mesurée, donc hors du seuil — la mesure se fait
  // toute seule, au fil des passages » : deux lignes de réassurance qu'on ne lit qu'une
  // fois, tous les jours, sur l'écran le plus consulté. Les deux FAITS restent — combien
  // sont écartées, et pour laquelle des deux raisons, qui appellent des gestes opposés
  // (attendre une passe, ou baisser le seuil). C'est l'explication qui part.
  return (
    <p className="controles__compte" role="status">
      {affichees} sur {total} {nom}
      {total > 1 ? "s" : ""}
      {sansDistance > 0 ? ` · ${sansDistance} sans distance` : ""}
      {sansNote > 0 ? ` · ${sansNote} sans note` : ""}
    </p>
  );
}
