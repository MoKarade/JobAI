"use client";

// components/BoutonGeocoder.tsx — déclencher une passe de géocodage.
//
// Un GESTE de Marc, jamais un déclenchement automatique. Nominatim est un service bénévole
// qui demande un usage parcimonieux ; une app qui l'interroge à chaque chargement de page
// se fait bannir, et la carte est alors cassée pour de bon.
//
// Le bouton REND COMPTE de ce qu'il a fait, y compris quand il n'a rien trouvé : un bouton
// silencieux laisse croire qu'il n'a pas fonctionné, et invite à le recliquer — ce qui est
// exactement ce qu'il ne faut pas faire avec un service à cadence limitée.

import { useState, useTransition } from "react";
import { geocoderVillesManquantes } from "@/lib/actions";
import { MAX_VILLES_PAR_PASSE } from "@/lib/geocodage";

export function BoutonGeocoder({ restantes }: { restantes: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (restantes === 0 && message === null) return null;

  return (
    <div className="geocodage">
      <button
        type="button"
        className="bouton bouton--discret"
        disabled={enCours}
        onClick={() => {
          setMessage(null);
          demarrer(async () => {
            const r = await geocoderVillesManquantes();

            if (!r.ok) {
              setMessage(r.erreur);
              return;
            }

            const bouts: string[] = [];
            if (r.ajoutees > 0) {
              bouts.push(`${r.ajoutees} ville${r.ajoutees > 1 ? "s" : ""} située${r.ajoutees > 1 ? "s" : ""}`);
            }
            if (r.introuvables.length > 0) {
              // On NOMME les villes introuvables : sans ça, on ne saurait pas quoi corriger.
              bouts.push(`introuvable${r.introuvables.length > 1 ? "s" : ""} : ${r.introuvables.join(", ")}`);
            }
            if (r.restantes > 0) bouts.push(`${r.restantes} en attente d’une prochaine passe`);
            if (r.panne) bouts.push(`interrompu — ${r.panne}`);

            setMessage(
              bouts.length > 0
                ? `${bouts.join(" · ")}.`
                : "Rien à situer : toutes les villes connues le sont déjà.",
            );
          });
        }}
      >
        {enCours
          ? "Localisation en cours…"
          : `Situer ${restantes} ville${restantes > 1 ? "s" : ""} manquante${restantes > 1 ? "s" : ""}`}
      </button>

      {message ? (
        <p className="geocodage__message" role="status">
          {message}
        </p>
      ) : null}

      {/* Le plafond est LU depuis la constante, jamais recopié : un nombre en dur ici
          se mettrait à mentir au premier ajustement, sans que rien ne le signale. */}
      <p className="geocodage__note">
        Les positions viennent d’OpenStreetMap (Nominatim) : une requête par seconde,{" "}
        {MAX_VILLES_PAR_PASSE} villes par passe au maximum. Chaque ville n’est interrogée
        qu’une fois, puis conservée — et une position est celle du centre de la municipalité,
        pas celle de l’employeur.
      </p>
    </div>
  );
}
