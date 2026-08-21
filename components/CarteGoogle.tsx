"use client";

// components/CarteGoogle.tsx — le plan sur fond Google Maps (ADR-0016, lot A).
//
// ⚠️ MÊME CONTRAT QUE `CarteOffres` (Leaflet), délibérément : `epingles` + `cadre`, calculés
// par `lib/carte.ts`. Le fond change, la DONNÉE ne change pas — c'est ce qui permet au repli
// Leaflet de rester vivant quand la clé manque, sans deux pipelines de données qui
// divergeraient.
//
// ⚠️ LA CLÉ ARRIVE EN PROP, DEPUIS LE SERVEUR. C'est la clé CLIENT (Maps JavaScript API
// seule, restreinte au domaine) : elle est lisible dans la page par construction — c'est le
// préfixe NEXT_PUBLIC_ qui le dit — et sa restriction console est sa seule protection. La
// clé SERVEUR (Places/Routes/Geocoding) ne traverse JAMAIS cette frontière : un test le
// verrouille (`tests/carteGoogle.test.ts`).
//
// ⚠️ LE DOMICILE S'AFFICHE ICI, ET C'EST UNE DÉCISION DATÉE, PAS UNE FUITE. Garde-fou n°1
// v3 (ADR-0016, décision Marc 2026-08-21) : derrière la session mono-adresse, le « client »
// est Marc — lui cacher sa propre maison protégeait le principe, pas la personne. Ce qui
// reste interdit : ces coordonnées dans un fichier VERSIONNÉ, ou servies à une requête non
// authentifiée.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  // ⚠️ Renommé : le composant s'appelle `Map` et MASQUERAIT le Map natif du langage —
  // `new Map(durees)` construirait alors un composant React, et le typage l'a attrapé.
  Map as FondGoogle,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import type { Epingle } from "@/lib/carte";
import { couleurNote, encreSurNote } from "@/lib/couleurNote";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { obtenirTrajet, type ResultatTrajet } from "@/lib/actionsTrajet";
import { BANDES_DUREE_MIN, bandeDuree, formaterDistance, formaterDuree } from "@/lib/trajetRoutes";
import { poidsEpingle, rayonDensiteM } from "@/lib/densite";

/**
 * L'identifiant de style Google. `DEMO_MAP_ID` est un identifiant que Google accepte pour
 * activer les AdvancedMarkers sans style personnalisé — le jour où Marc crée un Map ID
 * stylé dans la console, une seule constante change.
 */
const MAP_ID = "DEMO_MAP_ID";

/** Un trajet obtenu du serveur, prêt à tracer. */
interface TrajetAffiche {
  nom: string;
  dureeS: number;
  distanceM: number;
  polyline: string;
  duCache: boolean;
}

/**
 * Trace la polyligne du trajet sur la carte. Composant sans rendu : la Polyline est un
 * objet Google impératif, pas un nœud React — on la crée dans un effet et on la RETIRE au
 * démontage, sinon chaque trajet demandé empilerait son tracé sur le précédent.
 */
function TraceTrajet({ polyline }: { polyline: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !google.maps.geometry?.encoding) return;
    const trace = new google.maps.Polyline({
      path: google.maps.geometry.encoding.decodePath(polyline),
      map,
      // ⚠️ HEX, PAS oklch : les objets google.maps (Polyline, Circle) passent la couleur au
      // rendu vectoriel de la carte, qui ne garantit pas les espaces de couleur CSS
      // récents — un oklch non compris dessine invisible, sans erreur. Le DOM des épingles
      // (Pin, pastilles) reste en oklch : lui est du CSS ordinaire.
      strokeColor: "#4d79cc",
      strokeWeight: 5,
      strokeOpacity: 0.85,
    });
    return () => trace.setMap(null);
  }, [map, polyline]);
  return null;
}

