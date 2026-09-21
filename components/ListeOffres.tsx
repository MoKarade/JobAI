"use client";

// components/ListeOffres.tsx — la liste, REGROUPÉE PAR ENTREPRISE, et ses filtres.
//
// Composant client parce que les filtres sont interactifs. Il reçoit TOUTES les offres et
// filtre en mémoire : le volume est de quelques dizaines de lignes, un aller-retour serveur
// par frappe au clavier serait plus lent et plus fragile pour zéro bénéfice.
//
// ⚠️ REGROUPÉ, PAS APLATI (demande de Marc, 2026-08-21 : « regrouper toutes les offres par
// entreprise, mettre l'entreprise avec la meilleure note en moyenne en premier »). Le
// filtrage produit les offres visibles EXACTEMENT comme avant — le compte affiché reste un
// compte d'OFFRES, ce que Marc a demandé de voir en premier (2026-08-19) — et c'est SUR ce
// résultat filtré que `grouperParEntreprise` construit les groupes : un filtre qui écarte une
// offre l'écarte aussi du groupe, jamais l'inverse.
//
// La logique de filtrage vit dans `lib/filtres.ts`, celle du regroupement dans
// `lib/groupesEntreprise.ts` (les deux pures, testées) — ici, seulement l'état et le rendu.

import { useMemo, useState } from "react";
import type { Offre } from "@/lib/types";
import {
  FILTRES_VIDES,
  sansNoteCalculee,
  separerParDistance,
  type EtatFiltres,
} from "@/lib/filtres";
import { grouperParEntreprise } from "@/lib/groupesEntreprise";
import { CarteEntreprise } from "./CarteEntreprise";
import type { Fraicheur } from "@/lib/fraicheur";
import { BoutonExport } from "./BoutonExport";
import { CompteFiltre, Filtres } from "./Filtres";

export function ListeOffres({
  offres,
  rayonMaxKm,
  metiers = [],
  fraicheurs = {},
}: {
  offres: Offre[];
  /** Le rayon réglé par Marc — il devient un palier de distance, et le titre du groupe. */
  rayonMaxKm: number;
  /**
   * Les métiers du domaine, pour que la CATÉGORIE affichée soit celle qui a servi à noter.
   * Défaut vide : un appelant qui ne les passe pas obtient la catégorie déduite du seul
   * titre — honnête, jamais faux, simplement moins fine.
   */
  metiers?: readonly string[];
  /**
   * Ce que l'app peut encore affirmer sur la présence de chaque offre, par identifiant.
   *
   * Traversée telle quelle jusqu'à `CarteOffre` : elle vient du journal de veille, un état
   * SERVEUR, et ces composants-ci sont clients. Défaut vide — un appelant qui ne la passe
   * pas n'affiche simplement aucune pastille, jamais une pastille fausse.
   */
  fraicheurs?: Readonly<Record<string, Fraicheur>>;
}) {
  const [filtres, setFiltres] = useState<EtatFiltres>(FILTRES_VIDES);
  const { retenues: visibles, distanceInconnue } = useMemo(
    () => separerParDistance(offres, filtres, metiers),
    [offres, filtres, metiers],
  );
  const groupes = useMemo(() => grouperParEntreprise(visibles), [visibles]);
  // Le second groupe est regroupé et trié comme le premier : c'est la même liste, pas une
  // annexe. Un tri différent ferait croire à une autre nature d'offre.
  const groupesInconnus = useMemo(
    () => grouperParEntreprise(distanceInconnue),
    [distanceInconnue],
  );

  const sansDistance = distanceInconnue.length;
  const sansNote = useMemo(() => sansNoteCalculee(offres, filtres), [offres, filtres]);

  return (
    <>
      {/* La MÊME barre que la carte (`components/Filtres.tsx`) : deux copies auraient
          divergé, et Marc a demandé des filtres identiques partout. */}
      <Filtres
        filtres={filtres}
        onChange={setFiltres}
        etiquetteRecherche="Filtrer (entreprise, poste, note)…"
        rayonMaxKm={rayonMaxKm}
      >
        {/* L'export suit les filtres : ce qu'on télécharge est ce qu'on voit. */}
        <BoutonExport offres={visibles} />
      </Filtres>

      <CompteFiltre
        affichees={visibles.length}
        total={offres.length}
        sansDistance={sansDistance}
        sansNote={sansNote}
        nom="offre"
      />
      {/* Le compte ci-dessus reste en OFFRES (ce que Marc a demandé de voir) ; celui-ci
          dit en combien d'entreprises elles se regroupent — deux faits, deux phrases. */}
      {/* ⚠️ DEUX LIGNES DE COMPTE SONT DEVENUES UNE MENTION (refonte 2026-09-13). Elle
          disait « regroupées en 22 entreprises, la meilleure moyenne en premier » : le
          critère de tri ne change jamais, donc personne ne le relit — il est écrit dans le
          code qui trie, pas au-dessus de chaque liste. Le COMPTE reste : il dit en combien
          d'employeurs les offres se regroupent, ce qu'on ne peut pas déduire de la liste. */}
      {groupes.length > 0 ? (
        <p className="controles__compte controles__compte--secondaire">
          {groupes.length} entreprise{groupes.length > 1 ? "s" : ""}
        </p>
      ) : null}

      {groupes.length === 0 ? (
        <p className="vide">Aucune offre ne correspond aux filtres.</p>
      ) : (
        <div className="liste">
          {groupes.map((g) => (
            <CarteEntreprise key={g.nom} groupe={g} fraicheurs={fraicheurs} />
          ))}
        </div>
      )}

      {/* ⚠️ MONTRÉ, PAS MASQUÉ (`[UI-FILTRE-KM]`). Une offre dont la distance est INCONNUE ne
          satisfait pas un seuil — on ne peut pas affirmer qu'elle est proche. Mais la faire
          disparaître affirmerait l'inverse : qu'elle est loin. Depuis ADR-0019 c'est le cas
          de la majorité du suivi, donc un seuil posé le matin viderait l'écran et laisserait
          croire qu'il n'y a rien à moins de 25 km. Le groupe est donc à part, sous la liste,
          et il DIT ce qu'il est. */}
      {groupesInconnus.length > 0 ? (
        <section className="liste-distance-inconnue">
          <h2 className="liste-distance-inconnue__titre">
            Distance inconnue — {distanceInconnue.length} offre
            {distanceInconnue.length > 1 ? "s" : ""}
          </h2>
          <p className="liste-distance-inconnue__note">
            Hors du seuil ≤ {filtres.distanceMaxKm} km faute de mesure, pas parce qu&apos;elles
            sont loin. La mesure se fait toute seule, au fil des passages.
          </p>
          <div className="liste">
            {groupesInconnus.map((g) => (
              <CarteEntreprise key={g.nom} groupe={g} fraicheurs={fraicheurs} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
