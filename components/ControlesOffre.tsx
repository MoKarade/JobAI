"use client";

// components/ControlesOffre.tsx — les contrôles d'une offre : statut, priorité, note perso.
//
// ÉCART ASSUMÉ avec l'artifact d'origine : il faisait CYCLER le statut au clic. C'est
// pratique à la souris, mais inutilisable autrement — rien n'indique les valeurs possibles,
// et il faut cinq clics pour atteindre la sixième. Une liste déroulante montre les choix,
// se pilote au clavier, et n'exige qu'une seule interaction.
//
// L'état local est mis à jour AVANT la réponse du serveur (affichage optimiste) : sans ça,
// chaque changement clignote le temps de l'aller-retour. En cas d'échec, on revient à la
// valeur précédente et on le DIT — jamais un retour silencieux qui laisserait croire que
// c'est enregistré.

import { useState, useTransition } from "react";
import { modifierOffre } from "@/lib/actions";
import type { Offre, Priorite, Statut } from "@/lib/types";

const STATUTS: readonly { valeur: Statut; libelle: string }[] = [
  { valeur: "Identifiee", libelle: "Identifiée" },
  { valeur: "CVenvoye", libelle: "CV envoyé" },
  { valeur: "Relance", libelle: "Relance faite" },
  { valeur: "Entrevue", libelle: "Entrevue" },
  { valeur: "Refusee", libelle: "Refusée" },
  { valeur: "Offre", libelle: "Offre reçue" },
];

const PRIORITES: readonly Priorite[] = ["Haute", "Moyenne", "Basse"];

export function ControlesOffre({ offre }: { offre: Offre }) {
  const [statut, setStatut] = useState<Statut>(offre.statut);
  const [priorite, setPriorite] = useState<Priorite>(offre.priorite);
  const [note, setNote] = useState(offre.userNote);
  const [noteEnregistree, setNoteEnregistree] = useState(offre.userNote);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function enregistrer(patch: Record<string, string>, annuler: () => void) {
    setErreur(null);
    demarrer(async () => {
      const r = await modifierOffre(offre.id, patch);
      if (!r.ok) {
        annuler();
        setErreur(r.erreur);
      }
    });
  }

  const noteModifiee = note !== noteEnregistree;

  return (
    <div className="controles-offre">
      <label className="controle">
        <span className="controle__l">Statut</span>
        <select
          className={`select select--${statut}`}
          value={statut}
          disabled={enCours}
          onChange={(e) => {
            const nouveau = e.target.value as Statut;
            const precedent = statut;
            setStatut(nouveau);
            enregistrer({ statut: nouveau }, () => setStatut(precedent));
          }}
        >
          {STATUTS.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.libelle}
            </option>
          ))}
        </select>
      </label>

      <label className="controle">
        <span className="controle__l">Priorité</span>
        <select
          className="select"
          value={priorite}
          disabled={enCours}
          onChange={(e) => {
            const nouvelle = e.target.value as Priorite;
            const precedente = priorite;
            setPriorite(nouvelle);
            enregistrer({ priorite: nouvelle }, () => setPriorite(precedente));
          }}
        >
          {PRIORITES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="controle controle--large">
        <span className="controle__l">Ma note</span>
        <textarea
          className="zone-note"
          rows={2}
          value={note}
          disabled={enCours}
          placeholder="Note personnelle…"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {noteModifiee ? (
        <button
          type="button"
          className="bouton bouton--discret"
          disabled={enCours}
          onClick={() => {
            const precedente = noteEnregistree;
            setNoteEnregistree(note);
            enregistrer({ userNote: note }, () => setNoteEnregistree(precedente));
          }}
        >
          Enregistrer la note
        </button>
      ) : null}

      {erreur ? (
        <p className="controles-offre__erreur" role="alert">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