/**
 * Recale la carte quand son CONTENEUR change de taille — pas quand ELLE le décide.
 *
 * ⚠️ POURQUOI CE COMPOSANT EXISTE (bug Marc 2026-08-21, capture à l'appui) : Google Maps
 * ne réécoute JAMAIS le CSS de son `<div>` tout seul. `defaultBounds` ne fait le calcul
 * qu'UNE fois, au montage — et au montage, le flex de la page n'a pas fini de se résoudre :
 * la carte se cadre sur une taille qui n'est pas la taille finale. Aucun redimensionnement
 * ultérieur (resserrement du chrome, bascule « Agrandir », simple réouverture d'onglet à une
 * autre fenêtre) ne la corrige — Google continue de dessiner sur l'ANCIEN canevas, et ce
 * qui déborde du nouveau `<div>` reste soit vide, soit rempli de tuiles d'un zoom qui n'a
 * plus de rapport avec le cadrage voulu (la capture de Marc montrait le Michigan sous le
 * Québec — deux niveaux de zoom, un seul et même canevas mal recalé).
 *
 * `ResizeObserver` sur le `<div>` RÉEL de la carte (`map.getDiv()`, pas un `<div>` React à
 * nous — Google en pose un lui-même) + `google.maps.event.trigger(map, "resize")` (l'event
 * qui force Google à relire sa propre taille) + un `fitBounds` immédiat après (le `resize`
 * seul ne recadre pas, il redimensionne juste le canevas autour du centre qu'il avait déjà,
 * qui n'a plus de sens une fois la taille changée).
 */
function SuivreRedimensionnement({
  bornes,
}: {
  bornes: { north: number; south: number; east: number; west: number };
}) {
  const map = useMap();
  // Lu par le callback du `ResizeObserver`, jamais par un rendu : une ref évite de reposer
  // l'observateur à chaque frappe de filtre (qui change `bornes`) tout en lui donnant
  // toujours la valeur COURANTE — une fermeture sur `bornes` figerait celle du montage.
  const bornesRef = useRef(bornes);
  bornesRef.current = bornes;

  useEffect(() => {
    if (!map) return;
    const conteneur = map.getDiv();
    const observateur = new ResizeObserver(() => {
      google.maps.event.trigger(map, "resize");
      map.fitBounds(bornesRef.current);
    });
    observateur.observe(conteneur);
    return () => observateur.disconnect();
  }, [map]);
  return null;
}

/**
 * Un cercle de densité (lot G). Impératif comme la Polyline : créé dans un effet, retiré
 * au démontage — le toggle qui l'éteint doit vraiment l'éteindre.
 */
function CercleDensite({ lat, lon, rayonM }: { lat: number; lon: number; rayonM: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || rayonM <= 0) return;
    const cercle = new google.maps.Circle({
      map,
      center: { lat, lng: lon },
      radius: rayonM,
      fillColor: "#4caf7d",
      fillOpacity: 0.13,
      strokeColor: "#3d8f66",
      strokeOpacity: 0.3,
      strokeWeight: 1,
      clickable: false,
    });
    return () => cercle.setMap(null);
  }, [map, lat, lon, rayonM]);
  return null;
}

/** Ce qui est sélectionné sur le plan : une épingle, la maison, ou rien. */
type Selection = { type: "epingle"; index: number } | { type: "domicile" } | null;

/**
 * La note d'une épingle : la MOYENNE de ses offres notées (demande Marc 2026-08-21 —
 * la même règle que les groupes d'entreprises de l'accueil). Les non-notées sont EXCLUES
 * du calcul, jamais comptées zéro : pas jugée n'est pas mauvaise.
 */
function noteEpingle(entreprises: Epingle["entreprises"]): number | null {
  const notes: number[] = [];
  for (const e of entreprises) {
    for (const o of e.offres) {
      if (o.score !== null) notes.push(o.score);
    }
  }
  if (notes.length === 0) return null;
  return Math.round(notes.reduce((a, b) => a + b, 0) / notes.length);
}

