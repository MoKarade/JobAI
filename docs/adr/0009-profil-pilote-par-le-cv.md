# ADR-0009 — Le profil sort du code, et le CV le remplit

- **Statut** : accepté
- **Date** : 2026-08-13
- **Décideur** : Marc, sur quatre questions de cadrage posées avant toute ligne de code
- **Remplace** : `[V3-00]` du backlog (« accès au CV dans Google Drive ») — voir
  « Alternatives rejetées »

## Contexte

Demande de Marc : « je veux la possibilité d'uploader mon CV pour que la recherche de job se
fasse par rapport à ça, et que tout s'update, les scores, les SWOT, les critères, etc ».

### Ce que l'inventaire a montré, et qui change la forme du travail

Le profil de Marc **existe déjà dans l'app**. Il est simplement éclaté en trois endroits qui
ne savent pas qu'ils décrivent un profil :

| Fichier | Ce qui y est caché |
|---|---|
| `lib/scoring.ts` | `MOTS_COORDINATION`, `MOTS_TECHNIQUE`, `MOTS_DISQUALIFIANTS`, le seuil des 3 ans de `scoreSeniorite`, les paliers de `scoreSalaire`, `PALIERS_DISTANCE_KM`, `RAYON_MAX_KM`, `PONDERATION` |
| `lib/reference.ts` | le `SWOT` établi à la main le 2026-07-27, `SALAIRES_MARCHE`, `ENTREPRISES_CIBLES` |
| `lib/ingest/sources.ts` | les huit termes que la veille interroge |

Téléverser un CV n'est donc **pas** « analyser un PDF ». C'est extraire le profil de ces
trois cachettes, en faire un objet unique, et laisser le CV le remplir. L'analyse du fichier
est la moitié facile.

Conséquence directe sur l'ordre des travaux : **le premier lot a de la valeur même si aucun
CV n'est jamais téléversé**, puisqu'il rend le barème réglable sans toucher au code. C'est
aussi le lot sans aucun risque — ni LLM, ni donnée personnelle, ni changement de note.

### Deux affirmations périmées du `CLAUDE.md`, relevées au passage

Le §1 annonce l'**Anthropic SDK** dans la pile : `package.json` ne le connaît pas. Le
garde-fou §6 exige que « le texte non maîtrisé n'entre pas nu dans un prompt » via
`sanitizePromptText` : la fonction n'existe pas (`[V3-01]`, jamais commencé). Les deux
décrivaient l'intention, pas l'état. Ce chantier les rend vraies — c'est le seul traitement
acceptable d'une doc qui promet ce que le code ne fait pas.

## Décision

Un **profil unique et typé** (`lib/profil.ts`) devient la source de ce que l'app cherche, de
la façon dont elle note, et de ce qu'elle affiche du positionnement de Marc. Le CV le
**propose**, Marc le **valide**, et la validation recalcule tout.

### Une réserve sur « ce que l'app cherche », mesurée après coup

Le profil porte bien la liste `recherches`, et `lib/ingest/sources.ts` la lit désormais au
lieu d'une copie en dur. Mais il faut dire où cette liste agit RÉELLEMENT aujourd'hui, sinon
cet ADR promet plus que le code ne fait :

- `RECHERCHES_GUICHET` est **vide** — le flux du Guichet-Emplois ne répond pas (constat de
  `[INGEST-03]`). La passe quotidienne interroge donc les flux ATS d'entreprises et le point
  de dépôt, **pas des termes de recherche**.
- La liste sert donc au banc d'essai de la sonde, et servira la veille le jour où un flux
  par mots-clés existera.
- **La Routine quotidienne porte ses propres termes dans son prompt**, hors du dépôt. Un CV
  validé ne les change pas.

C'est une divergence réelle : un terme ajouté par un CV enrichit le profil sans modifier ce
que la Routine tape le matin. La refermer suppose que la Routine LISE le profil (via un
endpoint dédié) plutôt que de porter sa liste en dur — c'est un chantier à part, tracé au
backlog. Le dire ici vaut mieux que laisser croire que la boucle est bouclée.

Les quatre arbitrages, tels que tranchés :

1. **Le fichier de CV est CONSERVÉ en base.** Il peut donc être ré-analysé sans être
   re-téléversé, et ses versions successives restent comparables.
