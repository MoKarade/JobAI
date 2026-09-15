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

---

## 2026-09-14 — Un garde-fou qui refuse un LOT devient une panne permanente

**Le symptôme** : `bornes=0/1293 (1293 en échec)`, précédé de « boîte englobante anormalement
large — interrogation annulée ». Tous les jours, depuis un moment.

**Le mécanisme** : la mesure interroge Overpass UNE fois pour tout le lot (correction d'août
2026 : une requête par entreprise vidait le budget), et refuse une boîte englobante absurde —
protection légitime contre une position aberrante en base. Le jour où une telle position est
réellement entrée, la garde a refusé le lot ENTIER. Et le refus s'auto-entretient : un échec
ne marque aucune ligne, donc le lot du lendemain contient exactement les mêmes lignes, donc
la même boîte, donc le même refus. Un membre gèle 1 292 autres, indéfiniment.

**Règle durable** : devant un garde-fou qui rejette une opération GROUPÉE, demander ce qu'il
fait payer aux membres sains. Si la réponse est « tout », le seuil ne doit pas être relevé
(ce qui ne fait que déplacer le jour de la panne) mais converti en critère de **partition**.

**Comment partitionner sans inventer de nombre** : croissance gloutonne sur la CONTRAINTE
RÉELLE — on ajoute un lieu à la grappe tant que sa vraie boîte, marge comprise, respecte la
garde. Une grille aurait demandé de choisir une taille de cellule et de supposer une latitude
pour convertir la marge en degrés de longitude. Ici on ne suppose rien, et chaque boîte est
valide par construction.

**Ce qui ne peut entrer dans aucune grappe est NOMMÉ** (nom + coordonnées + « à re-géocoder »),
jamais fondu dans un compte : « 1 293 en échec » ne se corrige pas.

**Le piège de test, troisième fois de la journée** : la garde couvrait la fonction pure et
le budget, mais rien ne couvrait le BRANCHEMENT — casser l'étendue passée depuis
`lib/actions.ts` laissait toute la suite verte. Révélé par mutation, pas par relecture.

**Le piège de garde** : un test qui cherchait littéralement `budgetMs < DELAI_MAX_MS` a rougi
sur un lot qui ne touchait pas à ce qu'il défend — la grandeur comparée s'appelle maintenant
`reste`. Une garde ancre le FAIT, jamais la FORME qu'avait le code.

**Verrous** : `tests/bornes.test.ts` (découpage, déterminisme, aucun lieu perdu, chaque boîte
sous la garde, aberrants nommés, plus une garde de câblage lue sur la source décommentée).

---

## 2026-09-15 — Un message qui DÉDUIT sa cause d'un code HTTP envoie au mauvais endroit

**Le symptôme** : `[trajets] échec : Matrice refusée (403) : « Routes API » doit être activée
et dans les restrictions de la clé serveur.` Une phrase sûre d'elle, dans le journal, tous les
jours.

**Le mécanisme** : cette phrase n'était pas une lecture, c'était une SUPPOSITION écrite en dur
dans le `if (status === 403)`. Un 403 de Google porte au moins six causes — API non activée,
API absente des restrictions de la clé, clé NAVIGATEUR utilisée côté serveur, restriction par
IP, clé invalide, facturation inactive — et chacune se répare à un endroit différent de la
console. Le message était donc exact une fois sur six ; les cinq autres fois, il envoyait
faire un geste inutile, après quoi on croit le problème réglé et on attend un résultat qui ne
viendra pas. « Un message d'erreur FAUX coûte plus cher qu'un message générique » (§9), et
celui-ci coûtait un aller-retour complet à chaque fois.

**Le remède** : la cause se lit dans la donnée RICHE, à un seul endroit. Google la met dans
`error.details[].reason` (un `google.rpc.ErrorInfo`), qui est un identifiant stable et
documenté. `error.message`, lui, est de la prose pour humains : la traduire ou la reformuler ne
casse rien chez Google et casserait tout détecteur qui la lirait — d'où une TABLE sur `reason`,
jamais un `includes` sur le message. Le message n'est plus utilisé que pour être CITÉ.

**Et ce qu'on ne sait pas, on le cite.** Une raison inconnue ne retombe pas sur « l'API n'est
pas activée » : ce serait refaire exactement le défaut, en plus discret. Elle rend la phrase de
Google, bornée, avec le code HTTP — moins satisfaisant à lire, et vrai. C'est aussi ce qui
permettra de reconnaître la prochaine cause au lieu de la déguiser en celle d'avant.

