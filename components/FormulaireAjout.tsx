"use client";

// components/FormulaireAjout.tsx — ajouter une offre repérée à la main.
//
// Replié par défaut, dans un `<details>` natif : le formulaire est utile plusieurs fois par
// semaine, la liste l'est à chaque visite. Un `<details>` s'ouvre au clavier sans JavaScript
// et annonce son état aux lecteurs d'écran — c'est déjà le choix fait pour les panneaux.
//
// Aucune décision ici. L'identifiant, la note, le statut initial et la date sont calculés
// côté serveur (`lib/ajout.ts`, pur et testé) : ce composant saisit, envoie, et affiche
// honnêtement ce qui revient. Les erreurs par champ viennent des schémas Zod, pas d'une
// seconde liste de messages qui dériverait de la première.

import { useRef, useState, useTransition } from "react";
import { ajouterOffre } from "@/lib/actions";
import type { Priorite } from "@/lib/types";

const PRIORITES: readonly Priorite[] = ["Haute", "Moyenne", "Basse"];

/**
 * Un champ numérique vide vaut `null`, pas `0`.
 *
 * La distinction est portée jusqu'au barème : `scoreDistance(null)` est neutre,
 * `scoreDistance(0)` est le maximum. Une saisie illisible devient `NaN`, que le schéma
 * refuse explicitement — plutôt qu'un `0` silencieux qui noterait l'offre au maximum.
 */
function nombreOuNull(valeur: string): number | null {
  const t = valeur.trim();
  return t === "" ? null : Number(t);
}

const VIDE = {
  entreprise: "",
  poste: "",
  lien: "",
  km: "",
  salaireAffiche: "",
  priorite: "Moyenne" as Priorite,
  note: "",
  userNote: "",
};

