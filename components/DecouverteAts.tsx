"use client";

// components/DecouverteAts.tsx — lancer la recherche de pages carrières, et la regarder avancer.
//
// POURQUOI UNE BOUCLE CÔTÉ NAVIGATEUR
// Cent quatre-vingts paires (entreprise × famille d'ATS) ne tiennent pas dans une fonction
// serverless de 60 s. Plutôt qu'un travail de fond qu'on ne pourrait ni suivre ni arrêter,
// l'onglet de Marc rappelle l'action lot par lot : chaque aller-retour reste court, la barre
// avance à chaque retour, et le bouton « Arrêter » a un effet IMMÉDIAT parce que la boucle
// est ici. Un `after()` aurait hérité de la durée de vie de la page sans rien afficher.
//
// LA PROGRESSION VIENT DU SERVEUR, PAS D'UN COMPTEUR LOCAL
// Chaque lot renvoie `faites / total` relus de l'état persisté. Fermer l'onglet et revenir
// reprend donc au bon endroit — un compteur accumulé côté navigateur serait reparti de zéro
// en affichant « 0 % » sur un balayage à moitié fait.

import { useState, useRef } from "react";
import { lancerDecouverte, type ResultatDecouverte } from "@/lib/actions";

type Ligne =
  | { genre: "trouvee"; entreprise: string; famille: string; jeton: string }
  | { genre: "ecartee"; entreprise: string; famille: string; verdict: string; raison?: string };

const MOT_VERDICT: Record<string, string> = {
  refute: "écartée",
  indecis: "sans réponse exploitable",
  absent: "pas de page à cette adresse",
};

export function DecouverteAts({
  faitesInitial,
  totalInitial,
  resteInitial,
}: {
  faitesInitial: number;
  totalInitial: number;
  resteInitial: boolean;
}) {
  const [faites, setFaites] = useState(faitesInitial);
  const [total, setTotal] = useState(totalInitial);
  const [reste, setReste] = useState(resteInitial);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [journal, setJournal] = useState<Ligne[]>([]);
  // Un ref, pas un state : la boucle doit lire la valeur COURANTE à chaque tour, et une
  // variable d'état capturée dans la fermeture resterait figée à sa valeur de départ.
  const arret = useRef(false);

  const pourcent = total > 0 ? Math.min(100, Math.round((faites / total) * 100)) : 0;

  function absorber(r: Extract<ResultatDecouverte, { ok: true }>) {
    setFaites(r.faites);
    setTotal(r.total);
    setReste(r.reste);
    setJournal((avant) => [
      ...r.trouvees.map(
        (t): Ligne => ({ genre: "trouvee", entreprise: t.entreprise, famille: t.famille, jeton: t.jeton }),
      ),
      ...r.ecartees.map(
        (e): Ligne => ({
          genre: "ecartee",
          entreprise: e.entreprise,
          famille: e.famille,
          verdict: e.verdict,
          ...(e.raison ? { raison: e.raison } : {}),
        }),
      ),
      ...avant,
    ]);
  }

  async function balayer() {
    arret.current = false;
    setEnCours(true);
    setMessage(null);

    let trouvees = 0;
    let lots = 0;

    try {
      // Tant qu'il reste du neuf ET que Marc n'a pas arrêté. Le serveur est seul juge du
      // « reste » : c'est lui qui relit l'état, le navigateur ne devine rien.
      for (;;) {
        const r = await lancerDecouverte();

        if (!r.ok) {
          setMessage(r.erreur);
          break;
        }

        absorber(r);
        trouvees += r.confirmees;
        lots += 1;

        if (!r.reste) {
          setMessage(
            trouvees > 0
              ? `Balayage terminé — ${trouvees} page${trouvees > 1 ? "s" : ""} carrières trouvée${trouvees > 1 ? "s" : ""}.`
              : "Balayage terminé. Aucune page carrières trouvée cette fois — le détail de chaque essai est ci-dessous.",
          );
          break;
        }

        if (arret.current) {
          setMessage(`Arrêté après ${lots} lot${lots > 1 ? "s" : ""}. La progression est gardée.`);
          break;
        }
      }
    } catch {
      // Un échec réseau du navigateur (onglet en veille, connexion perdue) n'est pas un
      // échec du balayage : ce qui a été écrit est écrit, et un nouveau clic reprend.
      setMessage("La liaison s'est interrompue. Ce qui a été fait est gardé — relance quand tu veux.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="decouverte">
      <div className="decouverte__barre">
        {/* `progress` natif : le lecteur d'écran annonce la valeur sans qu'on ait à
            bricoler un rôle ARIA, et il reste lisible si le CSS ne charge pas. */}
        <progress className="decouverte__jauge" value={faites} max={Math.max(total, 1)} />
        <span className="decouverte__chiffres">
          {faites} / {total} paires examinées ({pourcent} %)
        </span>
      </div>

      <div className="decouverte__commandes">
        {enCours ? (
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => {
              arret.current = true;
              setMessage("Arrêt demandé — le lot en cours se termine.");
            }}
          >
            Arrêter
          </button>
        ) : (
          <button
            type="button"
            className="bouton"
            disabled={!reste}
            onClick={() => void balayer()}
          >
            {reste ? "Lancer la recherche" : "Rien de nouveau à tenter"}
          </button>
        )}
      </div>

      {/* Toujours dans le DOM : une région live qui apparaît en même temps que son premier
          message n'est pas annoncée par les lecteurs d'écran. */}
      <p className="decouverte__message" role="status">
        {enCours ? `Recherche en cours — ${faites} / ${total} paires examinées.` : message}
      </p>

      {journal.length > 0 ? (
        <div className="decouverte__journal">
          <h3 className="decouverte__titre">Ce que cette session a vu</h3>
          <ul className="decouverte__lignes">
            {journal.map((l, i) => (
              <li
                key={`${l.entreprise}|${l.famille}|${i}`}
                className={
                  l.genre === "trouvee" ? "decouverte__ligne decouverte__ligne--trouvee" : "decouverte__ligne"
                }
              >
                <span className="decouverte__entreprise">{l.entreprise}</span>
                <span className="decouverte__famille">{l.famille}</span>
                {l.genre === "trouvee" ? (
                  <span className="decouverte__verdict">page carrières trouvée ({l.jeton})</span>
                ) : (
                  <span className="decouverte__verdict">
                    {MOT_VERDICT[l.verdict] ?? l.verdict}
                    {l.raison ? ` — ${l.raison}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="decouverte__note">
        La recherche devine l’adresse de la page carrières de chaque entreprise chez cinq
        services (Greenhouse, Lever, Recruitee, Workable, SmartRecruiters), puis vérifie que
        les postes publiés sont bien dans la région — un identifiant qui répond n’est pas un
        identifiant qui a raison. Rien n’est inscrit sans cette vérification. Les essais sont
        mémorisés : relancer demain ne repaie pas ce qui a déjà été tenté.
      </p>
    </div>
  );
}
