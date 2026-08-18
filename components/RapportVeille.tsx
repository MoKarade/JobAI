// components/RapportVeille.tsx — ce que la dernière passe a fait, à l'écran.
//
// ⚠️ IL EST DÉLIBÉRÉMENT SANS ÉTAT ET SANS `"use client"`. Il reçoit un rapport et le rend,
// point. C'est ce qui lui permet d'être affiché à DEUX endroits sans se dédoubler : sous le
// bouton, avec le rapport que la passe vient de rendre, et en haut de `/sources`, avec le
// dernier rapport relu de la base. Deux composants auraient divergé au premier ajout de
// champ, et c'est toujours celui qu'on relit le moins qui garde la version fausse.
//
// CE QU'IL NE FAIT PAS : lire l'horloge. `maintenant` est un paramètre — sans quoi le rendu
// serveur et le rendu client différeraient d'une seconde et React signalerait une erreur
// d'hydratation à chaque affichage.

import { LIBELLE_MOTIF, depuis, fraicheurDepot, type RapportVeille } from "@/lib/rapportVeille";

/** Nombre de villes nommées par motif avant de dire « et N autres ». */
const MAX_VILLES = 8;

function Chiffre({
  valeur,
  libelle,
  ton,
}: {
  valeur: string | number;
  libelle: string;
  ton?: "bon" | "neutre" | "alerte";
}) {
  return (
    <div className={`rapport__chiffre${ton ? ` rapport__chiffre--${ton}` : ""}`}>
      <span className="rapport__valeur">{valeur}</span>
      <span className="rapport__libelle">{libelle}</span>
    </div>
  );
}

