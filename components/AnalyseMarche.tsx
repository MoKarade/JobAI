"use client";

// components/AnalyseMarche.tsx — le bouton d'analyse, et ce qu'elle a rendu.
//
// ⚠️ LES CHIFFRES AFFICHÉS NE VIENNENT PAS DU MODÈLE. Ils sont calculés par
// `lib/analyseMarche.ts` et rendus tels quels ici ; le texte du modèle est présenté À CÔTÉ,
// comme une lecture. Les mélanger laisserait croire que les nombres sortent de la prose.

import { useState, useTransition } from "react";
import { lancerAnalyseMarche } from "@/lib/actionsAnalyse";
import type { AnalyseConservee } from "@/lib/analyseConservee";

function quand(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function AnalyseMarcheVue({ initiale }: { initiale: AnalyseConservee | null }) {
  const [analyse, setAnalyse] = useState<AnalyseConservee | null>(initiale);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function lancer() {
    setErreur(null);
    demarrer(async () => {
      const r = await lancerAnalyseMarche();
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setAnalyse(r.analyse);
    });
  }

  const t = analyse?.tendances;

  return (
    <div className="marche">
      <button type="button" className="bouton" onClick={lancer} disabled={enCours}>
        {enCours ? "Lecture en cours…" : analyse ? "Refaire l’analyse" : "Analyser le marché"}
      </button>
      <p className="marche__note">
        Un appel au modèle, à ton initiative seulement — jamais au chargement de la page ni
        par la veille automatique.
      </p>

      {erreur !== null ? <p className="marche__erreur">{erreur}</p> : null}

      {analyse === null ? (
        <p className="vide">
          Aucune analyse pour l’instant. Elle demande quelques passes d’historique pour avoir
          de quoi comparer.
        </p>
      ) : (
        <>
          {t ? (
            <dl className="marche__chiffres">
              <div>
                <dt>Période</dt>
                <dd>
                  {t.du} → {t.au} · {t.passes} passes
                </dd>
              </div>
              <div>
                <dt>Nouvelles / passe</dt>
                <dd>
                  {t.recent.nouvellesParPasse ?? "—"}{" "}
                  <span className="marche__ref">
                    (sur l’ensemble : {t.ensemble.nouvellesParPasse ?? "—"})
                  </span>
                </dd>
              </div>
              <div>
                <dt>Note moyenne</dt>
                <dd>
                  {t.recent.noteMoyenne ?? "—"}{" "}
                  <span className="marche__ref">
                    (sur l’ensemble : {t.ensemble.noteMoyenne ?? "—"})
                  </span>
                </dd>
              </div>
              <div>
                <dt>Offres suivies</dt>
                <dd>
                  {t.suiviesDebut} → {t.suiviesFin}
                </dd>
              </div>
            </dl>
          ) : null}

          <p className="marche__texte">{analyse.texte}</p>

          {/* Une réponse coupée se dit : sans ça, une phrase tronquée s'afficherait avec
              l'autorité d'une analyse complète. */}
          {analyse.tronquee ? (
            <p className="marche__note">
              ⚠️ La réponse a été coupée au plafond de longueur : la dernière phrase est
              peut-être incomplète.
            </p>
          ) : null}

          <p className="marche__note">
            Analyse du {quand(analyse.le)}, sur {analyse.passes} passes. Elle ne se
            rafraîchit pas toute seule.
          </p>
        </>
      )}
    </div>
  );
}
