# Leçons — JobAI

> Journal des leçons réutilisables. Une leçon se consigne ici **au moment où on la vit**,
> et sa règle durable remonte dans la §9 du `CLAUDE.md` **dans le même commit**.
>
> Format d'une entrée :
>
> ```
> ## AAAA-MM-JJ — <titre qui est une PHRASE-RÈGLE, pas un sujet>
> **Contexte** : ce qu'on faisait, en deux lignes.
> **Ce qui s'est passé** : le symptôme observé, pas l'interprétation.
> **Cause réelle** : vérifiée, avec fichier:ligne.
> **Règle durable** : la phrase à appliquer la prochaine fois.
> **Verrou** : le test ou le tripwire qui empêche la récidive (ou « aucun », honnêtement).
> ```
>
> Une leçon sans règle durable est une anecdote. Une règle durable sans verrou est un vœu.

---

## 2026-07-28 — Avant d'interpréter le verdict d'un outil de vérification, prouver que l'outil peut vérifier

**Contexte** : un hook signalait les commits comme non signés. J'ai voulu trancher par la
mesure plutôt que par le raisonnement.

**Ce qui s'est passé** : j'ai extrait la clé publique embarquée dans la signature du commit,
monté un fichier de signataires autorisés, et lancé la vérification. Verdict : `B`, mauvaise
signature. J'ai failli l'annoncer comme un fait.

**Cause réelle** : `ssh-keygen` n'existe pas dans le conteneur, et git ne peut pas vérifier
une signature SSH sans lui. Le `B` mesurait l'absence de l'outil, pas la qualité de la
signature. Le verdict avait toutes les apparences d'une mesure et n'en était pas une.

**Règle durable** : un outil de vérification qui rend un verdict négatif doit d'abord être
prouvé CAPABLE de rendre un verdict positif. Sinon « échec de vérification » et
« impossibilité de vérifier » se confondent — et la seconde se lit comme la première.
Corollaire : quand l'instrument manque, la réponse honnête est « je ne peux pas savoir
d'ici », pas un verdict par défaut.

**Verrou** : aucun (règle de méthode). Le même piège a frappé deux fois dans la même
session : un test de discrimination dont l'échec venait d'un SQL cassé, et ce verdict de
signature. Dans les deux cas, l'échec ressemblait à une preuve.

**Épilogue, mesuré en fin de session** — le diagnostic était bien inversé :
- Les commits **SONT signés** : `git cat-file commit HEAD` montre un bloc `gpgsig` SSHSIG
  ed25519 complet.
- Le `N` de `git log --format=%G?` vient de
  `error: gpg.ssh.allowedSignersFile needs to be configured and exist` — git ne peut pas
  **vérifier** localement, faute de fichier de signataires autorisés. Et la clé publique
  configurée (`user.signingkey`) fait **0 octet**, donc l'y pointer ne suffirait pas.
- `ssh-keygen` est absent du conteneur, ce qui rend toute vérification SSH impossible ici.
- Conséquence pratique : le correctif habituel (`git commit --amend --reset-author`) est
  **inopérant** — l'adresse de l'auteur est déjà la bonne, et le ré-amendement re-signerait
  avec la même clé. Un badge « Unverified » côté GitHub voudrait dire que la clé publique
  n'est pas enregistrée sur le compte : c'est un réglage de compte, pas un défaut du commit.

Généralisation : un signal d'alerte qui se répète sans que rien ne change **n'est pas une
preuve accumulée** — c'est le même verdict rejoué. Le mesurer une fois, écrire ce qu'on a
mesuré, et ne plus le re-litiger.

---

## 2026-07-28 — Une procédure destinée à un humain doit MARQUER ce qui s'exécute et ce qui s'enregistre

**Contexte** : `docs/DEPLOIEMENT.md`, la marche à suivre pour mettre JobAI en ligne.

**Ce qui s'est passé** : Marc a collé dans PowerShell deux blocs qui n'étaient pas des
commandes — une ligne de fichier `.env.local` (`DATABASE_URL=postgresql://…`) et un bloc
TypeScript destiné à `lib/sources.ts`. Erreurs obtenues : `Le caractère perluète (&) n'est
pas autorisé`, puis `Expression manquante après « , »`. Deux échecs, zéro progression.

**Cause réelle** : la doc mélangeait trois natures de contenu dans des blocs visuellement
identiques — commandes à exécuter, contenu de fichier à enregistrer, code source à modifier.
Rien ne les distinguait. Le lecteur ne peut pas deviner l'intention de l'auteur.

**Règle durable** : dans toute procédure destinée à un humain, MARQUER chaque bloc par sa
nature (🖥️ commande · 📄 contenu de fichier · 💾 code) et le dire en tête du document.
Corollaire pour PowerShell : une valeur contenant `&` ou `$` se met entre guillemets
**simples** (`$env:X='…'`) — les guillemets doubles laissent l'interpréteur agir. Et une
chaîne de connexion ne se « tape » jamais : elle s'écrit dans un fichier.

