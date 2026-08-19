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
import { RapportVeilleVue } from "@/components/RapportVeille";
import { ReglageRayon } from "@/components/ReglageRayon";
import { ReglageMetiers } from "@/components/ReglageMetiers";
import { lireEtat } from "@/lib/etat";
import { CLE_RAPPORT, type RapportVeille } from "@/lib/rapportVeille";
import { CLE_RAYON, RAYON_DEFAUT_KM } from "@/lib/rayon";
import { CLE_METIERS, METIERS_DEFAUT, normaliserMetiers } from "@/lib/metiersRetenus";
import { classerPanne } from "@/lib/panne";

export const metadata = { title: "Sources — JobAI" };
export const dynamic = "force-dynamic";

export default async function Sources() {
  // Session revérifiée ici même si le middleware garde la route : défense en profondeur,
  // comme sur l'accueil et les références. Si le matcher change un jour, cette page ne
  // s'ouvre pas en silence — et elle porte un bouton qui écrit en base.
  const session = await auth();
  if (!session) redirect("/connexion");

  // Le dernier rapport, quel qu'ait été son déclencheur. C'est LE point de la page : la
  // veille tourne surtout toute seule, et jusqu'ici son travail n'existait que dans les
  // journaux Vercel. Une base injoignable n'est pas une page cassée — on le dit et on rend
  // le reste, qui est statique.
  let dernier: RapportVeille | null = null;
  let rayon = RAYON_DEFAUT_KM;
  let metiers: string[] = [...METIERS_DEFAUT];
  try {
    let metiersBruts: string[];
    [dernier, rayon, metiersBruts] = await Promise.all([
      lireEtat<RapportVeille | null>(CLE_RAPPORT, null),
      lireEtat<number>(CLE_RAYON, RAYON_DEFAUT_KM),
      lireEtat<string[]>(CLE_METIERS, [...METIERS_DEFAUT]),
    ]);
    // Re-normalisé à la lecture, comme dans `lireMetiers` : l'état est du JSON écrit par une
    // version antérieure du code, et un code mal formé ne retient rien.
    metiers = Array.isArray(metiersBruts) ? normaliserMetiers(metiersBruts).codes : [];
  } catch (err) {
    console.error("[sources] état illisible :", classerPanne(err));
  }
  // Instant figé côté SERVEUR et passé au composant : lu dans le composant, le rendu
  // serveur et le rendu client différeraient d'une seconde et React signalerait une
  // erreur d'hydratation à chaque affichage.
  const maintenant = Date.now();

  return (
    <Cadre actif="/sources" titre="Sources">
      <p className="intro-section">
        Les offres entrent par ces canaux, et seulement par ceux-là. Un canal muet est dit
        muet : rien n’est comblé par une estimation.
      </p>

      {dernier !== null ? (
        <RapportVeilleVue rapport={dernier} maintenant={maintenant} />
      ) : (
        <p className="intro-section">
          Aucune passe n’a encore rendu de rapport. Le premier apparaîtra ici après la
          prochaine veille — automatique ou lancée d’ici.
        </p>
      )}

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
            <span className="sources__nom">Guichet-Emplois — RSS</span>
            <span className="sources__etat">désactivé</span>
            <span className="sources__note">
              {RECHERCHES_GUICHET.length === 0
                ? "Son flux RSS répond 404 sur toutes les adresses testées, et l’hôte est refusé par la politique réseau. Le laisser tourner ferait des requêtes vouées à l’échec chaque matin, et on prendrait l’habitude de voir des sources en erreur."
                : `${RECHERCHES_GUICHET.length} recherche(s) interrogée(s) chaque passe.`}
            </span>
          </li>
          <li className="sources__canal">
            <span className="sources__nom">Guichet-Emplois — flux complet</span>
            <span
              className={`sources__etat${metiers.length > 0 ? " sources__etat--actif" : ""}`}
            >
              {metiers.length > 0 ? "actif" : "éteint"}
            </span>
            <span className="sources__note">
              {metiers.length > 0
                ? `Le flux XML de tout le Canada, filtré sur ${metiers.length} code(s) de profession et sur la région. Réglable plus bas.`
                : "Le flux XML de tout le Canada. Il n’est pas interrogé tant qu’aucun métier n’est retenu : sans tri, il ferait entrer des milliers d’offres que personne n’a demandées. À régler plus bas."}
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
        <h2 className="cadre-section__titre">Rayon</h2>
        <ReglageRayon rayonInitial={rayon} />
      </section>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Métiers retenus dans le flux complet</h2>
        <ReglageMetiers metiersInitiaux={metiers} />
      </section>

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Passer la veille</h2>
        <BoutonVeille />
      </section>
    </Cadre>
  );
}
