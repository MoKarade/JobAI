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

---

## 2026-09-14 — Une garde qui exclut une population la prive aussi de ce qu'on disait d'elle

**Le symptôme, en deux plaintes** : « les liens marchent pas forcément, je veux juste
cliquer pour avoir l'offre » et « ça m'étonne, certaines devraient être périmées ».

**La mesure** (les 32 offres ouvertes notées 60 et plus, relevées par le MCP) : 14 liens
mènent à une vraie annonce, 10 sont des jetons `to.indeed.com`, 4 des listes d'emplois
d'employeur, 4 des pages d'accueil. Les 18 liens faibles sont EXACTEMENT les 18 offres du
jeu de départ présentes dans cette liste. Et les offres réputées ouvertes depuis des mois
sont ce même jeu de départ — 38 entrées saisies à la main entre février et juillet.

**La cause** : `appliquerBalayage` ne compte d'absences que pour les offres déjà présentes
dans le journal de veille. C'est une garde JUSTE — l'absence d'une offre saisie à la main
dans une requête Indeed ne prouve rien, et périmer sur ce silence détruirait le travail le
plus fiable du jeu. Mais la péremption était le SEUL poste de l'app qui disait quelque chose
sur la présence d'une offre. Exclues du mécanisme, ces 38 offres n'étaient pas « protégées » :
elles étaient MUETTES, affichées exactement comme une offre confirmée la veille.

**Règle durable** : devant une garde qui saute une population, ne pas se demander seulement
ce que le mécanisme lui aurait FAIT, mais ce qu'il AFFIRMAIT en passant. Une exclusion retire
l'action ET l'information ; il faut rendre la seconde autrement.

**Ce qui a été livré, et ce qui a été refusé** : la pastille « à vérifier » plus la phrase
« repérée il y a N jours, jamais revue par un balayage », dont le seuil est DÉRIVÉ de la
patience de la veille (`SEUIL_ABSENCES_PEREMPTION`) et non choisi. Pas d'archivage
automatique sur l'âge : mesuré, ces offres sont les mieux notées du suivi (88, 85, 84, 82,
80…), et exécuter la demande à la lettre aurait emporté les meilleures pistes de Marc sur une
supposition. Quand une demande d'automatisation porte sur des données qu'on n'a pas encore
regardées, mesurer d'abord QUI elle emporterait.

**Le piège technique du même lot** : reconnaître une page de liste par
`chemin.includes("jobs")` classe `jobbank.gc.ca/jobsearch/jobposting/N` en « liste » — les 14
seuls liens qui marchent. La règle porte sur le DERNIER segment. Montré par MUTATION, pas par
relecture : le test écrit sur les URL réelles est passé au rouge 14 fois d'un coup.

**Verrous** : `tests/lienOffre.test.ts` (le relevé de production, 32 entrées, avec son
compte), `tests/fraicheur.test.ts` (seuil dérivé de la constante, silence sur les offres que
la veille suit), `tests/liensOffreCables.test.ts` (les écrans APPELLENT la règle — le module
pouvait être juste sans être branché, et rien entre les deux gardes existantes ne le voyait).

---

## 2026-09-14 — « Quasi tout X » se mesure, et l'outil de mesure se livre en premier

**Le symptôme** : « quasi toutes les offres sont à vérifier, mais je veux pas revérifier
manuellement, je veux que tu le mettes en place ».

**Le réflexe qu'il fallait retenir** : je n'avais aucun moyen de compter. Le nombre d'offres
qu'aucun balayage n'a jamais confirmées n'existait nulle part — ni dans le résumé MCP, ni
dans une route de diagnostic. J'allais donc dimensionner une automatisation qui ARCHIVE des
offres sur une impression. Premier lot : l'observabilité (`resume_suivi` rend un bloc
`veille`). Mesuré aussitôt : **1 572 confirmées, 21 jamais vues, toutes entre 30 et 90
jours**, sur 1 593. Pas « quasi toutes » — 1,3 %.