2. **Rien ne s'applique sans validation de Marc.** L'extraction ne produit qu'une
   *proposition*, champ par champ, chacun portant sa provenance.
3. **À la validation, tout est recalculé immédiatement** — pas de second écran d'aperçu.
   La revue du point 2 EST le moment de contrôle ; en ajouter un deuxième reviendrait à
   faire valider deux fois la même décision.
4. **Le chantier est livré entier**, jusqu'au SWOT.

### Ce qui ne se négocie pas, quels que soient ces arbitrages

- **Une note `scoreSource: "manuel"` n'est jamais écrasée par un recalcul.** C'est déjà la
  règle du barème (garde-fou n°3, `PLAFOND_NOTE_CALCULEE`), pas une préférence : une note
  lue et vérifiée à la main vaut mieux qu'un calcul, et un recalcul de masse est exactement
  la circonstance où on la perdrait sans s'en apercevoir.
- **Le CV stocké ne sort jamais** : ni dans un export CSV, ni dans une réponse d'API non
  authentifiée, ni dans le résumé publié au hub.
- **Le fichier ne touche jamais git.** Il vit en base, dans un dépôt qui n'est pas versionné.

## Impact quotas / coût

**Nouveau poste de dépense : l'API Anthropic**, absente de l'app jusqu'ici.

- L'extraction d'un profil depuis un CV est un appel **par téléversement**, déclenché par un
  geste de Marc — jamais en tâche de fond, jamais à l'ouverture d'une page. Un CV fait
  quelques milliers de jetons ; Haiku suffit largement pour de l'extraction structurée.
- L'ordre de grandeur est donc de quelques cents par téléversement, et Marc ne téléverse pas
  son CV tous les jours. Ce n'est pas ce poste qui menace le budget.
- **Ce qui le menacerait**, c'est de noter chaque offre par lecture LLM (`[V3-02]`). Ce
  chantier ne le fait **pas** : la notation reste le barème déterministe, simplement
  paramétré par le profil. Le plafond budgétaire `[V3-06]` reste dû avant `[V3-02]`.
- `ANTHROPIC_API_KEY` doit être posée dans l'environnement Vercel. **Absente, l'extraction
  n'invente rien** : elle répond un état honnête et l'écran le dit (règle no-fake-data). Le
  reste de l'app continue de fonctionner — un profil manquant retombe sur `PROFIL_DEFAUT`.

## Analyse de risques

### 1. Le CV est l'objet le plus dense en données personnelles du projet

Nom, adresse municipale, téléphone, courriel, employeurs, dates. Le garde-fou n°1 interdit
déjà l'adresse du domicile dans un fichier versionné ; le choix de conserver le fichier
déplace le risque sans le supprimer : le PDF dort désormais en base, et sort donc dans toute
copie de la base.

Mitigations retenues :
- le blob n'est **jamais** sélectionné par une requête de liste — seules les métadonnées
  (nom, taille, date) le sont, et le schéma le rend explicite ;
- aucune route ne sert le fichier ; `lib/export.ts` ne le connaît pas ;
- le profil **extrait** est expurgé des coordonnées (adresse, téléphone, courriel) avant
  d'être stocké : il n'a besoin que des faits professionnels, et il finira, lui, dans des
  écrans et des exports ;
- Marc peut supprimer un CV, et la suppression efface le blob.

### 2. Un LLM qui lit un CV produit des AFFIRMATIONS

S'il déduit « 5 ans d'expérience » là où il y en a trois, toutes les notes bougent et rien ne
le signale. C'est la forme la plus dangereuse de fake data : plausible, chiffrée, invisible.

Mitigation : **aucun champ extrait ne s'applique sans être affiché avec sa provenance** —
« 3 ans, §Expérience 2023-2026 ». Un champ sans provenance vérifiable est présenté comme une
supposition, pas comme un fait. C'est la raison d'être du point 2 de la décision.

### 3. Re-noter tout, c'est changer l'étalon

Après recalcul, les notes lues hier et celles lues aujourd'hui ne mesurent plus la même
chose. Marc a choisi le recalcul immédiat, et c'est défendable — une liste qui mélange deux
barèmes sans le dire est pire. Mitigation : **chaque offre garde la version de profil qui l'a
notée**, pour qu'une note reste explicable après coup.

