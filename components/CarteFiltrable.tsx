"use client";

// components/CarteFiltrable.tsx — la carte, avec les MÊMES filtres que la liste.
//
// POURQUOI CE COMPOSANT EXISTE
// Demande de Marc (2026-07-31) : « je veux pouvoir filtrer dans la carte aussi, par distance
// et par tout le reste des filtres, et je veux que les filtres soient les mêmes partout ».
// La page carte était entièrement rendue côté serveur ; filtrer y demandait un aller-retour
// par clic. Ici, la page passe les offres et les positions, et le filtrage se fait en
// mémoire — le volume est de quelques dizaines de lignes.
//
// UNE SEULE RÈGLE POUR DEUX SURFACES
// `filtrer` (pure, testée) et la barre `Filtres` sont EXACTEMENT celles de la liste. Rien
// n'est réimplémenté ici : un second filtrage « équivalent » finirait par ne plus l'être,
// et la carte se mettrait à montrer autre chose que la liste sans que rien ne le signale.
//
// `construireVue` est pure : elle tourne aussi bien ici que sur le serveur. C'est ce qui
// permet de recalculer les épingles à chaque frappe sans rien redemander.
//
// GARDE-FOU N°1 : le domicile n'entre pas ici — ni en props, ni dans le cadrage, qui se
// déduit des seules épingles. Le trajet passe par un lien Google Maps qui ne porte que la
// destination.

import { useMemo, useState } from "react";
import type { EntrepriseCible } from "@/lib/reference";
import type { Offre } from "@/lib/types";
import { cadrage, construireVue, type PositionEntreprise } from "@/lib/carte";
import {
  FILTRES_VIDES,
  filtrer,
  sansDistanceMesuree,
  unFiltreEstActif,
  type EtatFiltres,
} from "@/lib/filtres";
import { CompteFiltre, Filtres } from "./Filtres";
import { CarteOffres } from "./CarteOffres";
import { ListeCarte } from "./ListeCarte";
import { BoutonSituer } from "./BoutonSituer";

