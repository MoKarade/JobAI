"use client";

// components/ComparaisonOffre.tsx — « ce que l'offre exige » face à ta fiche de compétences (JobAI#157, ADR-0034).
//
// ⚠️ UN APPEL PAYANT, À TON CLIC SEULEMENT, pour les 100 meilleures offres. Le résultat n'est pas conservé et ne change
// ni la note ni le suivi. « Il te manque » veut dire « pas sur ta fiche », et ne parle que de l'extrait d'annonce gardé :
// le nombre de caractères lus est affiché. Ce que la fiche ne sait pas comparer est rangé à part, jamais dans un verdict.

import { useState, useTransition } from "react";
import { comparerExigences } from "@/lib/actionsComparaison";
import {
  resumeComparaison,
  resumeDesEcarts,
  type ExigenceEcartee,
  type LigneComparaison,
  type StatutExigence,
} from "@/lib/comparaisonOffre";

const GROUPES: { statut: StatutExigence; titre: string }[] = [
  { statut: "tu-as", titre: "Tu as" },
  { statut: "notions", titre: "Notions seulement" },
  { statut: "manque", titre: "Il te manque (pas sur ta fiche)" },
  { statut: "hors-fiche", titre: "Demandé, mais ta fiche ne sait pas le comparer" },
];

interface Resultat {
  lignes: LigneComparaison[];
  ecartees: ExigenceEcartee[];
  caracteresLus: number;
}

export function ComparaisonOffre({ idOffre, refus }: { idOffre: string; refus: string | null }) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (refus !== null) {
    return <p className="comparaison__note">{refus}</p>;
  }

  function lancer() {
    setErreur(null);
    demarrer(async () => {
      try {
        const r = await comparerExigences(idOffre);
        if (!r.ok) {
          setErreur(r.erreur);
          return;
        }
        setResultat({ lignes: r.lignes, ecartees: r.ecartees, caracteresLus: r.caracteresLus });
      } catch (err) {
        // Réseau coupé, plateforme en panne, délai dépassé : sans ce catch, l'erreur remplacerait toute la fiche de l'offre.
        console.error("[comparaison] la requête n'a pas abouti", err);
        setErreur("La requête n’a pas abouti. L’appel au modèle a pu partir : vérifie le coût avant de relancer.");
      }
    });
  }

  const resume = resultat ? resumeComparaison(resultat.lignes) : null;
  const ecarts = resultat ? resumeDesEcarts(resultat.ecartees) : "";

  return (
    <div className="comparaison">
      {/* aria-disabled et non disabled : un bouton désactivé perd le focus clavier au clic, et la région d'état ci-dessous annonce la fin. */}
      <button
        type="button"
        className="bouton bouton-principal"
        onClick={enCours ? undefined : lancer}
        aria-disabled={enCours}
        aria-busy={enCours}
      >
        {enCours ? "Lecture de l’annonce…" : resultat ? "Refaire la comparaison" : "Comparer à ma fiche de compétences"}
      </button>
      <p className="comparaison__note">
        Un appel au modèle, à ton clic seulement. Il lit l’extrait d’annonce gardé pour cette offre et relève ce qu’elle
        demande ; la comparaison à ta fiche est faite par le code. Rien n’est conservé, et la note ne change pas.
      </p>

      {erreur !== null ? (
        <p className="comparaison__erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {/* Région d'état TOUJOURS montée, vide au départ : une région créée déjà remplie n'est pas annoncée. */}
      <p className="comparaison__resume" role="status">
        {resultat && resume
          ? resultat.lignes.length === 0
            ? `Aucune exigence repérée dans les ${resultat.caracteresLus} caractères lus de l’annonce.`
            : `${resultat.lignes.length} exigence${resultat.lignes.length > 1 ? "s" : ""} relevée${resultat.lignes.length > 1 ? "s" : ""} dans les ${resultat.caracteresLus} caractères lus de l’annonce : ${resume.tuAs} couverte${resume.tuAs > 1 ? "s" : ""}, ${resume.notions} en notions, ${resume.manque} absente${resume.manque > 1 ? "s" : ""} de ta fiche, ${resume.horsFiche} hors fiche.`
          : ""}
      </p>

      {resultat && resume ? (
        <>
          {ecarts !== "" ? <p className="comparaison__note">{ecarts}</p> : null}

          {GROUPES.map(({ statut, titre }) => {
            const lignes = resultat.lignes.filter((l) => l.statut === statut);
            if (lignes.length === 0) return null;
            return (
              <section key={statut} className={`comparaison__groupe comparaison__groupe--${statut}`}>
                <h3>{titre}</h3>
                <ul>
                  {lignes.map((l, i) => (
                    <li key={`${statut}-${i}`}>
                      <p className="comparaison__phrase">« {l.exigence} »</p>
                      {l.competence !== null ? <p className="comparaison__competence">{l.competence}</p> : null}
                      {l.preuve !== null ? (
                        <p className="comparaison__preuve">
                          Ta fiche ({l.preuve.niveau}) : « {l.preuve.phrase} » ({l.preuve.poste})
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
