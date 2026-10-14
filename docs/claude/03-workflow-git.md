## 3. Workflow git

- **Branches** : développement **directement sur `main`** (décision Marc 2026-07-28,
  ADR-0002). Pas de branche de travail, pas de PR : projet solo, le va-et-vient de revue
  coûtait plus qu'il ne protégeait.
  ⚠️ **Ce n'est plus vrai à 100 %, et l'écrire au singulier induisait en erreur** : une session
  Claude distante ne peut pas pousser sur `main` protégée, donc elle passe par
  `claude/<slug>` + PR draft (#9, #10, et celle-ci). Les deux régimes coexistent — direct sur
  `main` depuis un poste, branche + PR depuis une session distante. Ce qui ne change pas : le
  gate de §5 avant chaque commit, et `git revert` plutôt qu'une réécriture d'historique.
  ⚠️ **À trancher par Marc (14/10)** : depuis le 28/09, `main` est protégée par un ruleset
  (« Protection de main (kit auto-merge) », aucun contournement) qui exige les trois contrôles
  de `.github/auto-merge.json` — un push direct sur `main` est donc refusé, et le dernier commit
  direct date du 25/09. La fusion se fait par le kit de l'Atelier (`auto-merge.yml` →
  `modeles/auto-merge/fusionner.mjs`) ; `fusion-auto.yml` (auto-merge natif) est désactivé
  côté GitHub. ADR-0002 (« direct sur `main` ») n'est pas modifié. Autre écart : « PR draft »
  ici, alors que la règle de l'Atelier pour les apps en fusion auto est « jamais en brouillon ».
- **Commits** : préfixés par l'ID de tâche du backlog. Ex. `[V1-03] endpoint hub summary`.
- **Le gate est en §5**, et il est obligatoire avant chaque commit. Jamais `--no-verify`.
- **Push** (régime ADR-0002, voir la note « À trancher » ci-dessus : impossible depuis le 28/09) : commits directs sur `main`. **Il n'y a donc AUCUNE revue pour rattraper une
  erreur** — le gate local est obligatoire avant chaque commit, et la CI est le seul filet
  partagé. Un commit poussé est en ligne : dans le doute, on vérifie avant, pas après.
  Retour arrière = `git revert`, jamais de réécriture d'historique sur `main`.
  ⚠️ **Le push n'est pas fini tant que le run de CI n'a pas été CONSULTÉ.** Sans PR, rien
  n'affiche un ✗ : une CI rouge peut passer inaperçue sur plusieurs commits (vécu, ×4).
- **Flotte d'agents** (`.claude/agents/`, **5**) : `gardien-des-garde-fous`,
  `code-reviewer`, `chasseur-de-pannes-muettes`, `auditeur-accessibilite`,
  `gardien-des-documents`. Panel avant commit via `/review`, qui route selon les fichiers
  touchés. Leurs périmètres ne se recouvrent pas — chacun dit ce qu'il ne traite pas.
  Un finding est une **hypothèse** : on vérifie le vrai code avant de coder un correctif.
  Entre deux agents qui se contredisent, **celui qui a mesuré l'emporte sur celui qui a
  déduit**. La flotte ne remplace pas le gate déterministe.
- **Documents vivants**, tenus à jour dans la **même PR** que le code : `HANDOVER.md` (état
  courant, lu en premier), `BACKLOG.md` (coché au merge), `docs/LESSONS.md`, `docs/adr/`.
  Doc périmée = pire que pas de doc.
- **Boucle de leçons** : à chaque push, se demander « qu'ai-je appris ? ». Une leçon durable
  remonte en §9 ci-dessous, dans le même commit. Rien appris → le dire, jamais sauter en silence.

