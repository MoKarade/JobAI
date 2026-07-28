"use client";

// components/CarteOffres.tsx — la carte, côté navigateur.
//
// Leaflet touche `window` dès son import : il est donc chargé DYNAMIQUEMENT dans un effet,
// jamais en import statique. Un import statique casserait le rendu serveur de la page
// entière, pas seulement la carte.
//
// PAS DE MARQUEUR-IMAGE, DES CERCLES. Les marqueurs par défaut de Leaflet référencent des
// PNG par URL relative, ce qui casse dès qu'un bundler renomme les fichiers — un piège
// classique qui se manifeste par des épingles invisibles en production seulement. Un
// `circleMarker` est du SVG pur : rien à charger, et la couleur porte le palier.
//
// GARDE-FOU N°1 : ce composant ne reçoit QUE des épingles de municipalités. Le domicile de
// Marc n'est pas dans ses props, donc pas dans le HTML envoyé au navigateur, donc pas
// déductible du cadrage — qui est calculé serveur à partir des seules offres.

// La feuille de style de Leaflet s'importe STATIQUEMENT, contrairement au module lui-même :
// c'est du CSS, il ne touche pas `window`, et sans elle les tuiles s'empilent en désordre —
// une carte visiblement cassée, sans erreur en console pour l'expliquer.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Epingle } from "@/lib/carte";
import { palier } from "@/lib/scoring";

/** Couleurs des paliers, alignées sur celles des cartes d'offre. */
const TEINTE: Record<ReturnType<typeof palier>, string> = {
  A: "#7c5cff",
  B: "#2f9e6d",
  C: "#c98a1b",
};

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function CarteOffres({
  epingles,
  cadre,
}: {
  epingles: readonly Epingle[];
  cadre: { latMin: number; latMax: number; lonMin: number; lonMax: number } | null;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [echec, setEchec] = useState<string | null>(null);

  useEffect(() => {
    if (!conteneur.current || !cadre || epingles.length === 0) return;

    let carte: { remove: () => void } | null = null;
    let annule = false;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (annule || !conteneur.current) return;

        const instance = L.map(conteneur.current, { scrollWheelZoom: false });
        carte = instance;

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 17,
          // La mention de source est une OBLIGATION de la licence des tuiles, pas un ornement.
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(instance);

        for (const e of epingles) {
          const meilleure = e.offres[0];
          const teinte = TEINTE[palier(meilleure?.score ?? null)];

          // Le rayon suit le nombre d'offres, borné : sans borne, « Québec » et ses dix
          // offres couvrirait la moitié de la carte.
          const cercle = L.circleMarker([e.lat, e.lon], {
            radius: Math.min(8 + e.offres.length * 2, 20),
            color: teinte,
            fillColor: teinte,
            fillOpacity: 0.55,
            weight: 2,
          }).addTo(instance);

          const lignes = e.offres
            .slice(0, 6)
            .map((o) => {
              const note = o.score === null ? "–" : `${o.score}/100`;
              const dist = o.km === null ? "" : ` · ${String(o.km).replace(".", ",")} km`;
              return `<li><a href="/offre/${encodeURIComponent(o.id)}">${echapper(
                o.entreprise,
              )}</a> — ${echapper(o.poste)}<br><small>${note}${dist}</small></li>`;
            })
            .join("");
          const reste =
            e.offres.length > 6 ? `<li><small>+ ${e.offres.length - 6} autres</small></li>` : "";

          cercle.bindPopup(
            `<strong>${echapper(e.ville)}</strong><ul class="popup-offres">${lignes}${reste}</ul>`,
          );
        }

        // Cadrage sur les offres. `padding` évite qu'une épingle de bord soit coupée.
        instance.fitBounds(
          [
            [cadre.latMin, cadre.lonMin],
            [cadre.latMax, cadre.lonMax],
          ],
          { padding: [40, 40], maxZoom: 12 },
        );
      } catch (err) {
        // Une carte qui ne charge pas doit le DIRE. Un cadre gris sans explication envoie
        // chercher un problème de connexion là où c'est le script qui a échoué.
        console.error("[carte] chargement impossible", err);
        if (!annule) setEchec("La carte n’a pas pu se charger. La liste ci-dessous reste à jour.");
      }
    })();

    return () => {
      annule = true;
      carte?.remove();
    };
  }, [epingles, cadre]);

  if (epingles.length === 0 || !cadre) return null;

  return (
    <>
      {echec ? (
        <p className="carte__echec" role="alert">
          {echec}
        </p>
      ) : null}
      {/* `aria-hidden` : une carte de tuiles n'est pas explorable au lecteur d'écran. La
          liste sous la carte porte exactement la même information, elle, accessible. */}
      <div ref={conteneur} className="carte-offres" aria-hidden="true" />
    </>
  );
}
