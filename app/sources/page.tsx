// app/sources/page.tsx — un bouton, ce que la passe a donné, et l'historique.
//
// ⚠️ CETTE PAGE A ÉTÉ VIDÉE LE 2026-08-20, ET C'EST LA DEMANDE (Marc : « rends l'onglet
// source beaucoup plus simple, un seul bouton […] et c'est tout, les filtres seront dans
// accueil »).
//
// Ce qui a été RETIRÉ, et pourquoi ce n'est pas une perte : le réglage du rayon (fixé à
// 300 km, la valeur demandée), la sélection des métiers (un défaut MESURÉ la rend inutile
// à régler), et l'inventaire des sources (il décrivait la mécanique, pas le résultat). Une
// page de réglages oblige à décider avant de pouvoir s'en servir ; c'est exactement ce qui
// était « trop compliqué ».
//
// Ce qui RESTE est ce qu'on vient consulter : est-ce que ça a tourné, qu'est-ce que ça a
// donné, et est-ce que ça se dégrade.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cadre } from "@/components/Cadre";
import { BoutonVeille } from "@/components/BoutonVeille";
import { RapportVeilleVue } from "@/components/RapportVeille";
import { HistoriqueVeilleVue } from "@/components/HistoriqueVeille";
import { lireEtat } from "@/lib/etat";
import { CLE_RAPPORT, type RapportVeille } from "@/lib/rapportVeille";
import { CLE_HISTORIQUE, lireHistorique, type EntreeHistorique } from "@/lib/historiqueVeille";
import { RAYON_DEFAUT_KM } from "@/lib/rayon";
import { classerPanne } from "@/lib/panne";

export const metadata = { title: "Veille — JobAI" };
export const dynamic = "force-dynamic";

export default async function Sources() {
  // Session revérifiée ici même si le middleware garde la route : défense en profondeur,
  // comme sur l'accueil. Si le matcher change un jour, cette page ne s'ouvre pas en
  // silence — et elle porte un bouton qui écrit en base.
  const session = await auth();
  if (!session) redirect("/connexion");

  let dernier: RapportVeille | null = null;
  let historique: EntreeHistorique[] = [];
  try {
    const [r, h] = await Promise.all([
      lireEtat<RapportVeille | null>(CLE_RAPPORT, null),
      lireEtat<unknown>(CLE_HISTORIQUE, []),
    ]);
    dernier = r;
    historique = lireHistorique(h);
  } catch (err) {
    // Une base injoignable n'est pas une page cassée : on le dit et on rend le bouton, qui
    // est ce pour quoi on vient.
    console.error("[veille] état illisible :", classerPanne(err));
  }

  // Instant figé côté SERVEUR et passé au composant : lu dans le composant, le rendu serveur
  // et le rendu client différeraient d'une seconde et React signalerait une erreur
  // d'hydratation à chaque affichage.
  const maintenant = Date.now();

  return (
    <Cadre actif="/sources" titre="Veille">
      <section className="cadre-section">
        <BoutonVeille />
        <p className="veille__auto">
          Elle cherche jusqu’à {RAYON_DEFAUT_KM} km autour de chez toi, et tourne toute seule
          chaque matin avant 8 h. Ce bouton sert à ne pas attendre.
        </p>
      </section>

      {dernier !== null ? (
        <RapportVeilleVue rapport={dernier} maintenant={maintenant} />
      ) : (
        <section className="cadre-section">
          <h2 className="cadre-section__titre">Dernière passe</h2>
          <p className="vide">
            Aucune passe n’a encore rendu de compte. Le premier apparaîtra ici après la
            prochaine veille — automatique ou lancée d’ici.
          </p>
        </section>
      )}

      <section className="cadre-section">
        <h2 className="cadre-section__titre">Historique</h2>
        <HistoriqueVeilleVue entrees={historique} />
      </section>
    </Cadre>
  );
}
