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

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
} from "@vis.gl/react-google-maps";
import type { Epingle } from "@/lib/carte";
import { couleurNote, encreSurNote } from "@/lib/couleurNote";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";

/**
 * L'identifiant de style Google. `DEMO_MAP_ID` est un identifiant que Google accepte pour
 * activer les AdvancedMarkers sans style personnalisé — le jour où Marc crée un Map ID
 * stylé dans la console, une seule constante change.
 */
const MAP_ID = "DEMO_MAP_ID";

/** Ce qui est sélectionné sur le plan : une épingle, la maison, ou rien. */
type Selection = { type: "epingle"; index: number } | { type: "domicile" } | null;

function MeilleureNote(entreprises: Epingle["entreprises"]): number | null {
  let meilleure: number | null = null;
  for (const e of entreprises) {
    for (const o of e.offres) {
      if (o.score !== null && (meilleure === null || o.score > meilleure)) meilleure = o.score;
    }
  }
  return meilleure;
}

function FicheEpingle({ epingle }: { epingle: Epingle }) {
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
}: {
  cle: string;
  epingles: readonly Epingle[];
  cadre: { latMin: number; latMax: number; lonMin: number; lonMax: number } | null;
  /** Les coordonnées du domicile, ou `null` si elles ne sont pas configurées. */
  domicile: { lat: number; lon: number } | null;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [agrandie, setAgrandie] = useState(false);

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
    <div>
      <div className={`carte-outils${agrandie ? " carte-outils--collante" : ""}`}>
        <button
          type="button"
          className="bouton"
          aria-pressed={agrandie}
          onClick={() => setAgrandie((a) => !a)}
        >
          {agrandie ? "Réduire la carte (Échap)" : "Agrandir la carte"}
        </button>
      </div>
      <div className={`carte-offres${agrandie ? " carte-offres--agrandie" : ""}`}>
        <APIProvider apiKey={cle}>
          <Map
            mapId={MAP_ID}
            defaultBounds={bornes}
            gestureHandling="greedy"
            style={{ width: "100%", height: "100%" }}
          >
            {epingles.map((e, i) => {
              const note = MeilleureNote(e.entreprises);
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
                  <Pin
                    background={approx ? couleurNote(null) : couleurNote(note)}
                    borderColor={encreSurNote()}
                    glyphColor={encreSurNote()}
                    scale={approx ? 0.85 : 1.1}
                    glyph={approx ? String(e.entreprises.length) : String(note ?? "—")}
                  />
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

            {selection?.type === "epingle" && epingles[selection.index] ? (
              <InfoWindow
                position={{
                  lat: epingles[selection.index]!.lat,
                  lng: epingles[selection.index]!.lon,
                }}
                onCloseClick={() => setSelection(null)}
                maxWidth={340}
              >
                <FicheEpingle epingle={epingles[selection.index]!} />
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
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
