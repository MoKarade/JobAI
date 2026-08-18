// app/sources/page.tsx — d'où viennent les offres, et ce que la dernière passe a fait.
//
// POURQUOI CETTE PAGE EXISTE
// La trace de chaque passe disait « sources=1 » sans que rien, à l'écran, ne dise LESQUELLES
// ni pourquoi. Un chiffre qu'on ne peut pas expliquer depuis l'app n'est pas un diagnostic,
// c'est une énigme.
//
// ⚠️ LA DÉCOUVERTE DE PAGES CARRIÈRES A ÉTÉ RETIRÉE LE 2026-08-18 (décision Marc, « ça ne
// marche pas »). Elle a tourné trois semaines pour inscrire DEUX employeurs, dont un
// (Dexterra) qui rendait cent offres pancanadiennes toutes refusées hors région : du bruit
// qui coûtait un budget de passe et salissait le compte rendu. Ce qui reste est ce qui
// nourrit vraiment le suivi — le dépôt — et la page le dit sans détour.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cadre } from "@/components/Cadre";
import { RECHERCHES_GUICHET } from "@/lib/ingest/sources";
import { BoutonVeille } from "@/components/BoutonVeille";

export const metadata = { title: "Sources — JobAI" };
export const dynamic = "force-dynamic";

export default async function Sources() {
  // Session revérifiée ici même si le middleware garde la route : défense en profondeur,
  // comme sur l'accueil et les références. Si le matcher change un jour, cette page ne
  // s'ouvre pas en silence — et elle porte un bouton qui écrit en base.
  const session = await auth();
  if (!session) redirect("/connexion");

  return (
    <Cadre actif="/sources" titre="Sources">
      <p className="intro-section">
        Les offres entrent par ces canaux, et seulement par ceux-là. Un canal muet est dit
        muet : rien n’est comblé par une estimation.
      </p>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Ce qui alimente la veille</h2>
        <ul className="sources__liste">
          <li className="sources__canal">
            <span className="sources__nom">Dépôt quotidien</span>
            <span className="sources__etat sources__etat--actif">actif</span>
            <span className="sources__note">
              Le lot d’offres qu’une Routine dépose chaque jour, récolté sur Indeed et
              ZipRecruiter. C’est le seul canal vivant — et c’est voulu : ces deux services
              n’ont pas d’API publique, et l’app n’a pas le droit de les moissonner.
            </span>
          </li>
          <li className="sources__canal">
            <span className="sources__nom">Guichet-Emplois</span>
            <span className="sources__etat">désactivé</span>
            <span className="sources__note">
              {RECHERCHES_GUICHET.length === 0
                ? "Son flux RSS répond 404 sur toutes les adresses testées, et l’hôte est refusé par la politique réseau. Le laisser tourner ferait des requêtes vouées à l’échec chaque matin, et on prendrait l’habitude de voir des sources en erreur."
                : `${RECHERCHES_GUICHET.length} recherche(s) interrogée(s) chaque passe.`}
            </span>
          </li>
          <li className="sources__canal">
            <span className="sources__nom">Pages carrières</span>
            <span className="sources__etat">retiré</span>
            <span className="sources__note">
              Retiré le 18 août. Trois semaines de recherche automatique pour deux
              employeurs inscrits, dont un qui ne rendait que des postes hors région.
            </span>
          </li>
        </ul>
      </section>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Passer la veille</h2>
        <BoutonVeille />
      </section>
    </Cadre>
  );
}
