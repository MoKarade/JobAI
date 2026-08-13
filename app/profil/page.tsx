// app/profil/page.tsx — le CV, et ce qu'il propose au profil.
//
// Session revérifiée ici même si la middleware garde la route : défense en profondeur,
// comme sur l'accueil. Si le matcher change un jour, cette page ne s'ouvre pas en silence —
// et c'est celle qui touche au document le plus personnel du projet.
//
// ⚠️ CETTE PAGE N'AFFICHE JAMAIS LE CONTENU DU CV. Ni le fichier, ni le texte extrait : le
// document porte le nom de Marc, son adresse et son téléphone, et rien de tout ça n'est
// utile pour décider d'un barème. Elle montre les FAITS professionnels retenus, et eux
// seuls (`lib/cv/depot.ts` — `colonnesCv`).

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cadre } from "@/components/Cadre";
import { RevueProfil } from "@/components/RevueProfil";
import { TeleversementCv } from "@/components/TeleversementCv";
import { listerCvs, profilActif, propositionDe } from "@/lib/cv/depot";
import { calculerEcarts } from "@/lib/cv/proposition";
import { PROFIL_DEFAUT } from "@/lib/profil";

export const metadata = { title: "Profil — JobAI" };

/** Un poids de fichier lisible. « 214 ko » se compare, « 219136 » se déchiffre. */
function poids(octets: number): string {
  return octets < 1024 * 1024
    ? `${Math.round(octets / 1024)} ko`
    : `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

function dateCourte(iso: string): string {
  return iso.slice(0, 10);
}

export default async function Profil() {
  const session = await auth();
  if (!session) redirect("/connexion");

  const cvs = await listerCvs();

  // Base absente : on le DIT plutôt que d'afficher un écran vide qui ressemblerait à
  // « aucun CV » (garde-fou n°3 — un état honnête, jamais un vide trompeur).
  if (cvs === null) {
    return (
      <Cadre actif="/profil" titre="Profil">
        <p className="intro-section">
          La base n’est pas configurée : impossible de lire ou d’enregistrer un CV.
        </p>
      </Cadre>
    );
  }

  let profil = PROFIL_DEFAUT;
  let erreurProfil: string | null = null;
  try {
    profil = await profilActif();
  } catch (e) {
    // Un profil illisible ne se contourne pas en silence : les notes seraient calculées
    // avec un barème que personne n'a choisi.
    erreurProfil = (e as Error).message;
  }

  // Le CV le plus récent qui porte une proposition : c'est celui qu'on donne à relire.
  const aRelire = cvs.find((c) => c.aUneProposition && !c.actif);
  const prop = aRelire ? await propositionDe(aRelire.id) : null;
  const ecarts = prop ? calculerEcarts(profil, prop.extraction) : [];

  return (
    <Cadre actif="/profil" titre="Profil">
      <p className="intro-section">
        Ce que l’app cherche chaque matin et la façon dont elle note viennent d’ici. Un CV
        peut le mettre à jour — il <strong>propose</strong>, tu valides, et rien ne bouge
        avant.
      </p>

      {erreurProfil ? (
        <p className="revue__retour revue__retour--echec">
          Profil enregistré illisible : {erreurProfil}. Les notes continuent d’utiliser le
          barème par défaut du code.
        </p>
      ) : null}

      <section className="carte-info">
        <h2>Profil actif</h2>
        <dl className="profil__faits">
          <div>
            <dt>Origine</dt>
            <dd>
              {profil.origine === "defaut"
                ? "barème par défaut du code"
                : profil.origine === "cv"
                  ? "CV validé"
                  : "saisie manuelle"}{" "}
              · version {profil.version} · établi le {profil.etabliLe}
            </dd>
          </div>
          <div>
            <dt>Expérience</dt>
            {/* « — » plutôt qu'un zéro plausible : non établi n'est pas débutant. */}
            <dd>
              {profil.faits.anneesExperience === null
                ? "—"
                : `${profil.faits.anneesExperience} ans`}
            </dd>
          </div>
          <div>
            <dt>Langues</dt>
            <dd>{profil.faits.langues.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>Diplômes</dt>
            <dd>{profil.faits.diplomes.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>Cherché chaque matin</dt>
            <dd>{profil.recherches.join(" · ")}</dd>
          </div>
        </dl>
      </section>

      <section className="carte-info">
        <h2>Téléverser un CV</h2>
        <TeleversementCv />
      </section>

      {prop && aRelire ? (
        <section className="carte-info">
          <h2>À valider</h2>
          <RevueProfil cvId={aRelire.id} ecarts={ecarts} nomFichier={prop.nomFichier} />
        </section>
      ) : null}

      {cvs.length > 0 ? (
        <section className="carte-info">
          <h2>CV déposés</h2>
          <ul className="liste-cv">
            {cvs.map((c) => (
              <li key={c.id} className="cv">
                <span className="cv__nom">{c.nomFichier}</span>
                <span className="cv__meta">
                  {poids(c.tailleOctets)} · déposé le {dateCourte(c.televerseLe)}
                  {c.actif ? " · profil actif" : ""}
                </span>
                {/* Une extraction ratée le DIT, avec sa raison : sans ça, Marc re-téléverse
                    le même fichier en boucle sans savoir ce qui cloche. */}
                {c.erreurExtraction ? (
                  <span className="cv__erreur">{c.erreurExtraction}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Cadre>
  );
}
