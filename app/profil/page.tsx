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

/**
 * Une liste de faits, en pastilles.
 *
 * ⚠️ POURQUOI PAS UN `dd` AVEC DES VIRGULES. C'est ce que faisait la page avant, et avec un
 * CV réel — une vingtaine d'outils, une dizaine de titres — chaque cellule devenait un
 * paragraphe compact dans une case de grille. Une pastille par valeur se lit d'un coup
 * d'œil et se replie toute seule sur un écran étroit.
 *
 * Une liste VIDE ne rend rien du tout : une rubrique vide n'apprend rien et ajoute du bruit
 * à une page qui en avait déjà trop.
 */
function ListeEtiquettes({ titre, valeurs }: { titre: string; valeurs: readonly string[] }) {
  if (valeurs.length === 0) return null;
  return (
    <div className="profil__groupe">
      <h3 className="profil__groupe-titre">{titre}</h3>
      <ul className="profil__etiquettes">
        {valeurs.map((v) => (
          <li key={v} className="etiquette">
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
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
  // ⚠️ TROIS CAS, ET ILS NE SE CONFONDENT PLUS. `null` = rien à relire ; `ok: false` = une
  // proposition existe mais n'est plus lisible (schéma resserré, JSON corrompu). La
  // première version rendait `null` dans les deux cas : le CV s'affichait propre, sans
  // erreur, simplement « sans rien à valider » — indiscernable du cas légitime.
  const ecarts = prop?.ok ? calculerEcarts(profil, prop.extraction) : [];

  // ⚠️ « AUCUN FAIT » SE MESURE SUR LES FAITS, PAS SUR `origine`. Un profil peut porter
  // `origine: "cv"` et des listes vides si l'extraction n'a rien trouvé d'exploitable —
  // afficher alors une grille de tirets ferait passer une extraction ratée pour une page
  // cassée. C'est le contenu qui décide de ce qu'on montre.
  const f = profil.faits;
  const aucunFait =
    f.anneesExperience === null &&
    f.titresOccupes.length === 0 &&
    f.outils.length === 0 &&
    f.diplomes.length === 0 &&
    f.langues.length === 0;

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
        <h2>Ce que l’app sait de toi</h2>

        {aucunFait ? (
          /* ⚠️ UN ÉTAT VIDE QUI SE NOMME. Sans lui, une grille de tirets ressemble à une
             page cassée — or « aucun CV validé » est une situation normale et réparable,
             et la phrase dit comment la réparer. */
          <p className="profil__vide">
            Aucun CV n’a encore été validé. La note utilise le barème par défaut du code —
            elle fonctionne, mais elle ne sait rien de ton parcours. Dépose un CV ci-dessous.
          </p>
        ) : (
          <>
            <div className="profil__cles">
              <div className="profil__cle">
                <span className="profil__cle-valeur">
                  {/* « — » plutôt qu'un zéro plausible : non établi n'est pas débutant. */}
                  {profil.faits.anneesExperience === null
                    ? "—"
                    : profil.faits.anneesExperience}
                </span>
                <span className="profil__cle-nom">
                  {profil.faits.anneesExperience === null ? "expérience" : "ans d’expérience"}
                </span>
              </div>
              <div className="profil__cle">
                <span className="profil__cle-valeur">{profil.faits.titresOccupes.length}</span>
                <span className="profil__cle-nom">postes occupés</span>
              </div>
              <div className="profil__cle">
                <span className="profil__cle-valeur">{profil.faits.outils.length}</span>
                <span className="profil__cle-nom">outils et méthodes</span>
              </div>
              <div className="profil__cle">
                <span className="profil__cle-valeur">{profil.faits.diplomes.length}</span>
                <span className="profil__cle-nom">diplômes</span>
              </div>
            </div>

            <ListeEtiquettes titre="Postes occupés" valeurs={profil.faits.titresOccupes} />
            <ListeEtiquettes titre="Outils et méthodes" valeurs={profil.faits.outils} />
            <ListeEtiquettes titre="Diplômes" valeurs={profil.faits.diplomes} />
            <ListeEtiquettes titre="Langues" valeurs={profil.faits.langues} />
          </>
        )}
      </section>

      <section className="carte-info">
        <h2>Ce que ça change dans tes notes</h2>
        {/* ⚠️ LA SECTION QUI REND LA PAGE UTILE. Afficher des faits sans dire ce qu'ils
            font est décoratif : le lien entre « voilà ton parcours » et « voilà pourquoi
            cette offre est à 68 » est exactement ce qu'on vient chercher ici. */}
        <p className="profil__aide">
          Une offre part de 100 points, répartis ainsi. Les mots ci-dessous sont ceux que le
          barème cherche dans un titre et une description.
        </p>

        <div className="profil__poids">
          {(
            [
              ["Rôle", profil.ponderation.fitRole],
              ["Distance", profil.ponderation.distance],
              ["Expérience exigée", profil.ponderation.seniorite],
              ["Salaire", profil.ponderation.salaire],
              ["Statut migratoire", profil.ponderation.immigration],
            ] as const
          ).map(([nom, pts]) => (
            <div key={nom} className="profil__poids-ligne">
              <span className="profil__poids-nom">{nom}</span>
              <span className="profil__poids-barre" aria-hidden="true">
                <span className="profil__poids-part" style={{ width: `${pts}%` }} />
              </span>
              <span className="profil__poids-pts">{pts}</span>
            </div>
          ))}
        </div>

        <ListeEtiquettes titre="Mots de coordination" valeurs={profil.motsCoordination} />
        <ListeEtiquettes titre="Mots techniques" valeurs={profil.motsTechnique} />

        <dl className="profil__faits">
          <div>
            <dt>Rayon de recherche</dt>
            <dd>{profil.rayonMaxKm} km</dd>
          </div>
          <div>
            <dt>Cherché chaque matin</dt>
            <dd>{profil.recherches.join(" · ") || "—"}</dd>
          </div>
        </dl>

        <p className="profil__origine">
          {profil.origine === "defaut"
            ? "Barème par défaut du code"
            : profil.origine === "cv"
              ? "Établi depuis un CV validé"
              : "Saisie manuelle"}{" "}
          · version {profil.version} · établi le {profil.etabliLe}
        </p>
      </section>

      <section className="carte-info">
        <h2>Téléverser un CV</h2>
        <TeleversementCv />
      </section>

      {prop && aRelire ? (
        <section className="carte-info">
          <h2>À valider</h2>
          {prop.ok ? (
            <RevueProfil cvId={aRelire.id} ecarts={ecarts} nomFichier={prop.nomFichier} />
          ) : (
            <p className="revue__retour revue__retour--echec">
              {prop.raison} Relance l’analyse de ce CV pour en obtenir une nouvelle.
            </p>
          )}
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