**Le piège de test, et il était déjà là** : les tests de 403 existants passaient avec des faux
`fetch` qui ne portaient AUCUN corps (`{ ok: false, status: 403 }`). Ils éprouvaient donc qu'une
phrase nommait l'API — ce qu'un message écrit en dur fait aussi bien qu'une lecture réelle.
Autrement dit, ils seraient restés verts sur le défaut comme sur son correctif. Chaque test
porte désormais un corps avec une raison DIFFÉRENTE et exige LE geste correspondant : si la
réponse cesse d'être lue, la phrase change et le test tombe.

**Prouvé par mutation, deux fois** : couper la lecture du corps aux cinq sites fait tomber
exactement cinq tests, un par site ; refaire du repli « inconnue » un « api-desactivee » en
fait tomber six. Deux mutations parce que ce sont deux propriétés distinctes — le branchement,
et le refus d'inventer.

**Ce que le lot ne fait pas** : il ne rétablit pas les trajets. Aucune session ne peut basculer
un interrupteur dans la console Google. Il fait que le prochain passage NOMME le geste au lieu
d'en supposer un — et le dire ainsi vaut mieux que de laisser croire que c'est réparé.

**Verrous** : `tests/erreurGoogle.test.ts` (la traduction, cas par cas, dont le discriminant
« un message qui dit autre chose que `reason` »), plus un test de branchement par site dans
`tests/trajetRoutes.test.ts` et `tests/geocodage.test.ts`.

---

## 2026-09-15 (fin de journée) — « on cite ce qu'on ne sait pas » ne vaut rien si le corps doit être du JSON

**Le symptôme, deux heures après le déploiement du correctif** :
`[trajets] échec : Routes API refuse la clé (403). Google n'a donné aucune explication
lisible — relever la réponse brute pour trancher.`

**Ce qui allait bien** : le message ne mentait plus. La branche « cause inconnue » a fait
exactement son travail — elle a refusé d'inventer « l'API n'est pas activée ».

**Ce qui n'allait pas** : elle n'apprenait rien. Le module promettait de CITER ce qu'il ne
sait pas interpréter, mais les cinq sites d'appel lisaient `reponse.json().catch(() => null)`
— donc au premier caractère inattendu, le corps était **jeté avant d'arriver au module**. Un
corps vide, une page HTML et un JSON sans `message` produisaient la même phrase, alors que ce
sont trois diagnostics opposés : rien à lire ; un refus posé AVANT l'API (une page d'erreur de
passerelle n'a pas la même cause qu'un refus de l'API) ; une cause à ajouter à la table.

**La règle générale** : une branche de repli qui promet de rendre la donnée BRUTE doit la
RECEVOIR. Un analyseur placé en amont lui livre `null` exactement dans les cas qu'elle existe
pour couvrir — c'est-à-dire qu'elle est vide précisément quand on en a besoin. Pour chaque
repli « on rend ce qu'on a », remonter le chemin et vérifier que « ce qu'on a » n'a pas déjà
été converti, filtré ou avalé.

**Le remède** : lire le corps en TEXTE, tenter le JSON dessus. Ce qui n'a livré aucune phrase
est cité tel quel — borné à 300 caractères, espaces repliés sur une ligne. La citation n'est
POSÉE que s'il n'y a pas de phrase (répéter la même chose deux fois est du bruit) et jamais
quand la cause est reconnue (le geste se suffit). Le corps ne porte pas la clé — elle voyage
dans l'en-tête `X-Goog-Api-Key` et Google ne la renvoie pas : citer ne publie aucun secret.

**Pourquoi les tests ne pouvaient pas le voir** : leurs faux `fetch` rendaient un objet portant
`json`. Le cas « le corps n'est pas du JSON » n'était pas seulement non testé — il était
**inexprimable** dans le harnais. C'est la signature d'un défaut qui n'apparaît qu'au premier
usage réel : on REGARDE la première exécution en production au lieu de la supposer conforme.

**Prouvé par mutation, deux fois** : rendre `brut` toujours `null` fait tomber 5 tests ;
revenir à `.json()` aux cinq sites en fait tomber 6.

**En passant, une question tranchée par les mêmes journaux** : `[PROFIL-02]` demandait pourquoi
le `console.warn` de `profilActif` n'apparaissait pas chez Vercel. Il est apparu :
`[profil] document antérieur à 5 champ(s) du barème, comblés depuis le défaut : faits.parcours,
ponderation.conditions, pointsConditions, facteurHorsDomaine, termesParJour`. Rien n'était
filtré — la ligne n'avait simplement pas été émise dans la fenêtre observée la veille. La
migration du profil n'est donc pas silencieuse, et elle comble bien cinq champs. **Une absence
de log dans une fenêtre d'une heure n'a jamais rien prouvé** ; il a suffi de regarder la bonne
exécution.