export function RapportVeilleVue({
  rapport,
  maintenant,
  titre = "Dernière passe",
}: {
  rapport: RapportVeille;
  maintenant: number;
  titre?: string;
}) {
  const quand = depuis(rapport.fini, maintenant);
  const muettes = rapport.sources.filter((s) => !s.ok);
  // Le déclencheur en clair : « le planificateur » et « toi » ne se lisent pas pareil quand
  // on cherche pourquoi un chiffre a bougé.
  const parQui = rapport.declencheur === "bouton-app" ? "lancée à la main" : "automatique";
  // ⚠️ AVANT LES CHIFFRES, PARCE QU'ELLE CHANGE LEUR SENS. « 0 nouvelle » sur un dépôt frais
  // est une observation du marché ; sur un dépôt qui rouille, c'est l'absence d'observation.
  const fraicheur = fraicheurDepot(rapport.depot);

  return (
    <section className="rapport" aria-label={titre}>
      <header className="rapport__entete">
        <h3 className="rapport__titre">{titre}</h3>
        <p className="rapport__meta">
          {rapport.jour} · {parQui}
          {quand ? ` · ${quand}` : ""}
        </p>
      </header>

      {fraicheur.etat !== "frais" ? (
        <p className={`rapport__fraicheur rapport__fraicheur--${fraicheur.etat}`} role="status">
          {fraicheur.texte}
        </p>
      ) : null}

      {/* Les quatre chiffres qui répondent à « alors ? ». Le reste est du détail. */}
      <div className="rapport__chiffres">
        <Chiffre valeur={rapport.nouvelles} libelle="nouvelle(s)" ton={rapport.nouvelles > 0 ? "bon" : "neutre"} />
        <Chiffre
          valeur={rapport.noteMoyenneNouvelles ?? "—"}
          libelle="note moyenne des nouvelles"
        />
        <Chiffre valeur={rapport.suivies} libelle="offres suivies" />
        <Chiffre valeur={rapport.noteMoyenneSuivi ?? "—"} libelle="note moyenne du suivi" />
      </div>

      {rapport.meilleure ? (
        <p className="rapport__meilleure">
          Meilleure du lot — <strong>{rapport.meilleure.entreprise}</strong>,{" "}
          {rapport.meilleure.poste} <span className="rapport__note">{rapport.meilleure.score}</span>
        </p>
      ) : null}

      <div className="rapport__flux">
        <span>
          <strong>{rapport.trouvees}</strong> trouvée(s) par les sources
        </span>
        <span>
          <strong>{rapport.nouvelles}</strong> retenue(s)
        </span>
        {rapport.perimees > 0 ? (
          <span>
            <strong>{rapport.perimees}</strong> périmée(s)
          </span>
        ) : null}
        {rapport.revenues > 0 ? (
          <span>
            <strong>{rapport.revenues}</strong> revenue(s)
          </span>
        ) : null}
        {rapport.enSursis > 0 ? (
          <span>
            <strong>{rapport.enSursis}</strong> en sursis
          </span>
        ) : null}
      </div>

      {rapport.refusees.length > 0 ? (
        <div className="rapport__refus">
          <h4 className="rapport__soustitre">Écartées, et pourquoi</h4>
          <ul className="rapport__motifs">
            {rapport.refusees.map((r) => (
              <li key={r.motif} className="rapport__motif">
                <span className="rapport__motif-n">{r.n}</span>
                <span className="rapport__motif-nom">{LIBELLE_MOTIF[r.motif]}</span>
                {r.villes.length > 0 ? (
                  <span className="rapport__villes">
                    {r.villes
                      .slice(0, MAX_VILLES)
                      .map((v) => `${v.ville} (${v.n})`)
                      .join(" · ")}
                    {r.villes.length > MAX_VILLES
                      ? ` · et ${r.villes.length - MAX_VILLES} autre(s)`
                      : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ⚠️ NE S'AFFICHE QUE S'IL N'EST PAS NUL, et c'est tout son intérêt : un reliquat
          non nul veut dire qu'un motif de rejet nous échappe encore. Le 17 août, ce sont
          74 offres qui s'évaporaient ainsi. */}
      {rapport.sansMotif !== 0 ? (
        <p className="rapport__alerte">
          {rapport.sansMotif} offre(s) SANS MOTIF — le compte ne tombe pas juste. Un rejet
          n’est pas nommé quelque part.
        </p>
      ) : null}

      <div className="rapport__detail">
        <h4 className="rapport__soustitre">Sources</h4>
        <ul className="rapport__sources">
          {rapport.sources.length === 0 ? (
            <li className="rapport__source">aucune source interrogée</li>
          ) : (
            rapport.sources.map((s) => (
              <li
                key={s.id}
                className={`rapport__source${s.ok ? "" : " rapport__source--muette"}`}
              >
                <span className="rapport__source-nom">{s.id}</span>
                <span className="rapport__source-n">{s.ok ? s.offres : "en échec"}</span>
              </li>
            ))
          )}
        </ul>
        {muettes.length > 0 ? (
          <p className="rapport__alerte">
            {muettes.map((s) => `${s.id} : ${s.erreur ?? "raison non dite"}`).join(" — ")}
          </p>
        ) : null}
      </div>

      <div className="rapport__detail">
        <h4 className="rapport__soustitre">Localisation</h4>
        <p className="rapport__ligne">{rapport.localisation}</p>
        <p className="rapport__ligne rapport__ligne--douce">
          {rapport.lieux.demandes > 0
            ? `${rapport.lieux.demandes} lieu(x) inconnu(s) mesuré(s) — ${rapport.lieux.juges} tranché(s), ${rapport.lieux.introuvables} introuvable(s), retentés plus tard.`
            : "Aucun lieu inconnu à mesurer : tous les noms de cette passe étaient déjà tranchés."}
          {rapport.villesCompletees > 0
            ? ` ${rapport.villesCompletees} ville(s) rattrapée(s) sur des offres déjà suivies.`
            : ""}
          {rapport.adressesAnnoncees > 0
            ? ` ${rapport.adressesAnnoncees} adresse(s) reprise(s) du texte des annonces.`
            : ""}
        </p>
      </div>
    </section>
  );
}
