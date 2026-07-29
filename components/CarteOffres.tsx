"use client";

// components/CarteOffres.tsx — la carte, côté navigateur.
//
// Depuis [UX-09], une épingle est une ENTREPRISE (cercle plein, teinté par le palier de sa
// meilleure offre) ou un GROUPE d'entreprises posées au centre de leur ville faute de mieux
// (cercle en pointillé, neutre — la précision se voit avant même d'ouvrir la fenêtre).
//
// Leaflet touche `window` dès son import : il est donc chargé DYNAMIQUEMENT dans un effet.
// Un import statique casserait le rendu serveur de la page entière.
//
// PAS DE MARQUEUR-IMAGE, DES CERCLES : les marqueurs par défaut de Leaflet référencent des
// PNG par URL relative, qui disparaissent dès qu'un bundler renomme les fichiers — panne
// visible en production seulement.
//
// GARDE-FOU N°1 : ce composant ne reçoit QUE des entreprises. Le domicile de Marc n'est ni
// dans ses props, ni déductible du cadrage (calculé sur les seules épingles). Le trajet
// passe par un lien Google Maps qui ne porte que la destination.

// La feuille de style s'importe STATIQUEMENT, contrairement au module : c'est du CSS, il ne
// touche pas `window`, et sans elle les tuiles s'empilent en désordre sans erreur en console.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Epingle, EntrepriseSurCarte } from "@/lib/carte";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { palier } from "@/lib/scoring";

/** Couleurs des paliers, alignées sur celles des cartes d'offre. */
const TEINTE: Record<ReturnType<typeof palier>, string> = {
  A: "#7c5cff",
  B: "#2f9e6d",
  C: "#c98a1b",
};
/** Une cible sans offre active n'a pas de palier : teinte neutre, pas un faux « C ». */
const TEINTE_SANS_OFFRE = "#7a8194";

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Le contenu HTML de la fenêtre d'une entreprise. Tout texte passe par `echapper`. */
function ficheEntreprise(e: EntrepriseSurCarte, approximative: boolean): string {
  const morceaux: string[] = [];

  morceaux.push(`<strong>${echapper(e.nom)}</strong>`);
  if (approximative) {
    // La précision se DIT dans la fiche, pas seulement par le style du cercle : une fois la
    // fenêtre ouverte, le cercle n'est plus visible.
    morceaux.push(
      `<span class="popup-approx">Position approximative — centre de ${echapper(e.ville)}</span>`,
    );
  }
  // Une distance non relevée se dit ; « null km » ou un zéro seraient pires que rien.
  const distance =
    e.km === null ? "distance non mesurée" : `${String(e.km).replace(".", ",")} km`;
  morceaux.push(
    `<span class="popup-faits">${echapper(e.ville)} · ${echapper(distance)}</span>`,
  );
  if (e.lecture) {
    const lecture = e.lecture.length > 160 ? `${e.lecture.slice(0, 157)}…` : e.lecture;
    morceaux.push(`<span class="popup-lecture">${echapper(lecture)}</span>`);
  }

  if (e.offres.length > 0) {
    const lignes = e.offres
      .slice(0, 6)
      .map((o) => {
        const note = o.score === null ? "–" : `${o.score}/100`;
        return `<li><a href="/offre/${encodeURIComponent(o.id)}">${echapper(o.poste)}</a><br><small>${note}</small></li>`;
      })
      .join("");
    const reste =
      e.offres.length > 6 ? `<li><small>+ ${e.offres.length - 6} autres</small></li>` : "";
    morceaux.push(`<ul class="popup-offres">${lignes}${reste}</ul>`);
  } else {
    // Une cible sans offre active reste une information : c'est la liste de chasse.
    morceaux.push(`<span class="popup-lecture">Aucune offre active repérée.</span>`);
  }

  const trajet = lienTrajetGoogleMaps(e.nom);
  if (trajet) {
    morceaux.push(
      `<a class="popup-trajet" href="${echapper(trajet)}" target="_blank" rel="noopener noreferrer">Trajet dans Google Maps ↗</a>`,
    );
  }

  return morceaux.join("");
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

        // La molette est inerte jusqu'au premier clic : sinon, faire défiler la PAGE zoome
        // la carte dès que le pointeur la survole — le piège classique des cartes pleine
        // largeur. Après un clic, l'intention est claire, le zoom molette s'active.
        // `keyboard: false` : le conteneur est `aria-hidden`, et Leaflet pose sinon
        // `tabIndex=0` dessus — un élément focalisable au clavier mais invisible aux
        // lecteurs d'écran est un piège (WCAG 4.1.2). Toute l'information est dans la
        // liste sous la carte, qui est le VRAI accès clavier.
        const instance = L.map(conteneur.current, { scrollWheelZoom: false, keyboard: false });
        instance.once("click", () => instance.scrollWheelZoom.enable());
        carte = instance;

        // Même logique pour ce que Leaflet injecte de focalisable (boutons de zoom,
        // liens d'attribution, liens des fenêtres) : hors du parcours clavier, puisque
        // tout est sous aria-hidden. Ré-appliqué à chaque ouverture de fenêtre.
        const neutraliserTab = () => {
          conteneur.current
            ?.querySelectorAll<HTMLElement>("a, button, [tabindex]")
            .forEach((el) => {
              el.tabIndex = -1;
            });
        };
        neutraliserTab();
        instance.on("popupopen", neutraliserTab);

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          // La mention de source est une OBLIGATION de la licence des tuiles, pas un ornement.
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(instance);

        for (const e of epingles) {
          const approximative = e.precision === "ville";
          const meilleure = e.entreprises
            .flatMap((x) => x.offres)
            .reduce<number | null>((max, o) => {
              if (o.score === null) return max;
              return max === null ? o.score : Math.max(max, o.score);
            }, null);
          const aDesOffres = e.entreprises.some((x) => x.offres.length > 0);
          const teinte = aDesOffres ? TEINTE[palier(meilleure)] : TEINTE_SANS_OFFRE;

          const cercle = L.circleMarker([e.lat, e.lon], {
            radius: approximative ? 12 : 9,
            color: teinte,
            fillColor: teinte,
            // Le pointillé EST le signal « approximatif » : il se voit avant tout clic.
            dashArray: approximative ? "4 4" : undefined,
            fillOpacity: approximative ? 0.25 : 0.6,
            weight: 2,
          }).addTo(instance);

          const contenu =
            e.entreprises.length === 1
              ? ficheEntreprise(e.entreprises[0]!, approximative)
              : `<strong>${echapper(e.ville)} — positions approximatives</strong>` +
                e.entreprises
                  .map((x) => `<div class="popup-groupe">${ficheEntreprise(x, false)}</div>`)
                  .join("");

          cercle.bindPopup(contenu, { maxWidth: 320 });
        }

        instance.fitBounds(
          [
            [cadre.latMin, cadre.lonMin],
            [cadre.latMax, cadre.lonMax],
          ],
          { padding: [40, 40], maxZoom: 13 },
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
