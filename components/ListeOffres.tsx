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
  filtrer,
  sansDistanceMesuree,
  sansNoteCalculee,
  type EtatFiltres,
} from "@/lib/filtres";
import { grouperParEntreprise } from "@/lib/groupesEntreprise";
import { CarteEntreprise } from "./CarteEntreprise";
import { BoutonExport } from "./BoutonExport";
import { CompteFiltre, Filtres } from "./Filtres";

export function ListeOffres({
  offres,
  metiers = [],
}: {
  offres: Offre[];
  /**
   * Les métiers du domaine, pour que la CATÉGORIE affichée soit celle qui a servi à noter.
   * Défaut vide : un appelant qui ne les passe pas obtient la catégorie déduite du seul
   * titre — honnête, jamais faux, simplement moins fine.
   */
  metiers?: readonly string[];
}) {
  const [filtres, setFiltres] = useState<EtatFiltres>(FILTRES_VIDES);
  const visibles = useMemo(() => filtrer(offres, filtres, metiers), [offres, filtres, metiers]);
  const groupes = useMemo(() => grouperParEntreprise(visibles), [visibles]);

  const sansDistance = useMemo(() => sansDistanceMesuree(offres, filtres), [offres, filtres]);
  const sansNote = useMemo(() => sansNoteCalculee(offres, filtres), [offres, filtres]);

  return (
    <>
      {/* La MÊME barre que la carte (`components/Filtres.tsx`) : deux copies auraient
          divergé, et Marc a demandé des filtres identiques partout. */}
      <Filtres
        filtres={filtres}
        onChange={setFiltres}
        etiquetteRecherche="Filtrer (entreprise, poste, note)…"
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
      {groupes.length > 0 ? (
        <p className="controles__compte controles__compte--secondaire">
          regroupées en {groupes.length} entreprise{groupes.length > 1 ? "s" : ""}, la
          meilleure moyenne en premier
        </p>
      ) : null}

      {groupes.length === 0 ? (
        <p className="vide">Aucune offre ne correspond aux filtres.</p>
      ) : (
        <div className="liste">
          {groupes.map((g) => (
            <CarteEntreprise key={g.nom} groupe={g} />
          ))}
        </div>
      )}
    </>
  );
}