export function CarteFiltrable({
  offres,
  cibles,
  positions,
  ciblesManquantes,
}: {
  offres: Offre[];
  cibles: EntrepriseCible[];
  /** Positions déjà géocodées, sérialisées par la page (une `Map` ne traverse pas). */
  positions: [string, PositionEntreprise][];
  /** Ce que le bouton « Situer » peut réellement traiter — les cibles, pas les employeurs. */
  ciblesManquantes: number;
}) {
  const [filtres, setFiltres] = useState<EtatFiltres>(FILTRES_VIDES);

  const table = useMemo(() => new Map(positions), [positions]);
  const retenues = useMemo(() => filtrer(offres, filtres), [offres, filtres]);
  const sansDistance = useMemo(() => sansDistanceMesuree(offres, filtres), [offres, filtres]);

  // ⚠️ Les cibles ne sont montrées SANS OFFRE que lorsqu'aucun filtre n'est posé.
  //
  // Une cible sans offre active est une information de carte quand on regarde le marché
  // (« Poly-Robotics — candidature spontanée possible »). Mais dès que Marc filtre, il pose
  // une QUESTION : « qu'est-ce qui est à 25 km ? ». Y répondre avec des entreprises qui
  // n'ont aucune offre correspondante serait répondre à côté — et lui faire croire que ces
  // épingles satisfont son filtre.
  const filtreActif = unFiltreEstActif(filtres);

  const vue = useMemo(
    () => construireVue(retenues, filtreActif ? [] : cibles, table),
    [retenues, cibles, table, filtreActif],
  );
  const cadre = useMemo(() => cadrage(vue.epingles), [vue.epingles]);

  const entreprises = vue.epingles.reduce((n, e) => n + e.entreprises.length, 0);
  const exactes = vue.epingles
    .filter((e) => e.precision === "exacte")
    .reduce((n, e) => n + e.entreprises.length, 0);

  // ⚠️ SAVOIR OÙ ELLE EST ET POUVOIR L'ÉPINGLER SONT DEUX CHOSES DIFFÉRENTES.
  //
  // « 8 à leur adresse, 44 au centre-ville » décrivait l'ÉPINGLE, mais Marc y lit « est-ce
  // que je sais où elles sont ? » — et depuis que le registre des entreprises alimente les
  // adresses, les deux ont cessé de coïncider : on connaît l'adresse déclarée d'une
  // entreprise qu'aucun géocodeur n'a su placer. Tout ranger sous « au centre-ville »
  // effacerait ce gain de l'écran alors qu'il est en base et affiché juste en dessous,
  // dans la liste. Trois états valent mieux qu'un ratio qui répond à côté.
  const adresseSansEpingle = vue.epingles
    .filter((e) => e.precision !== "exacte")
    .reduce(
      (n, e) => n + e.entreprises.filter((x) => x.adresseSource !== null).length,
      0,
    );
  const sansAdresse = entreprises - exactes - adresseSansEpingle;

  return (
    <>
      {/* La MÊME barre que la liste : un seul composant, une seule règle. */}
      <Filtres
        filtres={filtres}
        onChange={setFiltres}
        etiquetteRecherche="Filtrer (entreprise, poste, note)…"
      >
        <BoutonSituer restantes={ciblesManquantes} />
      </Filtres>

      <CompteFiltre
        affichees={entreprises}
        total={entreprises + vue.aSituer.length + vue.sansLieu.length}
        sansDistance={sansDistance}
        nom="entreprise"
      />

      <p className="carte__compte">
        {exactes} épinglées à leur adresse
        {adresseSansEpingle > 0
          ? ` · ${adresseSansEpingle} adresse connue, épingle au centre-ville`
          : ""}
        {sansAdresse > 0 ? ` · ${sansAdresse} sans adresse` : ""}
        {vue.aSituer.length > 0 ? ` · ${vue.aSituer.length} en attente de localisation` : ""}
        {filtreActif ? " · filtre actif : seules les entreprises qui ont une offre correspondante" : ""}
      </p>

      {/* ⚠️ LE PLAN ET LA LISTE CÔTE À CÔTE (choix de Marc, 2026-08-05).
          Empilés, il fallait faire défiler pour relier une épingle à sa fiche — le plan
          sortait de l'écran au moment précis où on lisait ce qu'il montre. La liste
          devient la colonne de lecture du plan ; sous 56 rem elle repasse dessous, où
          l'empilement redevient le bon choix. */}
      <div className="plan-ecran">
        {/* ⚠️ L'ENVELOPPE EST OBLIGATOIRE, ET SON ABSENCE A CASSÉ L'ÉCRAN EN PRODUCTION.
            `CarteOffres` rend un FRAGMENT : sa barre d'outils et son plan sont deux
            éléments FRÈRES. Sans ce `div`, la grille recevait TROIS enfants au lieu de
            deux — la barre prenait la première colonne, le plan se retrouvait écrasé dans
            la seconde (21 rem), et la liste retombait à la ligne. Mettre un composant dans
            une grille exige de vérifier ce qu'il rend À SA RACINE, jamais de le supposer. */}
        <div className="plan-ecran__plan">
          <CarteOffres epingles={vue.epingles} cadre={cadre} />
        </div>

        {vue.epingles.length === 0 ? (
          <div className="etat">
            <h2>Aucune entreprise à afficher</h2>
            <p>
              {filtreActif
                ? "Aucune entreprise ne correspond aux filtres. En retirer un ramènera des épingles."
                : vue.aSituer.length > 0
                  ? "Les entreprises n’ont pas encore été localisées. Ça se fait tout seul, au fil des passages — le bouton ci-dessus force une passe."
                  : "Aucune offre active et aucune entreprise cible à montrer."}
            </p>
          </div>
        ) : (
          <ListeCarte epingles={vue.epingles} />
        )}
      </div>

      {vue.aSituer.length > 0 ? (
        <p className="carte__manquants">
          {/* La phrase disait en trois lignes ce que la liste dit déjà : ces entreprises
              n'ont pas de position. Le fait utile — ça se règle tout seul — tient en trois
              mots, et les noms suffisent au reste. */}
          Sans position (se complète seule) : {vue.aSituer.join(", ")}.
        </p>
      ) : null}

      {vue.sansLieu.length > 0 ? (
        <p className="carte__manquants">
          Hors de la carte faute de ville annoncée par la source : {vue.sansLieu.join(", ")}.
          Aucune passe n’y changera rien — la ville doit venir de l’offre.
        </p>
      ) : null}
    </>
  );
}