**Verrou** : aucun (règle de rédaction). Mais l'indicateur est simple : si l'utilisateur
échoue à l'étape N, la doc est en cause avant lui.

---

## 2026-07-28 — En français, un motif générique de nom de personne ne discrimine rien

**Contexte** : garde-fou n°1 — vérifier qu'aucun nom de personne de recrutement n'est
committé dans le jeu de départ. J'avais écrit un motif « prénom + nom composé à trait
d'union », la forme d'un patronyme québécois.

**Ce qui s'est passé** : le test a échoué au premier lancement, sur un seed pourtant
expurgé. Les correspondances mesurées : « Machines-Outils », « servo-contrôle »,
« Saint-Damien », « garde-fou », « là-bas », « un cran au-dessus ».

**Cause réelle** : en français, les mots composés à trait d'union sont partout — toponymes
(Saint-X-de-Y), termes techniques, adverbes. Le motif n'avait aucun pouvoir discriminant.

**Règle durable** : on ne détecte pas « un nom de personne » par sa forme. On détecte les
FORMES DE PRÉSENTATION d'une personne : une civilité, un nom après « avec », un nom entre
parenthèses après une mention de contact. Et on écrit dans le test que sa portée est
partielle — un garde qui promet plus qu'il ne fait est pire qu'un garde absent, parce qu'on
cesse de relire.

**Verrou** : `tests/seed.test.ts`, section « données personnelles ». Discrimination prouvée :
3 formes réelles détectées, 0 faux positif sur 3 formulations effectivement utilisées.

---

## 2026-07-28 — Un endpoint destiné à une machine ne doit jamais passer par un middleware qui redirige

**Contexte** : audit du squelette `jobtracker` produit le 27/07, avant de le porter.

**Ce qui s'est passé** : le `middleware.ts` du squelette capturait toutes les routes sauf
`/api/auth` et `/connexion`, et redirigeait vers la page de connexion. La route destinée au
hub serait donc tombée dans cette redirection.

**Cause réelle** : `middleware.ts:18`, matcher trop large. Le hub attend du JSON et
interprète tout le reste comme une panne — il aurait affiché « injoignable » en permanence,
sans que rien ne paraisse cassé côté app : la page de connexion s'affiche parfaitement dans
un navigateur.

**Règle durable** : un endpoint machine-à-machine porte **sa propre** authentification et
reste **hors** du middleware d'authentification utilisateur. Plus généralement : un
middleware qui **redirige** est incompatible avec tout consommateur non-navigateur — pour
ceux-là, l'échec doit être un code HTTP, jamais une redirection HTML.

**Verrou** : `tests/hubSummary.test.ts` teste le handler directement. ⚠️ Il ne testera la
non-interception qu'une fois le middleware écrit (`[V1-04]`) — à compléter à ce moment-là,
sinon la règle n'est pas verrouillée.

---

## 2026-07-28 — Une décision d'architecture prise sans lire les dépôts concernés est une hypothèse

**Contexte** : le handover du 27/07 posait comme question bloquante « réutiliser le scan
Gmail de DriveAI ? », en indiquant explicitement que la session n'avait pas inspecté DriveAI.

**Ce qui s'est passé** : la lecture du dépôt a tranché la question en quelques minutes.
DriveAI n'expose qu'un seul endpoint consommable de l'extérieur, son moteur Gmail vit dans
Apps Script à l'intérieur du compte Google de Marc, et sa surface Gmail est verrouillée par
un check CI requis.

**Cause réelle** : rien de cassé — mais une question était restée « bloquante » pendant une
session entière alors que la réponse était lisible dans le code.

**Règle durable** : avant de poser une question comme bloquante, vérifier si elle se répond
en lisant le code. Une question bloquante légitime porte sur une **intention** (ce que veut
Marc) ou sur un état **hors dépôt** (réglage GitHub, variable Vercel, DNS) — jamais sur un
fait vérifiable dans un dépôt accessible.

**Verrou** : aucun (règle de méthode, pas de code).

---

## 2026-07-28 — Un `npm run test | grep` rend le code de sortie du GREP, pas des tests

**Contexte** : gate avant commit, enchaîné en une ligne avec `&&` pour aller vite.

**Ce qui s'est passé** : la ligne
`npm run test 2>&1 | grep -E "^ +Tests" && npm run lint && … && git commit` a affiché
`1 failed | 151 passed`, puis `gate complet OK`, puis a committé et poussé. Un test rouge
est parti en ligne.

**Cause réelle** : dans un pipeline shell, `$?` est le code de sortie du **dernier** maillon.
`grep` a trouvé sa ligne, donc il rend 0 — quel que soit le sort de `npm run test`. Le `&&`
a enchaîné sur un succès qui n'existait pas.

