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
import { AppliquerBareme } from "@/components/AppliquerBareme";
import { ReanalyseCv } from "@/components/ReanalyseCv";
import { TeleversementCv } from "@/components/TeleversementCv";
import { listerCvs, profilActif, propositionDe } from "@/lib/cv/depot";
import { apercuNouveauBareme, type ApercuBareme, type ExempleApercu } from "@/lib/apercuBareme";
import { lireOffres } from "@/lib/donnees";
import { lireMetiers } from "@/lib/actionsMetiers";
import { aujourdhui } from "@/lib/ajout";
import { calculerEcarts } from "@/lib/cv/proposition";
import { PROFIL_DEFAUT } from "@/lib/profil";
import { dateLisible } from "@/lib/dateLisible";

export const metadata = { title: "Profil — JobAI" };

// L'aperçu lit tout le suivi et note chaque offre deux fois (ADR-0032) : même borne que l'accueil.
export const maxDuration = 60;

/** Un poids de fichier lisible. « 214 ko » se compare, « 219136 » se déchiffre. */
function poids(octets: number): string {
  return octets < 1024 * 1024
    ? `${Math.round(octets / 1024)} ko`
    : `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

function dateCourte(iso: string): string {
  return dateLisible(iso.slice(0, 10));
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

/** Un écart signé, avec le vrai signe moins. */
function signe(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

function LigneExemple({ e }: { e: ExempleApercu }) {
  return (
    <li>
      <strong>{e.entreprise}</strong> — {e.poste} : de {e.avant} à {e.apres} ({signe(e.ecart)})
      {e.salaireAnnuel !== null ? ` · salaire lu ${e.salaireAnnuel.toLocaleString("fr-CA")} $/an` : ""}
    </li>
  );
}

/**
 * Ce que le nouveau barème ferait aux notes, avant que Marc l'applique (ADR-0032).
 *
 * ⚠️ UNE LECTURE : rien n'est écrit tant que le bouton n'est pas pressé. `avant` est la note
 * enregistrée — celle qu'il voit aujourd'hui —, pas un recalcul.
 *
 * ⚠️ UNE SEULE `<section>` ET `AppliquerBareme` À LA MÊME PLACE dans les deux états : l'action
 * revalide la page, qui passe de « aperçu » à « appliqué ». Un composant démonté à ce moment
 * perdrait son message de résultat. Le bouton reste tant qu'il y a quelque chose à faire — y
 * compris des notes qui ne suivent pas un barème déjà écrit, après une coupure en cours de route.
 */
function SectionNouveauBareme({ apercu, sansCv, plafond }: { apercu: ApercuBareme; sansCv: boolean; plafond: number }) {
  const p = apercu.poids;
  const d = apercu.distribution;
  const m = apercu.mouvement;
  const enRetard = m.montent + m.baissent;
  const reste = !apercu.dejaApplique || enRetard > 0;
  return (
    <section className="carte-info">
      <h2>{apercu.dejaApplique ? "Nouveau barème" : "Nouveau barème : le salaire en premier"}</h2>
      {apercu.dejaApplique ? (
        <p className="profil__aide">
          Appliqué : le salaire pèse {p.avant.salaire} points sur 100 et entre dans la note quand
          l’offre l’affiche. Version {apercu.versionActuelle} du profil.
          {enRetard > 0
            ? ` ${enRetard} note${enRetard > 1 ? "s ne suivent" : " ne suit"} pas encore ce barème : relance l’application.`
            : ""}
        </p>
      ) : (
        <>
          <p className="profil__aide">
            Aperçu, rien n’est modifié. Salaire : de {p.avant.salaire} à {p.apres.salaire} points ;
            rôle : de {p.avant.fitRole} à {p.apres.fitRole} ; expérience exigée : de{" "}
            {p.avant.seniorite} à {p.apres.seniorite} ; statut migratoire : de {p.avant.immigration}{" "}
            à {p.apres.immigration}. Tes notes manuelles ({apercu.population.manuellesPreservees})
            ne bougent jamais.
          </p>
          <dl className="profil__faits">
            <div>
              <dt>Notes calculées mesurées (offres ouvertes)</dt>
              <dd>
                {apercu.population.calculees}, dont {apercu.population.avecSalaireAnnuel} avec un
                salaire lu. {apercu.population.autresRenotees} offres historiques ou périmées seront
                aussi recalculées, sans figurer dans les chiffres ci-dessous.
              </dd>
            </div>
            <div>
              <dt>Note moyenne</dt>
              <dd>
                De {d.avant.moyenne ?? "—"} à {d.apres.moyenne ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Offres arrêtées au plafond de {plafond}, avant puis après</dt>
              <dd>
                {apercu.auPlafond.avant}, puis {apercu.auPlafond.apres}
              </dd>
            </div>
            <div>
              <dt>Offres par palier, avant</dt>
              <dd>
                A {apercu.paliers.avant.A}, B {apercu.paliers.avant.B}, C {apercu.paliers.avant.C}
              </dd>
            </div>
            <div>
              <dt>Offres par palier, après</dt>
              <dd>
                A {apercu.paliers.apres.A}, B {apercu.paliers.apres.B}, C {apercu.paliers.apres.C}
              </dd>
            </div>
            <div>
              <dt>Notes qui montent, baissent, ne bougent pas</dt>
              <dd>
                {m.montent}, {m.baissent}, {m.inchangees}
              </dd>
            </div>
          </dl>
          {apercu.exemples.montent.length > 0 ? (
            <div className="profil__groupe">
              <h3 className="profil__groupe-titre">Offres dont la note monte</h3>
              <ul>
                {apercu.exemples.montent.map((e) => (
                  <LigneExemple key={e.id} e={e} />
                ))}
              </ul>
            </div>
          ) : null}
          {apercu.exemples.descendent.length > 0 ? (
            <div className="profil__groupe">
              <h3 className="profil__groupe-titre">Offres dont la note baisse</h3>
              <ul>
                {apercu.exemples.descendent.map((e) => (
                  <LigneExemple key={e.id} e={e} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      {sansCv && !apercu.dejaApplique ? (
        <p className="profil__aide">
          Pour appliquer ce barème, valide d’abord un CV : sans CV actif, le barème en vigueur est
          celui du code et il n’y a pas de profil à réécrire.
        </p>
      ) : null}
      <AppliquerBareme
        reste={reste && !sansCv}
        libelle={apercu.dejaApplique ? "Relancer l’application" : "Appliquer le nouveau barème"}
      />
    </section>
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
    // Le détail reste dans les journaux du serveur ; l'écran n'affiche qu'une phrase simple.
    console.error("[profil] profil enregistré illisible :", erreurProfil);
  }

  // L'aperçu du nouveau barème (ADR-0032). Absent, il se dit par son absence : une panne de lecture
  // ne doit pas faire croire qu'il n'y a rien à appliquer — et ne doit pas casser la page.
  let apercu: ApercuBareme | null = null;
  let apercuIndisponible = erreurProfil !== null;
  if (erreurProfil === null) {
    try {
      const [offres, metiers] = await Promise.all([lireOffres(), lireMetiers()]);
      if (offres === null) apercuIndisponible = true;
      else apercu = apercuNouveauBareme(offres, profil, metiers, aujourdhui(new Date()));
    } catch (e) {
      console.error("[profil] aperçu du nouveau barème impossible :", e);
      apercuIndisponible = true;
    }
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
          Le profil enregistré est illisible pour le moment. Les notes continuent d’utiliser
          le barème par défaut.
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

      {apercu ? <SectionNouveauBareme apercu={apercu} sansCv={profil.origine === "defaut"} plafond={profil.plafondNoteCalculee} /> : null}
      {apercuIndisponible ? (
        <section className="carte-info">
          <h2>Nouveau barème</h2>
          <p className="revue__retour revue__retour--echec" role="alert">
            Aperçu indisponible : les offres, les métiers ou le profil n’ont pas pu être lus. Recharge
            la page ; rien n’est appliqué tant que l’aperçu manque.
          </p>
        </section>
      ) : null}

      <section className="carte-info">
        <h2>Téléverser un CV</h2>
        <TeleversementCv />
      </section>

      {prop && aRelire ? (
        <section className="carte-info">
          <h2>À valider</h2>
          {prop.ok ? (
            <RevueProfil
              key={aRelire.id}
              cvId={aRelire.id}
              ecarts={ecarts}
              nomFichier={prop.nomFichier}
            />
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
                {/* ⚠️ ET LE GESTE QUI VA AVEC LA RAISON. Dire « la clé API est absente » sans
                    offrir de relancer laissait un seul chemin : re-déposer le fichier —
                    exactement ce que le commentaire ci-dessus voulait éviter. Le bouton
                    n'apparaît que là où il SERT : une extraction ratée, ou un CV qui n'a
                    rien à valider. Le proposer sur un CV déjà analysé coûterait un appel au
                    modèle pour rien. */}
                {c.erreurExtraction !== null || !c.aUneProposition ? (
                  <ReanalyseCv id={c.id} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Cadre>
  );
}