function FicheEpingle({
  epingle,
  demanderTrajet,
  trajet,
  erreurTrajet,
  trajetEnCours,
  dureesParNom,
}: {
  epingle: Epingle;
  dureesParNom: ReadonlyMap<string, { dureeS: number; distanceM: number }>;
  /** `null` quand le trajet n'est pas disponible (domicile non configuré). */
  demanderTrajet: ((nom: string) => void) | null;
  trajet: TrajetAffiche | null;
  erreurTrajet: string | null;
  trajetEnCours: boolean;
}) {
  return (
    <div className="carte-fiche">
      {epingle.precision === "ville" ? (
        // ⚠️ L'APPROXIMATION SE DIT EN PREMIER, pas en note de bas de page : une épingle au
        // centre-ville prise pour l'usine est exactement l'erreur que cette ligne empêche.
        <p className="carte-fiche__approx">
          Position approximative — épinglée au centre de {epingle.ville || "la ville"}.
        </p>
      ) : null}
      {epingle.entreprises.map((e) => (
        <div key={e.nom} className="carte-fiche__entreprise">
          <h3 className="carte-fiche__nom">{e.nom}</h3>
          {e.adresse ? (
            <p className="carte-fiche__adresse">
              {e.adresse}
              {e.adresseSource === "registre" ? " (registre des entreprises)" : ""}
            </p>
          ) : (
            <p className="carte-fiche__adresse">Adresse inconnue</p>
          )}
          {e.km !== null ? <p className="carte-fiche__km">{e.km} km du domicile</p> : null}
          {e.offres.length > 0 ? (
            <ul className="carte-fiche__offres">
              {[...e.offres]
                .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                .map((o) => (
                  <li key={o.id}>
                    <span
                      className="carte-fiche__note"
                      style={{ background: couleurNote(o.score), color: encreSurNote() }}
                    >
                      {o.score ?? "—"}
                    </span>{" "}
                    <a href={`/offre/${o.id}`}>{o.poste}</a>
                  </li>
                ))}
            </ul>
          ) : null}
          <p className="carte-fiche__liens">
            {/* `lienTrajetGoogleMaps` rend `null` quand il ne peut rien construire de sûr :
                on n'affiche alors PAS de lien, plutôt qu'un lien vers un homonyme. */}
            {(() => {
              const lien = lienTrajetGoogleMaps(e.nom, undefined, e.ville || epingle.ville);
              return lien ? (
                <a href={lien} target="_blank" rel="noreferrer">
                  Itinéraire dans Google Maps
                </a>
              ) : null;
            })()}
            {e.siteWeb ? (
              <>
                {" · "}
                <a href={e.siteWeb} target="_blank" rel="noreferrer">
                  Site
                </a>
              </>
            ) : null}
          </p>
          {demanderTrajet && epingle.precision === "exacte" ? (
            <p className="carte-fiche__trajet">
              {trajet?.nom === e.nom ? (
                <span>
                  {formaterDuree(trajet.dureeS)} ({formaterDistance(trajet.distanceM)}) en
                  voiture, sans trafic{trajet.duCache ? " — du cache" : ""}
                </span>
              ) : dureesParNom.has(e.nom) ? (
                <span>
                  {formaterDuree(dureesParNom.get(e.nom)!.dureeS)} (
                  {formaterDistance(dureesParNom.get(e.nom)!.distanceM)}) en voiture, sans
                  trafic{" · "}
                  <button
                    type="button"
                    className="carte-fiche__bouton-trajet"
                    disabled={trajetEnCours}
                    onClick={() => demanderTrajet(e.nom)}
                  >
                    {trajetEnCours ? "Calcul…" : "Tracer"}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="carte-fiche__bouton-trajet"
                  disabled={trajetEnCours}
                  onClick={() => demanderTrajet(e.nom)}
                >
                  {trajetEnCours ? "Calcul…" : "Tracer le trajet depuis chez moi"}
                </button>
              )}
            </p>
          ) : null}
          {erreurTrajet && trajet === null ? (
            <p className="carte-fiche__trajet-erreur">{erreurTrajet}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function CarteGoogle({
  cle,
  epingles,
  cadre,
  domicile,
  durees = [],
}: {
  cle: string;
  epingles: readonly Epingle[];
  cadre: { latMin: number; latMax: number; lonMin: number; lonMax: number } | null;
  /** Les coordonnées du domicile, ou `null` si elles ne sont pas configurées. */
  domicile: { lat: number; lon: number } | null;
  /** Les durées du cache nocturne (lot C), affichées d'office dans les fiches. */
  durees?: [string, { dureeS: number; distanceM: number }][];
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [agrandie, setAgrandie] = useState(false);
  const [trajet, setTrajet] = useState<TrajetAffiche | null>(null);
  const [erreurTrajet, setErreurTrajet] = useState<string | null>(null);
  const [trajetEnCours, setTrajetEnCours] = useState(false);
  const dureesParNom = useMemo(() => new Map(durees), [durees]);
  /** Le calque de densité (lot G) — un toggle, tout local, zéro appel. */
  const [densite, setDensite] = useState(false);
  // Combien de cercles le calque peut dessiner : seules les positions EXACTES portant au
  // moins une bonne offre (palier B) en produisent un. Zéro cercle avec le toggle actif
  // doit se DIRE — sinon « densité marche pas » est indiscernable de « rien à montrer ».
  const nbCercles = useMemo(
    () =>
      epingles.filter((e) => e.precision === "exacte" && rayonDensiteM(poidsEpingle(e)) > 0)
        .length,
    [epingles],
  );


  // ⚠️ GARDE ANTI-RAFALE CÔTÉ CLIENT, en plus du plafond serveur : un double-clic ne doit
  // pas partir en deux appels facturés. Le disabled du bouton la matérialise, ce flag la
  // tient même si le bouton se re-rend entre les deux clics.
  async function demanderTrajet(nom: string) {
    if (trajetEnCours) return;
    setTrajetEnCours(true);
    setErreurTrajet(null);
    try {
      const r: ResultatTrajet = await obtenirTrajet(nom);
      if (r.ok) setTrajet({ nom, ...r });
      else {
        setTrajet(null);
        setErreurTrajet(r.raison);
      }
    } catch {
      setTrajet(null);
      setErreurTrajet("Le calcul du trajet a échoué — réessaie.");
    } finally {
      setTrajetEnCours(false);
    }
  }

  // Échap réduit la carte — même geste que le rendu Leaflet, pour que le changement de
  // fond ne change pas les habitudes.
  useEffect(() => {
    if (!agrandie) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAgrandie(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agrandie]);

  const bornes = useMemo(() => {
    if (!cadre) return null;
    // Le domicile fait partie du cadrage : une carte qui coupe la maison au bord oblige à
    // dézoomer à la main à chaque visite.
    let { latMin, latMax, lonMin, lonMax } = cadre;
    if (domicile) {
      latMin = Math.min(latMin, domicile.lat);
      latMax = Math.max(latMax, domicile.lat);
      lonMin = Math.min(lonMin, domicile.lon);
      lonMax = Math.max(lonMax, domicile.lon);
    }
    return { north: latMax, south: latMin, east: lonMax, west: lonMin };
  }, [cadre, domicile]);

  if (epingles.length === 0 || !bornes) {
    return <p className="vide">Aucun lieu à afficher — le géocodage n’est pas encore passé.</p>;
  }

  return (
    <>
      <div className={`carte-outils${agrandie ? " carte-outils--collante" : ""}`}>
        {/* MÊME STYLE QUE LES FILTRES ET LE REPLI LEAFLET (`.filtre`) — ces boutons
            portaient `.bouton`, le style du BOUTON DE CONNEXION (accent violet du
            gabarit, hérité de app-template, jamais destiné à cet écran). « Même
            allure que les filtres, ils n'ont pas à s'inventer un style » — la règle
            existait déjà pour la carte Leaflet, elle ne l'avait simplement pas
            traversée jusqu'ici. */}
        <button
          type="button"
          className={`filtre${agrandie ? " filtre--actif" : ""}`}
          aria-pressed={agrandie}
          onClick={() => setAgrandie((a) => !a)}
        >
          {agrandie ? "Réduire la carte (Échap)" : "Agrandir la carte"}
        </button>
        <button
          type="button"
          className={`filtre${densite ? " filtre--actif" : ""}`}
          aria-pressed={densite}
          onClick={() => setDensite((d) => !d)}
        >
          {densite ? "Masquer la densité" : "Densité des bonnes offres"}
        </button>
        {densite && nbCercles === 0 ? (
          <span className="carte-densite-vide">
            Aucun cercle : aucune offre au palier B sur une position exacte.
          </span>
        ) : null}
      </div>
      <div className={`carte-offres${agrandie ? " carte-offres--agrandie" : ""}`}>
        <APIProvider apiKey={cle} libraries={["geometry"]}>
          <FondGoogle
            mapId={MAP_ID}
            colorScheme="DARK"
            defaultBounds={bornes}
            gestureHandling="greedy"
            style={{ width: "100%", height: "100%" }}
            onClick={() => setSelection(null)}
          >
            {epingles.map((e, i) => {
              const note = noteEpingle(e.entreprises);
              const approx = e.precision === "ville";
              return (
                <AdvancedMarker
                  key={`${e.lat},${e.lon},${i}`}
                  position={{ lat: e.lat, lng: e.lon }}
                  title={
                    approx
                      ? `${e.ville} — position approximative (${e.entreprises.length} entreprise${e.entreprises.length > 1 ? "s" : ""})`
                      : e.entreprises[0]?.nom
                  }
                  onClick={() => setSelection({ type: "epingle", index: i })}
                >
                  {/* Le SCORE dans la pastille, comme sur le rendu Leaflet : un cercle de
                      couleur seul obligeait à cliquer pour savoir si ça vaut le détour.
                      Une épingle approximative est plus petite et grisée : deux niveaux de
                      certitude ne doivent pas se ressembler. */}
                  {(() => {
                    // La durée du groupe : la plus COURTE des entreprises de l'épingle —
                    // c'est elle qui répond à « est-ce à portée ? ».
                    const dureeS = approx
                      ? null
                      : (e.entreprises
                          .map((x) => dureesParNom.get(x.nom)?.dureeS)
                          .filter((d): d is number => d !== undefined)
                          .sort((x, y) => x - y)[0] ?? null);
                    return (
                      <div className="epingle">
                        <span
                          className={`epingle__pastille${approx ? " epingle__pastille--approx" : ""}`}
                          style={
                            approx
                              ? undefined
                              : { background: couleurNote(note), color: encreSurNote() }
                          }
                        >
                          {note ?? "—"}
                        </span>
                        {dureeS !== null ? (
                          <span className={`epingle__duree epingle__duree--b${bandeDuree(dureeS)}`}>
                            {formaterDuree(dureeS)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })()}
                </AdvancedMarker>
              );
            })}

            {domicile ? (
              <AdvancedMarker
                position={{ lat: domicile.lat, lng: domicile.lon }}
                title="Domicile"
                onClick={() => setSelection({ type: "domicile" })}
              >
                <Pin
                  background="oklch(0.72 0.12 250)"
                  borderColor="oklch(0.3 0.06 250)"
                  glyphColor="oklch(0.98 0.01 250)"
                  scale={1}
                />
              </AdvancedMarker>
            ) : null}

            <SuivreRedimensionnement bornes={bornes} />

            {trajet ? <TraceTrajet polyline={trajet.polyline} /> : null}

            {densite
              ? epingles
                  .filter((e) => e.precision === "exacte")
                  .map((e, i) => {
                    const r = rayonDensiteM(poidsEpingle(e));
                    return r > 0 ? (
                      <CercleDensite key={`d${e.lat},${e.lon},${i}`} lat={e.lat} lon={e.lon} rayonM={r} />
                    ) : null;
                  })
              : null}

            {dureesParNom.size > 0 ? (
              <div className="carte-bandes" aria-hidden="true">
                <span className="epingle__duree epingle__duree--b1">≤ {BANDES_DUREE_MIN[0]} min</span>
                <span className="epingle__duree epingle__duree--b2">≤ {BANDES_DUREE_MIN[1]} min</span>
                <span className="epingle__duree epingle__duree--b3">≤ {BANDES_DUREE_MIN[2]} min</span>
                <span className="epingle__duree epingle__duree--b4">au-delà</span>
              </div>
            ) : null}

            {selection?.type === "epingle" && epingles[selection.index] ? (
              <InfoWindow
                position={{
                  lat: epingles[selection.index]!.lat,
                  lng: epingles[selection.index]!.lon,
                }}
                onCloseClick={() => setSelection(null)}
                maxWidth={340}
              >
                <FicheEpingle
                  epingle={epingles[selection.index]!}
                  demanderTrajet={domicile ? demanderTrajet : null}
                  dureesParNom={dureesParNom}
                  trajet={trajet}
                  erreurTrajet={erreurTrajet}
                  trajetEnCours={trajetEnCours}
                />
              </InfoWindow>
            ) : null}
            {selection?.type === "domicile" && domicile ? (
              <InfoWindow
                position={{ lat: domicile.lat, lng: domicile.lon }}
                onCloseClick={() => setSelection(null)}
              >
                <div className="carte-fiche">
                  <h3 className="carte-fiche__nom">Domicile</h3>
                  <p className="carte-fiche__adresse">Point de départ des distances mesurées.</p>
                </div>
              </InfoWindow>
            ) : null}
          </FondGoogle>
        </APIProvider>
      </div>
    </>
  );
}