---

## 2026-09-15 (17:05) — la cause était dans la table depuis le début : c'est l'ENVELOPPE qui la cachait

**Ce que la citation a rendu**, au premier passage après le lot précédent :

```
[{ "error": { "code": 403,
   "message": "Requests to this API routes.googleapis.com method
               google.maps.routing.v2.Routes.ComputeRouteMatrix are blocked.",
   "status": "PERMISSION_DENIED",
   "details": [ { "reason": "API_KEY_SERVICE_BLOCKED", … } ] } }]
```

**Deux faits d'un coup.** Le geste est « ajouter Routes API aux restrictions d'API de la clé
serveur » — l'API est activée, c'est la clé qui ne l'autorise pas. Et surtout :
`API_KEY_SERVICE_BLOCKED` était dans la table `PAR_REASON` **depuis le premier commit**.

**Pourquoi elle n'était jamais atteinte** : `computeRouteMatrix` est un endpoint de
**STREAMING**. Il rend un TABLEAU d'éléments, et son refus arrive donc ENVELOPPÉ —
`[{ "error": … }]` et non `{ "error": … }`. `.error` sur un tableau vaut `undefined`, donc la
table n'était jamais consultée. Un refus parfaitement reconnaissable est resté « cause
inconnue » pendant deux lots, avec un message juste assez vrai pour ne pas alerter.

**Règle** : la FORME de l'enveloppe fait partie du contrat d'erreur, et elle n'est pas la même
pour toutes les méthodes d'une même API — `computeRoutes` rend un objet, `computeRouteMatrix`
un tableau, même hôte et même clé. Avant de conclure qu'une réponse « ne porte pas » ce qu'on
cherche, vérifier si elle le porte **une couche plus bas**.

**La morale de la série entière** : trois lots d'affilée, la logique de classement était JUSTE
et c'est le CHEMIN D'ALIMENTATION qui perdait l'information — d'abord la cause déduite du seul
statut, puis un `json()` qui jetait tout corps non-JSON, puis une enveloppe qu'on ne savait pas
ouvrir. **Un classificateur correct nourri d'une donnée amputée rend un verdict faux avec
aplomb**, et il le rend d'autant plus crédiblement qu'il est bien écrit. Devant un verdict
« inconnu » qui persiste, auditer ce qu'on DONNE au classificateur avant de toucher au
classificateur.

**Ce qui a rendu le diagnostic possible** : la citation du corps brut, livrée une heure plus
tôt. Sans elle, la chaîne restait « Google n'a donné aucune explication lisible » à vie — une
phrase vraie, stable, et qui n'aurait jamais mené nulle part. Un repli honnête qui CITE la
donnée finit par résoudre le problème ; un repli honnête qui se contente de dire « je ne sais
pas » ne le résout jamais.

**Verrou** : le corps EXACT relevé en production est une fixture de `tests/erreurGoogle.test.ts`.
Mutation : retirer `denvelopper` fait tomber 3 tests.

---

## 2026-09-15 (soir) — replier une barre, c'est promettre de dire ce qu'elle cache

**La demande** : « rends la carte plus grande ». Trois lectures possibles — ouvrir déjà
agrandie (le bouton existe), garder la liste à côté et récupérer la hauteur au-dessus, ou les
deux. Marc a choisi la deuxième. Poser la question a coûté trente secondes et évité de livrer
une mise en page qu'il n'aurait pas voulue.

**Ce qui était déjà là** : un bouton « Agrandir la carte » (82 % de la hauteur, liste dessous),
un `Depliant` natif (`<details>`, sans JavaScript au chargement, avec un champ `indice` pour
dire ce que le pli contient), et tout un lot d'août qui avait DÉJÀ resserré cette page au
pixel. Le levier restant était le seul gros bloc encore à l'air libre : la barre de filtres.

**La règle qui décide de la forme** : ce qui est masqué se dit, TOUJOURS. Un filtre actif
derrière un pli fermé fait chercher un bug dans les données. `resumerSeuils` existait et ne
couvre que les quatre seuils — s'en contenter aurait laissé la recherche et les trois bascules
agir invisiblement. D'où `resumerFiltres`, qui dit tout, et dont l'exhaustivité est DÉRIVÉE de
`FILTRES_VIDES` : un filtre ajouté plus tard sans passer par là fait rougir la suite, au lieu
de disparaître derrière le pli.