**Règle durable** : ne JAMAIS juger un gate à travers un pipe. Soit on capture le code
explicitement (`npm run test; echo $?`), soit on teste la commande seule
(`npm run test >/dev/null 2>&1; echo "exit=$?"`), soit on utilise `PIPESTATUS`. Le confort
d'affichage ne doit jamais passer devant la véracité du verdict — c'est la même classe que
« ne jamais juger un `git push` via `| tail` », déjà documentée pour DriveAI, et elle
s'applique à TOUT ce qui décide d'un go/no-go.

**Verrou** : aucun (règle de méthode). Détection : un gate qui n'échoue jamais est suspect.

---

## 2026-08-05 — « Les trajets marchent, pourtant pas les adresses » : le « pourtant » était le diagnostic

**Contexte** : Marc, plusieurs jours après la livraison du rattrapage d'adresses :
« j'ai toujours pas toutes les adresses pourtant les trajets maps marchent, corrige ».

**Ce qui s'est passé** : la fonction était livrée, testée, déployée, et validait bien ses
résultats. Elle ne tournait presque jamais. Les deux pages déclenchaient la passe de fond
sur `offres.some(o => o.km === null)` — « une offre n'a pas de distance ». Ce gate se
referme au moment exact où toutes les distances sont mesurées, c'est-à-dire au moment où
les trajets Maps se mettent à marcher. Or `rattraperAdresses` et `mesurerBornes` vivent
DANS cette même passe : une fois les distances faites, plus rien ne les appelait. Il ne
restait que le cron nocturne, six entreprises par nuit — sept nuits pour quarante.

**Cause réelle** : une passe qui fait trois travaux, déclenchée par un gate qui n'en
regarde qu'un. Le premier travail terminé referme la porte sur les deux autres.

**Ce qui a rendu le défaut invisible** : ces travaux ne journalisaient QUE leurs échecs.
Une passe qui tourne sans rien produire et une passe qui n'a jamais tourné laissent les
mêmes journaux vides. Il n'existait aucun moyen de distinguer « rien à faire », « affamé »
et « coupé par le budget » — donc aucun moyen de diagnostiquer autrement qu'en relisant le
code ligne à ligne.

**Règle durable** : quand une passe fait PLUSIEURS travaux, son déclencheur doit couvrir
CHACUN d'eux, et la règle vit à UN seul endroit (`lib/travaux.ts`, pure) partagé par tous
les déclencheurs et par la passe elle-même. Le gate doit CONVERGER : un travail dont la
réponse ne viendra jamais porte un délai de retente, sinon on remplace « s'éteint trop
tôt » par « ne s'éteint jamais ». Et tout travail de fond trace CHAQUE passe, même vide,
en X/Y — « 0/0 » et « 0/6 » sont deux situations opposées.

**Ce que Marc a dit et que je n'ai pas entendu tout de suite** : « pourtant ». Il ne
décrivait pas deux problèmes, il donnait la corrélation. Une plainte utilisateur qui
contient un « pourtant » ou un « alors que » désigne souvent le lien de cause, pas une
circonstance atténuante.

**Verrou** : `tests/travaux.test.ts` — le test discriminant assert les DEUX moitiés
(`some(distanceAMesurer)` faux ET `resteDuTravail` vrai). L'ancien gate rend faux.

---

## 2026-08-05 — Ma propre requête avait effacé la réponse

**Contexte** : dernière source d'offres encore plausible, deux jeux nommés « Offres
d'emploi » sur Données Québec. Il fallait savoir QUI les publie — un titre ne dit rien.

**Ce qui s'est passé** : la sonde a rapporté « organisme : ? · modifié : ? · formats :
aucun » sur les deux. J'ai failli en conclure que la source ne publiait rien
d'exploitable, et fermer la piste.

**Cause réelle** : j'avais ajouté `fl=title,organization,notes` à la requête CKAN, croyant
DEMANDER ces champs. CKAN passe `fl` à Solr, qui restreint la projection — et en a
supprimé `organization`, `metadata_modified` et `resources`, c'est-à-dire exactement les
trois choses que le résumé lisait. Sans le paramètre, la réponse est complète et tranche
en une ligne : Ville de Laval et Ville de Montréal, leurs propres postes, à 250 km.

**Règle durable** : une API rend son objet complet par défaut ; on ne l'ampute que si le
volume gêne, jamais « pour cibler ». Quand une réponse est vide là où on l'attendait
pleine, suspecter SA PROPRE requête avant la source. Même famille que « un HTTP 200 ne
prouve rien » : le vide non plus.

**Verrou** : aucun (règle de méthode). Le paramètre est retiré, avec la raison écrite à
côté pour que personne ne le remette.
