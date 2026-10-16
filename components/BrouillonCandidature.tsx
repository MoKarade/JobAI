"use client";

// components/BrouillonCandidature.tsx — le bouton « brouillon de CV et de lettre », et ce qu'il rend.
//
// ⚠️ UN BROUILLON, PAS UN DOCUMENT. Il part d'un appel payant au modèle, à ton clic seulement,
// et il n'est pas conservé : le texte est là pour être relu puis copié. Ce que le code a
// écarté (poste ou compétence absents du profil) et les chiffres que ni le profil ni l'offre
// ne portent sont affichés EN TÊTE : c'est là qu'il faut regarder avant de s'en servir.

import { useState, useTransition } from "react";
import { preparerBrouillon } from "@/lib/actionsCandidature";
import { cvEnTexte, lettreEnTexte, type Brouillon } from "@/lib/candidature";

function BoutonCopier({ texte, libelle }: { texte: string; libelle: string }) {
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setEtat("copie");
    } catch {
      // Pas de presse-papiers (page non sécurisée, permission refusée) : on le DIT, le texte
      // reste sélectionnable à l'écran.
      setEtat("echec");
    }
  }

  return (
    <button type="button" className="bouton bouton--discret" onClick={copier}>
      {etat === "copie" ? "Copié" : etat === "echec" ? "Copie impossible : sélectionne le texte" : libelle}
    </button>
  );
}

export function BrouillonCandidature({ idOffre }: { idOffre: string }) {
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function lancer() {
    setErreur(null);
    demarrer(async () => {
      const r = await preparerBrouillon(idOffre);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setBrouillon(r.brouillon);
    });
  }

  return (
    <div className="brouillon">
      <button type="button" className="bouton bouton-principal" onClick={lancer} disabled={enCours}>
        {enCours ? "Rédaction en cours…" : brouillon ? "Refaire le brouillon" : "Préparer un brouillon de CV et de lettre"}
      </button>
      <p className="brouillon__note">
        Un appel au modèle, à ton clic seulement. Il ne connaît de l’offre que le poste, l’employeur
        et les notes de recherche, et de toi que ton profil validé. Le brouillon n’est pas
        conservé : copie-le avant de quitter la page.
      </p>

      {erreur !== null ? (
        <p className="brouillon__erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {brouillon ? (
        <>
          {brouillon.chiffresNonSources.length > 0 || brouillon.avertissements.length > 0 ? (
            <div className="brouillon__avert" role="status">
              <strong>À vérifier avant usage</strong>
              <ul>
                {brouillon.chiffresNonSources.length > 0 ? (
                  <li>
                    Chiffres que ni ton profil ni l’offre ne portent :{" "}
                    {brouillon.chiffresNonSources.join(", ")}. Retire-les ou confirme-les.
                  </li>
                ) : null}
                {brouillon.avertissements.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <section className="brouillon__bloc">
            <h3>CV ciblé</h3>
            <pre className="brouillon__texte">{cvEnTexte(brouillon)}</pre>
            <BoutonCopier texte={cvEnTexte(brouillon)} libelle="Copier le CV" />
          </section>

          <section className="brouillon__bloc">
            <h3>Lettre</h3>
            <pre className="brouillon__texte">{lettreEnTexte(brouillon)}</pre>
            <BoutonCopier texte={lettreEnTexte(brouillon)} libelle="Copier la lettre" />
          </section>
        </>
      ) : null}
    </div>
  );
}
