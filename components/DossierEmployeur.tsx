// components/DossierEmployeur.tsx — le bloc « Employeur » de la fiche d'une offre (JobAI#161).
//
// Présentation seule : la lettre et les lignes viennent de `lib/dossierEmployeur.ts` (pur, testé). Chaque ligne dit sa
// source et sa date ; la lettre n'est jamais montrée seule. La note de l'offre ne dépend pas de ce bloc.

import { dateLisible } from "@/lib/dateLisible";
import type { DossierEmployeur as Dossier } from "@/lib/dossierEmployeur";

export function DossierEmployeur({ dossier }: { dossier: Dossier }) {
  return (
    <section className="signaux" aria-label="Employeur">
      <h3 className="signaux__titre">
        Employeur : {dossier.lettre === "inconnu" ? "inconnu" : dossier.lettre}
      </h3>
      <p className="doux">{dossier.resume}</p>
      {dossier.lignes.length > 0 ? (
        <ul className="signaux__liste">
          {dossier.lignes.map((l) => (
            <li key={l.texte}>
              {l.texte}{" "}
              <span className="doux">
                ({l.source}, vu jusqu&apos;au {dateLisible(l.date)})
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="doux">
        Cette lettre ne juge que ce que le suivi a vu de l&apos;employeur. Elle ne change pas la note de l&apos;offre.
      </p>
    </section>
  );
}