**Mais l'impression n'était pas gratuite** : le journal de veille tient dans UNE ligne d'état
JSON. Perdu ou écrit à moitié, il rend toutes les offres « jamais confirmées » d'un coup, et
la pastille accuse le suivi entier. D'où `journalPlausible` : une absence n'est une
information que si sa source est prouvée vivante.

**Le piège de conception** : j'avais gaté la fermeture automatique sur `couvertureComplete`,
la garde du mécanisme voisin. Elle ne répondait pas à ma question (le silence d'une requête
ne dit rien d'une offre qu'aucune requête n'a jamais trouvée — ce qui la ferme est un ÂGE),
et surtout elle ne pouvait pas tirer : aucun lot déposé depuis 24 jours, donc couverture
incomplète en permanence. Mécanisme vert, testé, mort à l'arrivée.

**Le piège de test** : deux témoins d'intégration restaient verts sous la mutation qui
retirait leur garde, parce qu'ils avaient le même âge que la vraie candidate et que la borne
« pas plus que ce que la passe a confirmé » ne gardait que le premier du tri. Un témoin doit
être le PREMIER que la règle emporterait si sa garde tombait.

**Verrous** : `tests/fermetureAuto.test.ts` (17 cas, chaque abstention par son motif),
`tests/ingest-passe-suspension.test.ts` (deux tests qui TRAVERSENT la passe, dont un sur une
couverture INCOMPLÈTE), `tests/fraicheur.test.ts` (le silence quand le journal est perdu).

---

## 2026-09-14 — Un document persisté est daté par le schéma qui l'a écrit

**La panne** : le profil enregistré de Marc ne passait plus `ProfilSchema`. Quatre champs
manquants — `ponderation.conditions`, `pointsConditions`, `facteurHorsDomaine`,
`termesParJour` —, tous ajoutés au MÊME commit (ADR-0014 D2). Document sain, simplement
antérieur. Rien ne l'avait relu depuis.

**Ce que ça cassait vraiment** : `/profil` et `/references` affichaient le barème et le SWOT
du CODE sous l'apparence de ceux de Marc, et `validerProfil` REFUSAIT — plus aucun CV
validable. Aucun de ces deux effets n'était dans mon annonce initiale.

**Le remède, et ce qu'on a refusé de faire** : `lib/profilStocke.ts` comble depuis
`PROFIL_DEFAUT` ce que le document n'a pas, récursivement, puis passe le schéma STRICT.
Assouplir le schéma aurait réparé l'écran en une ligne et transformé chaque ajout futur en
dérive silencieuse. La liste des champs se DÉRIVE du défaut : le prochain champ du barème est
couvert le jour où il y entre. Une valeur présente n'est jamais écrasée (sinon on efface au
lieu de migrer), et une valeur présente mais FAUSSE lève toujours — « ce champ n'existait pas
encore » et « ce champ est cassé » sont deux situations opposées.

**La deuxième leçon, plus chère** : j'avais annoncé à Marc « tout réglage enregistré est
ignoré, `termesParJour` compris ». Mesuré une heure plus tard par un simple `grep` des
consommateurs : FAUX sur toute la ligne. `termesParJour` n'est lu par aucun code hors du
défaut, le rayon et les métiers ont leurs propres lignes d'état, la notation tourne sur
`PROFIL_DEFAUT`. **Le nom d'un champ dans une trace d'erreur ne dit pas qui le lit.** J'avais
déduit la portée du symptôme au lieu de la mesurer — la faute exacte que l'ADR-0005 avait
déjà consignée (« un plan écrit d'après un TABLEAU de symptômes se trompe »), transposée à
une ligne de journal.

**Verrous** : `tests/profilStocke.test.ts` (11 cas, le document réel reconstitué depuis
`PROFIL_DEFAUT` moins les quatre champs ; cinq mutations jouées), et une lecture UNIQUE —
`profilActif` et `profilCourantOuDefaut` passent par la même fonction, sans quoi la fiche
s'afficherait pendant que la validation refuserait.