export function FormulaireAjout() {
  const [champs, setChamps] = useState(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreursChamp, setErreursChamp] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const premierChamp = useRef<HTMLInputElement>(null);

  function modifier(cle: keyof typeof VIDE, valeur: string) {
    setChamps((c) => ({ ...c, [cle]: valeur }));
    // L'erreur d'un champ disparaît dès qu'on le corrige : la laisser affichée sous un
    // champ qu'on vient de changer donne l'impression que la correction n'a pas été prise.
    // On ne rend un nouvel objet que s'il y avait bien une erreur — sinon chaque frappe
    // déclencherait un rendu de plus pour rien.
    setErreursChamp((actuelles) => {
      if (!(cle in actuelles)) return actuelles;
      const reste = { ...actuelles };
      delete reste[cle];
      return reste;
    });
  }

  function envoyer() {
    setErreur(null);
    setErreursChamp({});
    setSucces(null);

    demarrer(async () => {
      const r = await ajouterOffre({
        entreprise: champs.entreprise,
        poste: champs.poste,
        lien: champs.lien.trim(),
        km: nombreOuNull(champs.km),
        salaireAffiche: champs.salaireAffiche.trim() || null,
        priorite: champs.priorite,
        note: nombreOuNull(champs.note),
        userNote: champs.userNote,
      });

      if (!r.ok) {
        setErreur(r.erreur);
        setErreursChamp(r.champs ?? {});
        return;
      }

      // Le formulaire se vide et reprend le focus : ajouter deux offres d'affilée est le
      // cas normal après une session de recherche.
      setChamps(VIDE);
      setSucces("Offre ajoutée. Elle apparaît dans la liste ci-dessous.");
      premierChamp.current?.focus();
    });
  }

  return (
    <details className="ajout">
      <summary className="ajout__titre">Ajouter une offre repérée</summary>

      <form
        className="ajout__grille"
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
      >
        <label className="controle controle--large">
          <span className="controle__l">Entreprise *</span>
          <input
            ref={premierChamp}
            className="select"
            value={champs.entreprise}
            disabled={enCours}
            required
            aria-invalid={erreursChamp.entreprise ? true : undefined}
            onChange={(e) => modifier("entreprise", e.target.value)}
          />
          {erreursChamp.entreprise ? (
            <span className="ajout__erreur-champ">{erreursChamp.entreprise}</span>
          ) : null}
        </label>

        <label className="controle controle--large">
          <span className="controle__l">Poste *</span>
          <input
            className="select"
            value={champs.poste}
            disabled={enCours}
            required
            aria-invalid={erreursChamp.poste ? true : undefined}
            onChange={(e) => modifier("poste", e.target.value)}
          />
          {erreursChamp.poste ? (
            <span className="ajout__erreur-champ">{erreursChamp.poste}</span>
          ) : null}
        </label>

        <label className="controle controle--large">
          <span className="controle__l">Lien vers l’annonce</span>
          <input
            className="select"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={champs.lien}
            disabled={enCours}
            aria-invalid={erreursChamp.lien ? true : undefined}
            onChange={(e) => modifier("lien", e.target.value)}
          />
          {erreursChamp.lien ? (
            <span className="ajout__erreur-champ">{erreursChamp.lien}</span>
          ) : null}
        </label>

        <label className="controle">
          <span className="controle__l">Distance (km)</span>
          <input
            className="select"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            placeholder="inconnue"
            value={champs.km}
            disabled={enCours}
            aria-invalid={erreursChamp.km ? true : undefined}
            onChange={(e) => modifier("km", e.target.value)}
          />
          {erreursChamp.km ? <span className="ajout__erreur-champ">{erreursChamp.km}</span> : null}
        </label>

        <label className="controle">
          <span className="controle__l">Salaire affiché</span>
          <input
            className="select"
            placeholder="tel qu’écrit dans l’annonce"
            value={champs.salaireAffiche}
            disabled={enCours}
            onChange={(e) => modifier("salaireAffiche", e.target.value)}
          />
        </label>

        <label className="controle">
          <span className="controle__l">Priorité</span>
          <select
            className="select"
            value={champs.priorite}
            disabled={enCours}
            onChange={(e) => modifier("priorite", e.target.value)}
          >
            {PRIORITES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="controle">
          <span className="controle__l">Note /100</span>
          <input
            className="select"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            placeholder="calculée"
            value={champs.note}
            disabled={enCours}
            aria-describedby="ajout-aide-note"
            aria-invalid={erreursChamp.note ? true : undefined}
            onChange={(e) => modifier("note", e.target.value)}
          />
          {erreursChamp.note ? (
            <span className="ajout__erreur-champ">{erreursChamp.note}</span>
          ) : null}
        </label>

        <label className="controle controle--large">
          <span className="controle__l">Ma note</span>
          <textarea
            className="zone-note"
            rows={2}
            placeholder="Pourquoi cette offre m’intéresse…"
            value={champs.userNote}
            disabled={enCours}
            onChange={(e) => modifier("userNote", e.target.value)}
          />
        </label>

        {/* Dire ce que fait le champ vide vaut mieux que de laisser découvrir une note
            apparue toute seule. Le plafond des notes calculées est une règle du barème,
            pas un détail d'implémentation : il se dit à l'endroit où il s'applique. */}
        <p className="ajout__aide" id="ajout-aide-note">
          Laisse la note vide pour qu’elle soit calculée depuis le barème (plafonnée à 85 —
          une note calculée ne passe jamais devant une offre vérifiée à la main). Le salaire
          affiché n’entre pas dans ce calcul : il est conservé tel quel, sans interprétation.
        </p>

        <div className="ajout__actions">
          <button type="submit" className="bouton bouton--discret" disabled={enCours}>
            {enCours ? "Enregistrement…" : "Ajouter l’offre"}
          </button>
        </div>

        {/* `role="alert"` et `role="status"` : le résultat est annoncé aux lecteurs d'écran,
            qui ne voient pas apparaître une ligne de texte plus bas dans la page. */}
        {erreur ? (
          <p className="ajout__message ajout__message--erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        {succes ? (
          <p className="ajout__message ajout__message--succes" role="status">
            {succes}
          </p>
        ) : null}
      </form>
    </details>
  );
}
