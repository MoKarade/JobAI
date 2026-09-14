// app/archives/page.tsx — ce qui est fermé, et ce que ça apprend du marché.
//
// Deux demandes de Marc du 2026-09-14 tombent au même endroit, et c'est ce qui justifie une
// page plutôt que deux : « archive celles plus actives » (la liste) et « une historique pour
// estimer genre combien de temps une offre reste en ligne » (les statistiques). La seconde
// se calcule sur la première — les séparer aurait donné deux écrans dont l'un explique
// l'autre, et une entrée de navigation de plus pour rien.
//
// Les statistiques sont EN PREMIER, la liste dessous : l'agrégat est ce qu'on vient chercher
// (« ça bouge à quelle vitesse ? »), la liste est la preuve qu'on peut vérifier.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cadre } from "@/components/Cadre";
import { DureeVieVue } from "@/components/DureeVieVue";
import { ListeArchives } from "@/components/ListeArchives";
import { lireOffres } from "@/lib/donnees";
import { lireMetiers } from "@/lib/actionsMetiers";
import { lireEtat } from "@/lib/etat";
import { CLE_JOURNAL } from "@/lib/veilleComplete";
import type { JournalVeille } from "@/lib/veille";
import { observer, rapportDureeVie, type Observation } from "@/lib/dureeVie";
import { classerPanne, type Panne } from "@/lib/panne";
import type { Offre } from "@/lib/types";

export const metadata = { title: "Archives — JobAI" };
export const dynamic = "force-dynamic";

export default async function Archives() {
  // Session revérifiée ici même si le middleware garde la route : défense en profondeur,
  // comme sur l'accueil et la veille. Si le matcher change un jour, cette page — qui montre
  // le suivi complet de Marc — ne s'ouvre pas en silence.
  const session = await auth();
  if (!session) redirect("/connexion");

  let offres: Offre[] | null = null;
  let journal: JournalVeille = {};
  let metiers: string[] = [];
  let panne: Panne | null = null;

  try {
    [offres, journal, metiers] = await Promise.all([
      lireOffres(),
      lireEtat<JournalVeille>(CLE_JOURNAL, {}),
      lireMetiers(),
    ]);
  } catch (err) {
    console.error("[archives] lecture impossible", err);
    // La classification vit dans `lib/panne.ts`, partagée avec l'accueil et la carte :
    // écrite deux fois à la main, elle a déjà divergé une fois, et l'écran s'est mis à
    // envoyer chercher une connexion là où il manquait une migration.
    panne = classerPanne(err);
  }

  if (panne !== null || offres === null) {
    return (
      <Cadre actif="/archives" titre="Archives">
        <div className="etat">
          <h2>
            {panne === "schema-absent"
              ? "Tables absentes de la base"
              : "Suivi illisible pour le moment"}
          </h2>
          <p>
            {panne === "schema-absent"
              ? "La base répond, mais son schéma n’a pas encore été appliqué."
              : "La lecture du suivi a échoué. Le détail est dans les journaux du serveur."}
          </p>
        </div>
      </Cadre>
    );
  }

  const rapport = rapportDureeVie(offres, journal, metiers);

  // Les observations indexées, pour que chaque ligne d'archive porte sa durée sans
  // recalculer quoi que ce soit — deux calculs de la même grandeur finissent par diverger.
  const { observations } = observer(offres, journal, metiers);
  const parId = new Map<string, Observation>(observations.map((o) => [o.id, o]));

  // Les plus récemment fermées d'abord : c'est l'ordre dans lequel on se demande « celle-là,
  // elle a tenu combien de temps ? ». Un tri explicite, jamais l'ordre de la base.
  const fermees = offres
    .filter((o) => o.perimeeLe !== null && !o.histo)
    .sort((a, b) => (b.perimeeLe ?? "").localeCompare(a.perimeeLe ?? ""));

  return (
    <Cadre actif="/archives" titre="Archives">
      <DureeVieVue rapport={rapport} />

      <section className="cadre-section" aria-labelledby="archives-titre">
        <h2 id="archives-titre" className="cadre-section__titre">
          Offres fermées
        </h2>
        <p className="controles__compte">
          {fermees.length} archivée{fermees.length > 1 ? "s" : ""}
        </p>
        <ListeArchives offres={fermees} observations={parId} />
      </section>
    </Cadre>
  );
}
