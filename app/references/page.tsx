// app/references/page.tsx — barème, entreprises cibles, salaires du marché, position.
//
// Ces quatre panneaux vivaient au bas de l'accueil, sous la liste des offres. Ce sont des
// documents qu'on CONSULTE (avant une entrevue, avant de négocier), pas des choses qu'on
// FAIT — les empiler sous le suivi allongeait la page d'accueil sans jamais servir au
// moment où on l'ouvre. ADR-0003.
//
// Aucune lecture de base ici : tout vient de `lib/reference.ts` et de `lib/scoring.ts`,
// statiques et testés. Cette page ne peut donc pas tomber en panne de base — et c'est
// pour ça qu'elle ne porte aucun écran d'erreur.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cadre } from "@/components/Cadre";
import { Panneaux } from "@/components/Panneaux";
import { profilActif } from "@/lib/cv/depot";
import { PROFIL_DEFAUT } from "@/lib/profil";

export const metadata = { title: "Références — JobAI" };

export default async function References() {
  // Session revérifiée ici même si le middleware garde la route : défense en profondeur,
  // comme sur l'accueil. Si le matcher change un jour, cette page ne s'ouvre pas en silence.
  const session = await auth();
  if (!session) redirect("/connexion");

  // ⚠️ LA LECTURE DU PROFIL NE DOIT PAS POUVOIR ÉTEINDRE CETTE PAGE. Elle n'a jamais eu
  // d'écran de panne parce qu'elle ne dépendait de rien ; brancher le profil actif y
  // introduit une dépendance à la base. Un incident effacerait alors le barème de l'écran
  // alors qu'il est écrit dans le code — on retombe donc sur le défaut, et la page reste
  // consultable (elle affiche la date du constat, qui dit lequel des deux on lit).
  let profil = PROFIL_DEFAUT;
  try {
    profil = await profilActif();
  } catch {
    profil = PROFIL_DEFAUT;
  }

  return (
    <Cadre actif="/references" titre="Références">
      <p className="intro-section">
        Le barème qui produit les notes, les entreprises visées, les repères de salaire du
        marché et la lecture de position. Chaque repère porte sa source et son année : un
        chiffre de marché sans provenance n’est plus utilisable en négociation six mois plus
        tard.
      </p>
      <Panneaux profil={profil} />
    </Cadre>
  );
}
