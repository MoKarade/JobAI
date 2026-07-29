"use client";

// components/BoutonSituer.tsx — déclencher une passe de localisation des entreprises.
//
// Un GESTE de Marc, jamais un déclenchement automatique : Nominatim est un service bénévole
// à cadence limitée. Et le bouton REND COMPTE de ce qu'il a fait — un bouton silencieux
// laisse croire qu'il n'a pas fonctionné et invite à le recliquer, exactement le mauvais
// geste avec un service à cadence limitée.

import { useState, useTransition } from "react";
import { situerEntreprises } from "@/lib/actions";

export function BoutonSituer({ restantes }: { restantes: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (restantes === 0 && message === null) return null;

  return (
    <div className="geocodage">
      {restantes > 0 ? (
        <button
          type="button"
          className="bouton bouton--discret"
          disabled={enCours}
          onClick={() => {
            setMessage(null);
            demarrer(async () => {
              const r = await situerEntreprises();

              if (!r.ok) {
                setMessage(r.erreur);
                return;
              }

              const bouts: string[] = [];
              if (r.exactes > 0) {
                bouts.push(`${r.exactes} située${r.exactes > 1 ? "s" : ""} précisément`);
              }
              if (r.approximatives > 0) {
                bouts.push(
                  `${r.approximatives} posée${r.approximatives > 1 ? "s" : ""} au centre-ville (introuvable${r.approximatives > 1 ? "s" : ""} dans OpenStreetMap)`,
                );
              }
              if (r.restantes > 0) bouts.push(`${r.restantes} pour une prochaine passe`);
              if (r.insituables.length > 0) {
                // Une ville que Nominatim ne connaît pas ne convergera JAMAIS : la nommer
                // à chaque passe est voulu — un état sans issue doit se voir.
                bouts.push(`ville${r.insituables.length > 1 ? "s" : ""} introuvable${r.insituables.length > 1 ? "s" : ""} : ${r.insituables.join(", ")}`);
              }
              if (r.panne) bouts.push(`interrompu — ${r.panne}`);

              setMessage(
                bouts.length > 0
                  ? `${bouts.join(" · ")}.`
                  : "Rien à situer : toutes les entreprises le sont déjà.",
              );
            });
          }}
        >
          {enCours
            ? "Localisation en cours…"
            : `Situer ${restantes} entreprise${restantes > 1 ? "s" : ""}`}
        </button>
      ) : null}

      {/* La zone `role="status"` est TOUJOURS dans le DOM : une région live qui apparaît
          en même temps que son premier message n'est pas annoncée par les lecteurs
          d'écran. Elle porte aussi l'état « en cours » — sinon le seul signal est le
          libellé d'un bouton devenu inerte. */}
      <p className="geocodage__message" role="status">
        {enCours ? "Localisation en cours…" : message}
      </p>

      <p className="geocodage__note">
        Les positions viennent d’OpenStreetMap (Nominatim), une requête par seconde, quelques
        entreprises par passe. Une entreprise absente d’OpenStreetMap est posée au centre de
        sa ville — et la carte le dit, plutôt que d’inventer une adresse.
      </p>
    </div>
  );
}
