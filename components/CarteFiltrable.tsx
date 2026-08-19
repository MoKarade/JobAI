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
import {
  cadrage,
  compterEntreprises,
  construireVue,
  filtrerAdresseConnue,
  type PositionEntreprise,
} from "@/lib/carte";
import {
  FILTRES_VIDES,
  filtrer,
  sansDistanceMesuree,
  sansNoteCalculee,
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
  const sansNote = useMemo(() => sansNoteCalculee(offres, filtres), [offres, filtres]);

  // ⚠️ LES CIBLES SONT TOUJOURS PASSÉES, MAIS ELLES N'AJOUTENT PLUS D'ÉPINGLE.
  //
  // Ce code passait `[]` dès qu'un filtre était posé, pour éviter que des entreprises sans
  // offre viennent « répondre à côté » d'une question comme « qu'est-ce qui est à 25 km ? ».
  // Depuis le 2026-08-12, `construireVue` écarte elle-même toute entreprise sans offre
  // vivante (demande de Marc) : la distinction n'a donc plus d'effet sur les épingles.
  //
  // Et la garder aurait un COÛT : la liste des cibles ne sert plus à peupler la carte, elle
  // porte la fiche d'une entreprise (sa lecture, sa ville, sa distance de référence). La
  // vider sous filtre revenait à effacer ces faits pour des entreprises qui, elles, ont bien
  // une offre retenue. On la passe donc toujours.
  const filtreActif = unFiltreEstActif(filtres);

  const vue = useMemo(() => construireVue(retenues, cibles, table), [retenues, cibles, table]);

  // ⚠️ ÉTEINT PAR DÉFAUT depuis le 2026-08-12 — demande de Marc : « dans maps je veux
  // jamais voir une boîte et aucune offre active repérée, je veux toujours voir toutes les
  // offres que j'ai seulement ». Elle RÉVISE celle du 2026-08-06 (« je veux pas si y'a pas
  // au moins l'adresse ») qui allumait ce filtre : combinée à une acquisition d'adresses
  // en panne (registre 0/65 ce jour-là), elle réduisait la carte à 8 épingles pour 30
  // offres suivies — l'exact contraire de « toutes mes offres ». L'interrupteur reste :
  // c'est un choix d'affichage, pas une donnée effacée, et une épingle sans adresse est
  // dite honnêtement (pointillé + « position approximative » + « adresse inconnue »).
  const [adresseSeulement, setAdresseSeulement] = useState(false);

  const epingles = useMemo(
    () => (adresseSeulement ? filtrerAdresseConnue(vue.epingles) : vue.epingles),
    [vue.epingles, adresseSeulement],
  );
  const cadre = useMemo(() => cadrage(epingles), [epingles]);

  const entreprises = compterEntreprises(epingles);
  // Le compte de RÉFÉRENCE reste celui d'avant filtrage : c'est lui qui permet de dire
  // combien sont masquées, et un total qui bouge avec le filtre ne se vérifie pas.
  const masquees = compterEntreprises(vue.epingles) - entreprises;
  const exactes = epingles
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
  const adresseSansEpingle = epingles
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
        total={entreprises + masquees + vue.aSituer.length + vue.sansLieu.length}
        sansDistance={sansDistance}
        sansNote={sansNote}
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

      {/* ⚠️ CE QUI EST MASQUÉ SE DIT, TOUJOURS. Un filtre qui retire 41 employeurs sans
          l'écrire produirait exactement le défaut qu'il corrige : une couverture qu'on
          croit complète et qui ne l'est pas. Et la phrase précise où elles sont restées —
          rien n'est effacé, leurs offres sont toujours dans la liste d'accueil. */}
      <p className="carte__compte">
        <label className="carte__bascule">
          <input
            type="checkbox"
            checked={adresseSeulement}
            onChange={(e) => setAdresseSeulement(e.target.checked)}
          />{" "}
          Seulement les entreprises dont on connaît l&apos;adresse
        </label>
        {adresseSeulement && masquees > 0
          ? ` — ${masquees} masquée${masquees > 1 ? "s" : ""}, sans adresse connue. Leurs offres restent dans la liste d'accueil.`
          : ""}
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
          <CarteOffres epingles={epingles} cadre={cadre} />
        </div>

        {epingles.length === 0 ? (
          <div className="etat">
            <h2>Aucune entreprise à afficher</h2>
            <p>
              {filtreActif
                ? "Aucune entreprise ne correspond aux filtres. En retirer un ramènera des épingles."
                : vue.aSituer.length > 0
                  ? "Les entreprises n’ont pas encore été localisées. Ça se fait tout seul, au fil des passages — le bouton ci-dessus force une passe."
                  : "Aucune offre active à montrer."}
            </p>
          </div>
        ) : (
          <ListeCarte epingles={epingles} />
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
