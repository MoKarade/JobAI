"use client";

// components/ReponsesRecruteurs.tsx — les réponses de recruteurs repérées dans Gmail, à confirmer d'un geste. (JobAI#219, ADR-0043)
//
// CE BLOC NE CHANGE RIEN TOUT SEUL (garde-fou n°2). Chaque ligne montre l'offre, le statut actuel, le statut PROPOSÉ et la phrase du courriel
// qui le justifie : une proposition dont on ne voit pas la source ne peut pas être contestée. « Confirmer » écrit le statut (par le même chemin que
// le menu de statut) ; « Écarter » n'écrit rien dans le suivi. Le texte du courriel est une DONNÉE d'un tiers : affiché comme du texte, jamais
// interprété.
//
// L'affichage est mis à jour APRÈS la réponse du serveur, pas avant : une ligne qui disparaît avant d'être enregistrée ferait croire à un statut
// écrit. En cas d'échec la ligne reste, avec la raison.

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmerReponse, ecarterReponse } from "@/lib/actionsReponses";
import { dateLisible } from "@/lib/dateLisible";
import { aujourdhui } from "@/lib/ajout";
import { LIBELLE_STATUT } from "@/lib/export";
import type { ReponseAConfirmer } from "@/lib/gmail/reponses";

function Ligne({ reponse, traitee }: { reponse: ReponseAConfirmer; traitee: () => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function agir(geste: (id: string) => Promise<{ ok: true } | { ok: false; erreur: string }>) {
    setErreur(null);
    demarrer(async () => {
      const r = await geste(reponse.courrielId);
      if (r.ok) traitee();
      else setErreur(r.erreur);
    });
  }

  const recu = reponse.recuLe === null ? null : dateLisible(aujourdhui(new Date(reponse.recuLe)));

  return (
    <li className="reponses__item">
      <Link href={`/offre/${reponse.offreId}`} className="reponses__lien">
        {reponse.entreprise} — {reponse.poste}
      </Link>
      <p className="reponses__statuts">
        Statut actuel : {LIBELLE_STATUT[reponse.statutActuel]} · proposé : <strong>{LIBELLE_STATUT[reponse.statutPropose]}</strong>
      </p>
      <blockquote className="reponses__phrase">{reponse.phrase}</blockquote>
      <p className="reponses__source">
        Courriel de {reponse.expediteur === "" ? "expéditeur inconnu" : reponse.expediteur}
        {recu === null ? "" : `, reçu le ${recu}`}
      </p>
      <div className="reponses__actions">
        <button type="button" className="bouton bouton-principal" disabled={enCours} onClick={() => agir(confirmerReponse)}>
          Confirmer : {LIBELLE_STATUT[reponse.statutPropose]}
        </button>
        <button type="button" className="bouton bouton-second" disabled={enCours} onClick={() => agir(ecarterReponse)}>
          Écarter
        </button>
      </div>
      {erreur === null ? null : (
        <p className="reponses__erreur" role="alert">
          {erreur}
        </p>
      )}
    </li>
  );
}

export function ReponsesRecruteurs({ reponses }: { reponses: readonly ReponseAConfirmer[] }) {
  const [faites, setFaites] = useState<ReadonlySet<string>>(new Set());
  const restantes = reponses.filter((r) => !faites.has(r.courrielId));
  if (restantes.length === 0) return null;

  return (
    <section className="reponses" aria-labelledby="reponses-titre">
      <h2 id="reponses-titre" className="reponses__titre">
        Réponses de recruteurs
      </h2>
      <p className="reponses__resume">
        {restantes.length} réponse{restantes.length > 1 ? "s" : ""} repérée{restantes.length > 1 ? "s" : ""} dans Gmail. Rien n’est changé tant que tu
        n’as pas confirmé.
      </p>
      <ul className="reponses__liste">
        {restantes.map((r) => (
          <Ligne key={r.courrielId} reponse={r} traitee={() => setFaites((s) => new Set(s).add(r.courrielId))} />
        ))}
      </ul>
    </section>
  );
}