**Le pli est posé au POINT D'APPEL, pas dans le composant.** `Depliant` porte en commentaire
que la barre est « un élément PERMANENT de l'écran d'ordinateur » et que la replier y serait
une régression sans contrepartie. C'est vrai — sur la LISTE, où la hauteur ne manque pas. Sur
la carte, la contrepartie existe et Marc l'a choisie. Deux surfaces, deux arbitrages, une
seule barre : ça ne tient que si le pli vit chez l'appelant, et un test interdit au pli de
déborder sur la liste.

**« Situer » reste hors du pli** : c'est une ACTION, pas un filtre. Rangée sous un bouton
nommé « Filtres », elle deviendrait introuvable — et son compte rendu avec elle. Le test vise
l'ORDRE (le bouton vient après la fermeture du pli), pas seulement sa présence.

⚠️ **Un cas de test IMPOSSIBLE est resté vert.** Ma table de cas portait `categorie:
"production"` — une catégorie qui n'existe pas dans le type. Les 15 tests passaient : **vitest
ne typecheck pas**, et le cas ne prouvait donc rien de ce qu'il prétendait couvrir. Seul `tsc`,
au gate, l'a vu. La valeur est maintenant dérivée de `CATEGORIES` — comme la liste des champs
est dérivée de `FILTRES_VIDES`. Règle : dans un test dont l'objet est l'EXHAUSTIVITÉ, les
valeurs se dérivent du code autant que la liste des clés, sinon la garde devient une liste à
tenir à la main de plus.

**Prouvé par mutation** : vider l'indice de la recherche et des bascules fait tomber 6 tests ;
déplacer « Situer » dans le pli en fait tomber 1.

---

## 2026-09-15 (tard) — « elle a pas grandi » : libérer de la place au-dessus d'un élément à son PLANCHER ne lui donne rien

**Le retour de Marc, après un lot vert et déployé** : « la carte est trop petite encore, elle
a pas grandi ». Il avait raison.

**Ce que la mesure a montré** (Chromium sans affichage, page reconstituée avec la feuille et
le balisage RÉELS — la page elle-même exige une session et une base) : sur 1366×648, le plan
faisait **337 px avant ET après** le repli de la barre de filtres. Les 170 px libérés étaient
allés au **défilement** de la page (277 → 102 px), pas à la carte.

**La cause** : `.plan-ecran` porte `min-height: 26rem`. Sur un portable, c'est la valeur QUI
S'APPLIQUE — l'élément reçoit déjà plus que ce que la fenêtre laisse, et le surplus devient un
débordement. Dans cet état, tout gain en amont réduit le débordement et **ne change rien à la
hauteur rendue**. La règle générale : **avant de gagner de la place pour un élément, vérifier
s'il est à son plancher.** Si oui, le seul levier est le plancher, et il se paie en défilement.

**Le second défaut, trouvé par la même mesure** : les trois compteurs portaient
`display: inline` depuis le 13/09 pour tenir sur une ligne… et étaient enfants DIRECTS de
`main`, un conteneur flex. La spécification **blockifie les items de flex** : la règle était
inerte, la bande coûtait **102 px au lieu de 54**, et son commentaire affirmait le contraire.
Une règle ignorée ne laisse aucune trace — contrairement à une règle fausse, rien ne la
signale. Le remède est une ENVELOPPE qui sort les éléments du contexte flex. Même piège pour
`float` et `vertical-align`.

**Ce que ça change dans la conduite** : un correctif de mise en page qui « devrait » agrandir
quelque chose se MESURE avant d'être annoncé. Et la mesure reste possible quand la page est
derrière une session : on reconstitue le balisage avec la feuille réelle et on lit les
hauteurs dans un navigateur sans affichage. Ça a pris dix minutes et transformé « ça devrait
marcher » en diagnostic — après un aller-retour complet avec Marc qui, lui, coûtait une demande
répétée.

**Les deux correctifs ne servent pas le même écran**, et c'est à savoir avant d'en retirer un :
sur 1920 le plancher ne mord pas, les +80 px viennent entièrement de la bande ; sur un
portable c'est l'inverse, la bande ne change que le défilement et les +160 px viennent du
plancher.

**Arbitrage assumé** : « je veux pas pouvoir scroll sous la map » (2026-08-21) est révisé.
Sur un portable la promesse n'était déjà plus tenue (102 px de défilement avant ce lot), et la
demande du jour est explicite.

**Verrous** : `tests/carteHauteur.test.ts`. Ils ne mesurent pas des pixels (pas de navigateur
dans la suite) — ils verrouillent les MÉCANISMES : l'enveloppe existe, l'inline vise ses
enfants et non des items flex, le plancher ne redescend pas sous 34rem, et il reste un
plancher plutôt qu'une hauteur imposée. Trois mutations, trois rouges distincts.
