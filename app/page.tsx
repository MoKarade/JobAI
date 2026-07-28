// Page d'accueil provisoire. Elle dit honnêtement où en est l'app : le suivi n'est pas
// encore en ligne. Elle sera remplacée par le tracker au portage de l'interface [V1-06].

export default function Home() {
  return (
    <main className="shell">
      <div className="card">
        <p className="eyebrow">emploi.hubperso.com</p>
        <h1>JobAI</h1>
        <p className="lead">
          Suivi et analyse de recherche d’emploi dans la région de Québec : offres notées
          selon un barème pondéré par le profil, statuts de candidature, et assistance à la
          rédaction.
        </p>
        <p className="hint">
          L’app est en construction. L’endpoint <code>/api/hub/summary</code> est branché sur
          le hub et annonce l’état « en construction » — aucune donnée n’est encore publiée.
        </p>
      </div>
    </main>
  );
}
