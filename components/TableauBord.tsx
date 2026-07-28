// components/TableauBord.tsx — les compteurs en tête de page.
//
// Ils viennent tous de `resumer` (fonction pure testée) : aucun compte n'est recalculé
// ici. Deux chiffres calculés à deux endroits finissent toujours par diverger, et c'est
// l'affichage qu'on accuse.

import type { ResumeSuivi } from "@/lib/types";

export function TableauBord({ resume }: { resume: ResumeSuivi }) {
  const cases: readonly { libelle: string; valeur: number; teinte: string }[] = [
    { libelle: "Offres notées 80+", valeur: resume.notees80Plus, teinte: "haut" },
    { libelle: "Offres suivies", valeur: resume.actives, teinte: "neutre" },
    { libelle: "CV envoyés", valeur: resume.cvEnvoyes, teinte: "envoi" },
    { libelle: "Réponses", valeur: resume.reponses, teinte: "reponse" },
    { libelle: "Entrevues", valeur: resume.entrevues, teinte: "haut" },
  ];

  return (
    <div className="bord">
      {cases.map((c) => (
        <div key={c.libelle} className={`stat stat--${c.teinte}`}>
          <div className="stat__n">{c.valeur}</div>
          <div className="stat__l">{c.libelle}</div>
        </div>
      ))}
    </div>
  );
}
