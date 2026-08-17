"use client";

// components/SondeGuichet.tsx — demander à la PRODUCTION quelle adresse répond.
//
// Le bouton existe parce que la session de Claude ne peut pas poser la question : le proxy
// de l'environnement refuse l'hôte au tunnel CONNECT. La production, elle, joint Overpass et
// Nominatim tous les jours. Un clic de Marc, et on a une mesure au lieu d'une supposition.
//
// LECTURE SEULE. Rien n'est ingéré. Ce que la sonde rend est un CONSTAT à lire, pas une
// source qui s'allume toute seule — c'est en le lisant qu'on décidera de rallumer
// `RECHERCHES_GUICHET`.

import { useState } from "react";
import { lancerSondeGuichet, type ResultatSonde } from "@/lib/actions";

type Verdict = Extract<ResultatSonde, { ok: true }>["verdicts"][number];

/** L'adresse servie est-elle bien celle demandée, ou a-t-on été renvoyé ailleurs ? */
function memeChemin(v: Verdict): boolean {
  try {
    return new URL(v.url).pathname === new URL(v.urlFinale).pathname;
  } catch {
    return v.url === v.urlFinale;
  }
}

function verdictCourt(v: Verdict): string {
  if (v.erreur) return `pas de réponse en 12 s — essai SANS VERDICT, pas un refus`;
  if (v.statut === null) return "aucune réponse";
  if (v.statut >= 400) return `HTTP ${v.statut} — l'adresse n'existe pas`;
  // ⚠️ LE CAS QUI COMPTE : 200, mais ailleurs. Une page employeur qui redirige vers
  // l'accueil répond 200 sans porter la moindre offre — c'est ce que Marc a vu à l'écran,
  // et c'est exactement ce qu'un compte de codes HTTP aurait déclaré « fonctionnel ».
  if (!memeChemin(v)) return `HTTP ${v.statut}, mais REDIRIGÉ ailleurs`;
  if (v.offres > 0) return `HTTP ${v.statut} · ${v.offres} offre(s) lisibles`;
  // ⚠️ « AUCUNE OFFRE » NE VOULAIT PAS DIRE LA MÊME CHOSE SELON LE CONTENU, et la première
  // version confondait les deux. Une page HTML rendue à un analyseur RSS donne zéro offre
  // par CONSTRUCTION : ça ne juge que l'analyseur. Mesuré le 2026-08-17 — la page employeur
  // de Laserax et la page de recherche répondaient toutes deux 200, au bon chemin, avec le
  // bon titre, et ma conclusion annonçait « rien ne marche ».
  if (!v.estXml) return `HTTP ${v.statut} · page HTML valide (illisible par un analyseur RSS)`;
  return `HTTP ${v.statut} · XML, mais aucune offre dedans`;
}

function estUtilisable(v: Verdict): boolean {
  return v.statut !== null && v.statut < 400 && memeChemin(v) && v.offres > 0;
}

/** Une page qui répond au bon endroit — même si son contenu n'est pas un flux. */
function estVivante(v: Verdict): boolean {
  return !v.erreur && v.statut !== null && v.statut < 400 && memeChemin(v);
}

export function SondeGuichet({ terme }: { terme: string }) {
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatSonde | null>(null);

  return (
    <div className="sonde">
      <button
        type="button"
        className="bouton bouton--discret"
        disabled={enCours}
        onClick={() => {
          setEnCours(true);
          setResultat(null);
          void lancerSondeGuichet(terme)
            .then(setResultat)
            .catch(() =>
              setResultat({ ok: false, erreur: "La liaison s'est interrompue. Réessaie." }),
            )
            .finally(() => setEnCours(false));
        }}
      >
        {enCours ? "Sondage en cours…" : "Sonder le Guichet-Emplois"}
      </button>

      {/* Toujours dans le DOM : une région live qui apparaît avec son premier message
          n'est pas annoncée par les lecteurs d'écran. */}
      <p className="sonde__message" role="status">
        {enCours
          ? "Huit adresses éprouvées en série, depuis la production."
          : resultat && !resultat.ok
            ? resultat.erreur
            : null}
      </p>

      {resultat?.ok ? (
        <>
          <ul className="sonde__verdicts">
            {resultat.verdicts.map((v) => (
              <li
                key={v.url}
                className={estUtilisable(v) ? "sonde__verdict sonde__verdict--bon" : "sonde__verdict"}
              >
                <code className="sonde__url">{v.url}</code>
                <span className="sonde__etat">{verdictCourt(v)}</span>
                {!memeChemin(v) && !v.erreur ? (
                  <code className="sonde__url sonde__url--finale">→ {v.urlFinale}</code>
                ) : null}
                {v.apercu ? <span className="sonde__apercu">{v.apercu}</span> : null}
              </li>
            ))}
          </ul>

          {/* Ce qui n'a pas été essayé se DIT : une liste tronquée en silence se lirait
              comme une liste complète — l'erreur même que cette sonde existe pour ne plus
              commettre. */}
          {resultat.nonEssayees.length > 0 ? (
            <p className="sonde__message">
              {resultat.nonEssayees.length} adresse(s) non essayée(s), faute de budget :{" "}
              {resultat.nonEssayees.join(" · ")}
            </p>
          ) : null}

          {/* Les flux que les pages DÉCLARENT elles-mêmes : la seule piste qui ne soit pas
              une devinette. Rien à afficher si aucune page n'en annonce — et ce silence-là
              est une réponse, pas une absence de mesure. */}
          {resultat.verdicts.flatMap((v) => v.fluxAnnonces).length > 0 ? (
            <p className="sonde__note">
              Flux déclarés par les pages elles-mêmes :{" "}
              {[...new Set(resultat.verdicts.flatMap((v) => v.fluxAnnonces))].join(" · ")}
            </p>
          ) : null}

          <p className="sonde__note">
            {resultat.verdicts.some(estUtilisable)
              ? "Au moins une adresse rend des offres lisibles : la source peut être rallumée sur celle-là."
              : resultat.verdicts.some(estVivante)
                ? "Aucun FLUX ne répond — mais des pages HTML répondent au bon endroit, avec le bon titre. Ce n’est pas « le site est mort », c’est « le flux n’existe plus ». Lire ces pages demanderait un analyseur HTML, donc une décision (garde-fou n°4)."
                : "Aucune adresse ne répond. Ni flux, ni page : ce n’est pas une question d’analyseur."}
          </p>
        </>
      ) : null}
    </div>
  );
}
