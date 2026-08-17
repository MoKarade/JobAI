// app/sources/page.tsx — d'où viennent les offres, et comment en ajouter.
//
// POURQUOI CETTE PAGE EXISTE
// La trace de chaque passe disait « sources=1 » sans que rien, à l'écran, ne dise LESQUELLES
// ni pourquoi. Il fallait lire les journaux Vercel et le code pour savoir que le
// Guichet-Emplois est désactivé (son flux répond 404) et que la liste des pages carrières
// était vide faute de quelque chose pour la remplir. Un chiffre qu'on ne peut pas expliquer
// depuis l'app n'est pas un diagnostic, c'est une énigme.
//
// Elle porte aussi le bouton qui lance la recherche de pages carrières (demande de Marc,
// 2026-08-17) : sans lui, remplir cette liste demandait d'attendre quinze passes
// quotidiennes, soit quinze jours.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cadre } from "@/components/Cadre";
import { DecouverteAts } from "@/components/DecouverteAts";
import { etatDecouverte } from "@/lib/decouverte";
import { aujourdhui } from "@/lib/ajout";
import { RECHERCHES_GUICHET, RECHERCHES_GUICHET_CANDIDATES } from "@/lib/ingest/sources";
import { SondeGuichet } from "@/components/SondeGuichet";
import { BoutonVeille } from "@/components/BoutonVeille";
import { classerPanne, type Panne } from "@/lib/panne";

export const metadata = { title: "Sources — JobAI" };
export const dynamic = "force-dynamic";

export default async function Sources() {
  // Session revérifiée ici même si le middleware garde la route : défense en profondeur,
  // comme sur l'accueil et les références. Si le matcher change un jour, cette page ne
  // s'ouvre pas en silence — et elle porte un bouton qui écrit en base.
  const session = await auth();
  if (!session) redirect("/connexion");

  let etat: Awaited<ReturnType<typeof etatDecouverte>> | null = null;
  let panne: Panne | null = null;
  try {
    etat = await etatDecouverte(aujourdhui(new Date()));
  } catch (err) {
    // La classification vit dans `lib/panne.ts`, jamais réécrite ici : une page qui compare
    // les codes Postgres dans son coin finit par dire « la base n'a pas répondu » quand il
    // manque une table — c'est l'incident de la page Carte.
    panne = classerPanne(err);
  }

  if (panne !== null || etat === null) {
    return (
      <Cadre actif="/sources" titre="Sources">
        <div className="etat">
          <h2>
            {panne === "schema-absent" ? "Tables absentes" : "Base injoignable"}
          </h2>
          <p>
            {panne === "schema-absent"
              ? "La base répond, mais son schéma n’est pas encore appliqué. Ce n’est pas une panne."
              : "La base n’a pas répondu. Les canaux ci-dessous ne peuvent pas être lus pour l’instant."}
          </p>
          {panne === "schema-absent" ? (
            <p className="etat__aide">
              Depuis le dépôt, sur ton poste : <code>npm run db:migrate</code>.
            </p>
          ) : null}
        </div>
      </Cadre>
    );
  }

  return (
    <Cadre actif="/sources" titre="Sources">
      <p className="intro-section">
        Les offres entrent par ces canaux, et seulement par ceux-là. Un canal
        muet est dit muet : rien n’est comblé par une estimation.
      </p>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">
          Ce qui alimente la veille aujourd’hui
        </h2>
        <ul className="sources__liste">
          <li className="sources__canal">
            <span className="sources__nom">Dépôt de la Routine</span>
            <span className="sources__etat sources__etat--actif">actif</span>
            <span className="sources__note">
              Le lot d’offres qu’une Routine dépose chaque jour. C’est le seul
              canal vivant pour l’instant — d’où le « sources=1 » des journaux.
            </span>
          </li>
          <li className="sources__canal">
            <span className="sources__nom">Guichet-Emplois</span>
            <span className="sources__etat">désactivé</span>
            <span className="sources__note">
              {RECHERCHES_GUICHET.length === 0
                ? "Son flux RSS répond 404 sur toutes les adresses testées. Le laisser tourner ferait des requêtes vouées à l’échec chaque matin, et on prendrait l’habitude de voir des sources en erreur."
                : `${RECHERCHES_GUICHET.length} recherche(s) interrogée(s) chaque passe.`}
            </span>
          </li>
          <li className="sources__canal">
            <span className="sources__nom">Pages carrières</span>
            <span
              className={
                etat.inscrites.length > 0
                  ? "sources__etat sources__etat--actif"
                  : "sources__etat"
              }
            >
              {etat.inscrites.length > 0
                ? `${etat.inscrites.length} trouvée(s)`
                : "aucune"}
            </span>
            <span className="sources__note">
              Les employeurs qui publient leurs postes sur un service de
              recrutement public. Chacun devient une source interrogée à chaque
              passe.
            </span>
          </li>
        </ul>

        {etat.inscrites.length > 0 ? (
          <ul className="sources__inscrites">
            {etat.inscrites.map((a) => (
              <li key={`${a.entreprise}|${a.famille}`}>
                <strong>{a.entreprise}</strong> — {a.famille}{" "}
                <code>{a.jeton}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Lancer la veille</h2>
        <BoutonVeille />
      </section>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Sonder le Guichet-Emplois</h2>
        <p className="intro-section">
          Quelle adresse répond vraiment ? La question a reçu trois réponses le 17 août,
          aucune mesurée — chacune lue dans un titre de résultat de recherche. Cette sonde la
          pose depuis la production, en lecture seule : rien n’est ingéré, rien n’est écrit.
          Elle rapporte pour chaque adresse le code, l’URL réellement servie et un aperçu du
          contenu.
        </p>
        <SondeGuichet terme={RECHERCHES_GUICHET_CANDIDATES[0] ?? "automatisation"} />
      </section>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Chercher des pages carrières</h2>
        <DecouverteAts
          faitesInitial={etat.faites}
          totalInitial={etat.total}
          resteInitial={etat.aTenter > 0}
        />
      </section>

      {etat.essais.length > 0 ? (
        <section className="cadre-section">
          <h2 className="cadre-section__titre">Ce qui a déjà été essayé</h2>
          <p className="intro-section">
            Chaque essai garde son motif : « écartée » sans raison ne se vérifie
            pas, et trois causes différentes appellent trois corrections
            différentes.
          </p>
          <ul className="sources__essais">
            {etat.essais.map((e) => (
              <li
                key={`${e.entreprise}|${e.famille}`}
                className="sources__essai"
              >
                <span className="sources__entreprise">{e.entreprise}</span>
                <span className="sources__famille">{e.famille}</span>
                <span className="sources__verdict">
                  {e.verdict === "refute"
                    ? "écartée"
                    : e.verdict === "indecis"
                      ? "sans réponse exploitable"
                      : "pas de page à cette adresse"}
                  {e.raison ? ` — ${e.raison}` : ""}
                </span>
                <span className="sources__date">{e.le}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Cadre>
  );
}
