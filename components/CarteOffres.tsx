"use client";

// components/CarteOffres.tsx — la carte, côté navigateur.
//
// Depuis [UX-09], une épingle est une ENTREPRISE, ou un GROUPE d'entreprises posées au
// centre de leur ville faute de mieux — ce dernier se voit au trait POINTILLÉ, avant même
// d'ouvrir la fenêtre.
//
// Chaque pastille PORTE le meilleur score de ses offres, et sa couleur vient de la même
// échelle continue que les cercles de la liste (`lib/couleurNote.ts`). Un cercle de
// couleur seul obligeait à cliquer pour savoir ce qu'il valait — donc à cliquer partout.
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
import { centreDuCadrage, type Epingle, type EntrepriseSurCarte } from "@/lib/carte";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { couleurNote } from "@/lib/couleurNote";
import { minutesAPied } from "@/lib/bornes";
import { mentionSource } from "@/lib/adresse";

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
  // L'ADRESSE quand OpenStreetMap la connaît. Sur un repli au centre-ville il n'y en a pas,
  // et on ne dit rien plutôt que d'afficher celle de la mairie pour une usine.
  if (e.adresse) {
    // La SOURCE avec l'adresse, ici comme dans la liste : un domicile légal tiré du
    // registre n'est pas un lieu de travail. Le texte vient de `lib/adresse.ts` — écrit
    // deux fois, il aurait divergé, et c'est la version la plus vague qui aurait survécu.
    const mention = mentionSource(e.adresseSource);
    morceaux.push(
      `<span class="popup-adresse">${echapper(e.adresse)}${mention ? ` <small>(${echapper(mention)})</small>` : ""}</span>`,
    );
  }
  // Les bornes : trois états, trois phrases — « pas regardé » n'est pas « aucune ».
  const bornes =
    e.bornes === null
      ? null
      : e.bornes.plusProcheM === null
        ? "Aucune borne de recharge à 5 min à pied"
        : `Borne à ~${minutesAPied(e.bornes.plusProcheM)} min à pied${e.bornes.nom ? ` · ${e.bornes.nom}` : ""}`;
  if (bornes) morceaux.push(`<span class="popup-bornes">${echapper(bornes)}</span>`);
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
  /** L'instance Leaflet, pour que l'agrandissement puisse lui dire de se remesurer. */
  const instanceRef = useRef<{ invalidateSize: () => void } | null>(null);
  const [echec, setEchec] = useState<string | null>(null);
  const [agrandie, setAgrandie] = useState(false);

  useEffect(() => {
    if (!conteneur.current || !cadre || epingles.length === 0) return;

    let carte: { remove: () => void } | null = null;
    let annule = false;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (annule || !conteneur.current) return;

        // MOLETTE ACTIVE (demande de Marc, 2026-07-31). Elle était inerte jusqu'au premier
        // clic pour éviter le piège classique — faire défiler la page zoome la carte dès
        // que le pointeur la survole. Le compromis retenu : la molette répond tout de
        // suite, et le bouton « Agrandir » donne une carte assez haute pour qu'on n'ait
        // plus à la traverser au défilement. Si le défilement de page devient pénible,
        // c'est cette ligne qu'il faut revoir, pas la molette qu'il faut supprimer.
        //
        // `keyboard: false` : le conteneur est `aria-hidden`, et Leaflet pose sinon
        // `tabIndex=0` dessus — un élément focalisable au clavier mais invisible aux
        // lecteurs d'écran est un piège (WCAG 4.1.2). Toute l'information est dans la
        // liste sous la carte, qui est le VRAI accès clavier.
        const instance = L.map(conteneur.current, { scrollWheelZoom: true, keyboard: false });
        carte = instance;
        instanceRef.current = instance;

        // L'échelle : sans elle, « proche » et « loin » se jugent à l'œil, alors que la
        // distance est le critère numéro un de Marc.
        L.control.scale({ imperial: false, metric: true }).addTo(instance);

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
          // 19 : le niveau où les numéros de porte apparaissent. C'est le maximum que
          // publie OpenStreetMap — au-delà, les tuiles n'existent pas.
          maxZoom: 19,
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

          // ⚠️ L'ÉPINGLE PORTE LE SCORE (demande de Marc, 2026-08-06 : « je veux pouvoir
          // voir le score de l'offre dans la carte »). Un cercle de couleur seul obligeait
          // à cliquer pour savoir ce qu'il valait — donc à cliquer partout. Le nombre écrit
          // dedans supprime ce détour, et il porte l'information même pour qui ne
          // distingue pas les teintes (WCAG 1.4.1).
          //
          // La couleur vient de la MÊME fonction que les cercles de la liste
          // (`lib/couleurNote.ts`) : le plan et la liste doivent parler de la même échelle,
          // sinon un même score se dit de deux façons selon l'écran qu'on regarde.
          const fond = aDesOffres ? couleurNote(meilleure) : TEINTE_SANS_OFFRE;
          const libelle = meilleure === null ? (aDesOffres ? "–" : "") : String(meilleure);
          const taille = approximative ? 38 : 34;

          const cercle = L.marker([e.lat, e.lon], {
            icon: L.divIcon({
              className: "",
              html:
                `<span class="epingle${approximative ? " epingle--approx" : ""}" ` +
                `style="background:${fond};width:${taille}px;height:${taille}px">` +
                `${echapper(libelle)}</span>`,
              iconSize: [taille, taille],
              iconAnchor: [taille / 2, taille / 2],
            }),
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
      instanceRef.current = null;
      carte?.remove();
    };
  }, [epingles, cadre]);

  // ⚠️ UNE SORTIE QUI NE DÉPEND PAS DU DÉFILEMENT.
  //
  // Agrandie, la carte fait 82 % de la hauteur de la fenêtre et la molette lui appartient
  // (`scrollWheelZoom`) : remonter vers le bouton « Réduire » ZOOME la carte au lieu de
  // faire défiler la page. Le seul chemin de retour passait donc par ce qu'on cherchait à
  // réduire — Marc : « quand j'agrandis la carte je peux plus la réduire ». La barre
  // d'outils devient collante (elle reste à l'écran, voir le CSS), et Échap ramène à la
  // taille normale sans viser quoi que ce soit. Deux sorties INDÉPENDANTES : l'une se
  // voit, l'autre marche même si on ne la voit pas.
  useEffect(() => {
    if (!agrandie) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAgrandie(false);
      requestAnimationFrame(() => instanceRef.current?.invalidateSize());
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [agrandie]);

  if (epingles.length === 0 || !cadre) return null;

  // Le centre du cadrage — il sert au lien trafic. Il se déduit des seules ENTREPRISES,
  // jamais du domicile (garde-fou n°1), exactement comme `cadrage`.
  const centre = centreDuCadrage(cadre)!;
  const lienTrafic = `https://www.google.com/maps/@${centre.lat.toFixed(4)},${centre.lon.toFixed(4)},12z/data=!5m1!1e1`;

  function basculerTaille() {
    setAgrandie((a) => !a);
    // Leaflet mesure son conteneur au montage : après un changement de hauteur, il faut le
    // lui dire, sinon les tuiles restent calées sur l'ancienne taille et laissent des
    // bandes grises. `requestAnimationFrame` attend que le navigateur ait appliqué la
    // nouvelle classe — appelé trop tôt, il remesurerait l'ancienne.
    requestAnimationFrame(() => instanceRef.current?.invalidateSize());
  }

  return (
    <>
      {echec ? (
        <p className="carte__echec" role="alert">
          {echec}
        </p>
      ) : null}

      {/* Ces contrôles sont HORS du conteneur `aria-hidden` : ce sont de vrais boutons,
          utilisables au clavier et annoncés. */}
      <div className={`carte-outils${agrandie ? " carte-outils--collante" : ""}`}>
        <button
          type="button"
          className="filtre"
          onClick={basculerTaille}
          aria-pressed={agrandie}
        >
          {agrandie ? "Réduire la carte (Échap)" : "Agrandir la carte"}
        </button>

        {/* LE TRAFIC N'EXISTE PAS SUR CETTE CARTE, et c'est une limite, pas un oubli.
            OpenStreetMap publie un fond de carte, pas de données de circulation ; les
            seules sources (Google, TomTom, HERE) exigent une clé d'API, et une carte
            Google a déjà été écartée de ce projet. Plutôt qu'une couche vide ou une
            estimation inventée, un lien vers Google Maps centré sur la région, où le
            trafic habituel est réel. Le lien ne porte QUE le centre des entreprises —
            jamais le domicile. */}
        <a
          href={lienTrafic}
          target="_blank"
          rel="noopener noreferrer"
          className="filtre"
          title="OpenStreetMap ne fournit pas de données de circulation : le trafic s’affiche dans Google Maps."
        >
          Trafic dans Google Maps ↗
        </a>
      </div>

      {/* `aria-hidden` : une carte de tuiles n'est pas explorable au lecteur d'écran. La
          liste sous la carte porte exactement la même information, elle, accessible. */}
      <div
        ref={conteneur}
        className={`carte-offres${agrandie ? " carte-offres--agrandie" : ""}`}
        aria-hidden="true"
      />
    </>
  );
}
