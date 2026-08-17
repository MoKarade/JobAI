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
  if (v.erreur) return `injoignable — ${v.erreur}`;
  if (v.statut === null) return "aucune réponse";
  if (v.statut >= 400) return `HTTP ${v.statut}`;
  // ⚠️ LE CAS QUI COMPTE : 200, mais ailleurs. Une page employeur qui redirige vers
  // l'accueil répond 200 sans porter la moindre offre — c'est ce que Marc a vu à l'écran,
  // et c'est exactement ce qu'un compte de codes HTTP aurait déclaré « fonctionnel ».
  if (!memeChemin(v)) return `HTTP ${v.statut}, mais REDIRIGÉ ailleurs`;
  if (v.offres > 0) return `HTTP ${v.statut} · ${v.offres} offre(s) lisibles`;
  return `HTTP ${v.statut} · aucune offre lisible`;
}

function estUtilisable(v: Verdict): boolean {
  return v.statut !== null && v.statut < 400 && memeChemin(v) && v.offres > 0;
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

          <p className="sonde__note">
            {resultat.verdicts.some(estUtilisable)
              ? "Au moins une adresse rend des offres lisibles : la source peut être rallumée sur celle-là."
              : "Aucune adresse ne rend d’offres lisibles. Un « HTTP 200 » ne suffit pas — une page qui redirige vers l’accueil répond 200 sans porter une seule offre."}
          </p>
        </>
      ) : null}
    </div>
  );
}