### 4. Le SWOT n'est pas un calcul

« Mobilité limitée avant la résidence permanente (permis lié à l'employeur actuel) » ne sort
d'**aucun** CV. Un SWOT régénéré automatiquement à chaque téléversement perdrait précisément
ce qui fait sa valeur : il a été pensé.

Le CV nourrit donc les **faits** des quadrants (années, langues, diplômes, outils) ; le
**jugement** reste écrit par Marc, et la date de constat est celle de sa validation.

### 5. Le profil devient un paramètre du barème

Un barème paramétrable est un barème qu'on peut dérégler. Mitigation : `PROFIL_DEFAUT` porte
exactement les valeurs d'aujourd'hui, et un test rejoue le jeu de référence pour prouver que
le résultat est **bit-identique** tant que le profil n'a pas changé. Sans cette preuve, la
refonte serait indistinguable d'une régression silencieuse du barème.

## Méthode de test

- **Rétrocompatibilité bit-identique** : `computeScore(offre)` sans profil rend exactement la
  même note qu'avant le lot 1, sur tout le jeu de référence. Discrimination prouvée en
  modifiant un seuil de `PROFIL_DEFAUT` — le test doit tomber.
- **La note manuelle survit au recalcul** : test dédié, discrimination prouvée en retirant la
  garde.
- **Le blob ne fuit pas** : test qui vérifie qu'aucune requête de liste ni aucun export ne
  porte le contenu du fichier.
- **`sanitizePromptText`** : cas d'injection connus neutralisés, texte légitime intact —
  y compris les caractères accentués et les apostrophes françaises, qui sont le cas courant.
- **Clé API absente** : l'extraction rend un échec honnête, jamais un profil vide présenté
  comme un résultat.
- Gate complet vert à chaque lot : `typecheck` + `test` + `lint` + `build`.

## Conséquences

**Positif** — le barème devient réglable sans toucher au code ; la veille cherche ce que Marc
est plutôt qu'une liste figée ; le SWOT cesse d'être daté du 27 juillet pour toujours ; et
deux promesses périmées du `CLAUDE.md` deviennent vraies.

**Négatif** — un PDF chargé de données personnelles dort désormais en base, et l'app acquiert
une dépendance à un service payant qu'elle n'avait pas.

**Risques acceptés** — l'extraction LLM se trompera parfois ; c'est l'écran de revue qui la
rattrape, pas la qualité du modèle. Et un recalcul global reste un événement : il change des
notes que Marc avait peut-être en tête.

## Alternatives rejetées

- **Aller chercher le CV dans Google Drive** (`[V3-00]` du backlog) — c'était le plan prévu,
  et il portait le blocage le plus coûteux du chantier IA : deux scopes Google restreints sur
  la même app OAuth, ou un sélecteur de fichiers `drive.file` à construire. Un téléversement
  direct le rend inutile. `[V3-00]` est retiré, pas reporté.
- **Ne pas conserver le fichier** (l'analyser puis le jeter) — plus sûr côté données
  personnelles, et c'était ma recommandation. Écarté par Marc : re-analyser sans
  re-téléverser, et garder l'historique des versions, valait le risque assumé.
- **Appliquer l'extraction automatiquement** — c'est la porte ouverte au chiffre inventé qui
  déplace toutes les notes sans que personne ne le voie.
- **Noter chaque offre par lecture LLM** (`[V3-02]`) — c'est un autre chantier, avec un autre
  profil de coût, et il exige d'abord le plafond budgétaire `[V3-06]`. L'anticiper ici
  mélangerait deux décisions.
- **Un second écran d'aperçu avant recalcul** — proposé, écarté par Marc : la revue du profil
  est déjà le point de contrôle, et faire valider deux fois la même décision use la
  validation jusqu'à ce qu'on clique sans lire.

## Réversibilité

Par lot. Le lot 1 est un pur refactor à comportement identique (`git revert` sans
conséquence). Les lots suivants ajoutent une table et des routes : revenir en arrière suppose
de décider du sort des CV stockés — c'est le seul point non trivialement réversible, et il
découle du choix de conserver le fichier.
