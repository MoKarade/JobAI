// components/Relances.tsx — les candidatures qui dorment, enfin à l'écran.
//
// POURQUOI CE COMPOSANT EXISTE
// `lib/relances.ts` était livré et testé depuis des jours — et n'était branché NULLE PART.
// Marc l'a constaté directement (« vérifie pourquoi je vois pas relances », 2026-07-31) :
// il n'y avait rien à voir. Une logique qui n'atteint pas l'écran ne sert à rien ; le test
// vert donnait l'illusion du contraire.
//
// CE QUE CE BLOC NE FAIT PAS
// Il n'envoie aucune relance, ne rédige aucun courriel, ne change aucun statut. Il
// CONSTATE. `statut` et `dateEnvoi` appartiennent à Marc (garde-fou n°2), et une
// automatisation qui les modifierait effacerait l'information qu'elle prétend surveiller.
//
// Composant SERVEUR : que des liens, aucun état. Chaque ligne mène au détail de l'offre, où
// se trouvent les contrôles qui permettent d'agir.

import Link from "next/link";
import {
  SEUIL_RELANCE_JOURS,
  SEUIL_SILENCE_JOURS,
  type ResumeRelances,
  type Surveillance,
} from "@/lib/relances";

/** Combien de lignes avant que ce ne soit plus une liste de travail, mais une liste. */
const MAX_LIGNES = 8;

export function Relances({
  surveillance,
  resume,
}: {
  surveillance: readonly Surveillance[];
  resume: ResumeRelances;
}) {
  // Rien à relancer est un VRAI résultat : le dire évite de chercher un bloc qui n'aurait
  // pas chargé — et donne au passage le seuil, pour qu'on puisse le contester.
  if (surveillance.length === 0) {
    return (
      <section className="relances relances--vide" aria-labelledby="relances-titre">
        <h2 id="relances-titre" className="relances__titre">
          Relances
        </h2>
        <p className="relances__rien">
          {resume.enCours === 0
            ? "Aucune candidature en attente de réponse."
            : `${resume.enCours} candidature${resume.enCours > 1 ? "s" : ""} en attente, aucune n’a dépassé ${SEUIL_RELANCE_JOURS} jours.`}
        </p>
      </section>
    );
  }

  const visibles = surveillance.slice(0, MAX_LIGNES);

  return (
    <section className="relances" aria-labelledby="relances-titre">
      <h2 id="relances-titre" className="relances__titre">
        Relances
      </h2>
      <p className="relances__resume">
        {resume.enCours} en attente · {resume.aRelancer} à relancer
        {resume.sansSuite > 0 ? ` · ${resume.sansSuite} sans suite` : ""}
        {resume.plusAncienneJours !== null
          ? ` · la plus ancienne remonte à ${resume.plusAncienneJours} jours`
          : ""}
      </p>

      <ul className="relances__liste">
        {visibles.map(({ offre, jours, etat }) => (
          <li key={offre.id} className={`relances__item relances__item--${etat}`}>
            <Link href={`/offre/${offre.id}`} className="relances__lien">
              {offre.entreprise} — {offre.poste}
            </Link>
            {/* LE FAIT qui déclenche la ligne, toujours affiché : une suggestion dont on ne
                voit pas le déclencheur ne peut pas être contestée, et une liste qu'on ne
                peut pas contester finit par être ignorée en bloc. */}
            <span className="relances__motif">
              {etat === "sans-suite"
                ? `envoyée il y a ${jours} jours — au-delà de ${SEUIL_SILENCE_JOURS}, le silence est une réponse`
                : `envoyée il y a ${jours} jours — seuil de relance : ${SEUIL_RELANCE_JOURS}`}
            </span>
          </li>
        ))}
      </ul>

      {surveillance.length > visibles.length ? (
        <p className="relances__reste">
          {surveillance.length - visibles.length} autre
          {surveillance.length - visibles.length > 1 ? "s" : ""} en attente, non affichée
          {surveillance.length - visibles.length > 1 ? "s" : ""} ici.
        </p>
      ) : null}
    </section>
  );
}
