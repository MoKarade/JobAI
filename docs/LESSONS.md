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

---

## 2026-09-15 (fin) — un frein qui compte ce que personne n'a dépensé n'enferme que l'utilisateur

**La question de Marc** : « budget épuisé mais j'ai juste fait 2 recherches, pourquoi ».

**Le compte** : quatre passes de matrice ont réservé 12 éléments chacune — 48 — et toutes ont
été refusées en 403 par Google. Aucune route calculée, aucune facturation, 48 éléments
dépensés au compteur. Les deux clics de Marc ont fait le reste : 50/50.

**Le défaut** : la réservation se fait AVANT l'appel, et son commentaire le justifiait — « un
appel parti est facturé même si sa réponse est illisible ». C'est vrai d'un appel que Google
ACCEPTE. C'est faux d'un 403 : Google refuse la clé à la porte et ne calcule rien. Le
raisonnement était juste, son DOMAINE était trop large.

**Ce qui rend l'incident instructif** : le frein posé pour protéger l'argent a fini par
bloquer la VÉRIFICATION du correctif qui venait de régler ce même 403. Le défaut se paie deux
fois — une fois en budget, une fois en temps de diagnostic.

**La règle** : classer l'échec par ORIGINE avant de le compter. Ce dont on est SÛR qu'il n'a
rien coûté se rend (appel jamais parti, 401/403) ; ce dont on n'est pas sûr reste dépensé
(429 — le quota est justement ce qu'on protège —, 5xx, réponse illisible d'un appel accepté).
Le marqueur est posé par le site qui a VU la réponse, jamais deviné par le compteur : c'est la
même discipline que « le verdict se lit dans la donnée riche, une seule fois ».

**Et le symptôme ne désignait pas le coupable** : « budget épuisé » se lit comme « tu as trop
consommé », alors que Marc n'avait presque rien consommé. Un compteur partagé entre un geste
humain et un travail de fond devrait pouvoir dire QUI a dépensé — sinon la première hypothèse
est toujours la mauvaise, et c'est l'utilisateur qui la porte.

**Verrou** : `tests/budgetRoutes.test.ts`. Il ne peut pas éprouver le compteur lui-même
(`lib/etat.ts` importe Neon directement) : il éprouve la DÉCISION sur le vrai module avec un
`fetch` injecté, et le BRANCHEMENT par scan des deux appelants — dont le fait que le rendu est
SOUS condition, un rendu inconditionnel créditant aussi les 429. Trois mutations, trois rouges
distincts.

---

# Les 153 règles durables, déménagées du `CLAUDE.md` le 2026-09-17

> ⚠️ **Elles ne sont plus chargées à chaque session, et c'est le prix ASSUMÉ de `[CV-11]`.**
> Le `CLAUDE.md` faisait 1 854 lignes pour un plafond assumé de 150, et sa §9 en portait
> **1 536** — 83 % d'un fichier que la session lit en entier avant la première ligne de code.
>
> Ce qui RESTE dans la session : la RÈGLE de chacune, une ligne, dans la §9 du `CLAUDE.md`.
> Ce qui est ici : son HISTOIRE — l'incident, la mesure, le fichier, la date. Une règle sans
> son histoire reste applicable ; une histoire sans sa règle ne l'est pas. C'est dans ce sens-là
> qu'on coupe, et un lien ne remplace pas une règle : il ne descend jamais dans la session
> (le mode de panne du 20/08/2026, écrit dans la §10 du `CLAUDE.md`).
>
> **Le texte ci-dessous est celui de la §9, au caractère près.** Rien n'a été réécrit, rien
> n'a été résumé : une leçon distillée deux fois perd ce qui la rend vérifiable.

> N'ajouter ici que ce qui change la façon de coder.

- **Avant d'écrire un fichier ou d'annoncer une tâche, vérifier qu'elle n'est pas DÉJÀ
  faite.** Vécu 2× en une session : `components/Panneaux.tsx` puis `tests/piiGuard.test.ts`
  ont été ré-écrits de zéro alors qu'ils existaient et étaient committés — seul le refus
  d'écrasement de l'outil l'a évité. Réflexe : `git log --oneline -- <fichier>` et
  `grep <ID-de-tâche>` dans les commits **avant** de coder, pas après.
- **Un document vivant qui décrit un verrou doit nommer le fichier EXACT, et se met à jour
  dans le commit qui livre le verrou.** `CLAUDE.md` a déclaré le garde-fou n°1 « pas encore
  codé » alors que son test était en ligne depuis deux commits, et le nommait
  `tests/pii-guard.test.ts` au lieu de `tests/piiGuard.test.ts`. Une constitution qui
  renvoie à un fichier inexistant n'est pas juste périmée : elle est invérifiable — on ne
  peut pas distinguer « le verrou manque » de « le nom est faux ».
- **Sans PR, la CI ne se regarde pas toute seule : la vérifier fait partie du push.**
  Le gate local a été vert sur quatre commits d'affilée pendant que la CI était ROUGE — et
  personne ne l'a vu, parce qu'il n'y a pas de PR pour afficher un ✗. Sur ce dépôt,
  « poussé » ne veut pas dire « vert ». Le push n'est fini qu'une fois le run consulté.
  ⚠️ **Et Vercel ne bloque PAS sur la CI** : les quatre commits rouges ont été déployés en
  production comme les autres. GitHub Actions et Vercel sont deux chaînes indépendantes —
  « le site marche » ne prouve rien sur l'état de la CI, et réciproquement. Vérifier les
  deux, séparément.
- **Une même règle tenue dans deux langages diverge, et le mauvais exemplaire gagne.**
  Le garde-fou n°1 vivait à la fois dans `tests/piiGuard.test.ts` et dans un `git grep` de
  la CI. Le grep, plus grossier, a fini par bloquer sur la chaîne fabriquée qui PROUVE que
  le test détecte quelque chose — il détectait le détecteur. Et il cachait un second échec
  latent, faute de connaître la convention « un exemple porte un marqueur ». Deux
  implémentations d'une règle, c'est une règle et demie : garder la précise, retirer l'autre.
- **Un garde qui s'exclut d'un dossier entier s'en exclut pour toujours.** `piiGuard`
  ignorait tout `tests/` pour ne pas se détecter lui-même : la bonne exclusion était LUI,
  pas le dossier. Exclure large est le réflexe facile, et il laisse un angle mort permanent
  que rien ne signale.
- **Lire un fichier écrit sous Windows = retirer le BOM, tolérer CRLF.** `Set-Content
  -Encoding utf8` (PowerShell 5.1) et le Bloc-notes écrivent un BOM UTF-8 **par défaut**.
  `process.loadEnvFile` de Node ne le retire pas : la première clé devient
  `\uFEFFDATABASE_URL`, donc `process.env.DATABASE_URL` reste `undefined` — le fichier est
  correct, la variable est introuvable, et rien ne l'explique. On ne demande pas à
  quelqu'un de contourner le comportement par défaut de son système : on lit le fichier
  soi-même. Vaut pour tout fichier de config que Marc édite à la main.
- **Un outil qui échoue en SILENCE est pire qu'un outil qui plante.** `drizzle-kit migrate`
  choisit le pilote `@neondatabase/serverless` dès qu'il est installé ; ce pilote exige un
  websocket qu'il faut configurer soi-même en Node. Sans ça il sort avec le **code 0**, sans
  erreur, **sans avoir créé une seule table** — et on continue en croyant la base à jour.
  Deux règles qui en découlent : (a) un script qui MODIFIE quelque chose doit VÉRIFIER le
  résultat auprès de la source, pas se fier à l'absence d'exception ; (b) « la commande n'a
  rien dit » ne vaut jamais « la commande a réussi ». `npm run db:migrate` passe désormais
  par `scripts/migrer.ts` (pilote HTTP, celui de l'app), qui relit `information_schema` et
  sort en échec si une table manque. Verrouillé par `tests/outillage.test.ts`.
- **Ce que Next.js fait pour toi, les outils en ligne de commande ne le font pas.** Next
  charge `.env.local` ; `drizzle-kit` et les scripts `tsx` tournent HORS de Next et ne le
  chargent pas. `npm run db:migrate` échouait donc sur `url: ''` avec la chaîne dans le
  fichier juste à côté, et l'unique contournement — poser la variable dans le terminal —
  meurt avec la fenêtre et oblige à recoller un SECRET à la main chaque fois. Tout script
  hors Next qui lit une variable d'environnement appelle `chargerEnvLocal()` en première
  ligne. Et un message « valeur manquante » doit dire OÙ la poser, pas seulement qu'elle
  manque.
- **Un message d'erreur FAUX coûte plus cher qu'un message générique.** La page Carte a
  annoncé « la base n'a pas répondu » alors que la base répondait très bien — pour dire que
  la table n'existait pas. Marc est parti vérifier une connexion là où il manquait une
  commande. La cause n'était pas la logique mais sa DUPLICATION : l'accueil classait
  correctement (`42P01` = table absente ≠ panne), la nouvelle page avait été écrite sans
  reprendre cette classification. **Quand tu écris une page qui ressemble à une page
  existante, va CHERCHER ses gardes au lieu de les réécrire** — et si elles sont inline,
  extrais-les d'abord (`lib/panne.ts`). Verrouillé par un test qui interdit à toute page de
  re-comparer le code Postgres dans son coin.
- **Toute date que l'app ÉCRIT se calcule dans le fuseau de Marc, jamais en UTC.**
  Vercel tourne en UTC, Marc vit à UTC−4 : `new Date().toISOString().slice(0, 10)` date du
  LENDEMAIN toute offre ajoutée après 20 h locale. Le format voulu (`AAAA-MM-JJ`) s'obtient
  par `Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU })` — pas en recomposant les
  composants à la main. Et l'instant reste un **paramètre** de la fonction : c'est la seule
  façon de tester le passage de minuit. Vaut pour `dateReperage`, `dateEnvoi`, et toute
  date future que l'app posera elle-même.
- **Un invariant de COMPTAGE additionne des grandeurs de MÊME unité.** Le test « aucune
  offre ne disparaît » additionnait un compte d'OFFRES épinglées à `horsCibles` — un compte
  de NOMS dédupliqués : vacant dès qu'un employeur hors cibles porte deux offres (trouvé par
  la revue, sonde à l'appui). Compter des deux côtés dans la même unité, et préférer
  l'égalité EXACTE au `>=` quand la partition est totale. Sœur, même revue : une résolution
  de géocodeur DANS les bornes régionales n'est pas encore la bonne — la valider par la
  CLASSE du lieu et la DISTANCE au référent attendu, sinon un homonyme d'ailleurs s'inscrit
  « exact » à vie.
- **Un traitement automatique qui RETIRE quelque chose se conçoit à l'envers : d'abord ce
  qu'il n'a pas le droit de toucher.** « Enlève les offres qui ne sont plus dispos » se code
  en trois lignes et détruit le jeu de données. Une offre absente d'un balayage n'est pas
  fermée — le classement de la source suffit à la faire disparaître d'une requête. Trois
  gardes, chacune prouvée par sonde : un SEUIL d'absences consécutives (pas une), une
  RÉSURRECTION automatique (un faux positif ne doit jamais être définitif), et l'exclusion
  de ce que le traitement n'a jamais vu lui-même (les entrées saisies à la main ne relèvent
  pas d'une requête automatique). Sans la troisième, un balayage vide périmait les 29 offres
  d'un coup — mesuré, pas supposé.
- **« Redeploy » rejoue le commit du déploiement existant, PAS le dernier commit.** Vécu le
  2026-07-31 : `CRON_SECRET` posé, redéploiement fait, tout semblait en place — mais la
  production servait encore le commit précédent, et le code de la veille n'était nulle part.
  Le webhook GitHub → Vercel avait manqué le push, et un redéploiement ne le rattrape pas :
  il rejoue le MÊME commit avec les nouvelles variables. Vérifier un déploiement, c'est donc
  comparer le SHA servi au SHA attendu (`latestDeployment` / `githubCommitSha`), jamais se
  fier au fait qu'un déploiement récent existe. Même famille que « CI verte ≠ code en
  production » : le statut d'une opération ne dit pas ce qui tourne.
  ⚠️ **Récidive le 2026-08-12, en pire : AUCUN déploiement créé pour DEUX pushes d'affilée**
  (pas même un déploiement qui rejoue un vieux SHA — zéro entrée dans `list_deployments`).
  Le symptôme ne se lit donc PAS dans les build logs (rien à lire, rien n'a démarré) mais
  dans l'ABSENCE d'entrée récente comparée à l'heure du push (`git show -s --format=%cI`
  vs `createdAt` du dernier déploiement). Remède qui a marché : un nouveau commit RÉEL
  poussé (pas un redeploy depuis le dashboard, qui rejoue l'ancien SHA comme ci-dessus) —
  un nouveau push retente une livraison de webhook.
- **Un revert de conteneur peut effacer un travail non commité EN PLUS DE la plomberie git**
  (voir la leçon voisine sur `.git/config`) : ici, le fichier `lib/travaux.ts` entier avait
  disparu du disque, pas seulement le HEAD local qui pointait 20 commits en arrière. Le test
  décisif n'est pas « `git status` est-il propre » (il l'était — rien à perdre puisque tout
  était déjà reverté) mais « `git rev-parse HEAD` correspond-il à `git ls-remote origin
  main` ». Le correctif est le même que d'habitude (`git fetch` + `checkout -B main
  origin/main`), mais la conséquence change : tout ce qui n'était PAS encore poussé au
  moment du revert est perdu pour de vrai, pas juste temporairement invisible — il faut le
  refaire, pas le récupérer. Confirme le corollaire déjà noté : committer ne protège pas,
  seul un push protège.
- **Le FORMAT d'une erreur dit d'où elle vient.** `{"error":"non_authentifie"}` est le
  middleware ; `{"ok":false,"erreur":"non autorisé"}` est la route. Recevoir le premier là
  où on attend le second prouve que la requête n'atteint jamais la route — donc que le code
  n'est pas déployé, pas que le secret est faux. Distinguer les messages d'erreur par
  couche, c'est se donner un diagnostic gratuit.
- **Quand deux acteurs détiennent chacun la moitié d'un accès, la solution n'est pas de
  compléter l'un — c'est de vérifier que l'accès manquant est nécessaire.** Une Routine a
  Indeed sans le dépôt GitHub ; ma session a le dépôt sans réseau. J'ai d'abord cherché à
  donner le dépôt à la Routine. La vraie question était : les offres doivent-elles passer
  par un commit ? Non — elles vont en base. Un point d'entrée HTTP a fait disparaître le
  blocage au lieu de le contourner. Avant de chercher à élargir une permission, se demander
  si le chemin qui l'exige est le bon.
- **Compter un refus ne suffit pas : il faut le NOMMER.** « 5 écartées » ne se vérifie pas —
  ça ne dit pas si le filtre a bien travaillé ou s'il vient de jeter la meilleure offre du
  jour, et le seul moyen de trancher serait de tout rouvrir à la main : exactement ce que
  l'automatisation doit épargner. Tout rejet automatique porte son motif et son objet. Deux
  façons de compter la même réalité (total et liste) se vérifient l'une l'autre par test.
- **Un flux VALIDE n'est pas un flux UTILE : lire le contenu, pas le format.** Le RSS
  d'Espresso-Jobs répond 200, en XML bien formé, avec 20 entrées — tous les voyants au vert.
  La première s'intitule « TI : peut-on encore se priver des femmes ? » : c'est leur blogue,
  pas leurs offres. Un analyseur qui compte les entrées aurait déclaré la source
  fonctionnelle. Toujours faire remonter un ÉCHANTILLON du contenu jusqu'à l'œil humain —
  c'est la seule vérification qu'aucun code ne remplace.
- **Un HTTP 200 ne prouve rien tant qu'on n'a pas mesuré ce que l'API répond à une question
  ABSURDE.** La découverte de pages carrières annonçait « 36 entreprises trouvées » : c'était
  faux, le code prenait un 200 pour une preuve. Un TÉMOIN NÉGATIF a tranché en une requête —
  on interroge un nom qu'aucune entreprise ne porte : Greenhouse, Lever, Recruitee et
  Workable répondent 404 (leur réponse est donc exploitable), SmartRecruiters répond 200
  (la sienne ne vaut rien sans offres réelles). Avant de croire un signal de présence,
  vérifier ce que la source répond à une ABSENCE.
- **Un identifiant deviné trouve des homonymes, et ils sont crédibles.** `recruitee/ace` et
  `recruitee/robert` ont bien répondu — avec des postes à Amsterdam. Une résolution par nom
  normalisé n'a aucune valeur tant que le CONTENU n'a pas été confronté à ce qu'on attend
  (ici la région) : deux vérifications indépendantes, jamais une seule.
- **Ne jamais laisser tourner une source prouvée morte.** Le flux du Guichet-Emplois répond
  404 sur toutes les adresses testées. Le garder dans la liste active ferait huit requêtes
  vouées à l'échec chaque matin : du bruit dans le rapport, et surtout l'habitude de voir des
  sources en erreur — après quoi une vraie panne ne se remarque plus. Désactiver, avec la
  preuve écrite à côté.
- **Un seuil se pose sur la composante qui MESURE, pas sur le total.** Un plancher sur la
  note globale ne filtrait rien : « Caissier » et « Préposé à l'entretien ménager » notent
  48/100, parce que les points accordés aux INCONNUES (distance non mesurée, salaire non
  affiché, aucune exigence détectée) s'accumulent quel que soit le métier — un poste sans
  aucun rapport part déjà avec 40 points. Avant de fixer un seuil sur une note composite,
  INSTANCIER des cas volontairement hors sujet et regarder ce qu'ils obtiennent ; c'est ce
  qui révèle que seule une composante discrimine vraiment.
- **Une expression composée ne survit pas à l'écriture inclusive.** « Chargé(e) de projets »
  ne correspondait pas à « chargé de projet » : le `(e)` coupe l'expression en deux, et le
  poste tombait de 28 à 8 sur 40. Les mots isolés (« coordonnateur(trice) ») s'en tiraient
  par hasard, la marque tombant après le mot — donc le bug était invisible sur la moitié des
  cas. Au Québec, c'est la forme NORMALE d'une annonce : toute recherche de motif dans un
  titre doit d'abord normaliser (`normaliserTitre`).
- **Supprimer un geste manuel déplace son coût : il faut le borner AVANT de le supprimer.**
  Le bouton « Situer » servait de limiteur de débit humain — Marc cliquait une fois de temps
  en temps. Lancé automatiquement à chaque affichage de la carte, le même code enverrait une
  salve à Nominatim à chaque rechargement, et un service gratuit bannit les appelants
  insistants : le confort aurait coûté la fonctionnalité. Toute automatisation d'un geste
  humain hérite donc d'une contre-pression explicite (ici une passe / 5 min), stockée là où
  toutes les instances la voient — en serverless, une variable de module ne borne rien.
  Défaut sûr en cas d'échec de la borne : ne rien faire.
- **Un travail de fond va APRÈS la réponse, pas dedans.** Une passe de géocodage enchaîne
  des requêtes espacées de 1,1 s ; l'exécuter pendant le rendu ajouterait ces secondes à
  chaque affichage. `after()` (Next 15) la sort du chemin critique : la page s'affiche à sa
  vitesse normale et se complète au passage suivant.
- **Un déclencheur automatique se calibre sur ce qui doit VRAIMENT le réveiller.** L'app se
  synchronise sur une empreinte du contenu du jeu de départ — pas sur un compte d'offres,
  qui ne verrait pas une note corrigée, et surtout pas sur les champs de Marc, sinon chacun
  de ses clics déclencherait une réécriture complète. Le test qui le prouve doit être
  discriminant : ajouter `statut` à l'empreinte doit le faire tomber.
- **Un mécanisme qui ne peut pas atteindre sa source doit le DIRE, pas rendre un résultat
  vide.** L'absence de résultat et l'incapacité de chercher se ressemblent — « aucune
  nouvelle offre » est une phrase vraie sur la forme et fausse sur le fond quand la source
  n'a jamais été interrogée. Tout travail de fond vérifie donc sa source AVANT de conclure,
  et rapporte l'empêchement plutôt qu'un vide trompeur.
- **Un `| grep` masque le code de sortie : ne jamais chaîner un gate derrière lui.**
  `npm run test 2>&1 | grep -E "×|Tests " && echo VERT` affiche « VERT » alors que deux
  tests échouent — c'est `grep` qui a réussi, pas la suite. Vérifié en direct sur ce dépôt.
  Un gate se juge sur l'exit code de CHAQUE commande (`cmd > /dev/null; echo $?`), jamais
  sur la sortie d'un filtre placé après. Même famille que « ne jamais juger un `git push`
  via `| tail` ».
- **Un test qui désigne une donnée par son INDEX se met à tester autre chose en silence.**
  `SEED[30]` visait une candidature de 2025 ; neuf offres insérées plus haut ont décalé
  l'indice, et le test s'est mis à vérifier une offre active — sans rien signaler d'autre
  qu'un échec cryptique. Désigner par PRÉDICAT (`SEED.find(o => o.histo)`) avec une garde
  qui lève si le prédicat ne trouve rien : sinon le jour où il ne trouve plus rien, le test
  passe à vide.
- **Diagnostiquer AVANT de corriger : « trop peu d'offres » n'était pas un bug de carte.**
  Le réflexe était de retoucher l'affichage. Le comptage a montré l'inverse : 23 offres
  vivantes, 23 épinglées, zéro hors cibles — la carte montrait 100 % de ce qu'elle avait.
  Le manque était dans le STOCK, et le remède n'avait rien à voir (alimenter le jeu de
  données). Une plainte sur ce qu'on VOIT ne désigne pas forcément ce qu'il faut CHANGER :
  mesurer d'abord, sinon on « corrige » ce qui marche.
- **Un jeu de données qui change de nature casse les tests qui décrivaient son état — et
  c'est le moment de distinguer la DESCRIPTION de l'INVARIANT.** Ajouter six offres
  automatiques a fait tomber sept tests. Trois comptaient (23 → 29 : à mettre à jour).
  Quatre encodaient des propriétés du seed d'origine — « toute note est manuelle », « toute
  offre a une distance » — vraies par construction tant que tout était saisi à la main.
  Les supprimer aurait ouvert un trou ; les garder aurait forcé à inventer des distances.
  On les REFORMULE en ce qu'ils protègent vraiment (« une note calculée respecte son
  plafond », « une distance PRÉSENTE est plausible ») et on ajoute un **filet de
  majorité** : le jour où l'automatique dominera le manuel, ce sera une décision, pas un
  glissement. Reformuler n'est pas affaiblir — encore faut-il l'écrire dans le test.
- **Une sonde qui tourne dans un état local différent du distant ne prouve rien.**
  L'avertissement « le tag de la version courante existe-t-il ? » a répondu « tag v1.1.0
  présent » — parce que mon clone portait le tag créé lors d'un `git push` REFUSÉ (403).
  Invisible du distant, donc inexistant pour le clone frais d'une CI : la sonde validait
  un garde qui, en vrai, se serait déclenché. Toute vérification d'un mécanisme qui
  tournera ailleurs (CI, autre poste, production) se fait dans SES conditions —
  ici `git ls-remote`, pas `git rev-parse`. Vaut aussi pour l'inverse : un `.env.local`
  présent en local ferait croire qu'un build « ne demande aucun secret ».
- **Un message de commit ne passe jamais par une chaîne interpolée par le shell.**
  Deux mots entre backticks dans un `git commit -m "…"` ont été exécutés comme des
  commandes : le message poussé disait « le gate accepte ␣ comme ␣ ». Bash ne prévient
  pas, et le message est déjà en ligne quand on le relit. Passer par
  `git commit -F - <<'MSG'` (heredoc entre quotes : aucune interpolation) dès qu'un
  message contient des backticks, `$`, ou des guillemets.
- **Ce qui doit bloquer vit dans le gate ; ce qui change sans le code vit à côté.**
  `npm audit` en CI est utile mais devient rouge alors qu'aucune ligne n'a bougé — dans
  le gate, il peint un dépôt sain en rouge et on prend l'habitude du rouge, ce qui est
  exactement comment la CI de ce dépôt a été ignorée quatre commits d'affilée. En job
  séparé (plus un passage hebdomadaire), « gate vert / audit rouge » se lit d'un coup
  d'œil et désigne la vraie cause.
- **Une liste de colonnes recopiée à N endroits perd le champ suivant, et personne ne le
  voit.** `offers.ville` a été ajoutée au schéma, au type et à la lecture — et oubliée dans
  les QUATRE chemins d'insertion, qui recopiaient chacun leur liste. Aucune erreur, aucun
  log : le type porte le champ, la lecture le lit, l'écriture le perd. Quarante offres
  réelles sont entrées en production sans ville, donc sans position, donc sans distance —
  le critère n°1 de Marc, effacé en silence pendant qu'il regardait une carte qui « manquait
  d'offres ». Un `INSERT` recopié est une bombe à retardement dont la mèche est la prochaine
  colonne : une seule copie (`lib/persistance.ts`), et un verrou qui **dérive** la liste
  attendue du schéma plutôt que de la réécrire — sinon il vieillit comme les copies qu'il
  remplace. Corollaire : unifier des colonnes CHANGE un comportement là où une copie
  écrivait moins que les autres (ici `perimeeLe`, que la synchro du seed ne touchait pas et
  qui aurait ressuscité les offres périmées). Lister ces écarts AVANT d'unifier, et les
  nommer dans le code.
- **Une colonne ajoutée à une table dont le traitement SAUTE les entrées déjà présentes est
  une colonne morte pour tout l'existant.** Vécu TROIS FOIS le même jour : `ville` (l'insert
  ne l'écrivait pas), `ville` encore (`empreinteSeed` l'ignorait), puis `adresse` — les deux
  passes de géocodage écartent explicitement ce qui est déjà situé (`!deja.has(nom)`), donc
  toute entreprise géocodée avant l'ajout de la colonne ne serait jamais retentée. Le
  symptôme est toujours le même : ça marche pour les nouvelles entrées, donc les tests
  passent et l'écran a l'air correct, pendant que le stock existant reste vide à vie. La
  règle : **le chemin de rattrapage se livre DANS le même lot que la colonne**, jamais
  « plus tard ». Et la question à se poser en ajoutant un champ : « qu'est-ce qui le
  remplira pour ce qui est DÉJÀ en base ? » — si la réponse est « rien », le lot est
  incomplet.
- **« Cette liste-là sert à autre chose » n'immunise pas contre l'oubli qu'on vient de
  corriger.** En unifiant les quatre listes de colonnes, j'ai écarté une CINQUIÈME liste de
  champs (`empreinteSeed`) au motif qu'elle répond à une autre question — et j'ai écrit ce
  motif dans le message de commit. Elle avait pourtant perdu `ville` exactement pareil : une
  ville corrigée dans le jeu de départ ne changeait pas l'empreinte, donc la synchro
  répondait « à jour » et la correction ne partait jamais en base. Quand on corrige un champ
  oublié, RECENSER toutes les listes qui l'énumèrent — écriture, empreinte, sérialisation,
  export — et vérifier chacune par une sonde, pas par un raisonnement sur sa finalité.
- **Une heuristique peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.**
  En unifiant l'appariement des noms d'employeur, j'ai fait passer une règle de sous-chaîne
  de l'affichage (grouper deux annonces sur une épingle) à l'écriture (choisir la position
  qui donne la distance et la note d'une offre) — dans le fichier même dont l'en-tête
  interdisait ce glissement. Mesuré : `apparier("Robert", "Groupe Robert")` est vrai, donc
  une offre de « Robert » aurait reçu en silence la distance de « Groupe Robert ». Deux
  usages, deux règles : floue pour regrouper un affichage (une erreur se voit), stricte pour
  décider d'une donnée (une erreur s'écrit en base sans bruit). Et quand on unifie deux
  implémentations, se demander laquelle des deux était la PLUS STRICTE — c'est elle qui
  protégeait quelque chose.
- **Un choix qui dépend de l'ordre d'un `SELECT` sans `ORDER BY` est un tirage au sort.**
  Postgres ne garantit aucun ordre sans tri explicite. Un « premier candidat qui apparie »
  change donc d'une requête à l'autre — et se fige en base à la première écriture, ce qui
  le rend indébogable après coup. Trier avant de choisir, et le tester.
- **Un écart « assumé par un commentaire » reste un écart.** Le rattrapage de ville
  n'existait que dans le point de dépôt, et un commentaire disait que le cron ne le faisait
  pas — ce qui laissait la veille quotidienne aveugle au même manque, pour la seule raison
  qu'on avait codé le remède ailleurs. Écrire « c'est voulu » ne rend pas une lacune
  voulue : ou bien le second chemin n'en a réellement pas besoin, et on dit POURQUOI, ou
  bien il en a besoin et le commentaire ne fait que différer le travail. Même chose pour un
  cul-de-sac silencieux : une offre saisie sans ville était insituable À VIE, `ville`
  n'étant modifiable nulle part — une donnée qu'on ne peut ni fournir ni corriger n'est pas
  une limite de produit, c'est un défaut.
- **Un travail de fond a besoin d'un gate qui CONVERGE, pas d'un gate qui a l'air juste.**
  « Cet employeur n'a pas de position » se code en comparant son nom à la table des
  positions — et ne s'éteint jamais quand la position est inscrite sous un autre nom
  (« Laserax » vs « Laserax inc. »). Le bon critère est celui du RÉSULTAT visé (`km === null`
  : la distance est-elle mesurée ?), pas celui du moyen. Corollaire : deux pages qui
  déclenchent le même travail doivent le déclencher sur la MÊME condition, sinon l'une des
  deux boucle.
- **Deux `after()` ne s'exécutent pas l'un après l'autre.** La file de Next est créée sans
  limite de concurrence (mesuré : `p-queue` par défaut = `Infinity`). Deux travaux de fond
  qui respectent chacun leur cadence de 1,1 s produisent donc DEUX flux simultanés vers un
  service qui interdit la concurrence. Un seul `after()`, les travaux `await`és en série —
  et un `try` par travail, sinon l'échec du premier emporte le second.
- **Une plainte sur ce qu'on VOIT ne désigne presque jamais ce qu'il faut CHANGER.**
  « Les offres ne sont pas sur la carte » : le réflexe est la carte, la cause était une
  colonne jamais écrite deux couches plus bas. Déjà vécu avec « trop peu d'offres », qui
  était un manque de STOCK et non d'affichage. Remonter la chaîne complète — écriture,
  lecture, transformation, rendu — avant de toucher la couche qu'on accuse.
- **Un export de données est une surface d'exécution, pas un dump.** Une cellule CSV qui
  commence par `=`, `+`, `-` ou `@` est évaluée à l'ouverture par Excel, LibreOffice et
  Google Sheets. Tout champ de texte libre qui sort de l'app vers un tableur se neutralise
  au point de FORMATAGE (`lib/export.ts`), jamais dans le composant qui télécharge.
- **Retirer ce qui est laid ne produit pas du beau : ça produit du NEUTRE.** L'épure du
  2026-08-05 a retiré les ombres, les contours, les liserés, quatre tuiles sur cinq, et rendu
  l'ambre « rare ». Chaque geste était juste — l'écran d'avant empilait trois signaux qui se
  neutralisaient. Mais rien n'est venu REMPLACER ce qui partait, et le résultat (des
  rectangles blancs sur du gris) a valu « on dirait un logiciel de gestion ». Une épure
  libère la place, elle ne la remplit pas : elle doit être suivie d'un geste POSITIF, sinon
  on a juste soustrait. Corollaire pour toute demande d'apparence : « c'est trop chargé » et
  « c'est plat » sont les deux bouts du même axe, et on les traverse en une seule refonte si
  on ne remplace rien.
- **Une règle d'apparence vraie en CLAIR peut être fausse en SOMBRE — la vérifier sur les
  jetons, pas au jugé.** « Une carte blanche sur un fond gris se détache déjà, la lumière
  suffit » a servi à retirer tous les contours. Mesuré ensuite : l'écart de clarté fond↔carte
  vaut 4 points en sombre et 2,9 en clair. C'était donc insuffisant DANS LES DEUX THÈMES, et
  la règle avait l'air vraie parce qu'on ne l'avait jamais chiffrée. Avant de supprimer un
  séparateur au motif que « le contraste suffit », lire les valeurs.
- **Une maquette de refonte doit partir du code EXISTANT, pas d'une page blanche.** En
  proposant une direction visuelle, j'ai remplacé le dégradé de couleur par note d'un binaire
  ambre/gris — sans voir que `lib/couleurNote.ts` faisait déjà exactement ça, à la demande de
  Marc six jours plus tôt. Il l'a lu comme une nouvelle demande ; c'était une RÉGRESSION que
  je lui présentais. Même réflexe que « vérifier qu'une tâche n'est pas déjà faite », mais
  appliqué au DESIGN : recenser ce que l'écran fait déjà avant de redessiner, sinon on fait
  valider une perte.
- **Un second thème jamais montré à la validation n'est pas une option, c'est une version
  NON VALIDÉE de l'app servie au hasard du réglage système.** La refonte « Poste de nuit »
  a été choisie sur maquette, sa densité réglée au curseur, sa couleur arbitrée écran par
  écran — tout ça sur UNE apparence. L'autre, produite gratuitement par une
  `@media (prefers-color-scheme: light)`, n'a été ni montrée ni réglée. Le jour du
  déploiement Marc a signalé « les couleurs sont pas les mêmes » : son système est en clair,
  il regardait le pendant fade. Ce n'était pas un bug de code, et pourtant c'en était un
  d'expérience. Règle : soit un thème est dessiné, mesuré et validé comme l'autre, soit il
  n'existe pas. Corollaire de plomberie, quand on en retire un : `viewport.themeColor` et
  `manifest.background_color`/`theme_color` sont HORS du CSS — une valeur claire oubliée
  dans le manifeste fait un flash blanc au démarrage de l'app installée, et personne ne
  regarde le manifeste en revoyant une feuille de style.
- **Une lecture de format binaire écrite à la main s'éprouve sur des fichiers TIERS, ou elle
  ment.** J'ai écrit un lecteur de PDF (zlib + opérateurs `Tj`/`TJ`) : raisonnement
  défendable, tests verts, et deux échecs sur les deux premiers PDF réels rencontrés. Le
  pire n'était pas le faux négatif (« c'est un scan » sur un document plein de texte) mais
  le faux POSITIF : **76 784 caractères de binaire d'image annoncés comme un succès**, prêts
  à partir vers un modèle qui en aurait tiré un profil entièrement inventé. Un test écrit
  par l'auteur du parseur valide ses propres hypothèses, pas le format. Règle : soit une
  bibliothèque éprouvée, soit une épreuve sur des fichiers que personne n'a produits pour ce
  test. Et l'échec d'un extracteur doit être **impossible à confondre avec un succès
  maigre** — d'où un seuil de vraisemblance, pas seulement un `try/catch`.
- **Un test qui EXIGE un fichier absent de la CI transforme une dépendance de machine en
  rouge permanent.** J'avais vu le risque (« un test sauté en silence a cessé de protéger »)
  et tranché du mauvais côté : assertion dure ⇒ CI rouge sur autre chose qu'un défaut du
  code. Et committer les fichiers était exclu — l'un montrait du contenu réel du Drive de
  Marc. Le bon geste : **construire les cas** (ils sont lus par une bibliothèque tierce, qui
  refuserait une structure fantaisiste) et garder les fichiers réels en épreuve
  SUPPLÉMENTAIRE, jamais en condition de réussite.
- **Un garde de données personnelles fait des faux positifs, et c'est le garde qui a
  raison.** Les coordonnées d'un rectangle dans un PDF d'épreuve (trois groupes de trois
  chiffres) ont été lues comme un numéro d'assurance sociale. Puis le COMMENTAIRE qui citait
  la valeur fautive a rejoué l'échec — un scan de source ne distingue pas une explication de
  la chose expliquée. On adapte la donnée d'épreuve, jamais le motif : un garde qu'on
  assouplit une fois « parce que c'était un faux positif » ne protège plus rien.
- **Une bibliothèque peut DÉTACHER le tampon qu'on lui passe.** `getDocumentProxy` (pdf.js)
  ramène le `Uint8Array` de l'appelant à 0 octet — mesuré, 124 310 → 0. Comme l'appelant
  stockait le fichier APRÈS l'extraction, la base aurait reçu des CV vides, sans la moindre
  erreur, invisibles jusqu'à la première ré-analyse. Réflexe : quand une fonction tierce
  reçoit un tampon et rend un objet qui « possède » les données, **copier avant** et
  verrouiller par un test qui compare la longueur avant/après.
- **Composer un objet par `{ ...brut, quelquesChamps: netto(…) }` laisse passer TOUT LE
  RESTE.** J'ai nettoyé les coordonnées d'un CV dans un objet… que personne ne lisait, puis
  persisté un étalement de la réponse BRUTE du modèle avec trois champs seulement ré-écrits
  par-dessus. `langues`, `diplomes`, `outils`, `titresOccupes` et la provenance partaient
  donc en base, dans le profil et à l'écran, pendant que le code ET l'interface promettaient
  à Marc le contraire. **Nettoyer d'abord, composer ensuite, champ par champ** : ajouter un
  champ au schéma sans l'ajouter à la composition casse alors le typage, au lieu de laisser
  filer du texte brut en silence. Et le test doit viser **le champ réellement persisté**,
  jamais celui qu'on espérait voir utilisé — c'est la confusion même qui a créé le trou.
- **Un test qui n'éprouve qu'UNE variante d'un motif fait croire que le motif entier est
  couvert.** Mon filtre anti-évasion acceptait `[ \t]` là où il fallait `\s` : une balise
  coupée par un retour à la ligne traversait intacte et refermait le bloc de données. Le
  test « un texte balisé ne peut pas sortir de son bloc » passait — il n'essayait que
  l'espace. Pour un motif à classe de caractères, boucler sur TOUTES les variantes.
- **Le garde PII se déclenchera sur tes FIXTURES et sur tes COMMENTAIRES, et il aura
  raison.** Trois fois dans la même session : des coordonnées de rectangle lues comme un
  NAS, le commentaire qui citait la valeur fautive, puis des adresses et téléphones de test.
  Un scan de source ne distingue ni une illustration ni un faux numéro. Remède : **assembler
  les valeurs sensibles à l'exécution** (`["514","555","1234"].join("-")`) — aucune ligne de
  source ne porte de motif complet, la valeur est entière au runtime, le test reste réel.
- **Le conteneur peut REVERTIR l'arbre de travail en pleine tâche — `origin` est la seule
  vérité.** Vécu le 2026-08-14 : `git log` local remonté de sept commits (jusqu'à
  `[BORNE-02]`), `node_modules` amputé des paquets installés le jour même. Rien n'était
  perdu — `git ls-remote origin main` donnait le bon tip — mais **j'avais commencé à éditer
  la version périmée d'un fichier**, et cette version-là ne connaissait ni les bornes de
  recharge, ni le site, ni le téléphone, ni les horaires : mon édition les aurait toutes
  supprimées, sous couvert d'un « restylage ». Réflexes, dans cet ordre : (1) au moindre
  fichier qui montre du code supprimé récemment, **suspecter le revert AVANT toute
  hypothèse** ; (2) `git ls-remote origin main` — le serveur, jamais le ref local ;
  (3) `git checkout -B main FETCH_HEAD` puis `npm install` ; (4) **jeter les éditions faites
  sur l'ancienne base** au lieu de les rejouer, et refaire le travail sur la bonne.
- **Après un revert, `refs/remotes/origin/main` peut MANQUER alors que le tracking est
  configuré.** La refspec de ce clone ne suit qu'une branche : `git fetch` ne recrée donc pas
  `origin/main`, `@{u}` ne résout plus, et un garde d'arrêt annonce « 173 commits non poussés,
  pas de branche distante » sur un dépôt parfaitement à jour. Ne pas courir après un push
  déjà fait : comparer `git rev-parse HEAD` à `git ls-remote origin main`, puis rétablir le
  ref (`git config --add remote.origin.fetch '+refs/heads/main:refs/remotes/origin/main'`
  puis `git fetch origin`). Un avertissement de garde se VÉRIFIE comme un finding.
- **Une couleur écrite EN DUR ne se plaint jamais d'un changement de thème : elle devient
  fausse, en silence.** Deux valeurs du thème clair ont survécu au passage au sombre dans la
  bulle de la carte — un orange foncé pour une mention, un gris clair pour un filet — sur un
  écran qu'on ne rouvre pas tous les jours. Aucun test ne les voyait. Verrou :
  `tests/styles.test.ts` refuse tout `#rrggbb` dans une RÈGLE (les commentaires citent les
  valeurs retirées, à dessein). Corollaire : quand un écran « ne ressemble pas à la
  maquette », commencer par COMPARER LES JETONS aux hex de la maquette — ici les quatre
  neutres étaient identiques, ce qui a désigné tout de suite la vraie cause.
- **Un travail périodique qui dépend d'un déclencheur UNIQUE meurt en silence.** Le cron
  Vercel de la veille a cessé d'être appelé pendant trois jours ; celui de géocodage, déclaré
  dans le MÊME `vercel.json`, tournait chaque nuit. Rien ne l'a signalé : les offres cessent
  de se rafraîchir, l'app affiche les anciennes, la péremption les éteint une par une. Deux
  règles en sortent : (1) **toute action périodique porte une RÉSERVATION** (`reserverPasse`)
  même quand un seul chemin la déclenche — c'est elle qui rend un second chemin possible plus
  tard sans risque de double exécution ; (2) **un second déclencheur vaut mieux qu'un seul**,
  et le meilleur candidat est celui dont on a la PREUVE qu'il tourne. Le délai de réservation
  se dérive de l'écart entre les déclencheurs (ici 12 h ⇒ 20 h, entre 12 et 24), jamais d'un
  chiffre rond choisi au jugé — et le test le dérive de cet écart, pas de la valeur du jour.
- **Un saut de build se décide contre `HEAD^`, en SUPPOSANT que `HEAD^` a été déployé — et
  cette supposition tombe précisément le jour où un déploiement manque.** Troisième occurrence
  du webhook GitHub non livré (2026-08-14, après le 07-31 et le 08-12) : aucun déploiement créé
  pour `a30409d`, quarante minutes durant. Le piège est dans la suite : `build-necessaire.sh`
  ne regarde que le diff `HEAD^..HEAD`, donc un commit de docs poussé ensuite serait IGNORÉ —
  et le correctif serait resté hors ligne sans qu'aucun voyant ne change. Un mécanisme
  d'économie qui raisonne sur le commit PRÉCÉDENT plutôt que sur le commit DÉPLOYÉ hérite de
  toutes les livraisons manquées. Trois conséquences opératoires : (a) le remède reste un
  nouveau PUSH (un « Redeploy » rejoue le SHA du déploiement existant, ici ANTÉRIEUR au
  correctif) ; (b) un **commit vide** est le véhicule le plus sûr — il ne touche aucun fichier
  et son diff vide tombe dans « aucun fichier lisible » ⇒ `exit 1` ⇒ build LANCÉ, vérifié par
  sonde avant le push, jamais supposé ; (c) après le push, le seul signal valable est le SHA
  du déploiement `READY` comparé au SHA attendu.
- **`deploy_to_vercel` n'est pas « déploie ce dépôt ».** L'outil MCP téléverse un arbre de
  fichiers qu'il faut ÉNUMÉRER (151 fichiers ici) : ce qu'on oublie n'existe pas en production
  — la panne `outputFileTracingIncludes` du 08-12, mais provoquée à la main. Sans jeton ni CLI
  Vercel dans la session, le canal git est le SEUL chemin de déploiement fiable ; le dire au
  lieu de promettre un déploiement direct.
- **Un revert de conteneur RÉCIDIVE dans la même session, et il revient au même point.**
  Deux fois le 2026-08-14, jusqu'à `[BORNE-02]` les deux fois. Le tell de la seconde a été un
  `No such file or directory` sur un fichier lu quinze minutes plus tôt — et le commit que je
  venais de créer s'était posé sur la base périmée. « J'ai déjà vérifié l'arbre tout à l'heure »
  n'est donc PAS un acquis : la vérification se refait avant chaque écriture qui compte
  (`git ls-remote` contre `git rev-parse HEAD`), et ce qui a été fait sur l'ancienne base se
  JETTE. Corollaire déjà noté, re-vécu : le revert casse aussi la `refspec` d'`origin` (réduite
  à une vieille branche de travail), donc le garde d'arrêt annonce des centaines de commits non
  poussés sur un dépôt parfaitement à jour.
- **Un garde qui tombe pendant un refactor a raison : on met à jour sa LISTE, jamais son
  assertion.** En déplaçant la veille vers un module partagé, `tests/persistance.test.ts` a
  refusé le commit — sa liste de chemins d'écriture nommait encore l'ancien fichier. C'est
  exactement son travail : empêcher un chemin d'écriture de sortir de la surveillance à la
  faveur d'un déménagement. Retirer un chemin de cette liste, c'est cesser de le garder.
- **Prouver qu'une extraction est VERBATIM se fait sur les EFFETS, pas sur les lignes.** Un
  diff de 120 lignes déplacées ne se relit pas utilement. Ce qui se vérifie mécaniquement :
  le COMPTE de chaque écriture (`insert`, `update` par table, écritures d'état) et surtout
  leur ORDRE — ici la garantie « les offres d'abord, le journal ensuite » tient à cet ordre.
  Attention aux appels à cheval sur deux lignes : ma première regex rendait 0 des deux côtés
  et « validait » un champ qu'elle ne voyait pas.
- **Un contrôle promis en prose (« il suffira de grep ») ne verrouille rien.** L'ADR-0008
  annonçait « `grep prefers-color-scheme` ne doit rien rendre ». Personne ne lance ce grep :
  le second thème se serait reformé règle par règle sans qu'aucun test ne tombe. Le verrou
  vit dans le même commit que la décision (`tests/styles.test.ts`, discrimination prouvée en
  réintroduisant une media query), et il scanne les RÈGLES en écartant les commentaires —
  sinon il échoue sur le commentaire qui explique pourquoi il existe, et on le retire.
- **Un test « la garde couvre-t-elle X ? » se vérifie en RETIRANT la garde.** En ajoutant une
  page, j'ai voulu confirmer que `routesGardees.test.ts` l'attrapait : il passait toujours
  après suppression du `await auth()` de la page. Il n'était pas fautif — il éprouve la
  décision de la MIDDLEWARE, ce qui est son périmètre. Mais chaque page porte AUSSI une
  revérification que les commentaires appellent « défense en profondeur », promesse vérifiée
  nulle part. L'invariant tenait partout ; il n'était simplement pas protégé, et quelqu'un
  l'aurait un jour supprimé en le croyant décoratif. Réflexe : quand un commentaire annonce
  une SECONDE ligne de défense, chercher le test qui la couvre — s'il n'existe pas, elle
  n'existe qu'en intention.
- **Ajouter un paramètre à une fonction d'un seul argument piège tous les `map(fn)`.**
  `xs.map(scoreDistance)` passe (valeur, INDEX, tableau) : l'index atterrit dans le nouveau
  paramètre. Ici ça LÈVE (un nombre n'a pas de `.paliersDistanceKm`), donc ça se voit ; avec
  un défaut numérique plausible, ça noterait faux en silence. Grep les appels sans
  parenthèses avant d'élargir une signature.
- **Quand une passe fait PLUSIEURS travaux, son déclencheur doit couvrir CHACUN d'eux.**
  Le gate des pages était « une offre n'a pas de distance ». Il se referme au moment précis
  où toutes les distances sont mesurées — donc où les trajets se mettent à marcher — et il
  affamait le rattrapage des adresses et la mesure des bornes, qui vivent dans la MÊME
  passe : il ne restait que le cron nocturne, six entreprises par nuit. Marc l'a décrit
  exactement : « j'ai toujours pas toutes les adresses, POURTANT les trajets Maps
  marchent » — les deux moitiés de la phrase étaient la même cause, et c'est le « pourtant »
  qui la désignait. Un gate calibré sur le premier travail fini affame tous les autres, et
  le symptôme (« ça marche, mais il en manque toujours ») ne pointe jamais vers le gate.
  Corollaire : un gate doit aussi CONVERGER — un travail dont la réponse ne viendra jamais
  (une entreprise qu'OpenStreetMap ne connaît pas) porte un délai de retente, sinon on
  remplace « s'éteint trop tôt » par « ne s'éteint jamais ». Et vérifier qu'il y a du
  travail AVANT de réserver la passe : réserver puis ne rien faire brûle le créneau partagé
  des autres déclencheurs.
- **Un travail de fond qui ne journalise QUE ses échecs est indiagnosticable.** « Tourné
  sans rien produire » et « jamais tourné » laissent tous deux des journaux vides : on ne
  peut pas distinguer un travail qui n'a rien à faire d'un travail affamé, ni d'un travail
  coupé par son budget. Tracer CHAQUE passe, même vide, et compter en X/Y — « 0/0 » dit
  qu'il n'y avait rien à faire, « 0/6 » dit que six candidates ont été écartées, et ce sont
  deux situations opposées. Même exigence que pour les refus d'ingestion : chaque rejet
  porte son motif, parce que trois causes (homonyme écarté, source muette, service
  indisponible) appellent trois corrections différentes.
- **Une amputation de requête se fait passer pour une source vide.** La sonde CKAN portait
  `fl=title,organization,notes`, croyant DEMANDER ces champs ; le paramètre restreint la
  projection Solr et a supprimé de la réponse `organization`, `metadata_modified` et
  `resources` — précisément ce qu'on cherchait. Le rapport affichait « organisme : ? ·
  formats : aucun », et j'allais conclure que la source ne publiait rien. Une API rend son
  objet complet par défaut : on ne l'ampute que si le volume gêne, jamais « pour cibler ».
  Quand une réponse est vide là où on l'attendait pleine, suspecter SA PROPRE requête avant
  la source.
- **Un travail de fond hérite de la durée de vie de sa page — il ne s'y ajoute pas.**
  Le travail lancé par `after()` (Next 15) vit DANS l'invocation de la fonction : croire
  l'inverse est l'erreur de fond qui a tué trois `GET /carte` d'affilée en « Task timed out
  after 30 seconds », sans qu'une seule ligne de trace ne sorte — le processus est tué avant
  d'avoir pu écrire. Deux causes cumulées, dont une bien plus générale : **un budget laissé
  à `null` n'est pas un grand budget, c'est AUCUNE borne**, et ce défaut dort tant que le
  chemin est rare. Corollaire opératoire : deux séries d'appels enchaînées repartent chacune
  à zéro sur le garde-temps ET sur le plafond par passe — une frontière réseau se traverse
  en UNE série, sinon les bornes qu'on croit poser sont doublées en silence.
- **Le coût d'une frontière réseau se dimensionne sur le PIRE CAS, pas sur le cas nominal.**
  Une requête Overpass par entreprise coûte un aller-retour chacune — et quand elle échoue,
  elle coûte le délai × les trois instances de repli. Mesuré : `bornes=2/6 (3 en échec),
  budget restant=0 ms`. Baisser le délai ne réglait rien, c'était traiter le symptôme : la
  bonne question était « pourquoi le coût dépend-il du nombre de lieux ? ». Une requête sur
  la BOÎTE ENGLOBANTE de tout le lot, puis la proximité calculée en local, a rendu `76/76`
  et 27 s de budget. Quand un budget est mangé par des échecs, chercher la requête qui rend
  le coût indépendant du volume avant de rogner les délais.
- **Une déduction écrite au présent dans un commentaire devient un fait pour la prochaine
  session — donc elle se mesure ou elle se dit comme déduction.** J'ai posé un garde
  (« au-delà de 25 correspondances, le résultat serait de toute façon jugé ambigu ») en
  justifiant sa valeur par un raisonnement que je n'avais pas vérifié : il est faux dès
  qu'une seule des candidates est dans la ville attendue, cas que le code sait très bien
  trancher. Le garde jetait donc en SILENCE des résultats résolvables, pour économiser un
  coût que la mesure du jour montrait inexistant (27 s de budget restant). Deux règles :
  un filtre qui peut perdre des résultats DIT quand il mord, et un seuil qu'on n'a pas
  mesuré se place là où il n'est qu'un filet anti-explosion, jamais là où il devient une
  politique.
- **Un délai de retente encode une PRÉMISSE : quand elle tombe, le délai doit tomber avec.**
  « Retenter dans sept jours » était calibré sur une question dont la réponse ne change pas
  (« OpenStreetMap connaît-il cette entreprise ? »). Le jour où l'on acquiert une adresse
  civique, la question CHANGE — et laisser l'horodatage en place ferait attendre une semaine
  à une information déjà en main. C'est la même erreur que `ville` puis `adresse`, une
  troisième fois sous un autre visage : ce n'est pas une colonne qui manque de rattrapage,
  c'est un délai dont la justification vient de disparaître. Se demander, en acquérant une
  donnée : « quel mécanisme, calibré sans elle, devrait être ré-armé maintenant ? »
- **Un service qui ne trouve pas ne dit pas toujours non — il répond à côté, et à côté peut
  passer les contrôles.** Nominatim, faute de trouver une adresse, remonte la rue ou la
  MUNICIPALITÉ. Or la municipalité est à 0 km du centre-ville : elle franchit la validation
  par la distance sans broncher et s'inscrit « exacte » à vie. Ce n'est pas une donnée
  manquante, c'est une donnée fausse qui a l'air juste. Tout élargissement d'une recherche
  exige donc son propre discriminant, au niveau de la chose cherchée : le nom pour une
  entreprise, le NUMÉRO CIVIQUE **et** la voie pour une adresse — le numéro seul apparie
  toutes les rues, la voie seule tous les numéros.
- **Un garde dont la PORTÉE est « ce que git suit » arrive un commit trop tard.**
  `piiGuard` listait `git ls-files` : un fichier NEUF n'y figure pas, et devient visible du
  garde au moment précis où il entre dans l'historique. Résultat mesuré le 2026-08-05 : le
  gate local sincèrement vert avant le commit, la CI ROUGE juste après, et le fichier fautif
  portait douze adresses sous la forme surveillée — déjà en ligne. Un garde qui ne voit une
  faute qu'une fois commise ne protège pas, il constate. La portée juste est « ce qui est en
  ligne ET ce qui est sur le point d'y aller » (`git ls-files` + `--others
  --exclude-standard`, soit exactement ce qu'un `git add -A` emporterait). Question à poser
  à tout test-garde : **existe-t-il un état du dépôt où la faute existe et où le garde ne la
  voit pas ?** Ici c'était l'état le plus courant de tous — juste avant le commit.
- **Un OUTIL DE DIAGNOSTIC qui se tait quand il ne trouve rien ne diagnostique rien.**
  J'ai livré une sonde qui journalisait ses trouvailles et rien d'autre. Résultat en
  production : pas de ligne — donc impossible de distinguer « le registre est muet sur ces
  noms » de « le code n'est pas déployé », qui sont les deux hypothèses opposées qu'elle
  devait départager. C'est la règle des passes de fond (« 0/0 » et « 0/6 » disent des choses
  contraires) appliquée à un outil de mesure : il parle DÈS QU'IL Y A QUELQUE CHOSE À
  CHERCHER, et dit « aucune » quand c'est le cas. Sœur : le même jet annonçait en
  commentaire une recherche « dans les deux sens » alors que le code n'en faisait qu'un —
  une affirmation de commentaire se vérifie comme n'importe quel finding, et celle-ci
  cachait que le lien recherché (« Groupe Mundial » ↔ « MUNDIAL ») n'était atteignable par
  aucun préfixe.
- **Un quota de déploiement est une ressource PARTAGÉE, et pousser à chaque correctif la
  brûle.** Douze commits en deux heures ont produit douze déploiements de production et
  épuisé le quota du compte — qui sert aussi aux cinq autres projets de Marc. Plusieurs de
  ces commits ne touchaient QUE des `.md` et des tests : rien de ce que le site sert. Deux
  changements, l'un de comportement et l'autre de mécanique. (a) Un correctif qui n'est pas
  vérifiable tout de suite attend le suivant : on groupe, on ne pousse pas par réflexe.
  (b) `vercel.json` porte un `ignoreCommand` (`scripts/build-necessaire.sh`) qui saute le
  build quand le diff ne contient que documentation et tests. ⚠️ Sa convention est
  contre-intuitive — **exit 0 IGNORE le build, exit 1 le LANCE** — et l'inverser ne
  produirait pas « un déploiement de trop » : elle les supprimerait TOUS, en silence, la CI
  restant verte pendant que la production se fige sur un commit ancien. D'où la règle du
  script : toute incertitude (historique tronqué, diff illisible, extension inconnue) se
  résout en CONSTRUISANT. La liste des exemptions est FERMÉE, celle de ce qui construit est
  ouverte, et les deux sens de la panne sont prouvés par sonde.
- **Un revert de conteneur n'emporte pas que le travail : il emporte la PLOMBERIE GIT, et
  tous les outils qui s'y fient se mettent à mentir.** Vécu deux fois le 2026-08-05. Le
  premier symptôme est le bon : `git status` annonce « 124 commits non poussés, aucune
  branche distante » alors que le serveur porte exactement le HEAD local. La cause n'est pas
  l'état du dépôt mais celui de `.git/config` : le `refspec` de `origin` avait été réduit à
  une vieille branche de travail, sans `main`, et `refs/remotes/origin/main` avait disparu.
  Sans ce mapping, `git fetch` réussit, la ref est écrite, et git refuse quand même de la
  reconnaître comme branche de suivi — donc `@{u}` n'existe pas et tout compte de « non
  poussés » se fait contre le vide.
  Réflexe en trois temps, dans cet ordre : (1) **le serveur d'abord** — `git ls-remote origin
  <branche>` comparé à `git rev-parse HEAD` tranche en une commande, et c'est la seule
  vérité ; (2) si l'écart est réel, `git merge-base --is-ancestor HEAD FETCH_HEAD` AVANT tout
  `checkout -B`, sinon on détruit du travail local unique ; (3) réparer la plomberie
  (`git config --add remote.origin.fetch '+refs/heads/main:refs/remotes/origin/main'` puis
  `--set-upstream-to`), sans quoi le prochain outil racontera la même histoire.
  Corollaire de comportement : sous un conteneur qui reverte, **committer ne protège plus** —
  seul un push protège. Un lot vert se pousse tout de suite ; c'est aussi ce qui rend
  l'`ignoreCommand` de `vercel.json` payant, puisqu'un lot de docs ou de tests ne coûte alors
  aucun déploiement.

- **Une Routine qui allume une session NEUVE n'hérite de rien : ni des dépôts attachés, ni
  des outils MCP de la session qui l'a créée.** Deux exécutions d'affilée ont fini
  identiquement — gate vert, `git push` refusé 403 — parce que `MoKarade/JobAI` n'est pas
  dans les sources d'une session fraîche, et que la liste d'outils autorisés d'une session
  allumée par un déclencheur ne contient aucun `mcp__*` : elle ne peut donc même pas s'ajouter
  le dépôt elle-même. Deux commits valides sont morts avec leur conteneur.
  ⚠️ **Et j'ai relayé DEUX FOIS à Marc le message d'erreur (« ajoutez le dépôt aux sources »)
  comme si c'était un geste à sa portée, sans vérifier que ce chemin existait de son côté.**
  Un message d'erreur décrit l'état du système, pas toujours une action disponible à
  l'utilisateur : avant de le transmettre comme consigne, vérifier que le geste EXISTE là où
  on l'envoie. C'est la même faute que « CI verte ≠ code en production », appliquée à une
  instruction plutôt qu'à un statut.
  Le correctif n'a pas été d'élargir une permission mais de changer de cible : la Routine
  tire désormais dans la session de développement (`persistent_session_id`), qui a déjà le
  dépôt, Indeed et la recherche web. Corollaire de la leçon « deux acteurs, chacun la moitié
  d'un accès » : avant d'élargir, VÉRIFIER OÙ SONT VRAIMENT LES MOITIÉS — ici la session
  neuve avait le réseau vers l'app (qu'elle a mesuré) et la session de développement ne
  l'a pas (re-mesuré 403 au CONNECT le 11/08), l'inverse de ce que j'avais supposé.
  ⚠️ **MISE À JOUR 2026-08-13 — cette asymétrie n'est plus structurelle, elle était un effet
  de la politique réseau par défaut.** Marc a élargi la politique de l'environnement
  (`Trusted` → `Custom` + `*.hubperso.com`) : une session FRAÎCHEMENT provisionnée joint
  `emploi.hubperso.com` sans problème (mesuré : `curl` direct, 401 propre de
  `/api/hub/summary`, pas une redirection HTML). Mais le réglage vit au niveau de
  l'ENVIRONNEMENT, pas de la session, et ne se relit qu'au (re)provisioning : LA SESSION DE
  DÉVELOPPEMENT ELLE-MÊME (celle liée à la Routine, déjà active au moment du changement) est
  restée bloquée après coup — re-testé le jour même. Donc `curl` direct est de nouveau une
  vérification valide, mais seulement depuis une session ouverte APRÈS le changement de
  politique ; une session ancienne reste un faux négatif jusqu'à son prochain provisioning.
  ⚠️ **Re-mesuré le 2026-08-14 : la session de développement joint désormais la production**
  (`curl https://emploi.hubperso.com/api/hub/summary` ⇒ 401 propre). Les reverts de conteneur
  la re-provisionnent, donc elle a fini par relire la politique élargie. Ce qu'il faut retenir
  n'est pas « c'est débloqué » — ça peut rebasculer — mais que **l'accès réseau d'une session
  se MESURE au moment où l'on en a besoin**, jamais depuis une note écrite la veille : la §9
  affirmait « bloquée » et c'était faux au moment de s'en servir.
- **Un quota d'API partagé ne se mesure qu'en le heurtant, et il se referme en s'aggravant.**
  Indeed a rendu « Rate limit exceeded, try again in 26 s », puis 29, puis 51 après deux
  tentatives — le délai CROÎT à chaque appel refusé. Une boucle de retente serré ne fait donc
  pas qu'échouer : elle repousse le moment où le quota revient. Espacer, attendre le délai
  ANNONCÉ, ne jamais paralléliser. Et un travail de fond qui partage ce quota avec une
  Routine doit supposer qu'il arrive APRÈS elle, pas avant.
  ⚠️ **Le délai annoncé est un PLANCHER, pas une promesse — et « attendre plus » n'est pas
  une stratégie qui converge.** Mesuré le 2026-08-12 sur neuf tentatives espacées, dont une
  après trois minutes de silence TOTAL : 14 s → 42 → 3 → 42 → 23 → 13 → 30 → 12 → 43, et
  **zéro succès**. Le nombre annoncé oscille sans jamais s'éteindre : il dit « pas
  maintenant », il ne dit rien sur « quand ». Respecter chaque délai n'a donc pas suffi, et
  chaque nouvelle tentative ne faisait que confirmer la saturation à un prix. La règle
  opératoire qui manquait : **après trois refus consécutifs malgré l'attente annoncée,
  conclure que la fenêtre est dépensée et ARRÊTER** — le quota est partagé, quelqu'un
  d'autre (Routine, autre session, veille de la veille) l'a consommé, et aucune patience de
  ma part ne le rend. Corollaire pour la veille : ce jour-là il n'y a pas de lot, donc pas
  de fichier — et surtout pas de repli par `WebFetch` sur les pages de liste d'Indeed, qui
  serait du scraping (garde-fou n°4). Un `WebSearch` ne rend que des pages d'agrégat, sans
  employeur ni lien par offre : de quoi fabriquer une structure, pas de quoi la remplir.

- **Lire du texte écrit par un tiers, c'est l'INGÉRER — et un garde de forme ne suffit plus.**
  Tant que la veille ne collectait que des titres, aucune PII ne pouvait entrer. Le jour où
  elle a lu les annonces en entier (2026-08-12, 44 lues), une seule d'entre elles portait le
  nom, le courriel et le LinkedIn PERSONNELS d'un recruteur — et aucun motif existant ne
  l'attrapait : il a fallu que je le voie. Deux règles en découlent. (a) **Élargir ce qu'on
  ingère élargit la surface de PII** : la question à poser en ouvrant un nouveau champ n'est
  pas « ce champ est-il utile ? » mais « qui a écrit ce texte, et qu'y a-t-il mis ? ».
  (b) **Un outil de nettoyage sans garde qui refuse ne protège rien** — une exécution
  automatique oublierait de l'appeler. Le couple est indissociable : `expurgerPII` nettoie,
  `piiGuard` refuse. Corollaire mesuré : un test qui VÉRIFIE des formes de PII en contient
  par nature, et fait donc échouer le garde ; la bonne réponse est le marqueur d'exemple déjà
  conventionné (`estExemple`), **jamais** d'ajouter le fichier aux exclusions — exclure est le
  réflexe facile, et il laisse un angle mort permanent que plus rien ne signale.
- **Un identifiant fourni par une source externe n'est pas forcément un identifiant.**
  Le protocole de la veille disait « dédoublonner par lien ». Mesuré sur 64 offres Indeed :
  le lien capte **zéro** doublon, l'identité (entreprise + titre + ville) en capte **quinze**.
  Indeed forge un jeton de redirection par RÉSULTAT DE RECHERCHE — `get_job_details` rend
  encore un autre lien pour le même `job_id`. Avant de bâtir une déduplication sur un champ,
  vérifier qu'il est STABLE pour la même entité : le demander deux fois et comparer.
  (L'app avait raison depuis le début : `trier()` dédoublonne par `cleDoublon`.)
- **Une liste et son détail se contredisent : c'est le détail qui dit le lieu.** Deux offres
  du 2026-08-12 étaient listées « Quebec City » alors que l'annonce disait « basé à Saguenay »
  pour l'une et « territoire : grande région de Montréal » pour l'autre. Sans lecture, elles
  entraient sur la carte de Québec avec une fausse distance — le critère n°1 de Marc, faux en
  silence. Corriger `ville` d'après l'annonce, jamais d'après l'en-tête de la liste.

- **Un fichier commité n'existe pas en serverless tant que le traceur ne le voit pas — et
  l'absence du chemin doit être une PANNE DITE.** Incident du 2026-08-12, prouvé par les
  traces du build (`route.js.nft.json` : 91 fichiers, zéro dépôt) : le cron lisait
  `data/depot` par `readdir`, invisible au traceur Next, donc ABSENT du bundle de prod.
  Le code rendait ce manque comme « un jour sans dépôt » (`ok:true, offres:[]`) : aucune
  ingestion, et la péremption a mangé 40 offres en 3 jours pendant que tous les voyants
  restaient verts — le « 30 suivies » de Marc. Trois règles : (a) tout accès filesystem à
  l'EXÉCUTION en serverless exige `outputFileTracingIncludes` ; (b) un dossier versionné
  qui manque à l'exécution n'est jamais « l'état normal », c'est un déploiement amputé —
  `ok:false`, nommé ; (c) **un balayage qui n'a rien pu voir ne DÉCIDE rien** : aucune
  source en succès ⇒ compteurs d'absences gelés, suspension dite dans le résumé. La leçon
  « un mécanisme qui ne peut pas atteindre sa source doit le DIRE » ne suffisait pas — il
  faut aussi qu'il s'ABSTIENNE d'agir sur son vide.
- **Un plan écrit d'après un TABLEAU de symptômes se trompe ; il se vérifie contre le CODE
  avant d'être promis.** Le 2026-08-12, l'ADR-0005 a été rédigé à partir d'un tableau de
  notes et d'un compte d'adresses manquantes. Trois de ses conclusions sur quatre n'ont pas
  survécu à la lecture du code — et je les avais annoncées à Marc entre-temps :
  (a) « toutes les offres notent 68 » — vrai sans description, faux dès qu'on lit les
  annonces : treize notes distinctes sur 49 ;
  (b) « le barème récompense l'ignorance » — mesuré, ses défauts sont empiriquement justes ;
  le vrai défaut était un SYNONYME manquant dans une liste de mots (six mots, pas un seuil) ;
  (c) « rien ne mémorise les échecs de recherche d'adresse » — la fiche par employeur, le
  délai de retente, le ré-armement et le signalement des cas non convergents existaient tous.
  Le point commun des trois : j'avais diagnostiqué depuis une SORTIE (une distribution de
  notes, un compte de champs vides) au lieu de la MÉCANIQUE qui la produit. Une sortie dit
  QU'IL Y A un problème, jamais LEQUEL. Avant d'écrire un chantier dans un ADR — et surtout
  avant de l'annoncer — ouvrir le code qui produit le symptôme et nommer la ligne fautive.
  Corollaire vécu : ces réfutations ont fait GAGNER du temps (une table entière non écrite,
  un barème non touché) ; les écrire dans l'ADR vaut mieux que de les taire, sinon la
  prochaine session refera le mauvais chantier avec le même raisonnement.
- **Un plafond « configurable » peut être un LEURRE si un cap interne, plus bas, tronque déjà
  tout ce qui le dépasse.** `[CARTE-03]`, 2026-08-12 : Marc voyait 60 employeurs « sans
  adresse » et je m'apprêtais à monter `MAX_SITUATIONS_CRON` (8→20) pour accélérer le
  raffinage Nominatim. Lire `geocoderSerie` (lib/geocodage.ts) avant de toucher au nombre a
  montré que `MAX_VILLES_PAR_PASSE = 8` tronque DÉJÀ chaque série en interne, quel que soit
  le paramètre reçu — et l'historique (ADR-01, 2026-07-31) confirmait que ce plafond app-level
  avait DÉJÀ été ramené de 12 à 8 pour cette exacte raison (« mon "12" était un leurre »). Le
  commentaire du cron disait pourtant encore « Douze » onze jours plus tard : **un
  commentaire qui reste faux après que la valeur a changé est indiscernable d'un commentaire
  vrai** tant que personne ne recroise le texte et le nombre. Deux règles : (a) avant
  d'agrandir un plafond, chercher s'il existe un cap PLUS BAS, plus profond dans la pile, qui
  le rendrait sans effet — grep le nom de la constante voisine (`MAX_*`, `LIMITE_*`) dans le
  fichier qu'elle appelle ; (b) quand un plafond par-passe est un vrai calcul de sécurité
  (pire cas × nombre de requêtes sous un mur de temps de fonction), le lever exige de
  re-dériver ce calcul pour TOUTES les étapes qui partagent le budget — le levier sûr, qui
  n'y touche pas, est d'ajouter une PASSE (un second cron, à une autre heure) plutôt que
  d'agrandir la passe existante.
- **Un garde « déjà connu, ne pas retoucher » doit distinguer « à jour » de « obsolète depuis
  un événement précis » — sinon il fige une valeur périmée pour toujours.** `[CARTE-03]`,
  2026-08-12, trouvé en vérifiant le tout premier passage réel du 2ᵉ cron (demande de Marc :
  « check maintenant », pas dans 9 h) : les logs serveur disaient `precisees=2/8` (deux
  entreprises venaient d'obtenir leur vraie adresse) mais le JSON rendu disait `mesurees=0` —
  un chiffre qui semblait dire « rien ne s'est passé ». Cause : `planifierDistances` ne
  retouche jamais une offre dont `km` est déjà connu (bon réflexe en général — sinon
  l'affichage bougerait sans raison à chaque passe), mais ce garde ne savait pas distinguer
  « mesurée à la bonne précision » de « mesurée depuis un repli centre-ville que le raffinage
  vient de corriger » : la distance restait celle de la mairie, silencieusement, alors que la
  vraie adresse était en base. Fix : une fonction dédiée (`invaliderDistancesPrecisees`,
  lib/distances.ts) efface la distance des offres dont l'employeur vient d'être précisé
  CETTE passe, avant que le garde ne s'applique — reconnu par la MÊME correspondance que
  partout ailleurs (`memeEmployeur`), jamais une comparaison littérale sur le nom. Règle
  générale : un garde anti-recalcul économise un travail, mais son EXCEPTION doit couvrir
  chaque événement qui rend l'ancien calcul faux — ici, la précision de la position qui
  s'améliore ; l'écrire « ne jamais retoucher » sans lister ces événements, c'est figer un
  bug latent que rien ne signale (le chiffre existe, il n'est juste plus vrai).
  ⚠️ **Corollaire trouvé dans le même incident : un nombre calculé en interne mais jamais
  exposé cache un bug adjacent.** `raffinage.precisees` existait depuis toujours (calculé,
  logué en `console.log`), mais `mesurerDistances` ne le renvoyait pas — le JSON rendu au
  client n'avait donc AUCUN moyen de dire « le raffinage a marché ». Sans les vrais logs
  Vercel (lus à la demande explicite de Marc), j'aurais rapporté « 0 partout » comme un échec
  alors que la mécanique avançait. Un champ calculé qui ne sort pas de la fonction qui le
  produit est une PROMESSE d'observabilité non tenue — l'exposer coûte une ligne, pas exposer
  coûte un diagnostic à l'aveugle la prochaine fois que quelqu'un demande « ça a marché ? ».
- **Un mécanisme demandé peut déjà exister sous un nom qu'on ne cherchait pas.** Marc a
  demandé (2026-08-12) « une recherche web quand Nominatim échoue » — je m'apprêtais à
  construire un appel LLM avant de découvrir que `[LIEU-04]` (2026-08-06) avait DÉJÀ câblé
  une recherche web, côté Routine (elle a l'accès web, l'app n'appelle aucun LLM), avec la
  valeur `adresse_source = "recherche"` déjà dans le schéma et déjà affichée (« trouvée sur
  le web — à confirmer »). Le signal que j'ai failli manquer : un `grep` de la fonctionnalité
  DEMANDÉE (« recherche web ») aurait dû précéder toute conception, pas juste un `grep` du
  fichier que je pensais devoir modifier. Corollaire : **un ADR annulé n'est pas un ADR à
  ignorer.** ADR-0004 (Google Maps complet) a été accepté PUIS annulé le jour même — je l'ai
  lu avant de proposer Google Maps Geocoding (ADR-0007) et j'ai pu montrer en quoi les deux
  ne se contredisent pas (repli étroit et optionnel vs remplacement complet de l'UI). Sans
  cette lecture, j'aurais soit rouvert un débat déjà tranché, soit laissé Marc découvrir la
  contradiction après coup. Réflexe : avant tout nouveau mécanisme, `grep` le CONCEPT (pas
  le nom de fichier supposé) dans le code ET dans `docs/adr/`.
- **`drizzle-kit generate` peut proposer un diff halluciné si l'historique des snapshots a
  un trou.** Les migrations 0012 à 0014 avaient été écrites À LA MAIN (bon réflexe pour des
  changements simples), mais sans jamais lancer `db:generate` — leurs `meta/NNNN_snapshot.json`
  n'existent donc pas. Au premier VRAI `db:generate` depuis (migration 0015), l'outil a
  comparé mon schéma contre son DERNIER snapshot connu (0011) et proposé de RECRÉER deux
  colonnes (`bornes_rapide`/`bornes_tarif`) déjà en production depuis 0012 — un
  `ADD COLUMN` sur une colonne existante aurait fait échouer le déploiement suivant
  (« column already exists »), silencieusement jusqu'au moment où `lib/migrations.ts` le
  tenterait vraiment. Réflexe : **relire CHAQUE ligne d'un SQL généré contre l'historique
  des migrations DÉJÀ APPLIQUÉES**, pas seulement contre le schéma visé — surtout après une
  ou plusieurs migrations écrites à la main sans régénérer les snapshots. Le snapshot le
  plus RÉCENT (celui que `generate` vient de produire) redevient correct pour l'avenir ; ce
  sont les migrations SQL intermédiaires qu'il faut vérifier une à une.

- **`node_modules` PRÉSENT ne veut pas dire PAQUETS présents.** Après un revert, le dossier
  existe et les paquets installés le jour même ont disparu. J'ai vérifié `[ -d node_modules ]`,
  conclu « présent », et lancé le gate : typecheck rouge et quatre tests rouges sur
  `Cannot find module '@anthropic-ai/sdk'` / `unpdf`. Ça RESSEMBLE à un défaut du code qu'on
  vient d'écrire — c'était un `npm install` manquant. La vérification juste porte sur un
  paquet RÉCENT (`node -e "require.resolve('unpdf')"`), jamais sur l'existence du dossier.
- **Une configuration indexée PAR ROUTE ne suit pas un refactor qui PARTAGE du code.**
  `outputFileTracingIncludes` est une table route → fichiers. En sortant la veille dans
  `lib/veilleComplete.ts` pour lui donner un second déclencheur, j'ai créé un SECOND appelant
  (`/api/cron/geocodage`) avec son propre bundle — et sans entrée de traçage. Le chemin de
  reprise aurait donc tourné avec `data/depot` ABSENT : la panne du 2026-08-12 rouverte par la
  porte qu'on venait d'ouvrir, deux jours après l'avoir fermée, et invisible jusqu'au jour où
  la reprise sert vraiment. Tout refactor « je partage ce travail entre deux routes » se
  termine par un balayage des configs indexées par route ; ici la règle est écrite dans le
  fichier, à côté de l'entrée.
- **Un gate ne peut pas être vert dans une session sans egress — et ça se DIT.**
  `next/font/google` télécharge les fontes AU BUILD : `fonts.gstatic.com` hors allowlist ⇒
  build rouge, sans le moindre rapport avec le code. Trois façons de mal réagir : croire à une
  régression, retirer la fonte pour « faire passer », ou annoncer « gate vert » en comptant
  les trois autres. La bonne : annoncer exactement ce qui a tourné (« typecheck, tests et lint
  verts ; build non exécutable ici, hôte bloqué ») et laisser la CI, qui a le réseau, trancher.
- **Les paramètres d'une API se mesurent en les FAISANT VARIER, avant d'écrire un protocole
  autour.** Le protocole de veille prescrivait 24 recherches Indeed (12 termes × 2 villes).
  Mesuré : le paramètre de lieu est INERTE — « Québec » et « Lévis » rendent le même contenu,
  seul le terme discrimine. Douze appels sur vingt-quatre brûlaient un quota partagé pour
  rien. Même méthode, même jour, autre trouvaille : les `job_id` sont des compteurs PAR
  RÉPONSE (`940-942`, puis `943-945` pour la MÊME recherche relancée) — d'où le dédoublonnage
  par identité, jamais par identifiant ni par lien. Relancer avec UN paramètre changé et
  comparer les deux réponses coûte deux appels et corrige un protocole entier.
- **Un connecteur « activé » peut n'exposer AUCUN outil.** `ListConnectors` donnait Indeed
  `enabledInChat: true` — donc actif en apparence — avec `installState: "unknown"` et zéro
  outil chargé. « Activé dans ce chat » décrit une intention de configuration, pas une
  capacité. La capacité se lit dans la liste d'outils réellement disponible ; et la distinction
  compte, parce que l'une se répare en reconnectant (OAuth) et l'autre pas.
- **Une donnée d'entreprise renvoie le SIÈGE SOCIAL, jamais l'établissement local.**
  `get_company_data` (Indeed) rend `addresses: ["Charlotte, NC"]` pour une offre Honeywell à
  Québec, et échoue carrément sur les PME (`Laserax` → « Unknown error »). La brancher sur le
  champ `adresse` automatiserait la faute AMETEK déjà consignée — une donnée fausse qui a
  l'air précise, à 2 500 km, et qui franchirait la validation par la distance. Cet outil sert
  à JUGER un employeur (avis, salaires, taille), jamais à SITUER une offre. Règle générale :
  avant de brancher un champ d'une API sur un champ du modèle, demander « de quelle ENTITÉ
  cette valeur parle-t-elle ? » — l'entreprise et l'établissement ne sont pas la même chose.

- **Un verdict qui recouvre DEUX situations ne peut pas porter UN délai — il porte une
  ÉCHELLE.** `verifierAts` rend `refute` sur une seule constatation (« des offres, aucune
  dans la région »), et cette constatation vaut aussi bien pour un homonyme d'Amsterdam que
  pour le board MONDIAL de la bonne entreprise, un jour sans poste régional. Le délai fixe de
  60 jours était calibré sur la première seule : appliqué à la seconde, il mettait deux mois à
  l'étagère les plus gros employeurs visés. C'est la leçon du « délai qui encode une prémisse »
  d'un cran plus loin : quand la prémisse n'est vraie qu'une fois sur deux, on ne corrige pas
  la valeur, on la fait ESCALADER — court au premier constat, long seulement quand la SÉRIE
  l'a confirmé (et le compteur se remet à zéro dès qu'un autre verdict rompt la série, sinon
  on atteint le palier long par accumulation d'accidents). L'arbitrage se fait sur l'ASYMÉTRIE
  DES COÛTS : une retente inutile coûte une requête, un board mondial oublié coûte deux mois.
- **Un travail trop long pour une fonction serverless se découpe en LOTS que le NAVIGATEUR
  enchaîne, et sa progression se relit de l'état, jamais d'un compteur local.** 180 paires à
  vérifier ne tiennent pas dans 60 s. Un `after()` aurait hérité de la durée de vie de la page
  sans rien afficher ni pouvoir s'arrêter. L'onglet rappelle l'action lot par lot : chaque
  aller-retour reste court, le bouton « Arrêter » agit immédiatement (la boucle est côté
  client), et chaque lot renvoie `faites/total` RELUS de l'état persisté — fermer l'onglet et
  revenir reprend au bon endroit, là où un compteur accumulé afficherait « 0 % » sur un
  balayage à moitié fait. Deux corollaires : la boucle garde sa CONTRE-PRESSION en base (un
  clic répété ou deux onglets martèleraient les services tiers — une variable de module ne
  borne rien en serverless), et le calcul de progression s'extrait en fonction PURE, parce
  qu'une barre fausse ne lève aucune erreur : elle raconte juste une histoire fausse.
- **Une mesure faite depuis une session bloquée par le proxy ne mesure que le proxy.** 180
  essais ATS ont rendu « 180 absent » : `verifierAts` traduit un `fetch` qui lève en `absent`,
  et les cinq hôtes répondaient 403 par la politique réseau de l'environnement. Le chiffre
  avait l'air d'un résultat accablant ; il ne disait rien du monde. Avant de conclure d'une
  série d'échecs identiques, DISCRIMINER l'échec distant de l'empêchement local (ici : un
  `fetch` nu qui montre le code HTTP) — et le dire, plutôt que de laisser un 0/180 s'installer.
- **Dans un fichier `"use server"`, TOUTE fonction async exportée est un point d'entrée HTTP
  anonyme — un `export` n'y est pas un choix de portée, c'est une PUBLICATION.**
  `domicile()` (garde-fou n°1 : les coordonnées du domicile de Marc) vivait dans
  `lib/actions.ts`, privée. En voulant la réutiliser depuis la veille, j'allais lui ajouter
  `export` : un POST anonyme aurait alors rendu ces coordonnées. Aucun test n'aurait bronché —
  la fonction est correcte, c'est le FICHIER qui la publie, et rien dans la ligne qu'on écrit
  ne le rappelle. Ce qui l'a attrapé n'est ni la revue ni un garde, mais le build refusant une
  CONSTANTE exportée du même fichier (« Only async functions are allowed to be exported ») —
  un signal sans rapport avec le vrai danger, arrivé par chance. Règle : tout helper qui touche
  un secret, une coordonnée, une clé ou un service tiers à ménager vit dans un module ORDINAIRE,
  jamais dans un fichier `"use server"` ; la frontière est alors portée par la nature du module
  et non par la vigilance de celui qui l'édite. Et avant d'ajouter un `export` dans un tel
  fichier : se demander « suis-je en train d'ouvrir une route ? ».
- **Une liste blanche est un pari ; quand la question a une réponse MESURABLE, la mesurer.**
  `situer()` acceptait une offre si sa ville figurait dans une liste de ~130 municipalités,
  écrite pour un rayon de 50 km puis rallongée à la main quand il est passé à 75. Elle n'a
  jamais connu que les noms qu'on avait pensé à y mettre : le 2026-08-17, quarante-sept offres
  ont été refusées d'un coup, sans qu'on sache si elles étaient à vingt kilomètres ou à trois
  mille. L'élargir une fois de plus aurait été le même pari, en plus gros — et il aurait fallu
  le refaire au rayon suivant. Or « cette ville est-elle à moins de 75 km ? » se MESURE, et le
  géocodeur qui répond était déjà là, déjà borné. Trois conditions pour que la mesure remplace
  le pari sans coûter l'intake : elle est **bornée** (n noms par passe, budget en ms, sous le
  cap le plus profond de la pile), elle **s'éteint** (un verdict est conservé, une même chaîne
  n'est jamais redemandée — sinon le coût grandit avec le volume et l'étape doit passer en
  aval), et son échec est **un aveu, pas un verdict** (« introuvable » ≠ « hors région », sans
  quoi une panne d'une matinée condamne une ville à vie). Corollaire de dépendance : le seuil
  se DÉRIVE de la constante qui décide déjà (`rayonMaxKm`), sinon on recrée le décalage
  liste/rayon qu'on vient de supprimer.
- **Nommer le refus AVANT de le corriger — et le NOMMER, c'est nommer son OBJET.** La règle
  « compter un refus ne suffit pas » était tenue à moitié : `refusees` portait le motif,
  l'entreprise et le titre, mais pas la VILLE — le seul champ sur lequel les motifs
  géographiques se décident. « 47 lieu inconnu » ne permettait donc de choisir aucun remède :
  quarante-sept « Remote » et quarante-sept municipalités québécoises appellent des corrections
  opposées. Quand un rejet se décide sur un champ, ce champ fait partie du refus. Et un lot de
  refus se rend GROUPÉ et trié par fréquence : une liste de quarante-sept lignes ne se lit pas,
  trois lignes comptées désignent le correctif.

- **Rendre un paramètre RÉGLABLE périme tout ce qui a été décidé sous son ancienne valeur —
  et ce qui sauve la mise, c'est d'avoir stocké la MESURE, pas la conclusion.** En exposant
  le rayon de recherche (`[VEILLE-37]`), le travail visible était un champ et une action ; le
  vrai travail était ailleurs. Chaque verdict du registre des lieux avait été rendu SOUS un
  rayon donné, et ce registre est consulté AVANT toute nouvelle mesure : écrire le nouveau
  nombre sans y toucher aurait laissé « Baie-Comeau, hors région » en place alors qu'elle
  venait d'entrer dans le rayon — jamais revu, aucune erreur, Marc règle son rayon et rien ne
  change. C'est la leçon du « délai qui encode une prémisse » remontée d'un cran : ce n'est
  plus un délai mais un VERDICT qui encode le seuil sous lequel il a été rendu. La question à
  poser en rendant une constante réglable : **qu'est-ce qui, en base, a été décidé avec
  l'ancienne valeur ?** Ici le re-jugement n'a coûté aucune requête, uniquement parce que
  `appliquerJugements` stockait `km` à côté du verdict — un registre qui n'aurait gardé que la
  conclusion aurait exigé de re-géocoder des dizaines de villes à chaque réglage, et le
  réglage n'aurait probablement jamais été livré. Corollaire de conception : quand on met une
  décision en cache, garder la GRANDEUR qui l'a produite, pas seulement son résultat.
  Trois précisions qui se généralisent : re-juger n'est pas re-mesurer (garder l'horodatage
  et le compte d'essais, sinon on rend son palier de retente à un nom qui ne l'a pas gagné) ;
  ce qu'on n'a pas pu mesurer ne se re-juge pas (re-dériver depuis un `km` nul inventerait un
  verdict) ; et un compte de bascules ne se rend jamais seul — « 0 sur 0 » dit qu'il n'y avait
  rien à re-juger, « 0 sur 40 » que le réglage n'a rien libéré, et ce sont deux situations
  opposées que le même « 0 » masquerait.
- **Une source qui lit une FENÊTRE ne peut pas se taire : elle répète l'avant-veille, et le
  silence prend l'apparence d'un résultat.** Le dépôt lit sept jours de lots. Le jour où
  personne ne dépose, il rend quand même ceux d'avant, tout est compté « déjà connue », et
  l'écran affiche « 0 nouvelle » — mot pour mot ce qu'il afficherait un jour sans embauche.
  La règle déjà consignée (« un mécanisme qui ne peut pas atteindre sa source doit le DIRE »)
  ne couvrait pas ce cas : ici la source RÉPOND, elle répond juste avec du vieux. Ce qu'il
  faut donc exposer n'est pas l'échec mais **l'ÂGE de la donnée** — et le déduire de ce que
  la source a réellement lu, jamais d'un second canal qui finirait par dire autre chose.
  Une fenêtre glissante, un cache, un repli sur la dernière valeur connue : les trois ont ce
  défaut, et il ne se voit sur aucun voyant. Corollaire de lecture : un chiffre nul doit être
  QUALIFIÉ par la fraîcheur de ce qui l'a produit — « 0 » sur une donnée fraîche est une
  observation, « 0 » sur une donnée qui rouille est l'absence d'observation, et les deux
  appellent des gestes opposés (attendre, ou aller réparer la chaîne). Deux détails qui se
  généralisent : le seuil d'alerte se place au DEUXIÈME manquement, pas au premier (crier
  tous les matins apprend à ignorer le voyant — c'est ainsi que la CI de ce dépôt a été
  ignorée quatre commits d'affilée) ; et « rien lu du tout » se rend `null`, jamais `0`, qui
  se lirait « à jour » alors qu'on ne sait rien.
- **Chercher un défaut est le meilleur moment pour recenser ce qui reste debout.** Je partais
  corriger la localisation (« 47 lieu inconnu ») ; la sonde sur les 309 offres réelles a rendu
  **7** lieux inconnus, tous légitimes — les 47 venaient d'une source retirée depuis. Le même
  passage a montré que `selectionnerSources` ne rend plus qu'UNE source : ce n'était pas ce
  que je cherchais, et c'était le vrai sujet. Deux conséquences : (a) mesurer AVANT de coder
  évite de « corriger » ce qui marche (déjà consigné, re-vécu) ; (b) le retrait d'un composant
  change la topologie du reste — après avoir supprimé une source, un chemin, un déclencheur,
  RECENSER ce qu'il en reste plutôt que supposer que le reste est inchangé.
- **Une règle de PII écrite dans UNE seule langue laisse l'autre entrer, et le dépôt est
  public.** Le 2026-08-19, une annonce ELEM rédigée en anglais disait « to the attention of
  Ms. … ». `expurgerPII` ne portait AUCUN motif de civilité, et `piiGuard` n'en connaissait
  que les formes FRANÇAISES (`M.|Mme|Monsieur|Madame`) : le nom d'une personne tierce a
  traversé l'outil ET la garde, et il était déjà dans `data/depot/2026-08-18.json` — donc
  lisible du monde entier — depuis la veille. Le couple « l'outil nettoie, la garde refuse »
  ne protège que ce que les DEUX savent nommer ; ici les deux avaient le même angle mort, ce
  qui le rendait invisible. C'est exactement la classe de `[VEILLE-32]` (barème monolingue
  sur un bassin bilingue) transposée à la sécurité : les annonces de la région sont
  bilingues, donc toute liste de mots qui décide quelque chose doit l'être aussi.
  Trois corollaires opératoires. (a) **Corriger l'outil ne nettoie pas ce qui est déjà
  commité** : le rattrapage (re-passer l'expurgateur sur TOUS les dépôts) se livre dans le
  même lot que le motif — sinon on ferme la porte en laissant la fuite dedans. (b) **Un
  commentaire qui cite la valeur fautive la REPUBLIE.** Mon premier jet expliquait le motif
  en recopiant le vrai nom dans `expurger.ts` ; la garde l'a refusé, à raison. Un exemple
  vit dans un test, assemblé à l'exécution, jamais dans une explication. (c) **Un dépôt
  public ne se répare pas par un commit** : le correctif retire la valeur du fichier
  COURANT, pas de l'historique, des forks ni des miroirs. Le dire à Marc au lieu de laisser
  croire que c'est effacé.
- **Un plafond de lecture qu'on s'impose se dit AVEC la liste de ce qu'il a laissé de côté.**
  « 13 annonces lues » ne se vérifie pas ; « 13 lues, 41 déposées sans description, les
  voici » se vérifie. Le protocole l'exigeait déjà pour les lectures ; la même règle vaut
  pour tout tirage (quels termes ? lesquels sautés ?) — deux tirages différents ne mesurent
  pas la même chose, et sans la liste, « 51 offres » d'un jour ne se compare pas à celui
  d'hier.
- **Le gate ne vaut que pour l'arbre qu'il a VU : éditer après l'avoir lancé, c'est ne pas
  l'avoir lancé.** CI rouge le 2026-08-19 sur un dépôt dont le gate local était sincèrement
  vert — parce que j'avais lancé `npm run test`, PUIS édité un ADR, PUIS committé dans le
  même appel. Le fichier fautif n'est jamais passé sous les tests. La règle « gate avant
  chaque commit » se lit donc au sens strict : **la dernière chose avant `git commit` est le
  gate, pas une édition**. Un enchaînement `édition && gate && commit` dans un seul appel est
  sûr ; `gate` puis `édition && commit` ne l'est pas, et rien ne le signale — le gate a
  affiché vert, il disait la vérité sur un arbre qui n'existe plus.
- **Un compte d'octets écrit en tranches de trois EST un numéro d'assurance sociale pour un
  scan de source.** `piiGuard` a fait échouer la CI sur la taille d'un flux citée dans un
  ADR. Le garde a raison : il ne peut pas distinguer une mesure d'une identité. On adapte la
  DONNÉE (écrire en Mo), jamais le motif — un garde assoupli une fois « parce que c'était un
  faux positif » ne protège plus rien. ⚠️ Et la note qui expliquait le correctif a REFAIT
  échouer le garde, parce qu'elle recitait la valeur : troisième occurrence du même piège
  déjà consigné (les coordonnées d'un rectangle PDF, puis le commentaire qui les citait).
  **Décrire la forme, ne jamais l'instancier** — et se relire en se demandant « est-ce que
  mon explication contient la chose que j'explique ? ».
- **Un test de NETTOYAGE ne discrimine que si le nettoyage a encore quelque chose à faire.**
  J'ai écrit « le flux est-il annulé ? » sur un flux d'épreuve qui se refermait tout seul
  après son dernier morceau — or `cancel()` sur un flux déjà clos ne rappelle JAMAIS la
  source : le test passait avec ET sans l'annulation, et il aurait « protégé » zéro. Refait
  sur un flux qui coule encore (le cas réel : le vrai flux fait ~134 Mo et n'est pas fini
  quand on s'arrête), il tombe dès qu'on retire le `finally`. La règle générale : pour un
  test de libération (annulation, fermeture, verrou relâché, minuteur nettoyé), la condition
  d'épreuve n'est pas « l'opération se termine », c'est **« la ressource est encore
  détenue »** — sinon on éprouve un no-op. Et ça se vérifie comme tout le reste : casser le
  code et regarder si le test tombe.
- **Borner la mémoire ne borne PAS le réseau.** Sortir d'une boucle de lecture sans annuler
  le flux laisse les Mo restants continuer d'arriver : le budget qu'on croit avoir respecté
  est dépensé à ne rien lire, et la fonction meurt quand même. Toute lecture bornée d'un gros
  corps se termine par un `cancel()` en `finally` — la borne de mémoire et la borne de
  réseau sont deux gestes, pas un.
- **Quand on ne peut pas LIRE la source, l'analyseur doit RAPPORTER ce qu'il a vu.**
  Le format du flux Guichet vient d'un échantillon tronqué, et la passerelle de session
  refuse l'hôte : les noms de champs sont une hypothèse. Un analyseur qui se contente de
  chercher `title` rendrait « 0 offre » si le champ s'appelle autrement — indiscernable d'un
  marché calme, la panne déjà payée trois jours durant. Un `recenserBalises` qui rapporte les
  noms RÉELLEMENT rencontrés coûte cinq lignes et transforme une hypothèse invisible en
  mesure lisible. Corollaire de séquence : on MESURE depuis une route de diagnostic avant de
  brancher sur la passe quotidienne — brancher d'abord, c'est parier le seul flux qui marche.
- **Un recensement qui rend un ENSEMBLE ne conclut RIEN sur une absence.** J'avais écrit un
  `recenserBalises` qui rendait la LISTE des noms de champs vus sur vingt offres, pour
  corriger mes hypothèses de format. Au premier passage réel, `city` et `state` n'y étaient
  pas — et j'ai failli en conclure que le flux du Guichet n'a pas de ville. **Il en a une** :
  les offres retenues portaient « Québec » et « Lévis ». Un ensemble sur un petit échantillon
  ne distingue pas « ce champ n'existe pas dans le format » de « ces offres-là ne l'avaient
  pas » : les deux rendent la même absence, et l'une des deux conclusions est fausse. Un
  COMPTE tranche (`city: 0` ≠ `city: 1987`), à condition de dire aussi la taille de
  l'échantillon — « city: 12 » ne se lit pas sans savoir si on en a vu 12 ou 2000. Et la
  vraie force vient de la **mesure jumelle** : compter ce que la source ÉCRIT (les balises)
  et ce que mon code en TIRE (les champs non vides) mesure la même chose par deux chemins —
  l'écart entre les deux désigne le défaut sans qu'on ait à deviner de quel côté il est.
- **Un plafond atteint transforme toutes les mesures d'une passe en PRÉFIXES.** La même
  lecture s'est arrêtée sur `plafond-retenues` à ~42 % du flux : le total d'offres
  régionales, la liste des villes inconnues et le recensement n'étaient plus des mesures,
  seulement le début d'une. Le rapport le disait (`fin`), et j'ai quand même failli lire ces
  comptes comme des résultats. Réflexe : **avant d'interpréter le moindre chiffre d'un
  rapport borné, lire son motif d'arrêt** — et ne rien conclure tant qu'il n'est pas
  « terminé ». Corollaire de dimensionnement : un plafond se calibre sur le DÉBIT MESURÉ, pas
  sur une prudence a priori (ici ~25 Mo/s : lire le flux entier coûtait quelques secondes,
  et le plafond prudent coûtait la conclusion).
- **Une entité HTML non décodée ne casse rien — elle fait juste disparaître des données.**
  `texteSimple` décodait `&nbsp; &amp; &lt; &gt; &quot; &#39;` mais pas **`&apos;`**, que le
  flux du Guichet écrit. Non décodée, elle survit à `normaliserLieu` (« val-d&apos or ») et
  ne peut plus matcher aucune entrée des listes de lieux : mesuré, `L'Islet` et
  `Saint-Pierre-de-l'Île-d'Orléans` — DEUX villes de la région — tombaient en « lieu
  inconnu », sans erreur ni trace. Et `L'Ancienne-Lorette` passait **par accident** (la liste
  porte aussi la forme sans article), ce qui masquait le défaut : un faux positif qui cache
  un faux négatif est le pire des deux. Règles : une table de décodage se veut COMPLÈTE
  (entités nommées usuelles + numériques décimales et hexadécimales), `&amp;` se décode **en
  dernier** (sinon `&amp;lt;` devient `<`, un décodage de trop), et un point de code invalide
  laisse l'entité telle quelle plutôt que de lever — un flux mal formé n'est pas une raison
  de perdre l'annonce entière.
- **Le VOLUME d'une source n'est pas sa VALEUR, et ça se regarde avant de brancher.**
  Le flux du Guichet porte des dizaines de milliers d'offres — et l'échantillon retenu
  donne *sod layer*, *car washer*, *hairstylist*, *labourer*. Une source qui rend mille
  offres dont aucune ne concerne le profil est un bruit coûteux (mesures Nominatim, place
  dans la file, péremption à gérer), pas une trouvaille. Regarder l'ÉCHANTILLON avant de
  se réjouir du compte. Corollaire mesuré ici : ses titres sont en ANGLAIS et ses
  descriptions bilingues — la brancher avant `[VEILLE-32]`/`[VEILLE-34]` (vocabulaire de
  notation monolingue) noterait tout à zéro, et on conclurait que la source ne vaut rien
  alors que c'est le barème qui ne sait pas la lire.
- **Savoir qu'un champ EXISTE ne dit rien de ce qu'il PORTE.** Suite directe de la leçon
  précédente, d'un cran plus loin : après avoir corrigé un recensement qui rendait un
  ensemble, j'ai obtenu que `noc2021`, `salary` et `postalcode` sont présents sur 100 % des
  offres du flux — et j'ai failli en déduire un plan de filtrage. Or un champ toujours
  présent peut porter un code, un libellé, ou une chaîne vide déguisée : un filtre bâti sur
  une valeur SUPPOSÉE se trompe en silence, exactement comme un pré-filtre. On compte donc
  les VALEURS (par classe, parce qu'une cardinalité brute ne s'interprète pas — dix mille
  salaires distincts n'apprennent rien, six classes décident) avant de s'en servir. Corollaire
  de bornage : un inventaire de valeurs se borne en nombre de classes, et la borne ne doit
  rendre le compte qu'INCOMPLET, jamais FAUX — une classe déjà connue continue de se compter,
  seules les NOUVELLES tombent dans « (autres) », et « (autres) » se dit.
- **Une liste blanche qui compare par SOUS-CHAÎNE ne s'étend pas par simple ajout : un nom
  court avale ses composés.** Mesuré en préparant l'exclusion des arrondissements montréalais :
  ajouter `saint-laurent` à `HORS_PORTEE` aurait aussi exclu `Saint-Laurent-de-l'Île-d'Orléans`,
  qui est DANS la région — et comme `HORS_PORTEE` est consulté en PREMIER, l'exclusion aurait
  gagné. Avant d'ajouter une entrée à une liste consultée par `includes`, vérifier qu'aucune
  entrée existante ne la CONTIENT ni n'est CONTENUE par elle. Et quand une donnée sans
  homonyme existe dans la source (ici le code postal), elle vaut mieux qu'une liste de noms,
  quelle que soit la qualité de la liste.
- **Le VOLUME d'une source est une question de TRI, pas de branchement.** Le flux du Guichet
  rend 1 300 offres régionales par passe, là où le suivi en porte quelques dizaines. Le
  réflexe « la source marche, on la branche » noierait l'écran sous des postes que Marc ne
  veut pas. Une source abondante ne se branche qu'avec le critère qui la trie — et ce critère
  se choisit sur des valeurs MESURÉES, pas sur l'enthousiasme du volume.
- **Un échantillon décrit la population dont il est TIRÉ, jamais celle qui t'intéresse — et
  c'est la troisième fois en une session.** Mon inventaire de valeurs portait sur les deux
  mille premières offres d'un flux national : `state` y donnait BC 561, ON 480, AB 393 et
  seulement **QC 223**. Toutes ses distributions décrivaient donc le Canada — « English
  1726 », des codes postaux de Surrey et Calgary — alors que la question était « à quoi
  ressemblent les offres RÉGIONALES qu'on ingérerait ? ». Les trois instances du jour ont la
  même forme : recensement sur les 20 premières offres, comptes lus sur une passe arrêtée à
  42 %, inventaire sur un préfixe national. Le réflexe qui les attrape toutes : **nommer la
  population dans le nom du champ** (`inventaireVues` vs `inventaireRetenues`), pour qu'on ne
  puisse plus lire l'un pour l'autre sans s'en apercevoir. Et quand deux populations
  coexistent, les mesurer TOUTES LES DEUX : c'est l'écart entre elles qui révèle le biais.
- **Un gabarit de texte servi par une source tierce n'est pas stable, même à quelques minutes
  d'intervalle.** Entre deux appels, le Guichet a basculé les libellés de ses descriptions du
  français à l'anglais (« Durée de l'emploi » → « Work Term ») : chaque description a
  raccourci de 44 à 49 caractères, uniformément. Rien n'a cassé parce qu'on ne parse pas ces
  libellés — mais tout code qui extrairait un fait du TEXTE d'une annonce aurait changé de
  résultat sans qu'une ligne bouge chez nous. Quand une source expose un champ DÉDIÉ (ici
  `education`, `experience`, `workterm`, énumérations propres), le lire plutôt que d'extraire
  la même information de sa prose.
- **Un module qui documente CE QUI LE PROTÈGE devient FAUX quand on change les conditions —
  et c'est lui qu'il faut relire AVANT d'ajouter la fonctionnalité, pas après.** En écrivant
  l'ADR du connecteur MCP, j'allais annoncer « le texte des annonces passe par
  `sanitizePromptText`, donc l'injection est couverte ». En ouvrant le module pour le citer,
  j'ai lu son propre en-tête : ce qui rendait une injection SANS CONSÉQUENCE n'était pas lui,
  c'étaient deux règles — « le modèle ne fait que proposer » et « aucun outil ne lui est
  exposé : il ne peut rien écrire ». **Un connecteur qui écrit casse les deux**, et
  l'assainissement ne comble pas l'écart : il neutralise ce qui fait FRONTIÈRE (balises de
  rôle, délimiteurs), jamais ce qui fait SENS — une consigne en langage naturel dans un nom
  d'employeur traverse intacte, par conception. Trois règles en sortent. (a) Avant d'ajouter
  une capacité, relire les modules de sécurité qu'on croit réutiliser et vérifier que LEURS
  PRÉMISSES tiennent encore. (b) Quand une prémisse tombe, l'écrire DANS le module concerné
  dans le même commit — une doc qui affirme une chose fausse est pire qu'une doc absente, et
  la prochaine session la croira. (c) Quand le contrôle qui protégeait disparaît, dire ce qui
  le remplace : ici ce n'est plus l'assainissement mais la SURFACE (quatre champs, jamais les
  calculs du moteur, aucune suppression, aucun outil sortant, avant/après rendu) — un risque
  assumé se borne et se nomme, il ne se tait pas.
- **Une exception à un garde-fou non négociable se livre avec ses CONDITIONS, jamais seule.**
  Marc a autorisé l'écriture depuis une conversation, ce que le garde-fou n°2 interdisait
  explicitement (« Exception : aucune »). Une exception écrite « Marc a dit oui » avale la
  règle au premier chantier suivant. Écrite en quatre conditions vérifiables — elle ne couvre
  que ce que Marc demande, tout passe par le module écrivain unique, l'avant/après remplace
  l'écran qu'il n'a plus sous les yeux, le moteur garde ses calculs — elle reste une exception.
  Et chaque condition porte son verrou : un test de frontière qui interdit au connecteur
  d'atteindre la base est ce qui empêche la condition n°2 de se dissoudre en intention.
- **Zod STRIPPE les clés inconnues : un test qui croit éprouver un REJET éprouve peut-être un
  silence.** Mon test « refuse un champ hors du domaine de Marc » passait — mais
  `MiseAJourOffreSchema.parse({ score: 100 })` ne lève pas, il rend `{}` : le refus observé
  venait de la garde « aucun champ à modifier », pas d'un rejet. Le nom du test mentait sur le
  mécanisme, et il aurait continué de passer si le stripping avait disparu. Deux règles :
  **mesurer ce que le schéma FAIT** (`safeParse` sur un cas mixte) avant d'écrire ce qu'un
  test prouve, et éprouver le cas qui compte — ici une demande MIXTE (`{priorite, score}`) où
  l'un doit bouger et l'autre pas, jamais un cas dégénéré qui tombe dans une autre garde.
- **Une règle qui ne vit que dans un document se reperd — il lui faut un test-scan.**
  « Toute date que l'app ÉCRIT se calcule dans le fuseau de Marc » est dans ce fichier depuis
  des mois. Deux chemins d'écriture y échappaient quand même : la date d'envoi posée par
  `modifierOffre` et la date de modification du profil de CV, toutes deux en
  `new Date().toISOString()`. Mesuré : un CV marqué envoyé à 20 h 30 le 19 août était
  enregistré au 20. Et le second site n'a été trouvé qu'en GREPANT LA CLASSE après avoir
  corrigé le premier — corriger un site sans recenser ses voisins est une faute déjà payée
  trois fois ici (`ville`, `adresse`, les quatre listes de colonnes). Le garde doit
  DISCRIMINER : `new Date().toISOString()` (une horloge fraîche, interdite) n'est pas
  `new Date(t).toISOString()` (une date que la SOURCE a donnée, légitime) — un motif trop
  large ferait tomber les conversions honnêtes, et on prendrait l'habitude de le contourner.
- **Éprouver un serveur par son PROTOCOLE, pas par ses handlers.** Appeler directement le
  handler d'un outil MCP contourne tout ce que le SDK fait autour : validation des schémas,
  forme des réponses, liste des outils exposés. On teste alors sa propre fonction, pas ce que
  le client verra — et la liste des outils EST le contrat public, puisqu'un outil ajouté sans
  décision devient appelable par un modèle. Le transport en mémoire du SDK rend le vrai
  chemin testable sans réseau ; c'est lui qui a montré qu'un `readOnlyHint` omis fait passer
  une écriture pour anodine.
- **Une liste écrite à la main devient fausse au chantier suivant — et deux d'entre elles
  l'étaient déjà.** En ajoutant trois tables, j'ai fait DÉRIVER du schéma la liste que le
  script de migration vérifie après coup. Elle nommait **trois tables sur onze** : les huit
  autres étaient créées par la migration puis jamais contrôlées, donc une migration à moitié
  appliquée serait sortie en SUCCÈS — exactement la panne que ce script existe pour empêcher,
  rouverte par la liste censée la fermer. Le test voisin (`db.test.ts`) annonçait « les huit
  tables attendues » et se trompait aussi. C'est la cinquième instance de la même classe sur
  ce dépôt (quatre listes de colonnes, l'empreinte du seed, ces deux-ci). La règle : dès
  qu'une liste ÉNUMÈRE ce qu'une autre source déclare, la dériver — et si la dériver est
  impossible, le test qui la garde doit la dériver, LUI. C'est en faisant dériver côté test
  que les deux dérives ont été trouvées, pas en relisant.
- **Un contrôle de sécurité se teste avec les chaînes d'attaque EXACTES, pas avec des cas
  plausibles.** `jugerRedirectUri` est protégé par deux chaînes nommément :
  `http://127.0.0.1.evil.com/cb` (un sous-domaine — l'hôte réel est evil.com) et
  `http://127.0.0.1@evil.com/cb` (la partie userinfo — l'hôte réel est evil.com aussi). Ce
  sont celles qui ont traversé le `startsWith` de FinanceAI. Un test écrit sur des cas
  « raisonnables » (une URL http quelconque, un schéma bizarre) passe avec l'implémentation
  vulnérable : je l'ai vérifié en la réintroduisant. La preuve d'un garde de sécurité, c'est
  qu'il tombe sur le code qu'on sait cassé — pas qu'il passe sur celui qu'on croit bon.
- **Une garantie d'unicité vit dans l'ÉCRITURE, jamais dans une lecture qui la précède.**
  « Ce code n'a pas encore servi » vérifié par un `SELECT` puis appliqué par un `UPDATE`
  laisse une fenêtre où deux requêtes lisent la même chose et gagnent toutes les deux —
  mesuré sur une vraie Postgres : le motif naïf produit deux gagnants, le motif
  `UPDATE … WHERE consomme_le IS NULL RETURNING` un seul. Vaut pour tout usage unique : code
  d'autorisation, rotation de jeton, réservation de passe. Et ça se prouve par un test de
  COURSE (`Promise.all` de deux consommations), jamais par deux appels en séquence — le
  séquentiel passe avec les deux implémentations.
- **Un automatisme « pour ne plus jamais y penser » ne s'applique QUE là où quelqu'un l'a
  appelé — donc tout module qui ajoute des tables en hérite.** L'app applique ses migrations
  seule depuis juillet (demande de Marc). Mes routes OAuth ne le demandaient pas : en
  production, un enregistrement légitime rendait **500 sans corps** parce que les trois
  tables n'existaient pas encore. Rien dans le code ne rappelle cette obligation, et aucun
  test ne pouvait la voir — la suite tourne sur PGlite, où les migrations sont appliquées par
  le harnais. Réflexe : en ajoutant une table, grep qui appelle `assurerMigrations` et se
  demander si le nouveau chemin d'entrée y passe. Et corollaire déjà écrit ici, re-vécu : un
  500 muet est le pire des messages — les trois routes classent maintenant la panne
  (`schema-absent` ≠ `base-injoignable`), parce que ces deux causes appellent des gestes
  opposés et que les confondre envoie chercher au mauvais endroit.
- **Sur un endpoint authentifié, une PANNE n'est pas un REFUS.** Rendre 401 quand la base ne
  répond pas ferait croire au client que son jeton est mauvais : il le jette, redemande une
  connexion, et recommence — en boucle, pendant que le vrai problème est ailleurs. Un 503
  nommé se distingue et se corrige. À l'inverse, les refus d'authentification entre eux
  doivent rester INDISCERNABLES (jeton absent, invalide, expiré, compte non autorisé) : les
  distinguer en ferait un oracle.
- **Quand je demande la même mesure une quatrième fois, le problème n'est plus la mesure :
  c'est que je n'ai pas d'accès.** Marc a collé quatre fois le JSON d'un diagnostic parce que
  la passerelle de session refuse `jobbank.gc.ca` (403, mesuré) et que la route de diagnostic
  exige une session que je n'ai pas (401 `non_authentifie`, le format de la middleware).
  La bonne réponse n'était pas de mieux demander, c'était d'ouvrir un canal : le diagnostic
  est devenu un outil MCP en lecture seule. Réflexe général : un aller-retour humain qui se
  répète est un défaut d'outillage, pas une fatalité — et le canal existait déjà, il fallait
  juste y brancher la mesure.
- **Un réglage qui exige une session Claude n'est pas un réglage — c'est une dépendance, et
  elle se supprime en livrant l'ÉCRAN, pas la donnée.** Le choix des codes de profession
  retenus tenait dans une liste de deux caractères par entrée : j'aurais pu l'écrire en dur
  en trente secondes. Mais Marc aurait dû me redemander à chaque correction, et surtout me
  redemander de LANCER la mesure — le tableau code/compte/titres n'existait que dans un JSON
  de plusieurs centaines de lignes que seule une session pouvait déclencher et lire. Le
  travail utile n'était donc pas de choisir : c'était de rendre le choix faisable sans moi
  (bouton de mesure, tableau, cases à cocher). Même leçon que le rayon, un cran plus loin :
  là on avait sorti une CONSTANTE du code, ici on sort une MESURE. Corollaire de forme : un
  tableau de décision montre le compte ET l'objet (« 65200 : 402 — Cook, Kitchen helper »),
  jamais le compte seul, qui exige de connaître la nomenclature par cœur. Et un piège de
  saisie vu à la première relecture : un champ texte dont la valeur affichée se DÉRIVE d'un
  état normalisé mange les frappes intermédiaires (taper « 21301 » perd les caractères qui
  ne font ni deux ni cinq chiffres) — la source de vérité est la SAISIE, les codes valides
  s'en dérivent, jamais l'inverse.

- **Un `\b` placé après une alternation dont une branche finit par un POINT ne matche
  jamais — et la branche est morte en silence.** Mesuré le 2026-08-20 sur une vraie annonce
  portant un numéro civique suivi de l'abréviation `Av.` : le motif d'adresse civique
  d'`expurgerPII` se terminait par
  `\b`, or entre le `.` de `av.` et l'espace qui suit, les deux caractères sont des non-mots
  — donc aucune frontière, donc aucun match. Les graphies `av.` et `ch.` ne retiraient RIEN
  depuis toujours ; `boul.` survivait par accident (son `?` la ramène à `boul`, qui finit par
  une lettre), ce qui masquait le défaut sur un troisième cas. Le remède est
  `(?![\p{L}\d])` : il accepte une fin de graphie ponctuée tout en gardant la
  discrimination (« 12 ruelles » n'est pas une adresse). ⚠️ **Ce qui rend la leçon générale,
  c'est COMMENT le défaut est apparu** : pas par une relecture, mais parce que `piiGuard` a
  bloqué le gate sur une adresse que l'outil venait de laisser passer. Le couple
  « l'outil nettoie, la garde refuse » ne protège que si les deux nomment la MÊME chose —
  quand ils divergent, la garde devient un mur qu'on finit par contourner au lieu de
  corriger l'outil. Corollaire déjà consigné et re-vécu : un motif à alternation se teste sur
  TOUTES ses branches, jamais sur une seule variante.

- **Une doc qui déduit une conclusion d'un fait devient FAUSSE en silence quand le fait
  change — et la conclusion, elle, avait des conséquences.** Le README affirmait « aucun
  appel LLM dans l'app » et en TIRAIT que l'absence de bloc `usage` au contrat du hub était
  honnête. Le module CV a introduit un appel Anthropic ; personne n'est allé relire la
  déduction. Résultat : pendant des semaines, l'absence de bloc n'était plus un aveu mais un
  TROU, et le total « Coûts & quotas » du hub ignorait ce que JobAI dépense — sans qu'aucun
  voyant ne change, puisque « non suivie » et « ne suit pas encore » s'affichent pareil.
  Réflexe : en ajoutant une CAPACITÉ (un appel payant, une écriture, un scope), grep la doc
  pour les phrases qui affirment son ABSENCE — ce sont elles qui portent des conclusions.
  Corollaires du correctif, chacun payé ailleurs dans ce dépôt : (a) un champ absent d'un
  relevé vaut `0`, jamais `undefined` — `undefined + nombre` donne `NaN` et **un seul `NaN`
  empoisonne TOUT le cumul**, pas seulement l'appel concerné ; (b) une donnée illisible se
  COMPTE (« le montant sous-estime de N appels ») au lieu de se rabattre sur zéro — un cumul
  discrètement amputé est pire qu'une erreur visible, il se présente comme une mesure ; (c) la
  lecture d'un compteur d'argent ne passe pas par un helper dont le `catch` rend le défaut
  (`lireEtat`), sinon un JSON corrompu repart de zéro et publie un cumul amputé ; (d) la
  comptabilité vit AU SITE D'APPEL, pas chez ses appelants — deux appelants, c'est déjà « un
  outil qu'on peut oublier d'appeler » ; (e) elle se pose AVANT les validations de la réponse,
  parce que l'appel est facturé même quand le schéma refuse ensuite.
- **Deux populations sans instrument commun : mesurer chacune dans SON unité, conclure sur
  les ORDRES DE GRANDEUR ABSOLUS.** « Le flux du Guichet peut-il remplacer le dépôt de la
  Routine ? » n'avait pas de réponse comparable : le dépôt se mesure au barème (vocabulaire
  français, titres français), le flux se mesure par sa distribution NOC (titres anglais, que
  le barème rendrait « hors sujet » quel que soit leur mérite). Mettre les deux chiffres
  côte à côte — 64 % contre 3,5 % — aurait été une comparaison FABRIQUÉE : le second n'est
  pas le même pourcentage de la même chose. La sortie n'est pas de renoncer, c'est de faire
  porter la conclusion par ce qui NE dépend pas de l'instrument : le VOLUME absolu (45
  offres du bon domaine par passe) et des titres réels lisibles sans outil (*cook*, *car
  washer*, *sod layer*). ⚠️ Et il faut le DIRE dans la conclusion, pas seulement le savoir :
  écrire « ces deux pourcentages ne sont pas mesurés au même instrument, voici ce sur quoi
  la réponse repose » est ce qui empêche le chiffre d'être re-cité plus tard comme une
  comparaison. Corollaire déjà payé trois fois ici : une mesure ne conclut que si elle va au
  bout (`flux-termine`) — sur toute autre fin, chaque compte n'est qu'un préfixe.

- **`git checkout <fichier>` pour défaire UNE mutation efface TOUT le travail non commité du
  fichier.** Vécu le 2026-08-20 : après avoir prouvé qu'un test-garde discriminait, un
  `git checkout lib/cv/extraction.ts` a rendu le fichier à `HEAD` — schéma, outil, consigne
  et nettoyage du parcours, tous effacés d'un coup, quatorze erreurs de typage plus tard. La
  leçon était DÉJÀ écrite ailleurs dans ce dépôt et je l'ai reprise quand même : pour une
  campagne de mutations, `cp` du fichier AVANT, `cp` de retour APRÈS — jamais git, qui ne
  connaît que le dernier commit. Corollaire du même passage : **une mutation qui ne
  s'applique pas ressemble EXACTEMENT à un test qui ne discrimine pas** (49 verts dans les
  deux cas). Toute mutation s'écrit avec une assertion qu'elle a bien changé le fichier
  (`assert s != avant`), sans quoi on conclut « mon test est mauvais » sur une manipulation
  ratée — ou pire, « mon test est bon » sur une mutation fantôme.

- **Un mécanisme de troncature ne protège que la PROFONDEUR qu'il parcourt.** Vécu deux fois
  ici, et la seconde par ma faute. Le 2026-08-14, une analyse de CV entière était rejetée
  pour neuf forces au lieu de huit ; le correctif a annoncé les plafonds au modèle et ajouté
  `bornerListes`, qui ramène chaque liste à sa borne AVANT le schéma. Le 2026-08-20, un CV
  réel a été rejeté pour onze réalisations sur un poste : `bornerListes` ne regardait que le
  PREMIER NIVEAU, et le nouveau champ portait une liste dans une liste. La borne n'avait pas
  la mauvaise valeur, elle n'allait pas assez profond. Toute liste imbriquée ajoutée plus
  tard doit être bornée dans la même fonction — et le test-garde des plafonds descend
  désormais lui aussi dans les sous-schémas, parce qu'une garde qui ne voit qu'un étage
  laisse passer exactement ce qu'elle promet d'attraper.
  ⚠️ **Et la réponse n'était PAS d'assouplir le schéma.** Mon premier correctif relâchait la
  borne Zod pour « ne plus échouer » : c'était troquer un échec fort et diagnosticable
  (`parcours.1.faits`, le champ NOMMÉ) contre une dérive muette. Un test existant l'a réfuté,
  et il avait raison — la stricture du schéma est la CEINTURE qui signale ce que la
  troncature a manqué. On répare l'outil qui tronque, jamais la garde qui alerte.

- **Un budget plus long que le MUR de sa fonction ne borne rien.** Le même diagnostic tourne
  derrière deux routes : 300 s en HTTP, 60 s en MCP. Y passer les mêmes 120 s ferait couper
  l'appel PAR LE DEHORS sur la seconde — et le client ne verrait qu'un timeout, sans le champ
  qui dit si la lecture était complète. Un budget se dérive du mur de l'appelant, jamais
  d'une constante partagée entre appelants qui n'ont pas le même.

- **Une garde qui EXCLUT une population d'un mécanisme la prive aussi de ce que ce mécanisme
  DISAIT.** La veille ne périme que ce qu'elle a vu elle-même — règle juste, écrite pour
  qu'un silence de requête ne détruise pas le travail saisi à la main. Mais la péremption
  était le SEUL poste qui disait quoi que ce soit sur la présence d'une offre : exclues du
  mécanisme, les 38 offres du jeu de départ étaient affichées comme ouvertes depuis février,
  indiscernables d'une offre confirmée la veille — six mois sans que rien ne cloche nulle
  part. Le correctif n'est pas de retirer la garde (elle protège toujours) : c'est de
  demander, pour chaque exclusion, **ce que le mécanisme AFFIRMAIT en passant** et de le dire
  autrement. Réflexe : devant un `continue`/`if (!connu)` qui saute une population, lister ce
  que la suite de la fonction PRODUIT, et pas seulement ce qu'elle MODIFIE.
  ⚠️ Corollaire de conduite, du même lot : Marc a demandé que « certaines soient périmées ».
  Mesuré, ces offres-là étaient ses MIEUX NOTÉES (88, 85, 84, 82, 80). Exécuter la demande à
  la lettre aurait archivé ses meilleures pistes sur une supposition. Quand une demande
  d'AUTOMATISATION porte sur des données qu'on n'a pas encore regardées, mesurer d'abord QUI
  elle emporterait — et si la réponse surprend, livrer l'information plutôt que la suppression.

- **Deux plaintes d'un même message peuvent n'avoir qu'UNE cause, et seule la mesure le
  montre.** « Les liens marchent pas » et « certaines devraient être périmées » avaient l'air
  de deux chantiers : un de liens, un de veille. Relevé sur les 32 offres ouvertes les mieux
  notées, les 18 liens faibles sont EXACTEMENT les 18 offres du jeu de départ de cette liste,
  et les offres inpérimables sont ce même jeu de départ. Traiter les deux séparément aurait
  produit deux correctifs partiels au lieu d'une explication. Avant de découper un message en
  tâches, croiser les populations : si les deux symptômes frappent les mêmes lignes, c'est un
  seul défaut.

- **Un mot-clé cherché N'IMPORTE OÙ dans une URL classe mal exactement ce qui marche.**
  Reconnaître une page de liste d'emplois par `chemin.includes("jobs")` range en « liste »
  `jobbank.gc.ca/jobsearch/jobposting/49850218` — les 14 seuls liens du suivi qui mènent
  vraiment à une annonce, soit le contraire exact du but. La règle juste porte sur le DERNIER
  SEGMENT (`/jobs` est une liste, `/jobs/1234-coordonnateur` est une annonce). Et c'est la
  MUTATION qui l'a montrée, pas la relecture : le test écrit sur les URL réelles de la
  production a viré 14 fois au rouge d'un coup. Un classement d'URL se prouve sur les adresses
  QU'ON A, jamais sur des exemples plausibles.

- **« Quasi tout X » se MESURE avant d'être corrigé — et l'outil de mesure se livre d'abord.**
  Marc a dit « quasi toutes les offres sont à vérifier ». Mesuré une heure plus tard : **21
  sur 1 593**, soit 1,3 %. Je n'avais AUCUN moyen de compter — le chiffre n'existait nulle
  part —, et j'allais construire une automatisation dimensionnée sur une impression. Un
  traitement automatique qui RETIRE quelque chose se conçoit à l'envers, et « à l'envers »
  commence par le compte : s'il n'est pas observable, le premier lot est l'observabilité, pas
  le correctif. ⚠️ Et l'impression n'était pas fausse pour rien : la pastille pouvait
  effectivement se poser sur TOUT le suivi, parce qu'elle lisait l'absence d'une entrée dans
  un journal qui tient dans une seule ligne d'état — perdu, il accuse 1 593 offres d'un coup.
  **Une absence n'est une information que si sa source est prouvée vivante** : d'où
  `journalPlausible`, qui fait taire la pastille tant que le balayage n'a pas confirmé la
  majorité du suivi.

- **La garde qu'on copie du voisin peut être INOPÉRANTE chez soi, et elle a l'air prudente.**
  J'avais gaté la fermeture automatique sur `couvertureComplete` par réflexe : c'est ce que
  fait `estPerimable`, le mécanisme d'à côté. Deux erreurs dans le même geste. (a) Elle ne
  répond pas à ma question : « la passe a-t-elle relancé TOUS les termes ? » décide du sort
  d'une offre DÉJÀ VUE par un terme, et ne dit rien d'une offre que le balayage n'a JAMAIS
  vue — celle-là se ferme sur un ÂGE mesuré, pas sur un silence. (b) Elle ne pouvait pas
  tirer : aucun lot n'était déposé depuis 24 jours, donc la production tourne en couverture
  incomplète en permanence. J'aurais livré un mécanisme vert, testé, et mort à l'arrivée.
  Réflexe symétrique de « quel garde mes voisins ont-ils que je n'ai pas ? » : **pour chaque
  garde qu'on hérite, vérifier qu'elle répond à SA question — et surtout qu'elle peut passer
  au moins une fois sur l'état RÉEL de la production.**

- **Un seuil se mesure avec l'instrument qu'on a déjà construit.** Fermer une offre qu'aucun
  balayage ne confirme demande un âge. Écrire « 60 jours » aurait été une politique inventée,
  fausse au premier changement de rythme du marché — alors que `lib/dureeVie.ts` estime déjà
  la survie des annonces (Kaplan-Meier, censure comprise). Le seuil est donc l'âge auquel la
  survie observée tombe sous une petite part résiduelle, et quand la mesure ne conclut pas
  (trop peu de fermetures, courbe qui ne descend pas), **rien ne se ferme**. Un module qui ne
  peut pas justifier son seuil ne doit pas en prendre un par défaut.

- **Un témoin d'intégration peut être protégé par la BORNE plutôt que par la garde qu'il
  prétend éprouver.** Deux fois dans le même lot : le témoin « offre que Marc a travaillée »
  et le témoin « offre que la passe vient de revoir » restaient verts sous la mutation qui
  retirait leur garde — parce qu'ils avaient le MÊME ÂGE que la vraie candidate et que la
  borne « pas plus que ce que la passe a confirmé » ne gardait que la première du tri. Le
  test mesurait l'ordre, pas la garde. **Un témoin doit être le PREMIER que la règle
  emporterait si sa garde tombait** — ici le plus vieux. Et ça ne se voit qu'en jouant la
  mutation : les deux fichiers étaient verts, et l'un des deux ne prouvait rien.

- **Un document PERSISTÉ est daté par le schéma qui l'a écrit : ajouter un champ requis le
  rend illisible, et personne ne le voit avant des semaines.** Quatre champs entrés au même
  commit (ADR-0014 D2) ont fait tomber le profil enregistré de Marc — document parfaitement
  sain, simplement ANTÉRIEUR. Conséquence invisible : `/profil` et `/references` montraient
  le barème du CODE sous l'apparence du sien, et surtout **plus aucun CV ne pouvait être
  validé**. Le remède n'est PAS d'assouplir le schéma (ça répare l'écran en une ligne et fait
  de chaque ajout futur une dérive silencieuse) : c'est de COMBLER le document depuis le
  défaut, à la lecture, et de garder le schéma strict derrière. Trois règles qui vont avec :
  **la liste des champs à combler se DÉRIVE du défaut** (récursivement — le champ réel qui
  manquait vivait DANS un objet déjà présent, une migration à un niveau l'aurait raté) ;
  **une valeur présente n'est jamais écrasée**, même différente du défaut, sinon on ne migre
  pas, on efface ; et **« absent » ne se confond jamais avec « présent mais faux »** — le
  premier est un document ancien, le second une corruption, et maquiller le second est la
  seule vraie faute possible ici. Réflexe : en ajoutant un champ requis à un schéma, demander
  **ce qui est DÉJÀ écrit sous l'ancien**, exactement comme pour une colonne de base.

- **Un diagnostic tiré d'un message d'erreur décrit le SYMPTÔME, pas la portée — y compris
  quand c'est moi qui l'ai écrit une heure plus tôt.** J'ai lu « `termesParJour` manquant »
  dans une trace Zod et annoncé à Marc que « tout réglage enregistré est ignoré ». Mesuré
  ensuite par `grep` des consommateurs : `termesParJour` n'est lu par AUCUN code hors du
  défaut (c'est la Routine qui l'applique depuis le protocole), le rayon et les métiers
  vivent dans leurs propres lignes d'état, et la notation tourne sur `PROFIL_DEFAUT`. Rien de
  ce que j'avais annoncé n'était exact — et le vrai dégât, lui, n'était pas dans la liste :
  la validation d'un CV était totalement bloquée. **Le nom d'un champ dans une erreur ne dit
  pas qui le lit.** Avant d'annoncer une portée, grepper les CONSOMMATEURS du champ, jamais
  déduire de son nom. Et corriger l'annonce dans les trois endroits où elle a été écrite
  (compte-rendu, `BACKLOG.md`, `HANDOVER.md`) : un diagnostic faux laissé en place devient la
  prémisse du lot suivant.

- **Un garde-fou qui REFUSE un lot entier se transforme en panne permanente dès qu'un seul
  membre est mauvais — et le bon remède n'est jamais de relever le seuil, c'est de DÉCOUPER.**
  La mesure des bornes interrogeait Overpass une fois pour tout le lot, avec une garde
  refusant une boîte englobante absurde. Un seul employeur mal géocodé a fait déborder la
  boîte : `bornes=0/1293 (1293 en échec)`, **tous les jours**. Et le refus était définitif par
  construction — un échec ne marque aucune ligne, donc le lot du lendemain est identique, donc
  la boîte aussi. La garde n'était pas fausse (une requête qui ramène un continent doit être
  refusée) ; c'est son EFFET qui l'était. Réflexe : devant un garde-fou qui rejette une
  OPÉRATION GROUPÉE, demander **ce qu'il fait payer aux membres sains**, et si la réponse est
  « tout », le convertir en critère de PARTITION. ⚠️ Corollaire de conception : la partition
  se construit en vérifiant la CONTRAINTE RÉELLE à chaque ajout (faire grossir une grappe tant
  que sa vraie boîte tient), jamais en choisissant une taille de cellule — sinon on invente un
  nombre et on suppose une latitude pour convertir une marge en degrés. ⚠️ Et corollaire déjà
  payé trois fois ce jour-là : la garde ne couvrait QUE la fonction pure. Casser l'étendue
  passée depuis l'appelant laissait toute la suite verte — le branchement n'était le sujet
  d'aucun test, et c'est la mutation qui l'a dit, pas la relecture.

- **Un test qui vérifie ce qu'une fonction REND ne prouve rien sur ce qui est ÉCRIT — et la
  liste que la persistance parcourt EST le contrat.** La fermeture d'office livrée le
  2026-09-14 calculait juste, rendait juste, passait un test d'intégration qui traversait la
  passe… et n'atteignait jamais la base : `lib/veilleComplete.ts` n'écrit `perimeeLe` que pour
  les identifiants de `rapport.perimees`, et les fermetures vivaient dans un champ voisin.
  Mesuré le lendemain : `perimees` 606 → 624 (la péremption ordinaire, persistée) pendant que
  `jamaisConfirmees` restait à 21. ⚠️ **J'avais écrit la leçon « mécanisme vert, testé, mort à
  l'arrivée » dans le commit précédent, sur une autre garde, et je l'ai reprise par la porte
  d'à côté** — écrire une leçon ne la fait pas appliquer, seul un test le fait. Le verrou juste
  n'est pas un cas de plus : c'est l'INVARIANT du contrat — toute offre rendue avec un
  `perimeeLe` que l'entrée n'avait pas doit figurer dans la liste que l'écriture parcourt —,
  plus une garde à l'autre bout qui vérifie que l'écriture parcourt bien cette liste-là. Il
  couvre alors le prochain mécanisme sans que personne y pense. Réflexe : quand un lot ajoute
  une façon de produire un fait DÉJÀ persisté ailleurs, ne pas ajouter une seconde boucle
  d'écriture — faire entrer le nouveau fait dans la liste existante, et garder les deux bouts.

- **Un message qui DÉDUIT sa cause d'un code de statut envoie au mauvais endroit — et il le
  fait avec aplomb.** `[trajets] échec : Matrice refusée (403) : « Routes API » doit être
  activée` n'était pas une lecture, c'était une phrase écrite EN DUR dans le `if (status ===
  403)`. Or un 403 de Google porte au moins six causes (API non activée, API hors des
  restrictions de la clé, clé NAVIGATEUR côté serveur, restriction d'IP, clé invalide,
  facturation inactive), chacune réparable à un endroit DIFFÉRENT de la console : le message
  était juste une fois sur six, et les cinq autres fois il faisait faire un geste inutile
  après lequel on croit le problème réglé. La cause se lit donc dans la donnée RICHE que le
  fournisseur envoie — ici `error.details[].reason`, un identifiant STABLE et documenté —,
  jamais dans `error.message`, qui est de la prose que le fournisseur traduit et remanie sans
  préavis (un détecteur qui la lirait changerait de verdict à la première reformulation). Et
  **ce qu'on ne reconnaît pas se CITE**, borné, avec le code : retomber sur la cause la plus
  fréquente refait le défaut en plus discret, et empêche de reconnaître la prochaine.
  ⚠️ **Le test qui « couvrait » ce site ne pouvait pas voir le défaut** : son faux `fetch`
  rendait `{ ok: false, status: 403 }` — aucun corps. Il éprouvait donc qu'une phrase nomme
  l'API, ce qu'un message écrit en dur fait aussi bien qu'une lecture réelle : vert sur le
  défaut ET sur son correctif. **Un test de traduction d'erreur doit porter un corps
  RÉALISTE et exiger le geste PROPRE à cette cause-là** — sinon il ne mesure que la présence
  d'un nom. Prouvé par mutation aux deux bouts : couper la lecture du corps aux cinq sites
  fait tomber cinq tests (un par site), et rétablir le repli « cause inconnue → API non
  activée » en fait tomber six.
  ⚠️⚠️ **Et « on cite ce qu'on ne sait pas » ne valait RIEN tant que le corps devait être du
  JSON — trouvé au PREMIER USAGE RÉEL, deux heures après le déploiement.** La production a
  rendu `Routes API refuse la clé (403). Google n'a donné aucune explication lisible`. Le
  message ne mentait pas ; il n'apprenait rien non plus. Cause : les cinq sites lisaient
  `reponse.json().catch(() => null)`, donc un corps VIDE, une page HTML et un JSON sans
  `message` produisaient la MÊME phrase — alors que ce sont trois diagnostics différents (rien
  à lire ; un refus posé AVANT l'API ; une cause à ajouter à la table). On lit donc le corps en
  **TEXTE** et on tente le JSON dessus : ce qui n'a livré aucune phrase est cité TEL QUEL,
  borné, espaces repliés. **Règle générale : une branche de repli qui promet de CITER la donnée
  brute doit RECEVOIR la donnée brute** — un analyseur placé avant elle lui livre `null`
  exactement dans les cas qu'elle existe pour couvrir. Réflexe de revue : pour chaque repli
  « on rend ce qu'on a », remonter le chemin et vérifier que « ce qu'on a » n'a pas déjà été
  jeté par une conversion en amont. Corollaire de calendrier, re-vécu : **ce défaut était
  invisible aux tests parce que leurs faux `fetch` ne pouvaient même pas exprimer le cas**
  (ils rendaient un objet portant `json`) — seul l'usage réel le montre, donc on REGARDE la
  première exécution en production au lieu de la supposer conforme.
  ⚠️⚠️ **Et la citation a livré la cause le jour même : `API_KEY_SERVICE_BLOCKED`, que la
  table connaissait DEPUIS LE PREMIER JOUR.** Elle n'était jamais atteinte parce que le corps
  de `computeRouteMatrix` est un **TABLEAU** (`[{ "error": … }]`, endpoint de streaming) et
  que `.error` sur un tableau vaut `undefined`. Un refus parfaitement reconnaissable est resté
  « cause inconnue » pendant deux lots, et le message affiché était juste assez vrai pour ne
  pas alerter. **La FORME de l'enveloppe fait partie du contrat d'erreur, et elle n'est pas la
  même pour toutes les méthodes d'une même API** — `computeRoutes` rend un objet,
  `computeRouteMatrix` un tableau, même hôte et même clé. Avant de conclure qu'une réponse
  « ne porte pas » ce qu'on cherche, vérifier si elle le porte **une couche plus bas**.
  ⚠️ La morale de la série entière, en une phrase : **un classificateur correct nourri d'une
  donnée amputée rend un verdict faux avec aplomb.** Trois lots de suite, la logique de
  classement était juste et c'est le CHEMIN D'ALIMENTATION qui perdait l'information — d'abord
  le corps déduit du statut, puis le `json()` qui jetait le non-JSON, puis l'enveloppe non
  ouverte. Devant un verdict « inconnu » persistant, auditer ce qu'on DONNE au classificateur
  avant de toucher au classificateur.

- **Libérer de la place au-dessus d'un élément qui est à son PLANCHER ne lui donne RIEN.**
  Marc : « rends la carte plus grande » → j'ai replié la barre de filtres, gate vert, déployé.
  Sa réponse : « elle a pas grandi ». Mesuré au navigateur (Chromium, page reconstituée avec
  la vraie feuille) : sur 1366×648 le plan faisait **337 px avant ET après** — les 170 px
  libérés étaient allés au DÉFILEMENT de la page (277 → 102 px), pas à la carte. Cause :
  `.plan-ecran` porte `min-height: 26rem`, et sur un portable c'est la valeur QUI S'APPLIQUE
  — l'élément reçoit déjà plus que ce qui tient, donc tout gain en amont ne fait que réduire
  le débordement. **Avant de gagner de la place pour un élément, vérifier s'il est à son
  plancher** : si oui, le seul levier est le plancher lui-même, et il se paie en défilement.
  Corollaire de conduite : un correctif de mise en page qui « devrait » agrandir quelque chose
  se MESURE avant d'être annoncé — et la mesure est possible même quand la page est derrière
  une session, en reconstituant le balisage avec la feuille RÉELLE dans un navigateur sans
  affichage. C'est ce qui a transformé « ça devrait marcher » en diagnostic.
  ⚠️ **Et `display: inline` sur un enfant DIRECT d'un conteneur flex ou grid est INERTE** —
  la spécification blockifie les items. Une règle posée le 13/09 pour mettre trois compteurs
  sur une ligne n'a jamais rien fait (mesuré : 102 px au lieu de 54), et son commentaire
  affirmait le contraire depuis deux jours. Le remède est une ENVELOPPE qui sort les éléments
  du contexte flex. Vaut pareil pour `float` et `vertical-align`. Réflexe : avant d'écrire
  `display:inline`, regarder ce qu'est le PARENT — et se rappeler qu'une règle ignorée ne
  laisse aucune trace, contrairement à une règle fausse.

- **Un frein qui compte ce que PERSONNE n'a dépensé ne protège rien : il enferme.** Marc :
  « budget épuisé mais j'ai juste fait 2 recherches, pourquoi ». Mesuré : **48 des 50 éléments
  du jour** avaient été brûlés par QUATRE passes de matrice refusées en 403 (12 éléments
  réservés chacune), sans qu'un seul trajet n'existe — ses deux clics ne coûtaient que 2. La
  réservation se fait AVANT l'appel, et son commentaire le justifiait : « un appel parti est
  facturé même si sa réponse est illisible ». Vrai d'un appel que Google ACCEPTE ; **faux d'un
  403, refusé à la porte et jamais facturé**. Le frein posé pour protéger l'argent a fini par
  bloquer la VÉRIFICATION du correctif qui réglait ce même 403 — le défaut se paie deux fois.
  Règle : **classer l'échec par ORIGINE avant de le compter** (la leçon des échecs LLM de
  DriveAI, payée ici sur un budget d'argent). Ce dont on est SÛR qu'il n'a rien coûté se rend
  (appel jamais parti, 401/403) ; ce dont on n'est pas sûr reste dépensé (429 — le quota est
  justement ce qu'on protège —, 5xx, réponse illisible d'un appel ACCEPTÉ). Le marqueur est
  posé par le site qui a VU la réponse, jamais deviné par le compteur.
  ⚠️ **Et le symptôme ne désigne pas le coupable** : « budget épuisé » se lit comme « tu as
  trop consommé », alors que l'utilisateur n'avait rien consommé du tout. Un compteur partagé
  entre un geste humain et un travail de fond doit pouvoir dire QUI a dépensé — sinon la
  première hypothèse est toujours la mauvaise.

---

## 154. Un recensement ancré sur `npm ci` ne voit pas `npx` (2026-09-18, lot L2 de l'audit)

Le lot L2 de l'audit multi-outils devait fermer deux surfaces de la chaîne de build : le
`GITHUB_TOKEN` laissé lisible par `actions/checkout`, et les scripts d'installation de paquets
exécutés sur le runner. J'ai recensé la seconde en cherchant `npm ci` et `npm install -g`, posé
`--ignore-scripts` sur les trois sites de ce dépôt, rejoué le compte, et déclaré le lot fini.

**Il restait cinq `npx tsx scripts/sonder-*.ts`.** `npx` télécharge le paquet depuis le registre
quand il ne le trouve pas localement, **et exécute ses scripts de cycle de vie** — exactement la
surface que `--ignore-scripts` venait de fermer à l'étape d'installation, rouverte quelques
étapes plus bas, et sur une version que le lockfile ne gouverne pas (le registre sert la
dernière). Ces sondes tournent dans les workflows `sonde-sources.yml` et `sonde-registre.yml`,
qui ne portent aucun secret — mais la règle ne se juge pas workflow par workflow : c'est la
FORME de la commande qui décide, et elle est la même partout.

Ce n'est pas mon recensement qui l'a trouvé : c'est le rapport SonarCloud d'un AUTRE dépôt
(DriveAI), qui le disait dans des termes où je ne cherchais pas — « "npx" can install packages
on-demand and run their lifecycle scripts ». La même requête élargie sur les huit dépôts a
ensuite sorti **8 sites** hors de ma requête initiale : 5 ici, 3 chez FinanceAI.

**Le correctif est `npx --no-install`**, jamais le retrait de l'étape : le binaire vient alors
de `node_modules/.bin`, donc de la version qu'épingle le lockfile, et npx échoue franchement
s'il manque au lieu d'aller le chercher. Mesuré ici avant d'être posé : `npx --no-install tsx
--version` rend « tsx v4.23.1 », et `tsx` est bien une devDependency.

⚠️ **Le drapeau exige que l'étape d'installation vive dans le MÊME job**, sinon il transforme un
téléchargement silencieux en échec de CI. Vérifié job par job avant de le poser : les deux
workflows font `npm ci --ignore-scripts` dans le même job que leurs `npx`.

**La règle** : un recensement de commandes d'installation s'énumère par ce qu'elles FONT
(installer un paquet, exécuter un binaire qui peut s'installer), jamais par le nom de l'une
d'elles. C'est la leçon n° 127 (« une liste écrite à la main devient fausse au chantier
suivant ») appliquée à une REQUÊTE de recensement, et la variante n° 5 du même piège en une
session : un scan ne couvre que la forme qu'on lui a apprise.

---

## 2026-09-18 — `.default(null)` et `.nullable().optional()` ne sont pas la même chose, et l'un des deux est additif

`[VEILLE-52]`, ADR-0019. J'ajoutais une colonne `situation` à `Offre` — un champ ADDITIF, le
patron que ce dépôt applique déjà à `noc`. Écrit `.nullable().default(null)`, parce que ça se
lit « nullable, et par défaut null », ce qui décrit exactement l'intention.

**Le typecheck a sorti 9 erreurs, dans 7 fichiers de test et 2 modules** — tous des endroits
qui construisent un objet `Offre` à la main et qui n'ont rien à savoir de cette colonne. Zod
distingue le type d'ENTRÉE du type de SORTIE : `.default()` rend le champ facultatif à
l'entrée et **REQUIS à la sortie**, donc `z.infer` — le type `Offre` que tout le dépôt
manipule — l'exige partout. `.nullable().optional()` laisse les deux facultatifs, et c'est
la forme que `noc` portait déjà trois lignes plus haut.

**La règle** : un champ additif s'écrit `.nullable().optional()`, jamais
`.nullable().default(null)` — et quand un patron existe déjà dans le même fichier, le copier
mot pour mot plutôt que d'écrire la version qui « se lit mieux ». Coût réel : un aller-retour
de typecheck. Coût si je l'avais laissé passer en corrigeant les 9 sites : neuf fixtures qui
posent une valeur qu'aucune ne veut exprimer, et la règle « champ additif = zéro migration »
silencieusement perdue.

---

## 2026-09-18 — Le champ que je voulais nommer existait déjà dans le même type, et portait autre chose

Même lot. `RapportVeille` gagne la liste des verdicts de lieu ; je l'appelle `lieux`, parce
que c'est ce que c'est. Le compilateur refuse : `RapportVeille.lieux` existe déjà, et porte
le COMPTE de la mesure du géocodeur (`{ demandes, juges, introuvables }`). Deux choses sans
rapport, le même mot, dans le même type.

Ce n'est pas une relecture qui l'a trouvé, c'est `tsc`. **Et il n'aurait rien dit si le type
d'en face avait été compatible** — par exemple si j'avais ajouté `lieux: string[]` à un type
qui portait déjà un `lieux?: string[]` optionnel. Renommé en `verdictsLieu`.

**La règle** : avant de nommer un champ dans un type déjà large, grep le nom dans ce type.
C'est la leçon n° 117 (« savoir qu'un champ EXISTE ne dit rien de ce qu'il PORTE ») prise
par l'autre bout : savoir ce que je veux EXPRIMER ne dit rien de ce que le nom porte DÉJÀ.

---

## 2026-09-18 — Retirer un filtre laisse orpheline l'observabilité qu'il produisait

Même lot, et c'est le piège qui m'a coûté le plus de réflexion. Les deux verdicts de lieu
(`hors-region`, `lieu-inconnu`) vivaient dans `Tri.refusees`, la liste des refus nommés. En
retirant le refus, le réflexe est de retirer les entrées : elles n'ont plus rien à faire dans
une liste qui s'appelle « refusées », et l'écran annoncerait « écartées » des offres qu'il
vient d'inscrire.

**Mais cette liste ne servait pas qu'à justifier le refus.** C'est elle qui produit
`[veille] lieux … — inconnus : sherrington×7 · gaspe×5 · parc-bon-air×3 …` dans le journal —
autrement dit la liste de travail du géocodeur, triée par fréquence, et la seule façon de
savoir si `situer` progresse. La retirer avec le filtre aurait supprimé l'observabilité en
même temps que la restriction, et personne ne l'aurait vu : le journal aurait simplement
cessé d'écrire une ligne.

Correctif : une SECONDE liste, `Tri.lieux`, avec la même forme et un nom qui dit la vérité
(« ce que le lieu a dit », pas « ce qui a été refusé »). `villesRefusees` la consomme sans
changer d'une ligne — elle ne lisait que `ville` et `motif`. Le journal et l'écran ont suivi,
et leur libellé aussi : « lieux refusés » serait devenu faux.

**La règle** : avant de retirer un filtre, lister ce que son chemin PRODUIT en plus du refus
— compteurs, listes nommées, lignes de journal, priorités de file. Ce qui sert à DÉCIDER
disparaît avec la décision ; ce qui sert à OBSERVER doit survivre, et sous un nom qui ne ment
plus. Même famille que la leçon n° 140 (« une garde qui EXCLUT une population la prive aussi
de ce que ce mécanisme DISAIT »), vue depuis le moment où l'on retire la garde.

---

## 158. Le libellé d'une métrique publiée est une CLÉ chez son consommateur

**2026-09-21, `[HUB-HEROS-ARRIVAGE]` / ADR-0020.** Marc : « la carte jobai je veux que ce soit
le nombre de nouvelles offres le gros chiffre et le graph ».

La demande ressemblait à une préférence de mise en page. Elle décrivait un défaut.

Le hub choisit le gros chiffre de la carte par `metrics.find(m => m.primary) ?? metrics[0]`,
puis trace sa courbe avec `serieMetrique(historique, elue.label)` — **l'historique est indexé
par le LIBELLÉ**. Le héros de JobAI s'appelait `Meilleure : <entreprise>`. À chaque changement
d'employeur en tête de liste, le libellé changeait, donc la clé changeait, donc la série
repartait de zéro et la carte affichait « pas encore d'historique ».

**Le seul chiffre mis en avant était structurellement le seul à ne pas pouvoir être tracé.**
Personne ne pouvait le voir en lisant JobAI : rien n'y est faux. Et personne ne pouvait le voir
en lisant le hub : il fait exactement ce qu'il annonce. Le défaut vit dans le **contrat entre
les deux**, et il ne se lit qu'en ouvrant les deux dépôts.

Mesuré avant de décider : `Nouvelles (7 j)` est publié sans condition depuis le **2026-08-14**
(`c900e39`, `[HUB-01]`) et la rétention du hub est de **90 jours**. La série existait donc
déjà, complète — elle n'avait jamais été élue. La courbe est apparue avec 38 jours
d'historique, sans rien attendre.

⚠️ **La conséquence est plus large que le lot** : le libellé cesse d'être un titre. Il devient
une clé partagée avec un autre dépôt, que le hub n'a aucun moyen de rapprocher de sa
remplaçante. Le renommer « en mieux » — c'est la tentation, `Nouvelles offres` est plus joli —
jette la série **sans que rien ne rougisse**. D'où une constante exportée (`LIBELLE_HEROS`) et
une garde qui fige sa valeur EXACTE.

⚠️ **Et cette garde-là n'est pas un golden de confort : sans elle, toutes les autres sont
auto-satisfaites.** Les quatre assertions du lot comparent à `LIBELLE_HEROS` — renommer la
constante les laisse toutes vertes pendant que la production perd sa courbe. Mesuré : le
renommage fait tomber 3 tests, dont celui-là ; sans lui il n'en tombe que 2, et aucun ne parle
de la série.

**La règle** : le libellé d'une métrique publiée à un consommateur qu'on ne contrôle pas est
une CLÉ chez lui, jamais un titre. Avant de le choisir, demander ce que le consommateur en
FAIT — ce qu'il indexe et ce qu'il dérive. Un libellé qui porte une part variable (une
entreprise, une date, un compte) ne peut pas avoir d'historique, et ça ne se voit d'aucun des
deux côtés.

*(Même famille que la leçon jumelle de FinanceAI, `UN-LIBELLE-DE-METRIQUE-EST-UNE-CLE-CHEZ-SON-CONSOMMATEUR`,
2026-09-17 : là-bas c'était une date dans le libellé qui remettait la série à zéro à chaque
séance. Deux dépôts, deux formes de part variable, un seul mécanisme.)*


---

## 2026-09-21 — J'ai prescrit un remède qui était déjà livré, et le vrai manque était plus fin

`[BORNES-03]`. Le journal du 21/09 : `grappe de 520 lieu(x) — boîte ~168 km :
overpass-api.de → HTTP 504`, et le reste à mesurer qui remonte de 1 à 533. J'ai écrit au
BACKLOG, le soir même : « il faut découper la grappe géographiquement », en citant la leçon
n° 149 avec assurance.

**Le découpage existait depuis le 14/09.** `grapperPourBornes` fait exactement ça, et le
commentaire de `mesurerBornes` le dit en toutes lettres — je l'ai lu le lendemain en ouvrant
le fichier pour coder mon correctif. C'est la leçon n° 1 du dépôt (« vérifier qu'une tâche
n'est pas DÉJÀ faite »), mais prise par un bout que je n'avais pas vu : elle vaut pour le
DIAGNOSTIC autant que pour la tâche. Un remède prescrit depuis un journal, sans ouvrir le
code, décrit ce qu'on ferait à partir de rien — pas ce qui manque à ce qui existe.

**Et le vrai manque était à un cran de finesse en dessous.** Le découpage borne l'ÉTENDUE ;
168 km tient largement sous les 3° d'`ETENDUE_MAX_DEG`, qui garde contre une position
aberrante — un homonyme géocodé sur un autre continent — et pas du tout contre une requête
coûteuse. Deux rôles dans une constante, et seul le premier était écrit.

Resserrer ce seuil aurait été inventer un nombre, et un faux : **le coût d'une requête
Overpass dépend de la DENSITÉ autant que de la surface.** Cent kilomètres autour de Montréal
ne coûtent pas cent kilomètres en Gaspésie. Aucun seuil d'étendue fixe ne peut capturer ça.

Le correctif est donc de ne rien supposer : couper APRÈS un échec, et recommencer. Une
requête qui passe DIT que la grappe était assez petite ; une qui échoue dit le contraire.
Borné par `MAX_SCISSIONS_GRAPPE`, sans quoi une PANNE d'Overpass — où tout échoue — ferait
doubler les requêtes à chaque tour jusqu'à épuiser le budget de la passe.

**La règle** : avant de prescrire un remède depuis un journal, ouvrir le code qui produit la
ligne. Et devant une garde qui laisse passer ce qu'elle devrait arrêter, se demander si elle
ne remplit pas DÉJÀ un autre rôle, légitime — auquel cas c'est une seconde garde qu'il faut,
pas un seuil plus serré.

---

## 2026-09-21 — Une fixture à valeur constante rend le second critère de tri invisible

Même lot. `scinderGrappe` coupe par la dimension la plus longue ; j'écris le test avec six
points à **latitude constante** étalés en longitude, je vérifie que les moitiés réduisent
l'étendue, vert.

Mutation : `const surLaLatitude = true` — couper toujours la latitude, quoi qu'il arrive.
**Le test reste VERT.**

Parce que le tri est `a.lat - b.lat || a.lon - b.lon`. À latitude constante, le premier
critère rend zéro partout et le second départage : trier « par latitude » rend exactement le
même ordre que trier par longitude. La fixture ne pouvait pas distinguer les deux branches —
elle mesurait le second critère du tri, pas le prédicat que je croyais tester.

Corrigé avec des latitudes **alternées**, pour qu'un tri par latitude mélange les longitudes,
plus un cas miroir où c'est la latitude qui est la plus longue. Les deux mutations
(`= true` et `= false`) rougissent désormais, chacune sur un cas.

⚠️ Et l'assertion a changé de nature au passage : au lieu d'un ratio d'étendue — qui aurait
demandé de choisir un seuil, donc d'inventer un nombre —, elle vérifie que les deux moitiés
sont **séparées** sur la dimension coupée (tout ce qui est d'un côté est à l'ouest de
l'autre). C'est la propriété d'une coupe par la bonne dimension, et elle est binaire.

**La règle** : quand un comparateur a un second critère, une fixture où le premier est
CONSTANT teste le second. Faire varier toutes les clés du tri, ou la mutation reste verte.

## 2026-09-21 — Je cherchais des distances manquantes, j'ai trouvé des distances fausses

`[GEO-BOOTSTRAP]` disait, de ma main : « la table `villes` existe et n'est pas exploitée pour
donner un km approché aux offres ». En ouvrant `mesurerDistances` pour le corriger, l'étape
« 0 bis » (chantier #07, 2026-08-12) fait exactement ça depuis cinq semaines, sans réseau.
C'est la deuxième fois en deux jours qu'un remède est prescrit depuis un JOURNAL sans ouvrir
le code qui produit la ligne — la règle n° 159, écrite la veille pour `[BORNES-03]`.

Le vrai défaut était de l'autre signe. Relevé en production (MCP, `scoreMin=65`,
185 correspondances) : `Coffrages Synergy`, **Lavaltrie**, ~200 km du domicile, affichée à
**6,1 km**, notée **76** — et ses quinze autres offres avec elle. L'`Université du Québec` à
**Montréal** : **5,1 km**. La `Société québécoise des infrastructures` à **Montréal** :
**6,1 km**. Ce ne sont pas des distances absentes, ce sont des distances plausibles et
fausses, en tête de la liste de Marc, et **sans la réserve « distance à mesurer »** — elle ne
s'affiche que quand `km` est `null`.

Deux mécanismes, tous deux rendus graves par ADR-0019 (l'ouverture de l'ingestion à tout le
Québec), tous deux invisibles avant :

1. **Un employeur n'a QU'UNE position.** `entreprises_lieux.nom` est la clé primaire.
   `villeDe` dérive la ville de la PREMIÈRE offre de cet employeur qui en porte une, et
   `planifierDistances` applique cette position à TOUTES ses offres. Un organisme dont le
   siège est à Québec et qui publie à Montréal mesure ses offres montréalaises depuis Québec.
   Tant que toutes les offres étaient régionales, l'erreur valait quelques dizaines de
   kilomètres ; depuis, elle vaut la largeur de la province.
2. **Le lecteur qui remplit `villes` n'exigeait pas que la réponse SOIT une ville.**
   `lireReponseMunicipalite` filtrait sur la classe Nominatim (`place`/`boundary`) et son
   commentaire disait pourquoi. `lireReponse`, sur le chemin qui REMPLIT la table, ne
   vérifiait que les bornes. Or `urlRecherche` demande « <ville>, Québec, Canada », ce qui
   biaise Nominatim vers la ville de Québec : une rue homonyme y passe pour le CENTRE d'une
   municipalité lointaine, et ce faux centre contamine ensuite toutes les offres de la ville.
   `[Probable]` comme cause du cas Lavaltrie — cette session n'a pas accès à Nominatim, le
   fichier le dit lui-même. `[Certain]` pour l'asymétrie des deux lecteurs.

Et une troisième chose, trouvée en lisant les bornes : `BORNES` valait 45–49 / −75…−68, la
grande région de Québec. Gatineau (−75,70), Rouyn (−79,0), Sept-Îles (50,2 / −66,4) et Gaspé
(−64,5) étaient REFUSÉS — leur ville ne pouvait pas entrer dans la table, donc leurs offres ne
pouvaient JAMAIS recevoir de distance. Rien ne le disait : elles étaient comptées
« introuvables », exactement comme une ville que Nominatim ne connaît pas. On avait ouvert
l'ingestion à la province sans ouvrir la géographie.

Livré (ADR-0021) : lecteur strict et `lire` rendu REQUIS dans `geocoderSerie` (le défaut
permissif était le vrai coupable — la série la moins gardée était celle qu'on obtenait en ne
choisissant pas), bornes élargies à la boîte du Québec avec le tripwire qui les lie aux CHECK
de la base, garde de plausibilité position↔ville de l'OFFRE (même constante que
`deciderPrecision`, troisième consommateur), effacement des km déjà écrits qu'elle refuse,
re-vérification des centres de l'ancien lecteur (`villes.verifie_le`, jamais un `DELETE` :
une ligne non confirmée n'est pas prouvée fausse), et priorité des villes par ce qu'elles
débloquent — huit places par passe, l'ordre d'itération des employeurs n'en est pas une
politique.

Neuf perturbations jouées, neuf rouges. Et un seuil d'anti-vacuité écrit avant sa mesure
(`> 10 000` caractères pour un fichier qui en fait 9 557) — le piège se re-commet même en le
connaissant.

## 2026-09-21 (Lot 4) — Le filtre par km existait ; ce qui manquait, c'était mon rayon et l'honnêteté

Troisième « déjà fait ? » de la semaine. `[UI-FILTRE-KM]` annonçait trois volets ; deux
tournaient déjà. Le filtre par distance existe depuis le 2026-07-31 (`distanceMaxKm`, paliers
10/25/50) et le tri par note depuis le 2026-08-21 (`grouperParEntreprise`, note moyenne
décroissante et trois départages). Écrire une entrée de backlog sans rouvrir le code, c'est
décrire ce qu'on ferait à partir de rien.

Ce qui manquait vraiment tenait en deux points, et les deux sont des défauts d'HONNÊTETÉ plus
que de fonctionnalité.

**Le rayon de Marc n'était pas proposé.** Les paliers s'arrêtaient à 50 km ; le rayon réglé
vaut 75 par défaut et se règle jusqu'à 300. La seule question qui a un sens métier — « qu'est-ce
qui est DANS mon rayon ? », celle pour laquelle tout l'import d'ADR-0019 a été fait — n'était
pas offerte par l'écran. Le correctif n'est pas d'ajouter « 75 » à la liste : c'est de la
DÉRIVER du rayon, sinon elle se périme au premier réglage — exactement ce que `PALIERS_NOTE`
fait déjà en dérivant du barème.

**Les offres sans distance étaient masquées.** Le seuil les écartait et un compte les résumait
au-dessus de la liste. Écarter une offre dont la distance est INCONNUE revient à affirmer
qu'elle est loin ; depuis ADR-0019 c'est la majorité du suivi, donc un seuil posé le matin
vidait l'écran et laissait croire qu'il n'y avait rien à moins de 25 km. Elles forment
maintenant un groupe visible, sous la liste, qui dit pourquoi il existe.

Et un défaut trouvé en chemin : **le compte et le groupe n'étaient pas le même ensemble**.
`sansDistanceMesuree` n'appliquait que `historique`, `activesSeules` et `avecPerimees` — trois
des huit filtres. Il annonçait donc « 412 sans distance » quand une recherche textuelle n'en
laissait que trois. Le compte dérive désormais du groupe : un seul calcul, donc pas de
divergence possible.

⚠️ **Et ma garde de rendu était vacueuse.** Elle asserait la présence de la classe CSS et de
l'appel de regroupement ; en remplaçant la condition de rendu par `false`, le test restait
VERT — le JSX était toujours écrit dans le fichier. Un scan prouve qu'on a TAPÉ un jeton, pas
qu'il s'affiche : l'assertion doit viser la CONDITION. Sept perturbations jouées, celle-là
trouvée par la sixième.

## 2026-09-21 (Lot 5) — J'ai recommandé le mauvais levier, et la compression me l'a dit

Marc : « la carte met un temps fou à charger ». J'ai mesuré deux choses et j'en ai classé une
à l'envers.

**Le poids.** Un corpus de forme production (6 923 offres, 3 000 employeurs, 400 villes) pèse
**4,93 Mo** de JSON, dont 38 % pour les `raisons` — la même phrase « Trouvée automatiquement :
… » répétée six mille fois. J'en ai conclu que le payload était le premier levier, je l'ai
recommandé à Marc, et il a choisi de commencer par là sur cette recommandation. Puis j'ai
mesuré ce qui passe VRAIMENT : **0,12 Mo en gzip, 0,05 Mo en brotli** — 2,4 % et 0,9 %. Et
`content-encoding: br` est confirmé sur une vraie réponse de `emploi.hubperso.com`. Le
dégraissage que j'avais chiffré (table de textes dédoublonnés, −34 % sur le brut) aurait été
un lot entier que le réseau n'aurait pas vu. `JSON.parse` du brut : 103 ms sur ce conteneur.

La règle : **le poids d'un payload se mesure compressé.** L'hébergeur le fait par défaut, et
du JSON répétitif est exactement ce que la compression avale le mieux. Corollaire de conduite :
une recommandation donnée avant la mesure engage l'utilisateur dans le mauvais lot — et quand
la mesure la dément, on le dit AVANT de faire le travail qu'elle a fait approuver.

**Le calcul.** C'était ça, le vrai. `construireVue` (carte) et `grouperParEntreprise` (liste)
répondaient toutes deux à « cet employeur est-il déjà connu ? » par
`[...map.keys()].find((c) => apparier(nom, c))`. Deux coûts s'y empilaient : la liste des clés
RÉ-ALLOUÉE à chaque offre (jusqu'à 3 000 éléments), et `apparier` qui re-normalise les deux
côtés à chaque comparaison — ~18 millions de `trim().toLowerCase()` pour un seul écran. Mesuré
**1 900 ms** et **1 471 ms**, contre 19 et 11 ms à deux cents offres. Et ça recommence à chaque
changement de filtre.

Rien de tout ça n'était un défaut le jour où ça a été écrit : à deux cents offres, c'est
instantané. C'est ADR-0019 — multiplier le volume par trente — qui l'a transformé en panne.
**Un coût en O(n × m) est invisible tant que n et m sont petits** : un lot qui change le volume
oblige à relire les boucles qui balayent une liste par élément, pas seulement les bornes qu'on
s'était données.

`indexEmployeurs` garde la règle et l'ORDRE à l'identique — ×3, 1 767 tests verts. L'ordre
compte : `find` rend le PREMIER nom qui apparie, pas le meilleur, donc « Robert » tombe sur
« Groupe Robert » s'il a été rencontré avant. Un index par égalité exacte serait plus rapide
encore et rendrait « Robert » : c'est une décision de produit, pas une optimisation, et la
perturbation qui l'introduit fait rougir deux tests — c'est exactement ce qu'on attend d'eux.

## 2026-09-21 (Lot 6) — Le même défaut vivait aux DEUX bouts du fichier, personne ne l'avait vu à l'affichage

Suite directe de `[CARTE-PERF]`. Le lot précédent avait rendu O(1) le regroupement par
sous-chaîne (`apparier`) sans toucher à la règle — ~1,1 s restaient par écran. Pour aller
plus vite, il fallait une VRAIE clé de `Map` (une égalité), pas un meilleur index d'une
recherche floue. Ça a changé la question posée : est-ce qu'une égalité stricte, la MÊME que
`memeEmployeur` (déjà écrite, déjà testée, déjà utilisée pour les DONNÉES), convient aussi
pour l'AFFICHAGE ?

En rouvrant `lib/employeurs.ts` pour répondre, son propre en-tête racontait déjà l'histoire :
`apparier("Robert", "Groupe Robert")` vaut `true`, et ce défaut avait un jour fait fusionner
deux entreprises sans rapport côté DONNÉES — corrigé depuis, `positionDe` utilise
`memeEmployeur`. **Ce même défaut vivait encore côté AFFICHAGE**, dans `construireVue` et
`grouperParEntreprise`, personne ne l'avait signalé — parce qu'un faux regroupement visuel se
corrige à l'œil (on voit deux offres sous une seule carte, ça semble juste une bizarrerie de
présentation), alors qu'un faux regroupement de DONNÉES écrit un chiffre faux en silence. Le
défaut est le même ; seule sa VISIBILITÉ diffère, et la visibilité n'est pas une preuve
d'innocuité.

Passer à `memeEmployeur` avait un coût mesurable, mesuré AVANT de trancher :
`SEED` × `ENTREPRISES_CIBLES`, offres actives → 2 employeurs (`STERIS`/`STERIS Canada`,
`Exo-s Saint-Damien`/`Exo-s`) qui appariaient au sens flou et pas au sens strict, parce que
« Canada » et « Saint-Damien » ne sont pas des suffixes juridiques. Sans conséquence
PRODUCTION aujourd'hui (ces deux offres ont un `km` manuel, jamais retouché), mais une vraie
propriété PRÉEXISTANTE de `memeEmployeur` que ce lot a rendue visible, pas créée — portée au
BACKLOG (`[EMPLOYEUR-VARIANTE]`), pas corrigée (scope non demandé).

Second fait trouvé en investiguant le « coût serveur » que Marc a demandé d'inclure : la
page Carte lisait CINQ sources Neon en SÉRIE (`domicile`, rayon, offres, positions, trajets),
alors qu'aucune des quatre premières ne dépend d'une autre. `app/page.tsx` avait déjà la
bonne forme (`Promise.all`, posée deux lots plus tôt) — cette page-ci était la seule
restante. Passée en parallèle, vérifiée par scan de source (pas de harnais de rendu dans ce
dépôt) : un motif qui isole le bloc `Promise.all` et vérifie qu'aucune des cinq lectures ne
réapparaît en `await` isolé au-dehors.

Le scan de câblage (`tests/cartePageParallele.test.ts`) applique directement la règle n° 167
(lot précédent) : une assertion « aucun `await` isolé hors du bloc » n'a de sens que si le
motif RETIRE d'abord le contenu du `Promise.all` avant de chercher — sinon les cinq `await`
qui sont légitimement DEDANS se compteraient comme « hors bloc » et le test échouerait
toujours, quelle que soit la vraie structure du code. Écrit ainsi dès le premier jet cette
fois ; la mutation (Q1, un `await` isolé réintroduit) confirme qu'il rougit pour la BONNE
raison.

### `[PERSIST-02]` — la liste des chemins d'écriture d'offres, découverte plutôt qu'écrite

`tests/persistance.test.ts` gardait trois chemins ÉCRITS À LA MAIN (`lib/veilleComplete.ts`,
`lib/actions.ts`, `lib/synchro.ts`). Remplacés par une découverte par balayage récursif de
`lib`, `app`, `scripts` — même patron que `cheminsQuiEcriventLeLien` posé le 18/09 dans
`tests/ingest-pipeline.test.ts` pour un défaut jumeau (un chemin supprimé y était resté
listé). Le balayage a trouvé **cinq** chemins, pas trois : les deux manquants,
`app/api/mcp/route.ts` (ADR-0011, n'écrit que les champs de Marc) et `lib/cv/actions.ts`
(ne pose que la note et sa version de profil), sont des écritures CIBLÉES qui n'appellent
jamais `colonnesOffre`/`colonnesSeed` — légitimement : ni l'une ni l'autre n'insère une
ligne complète, et Postgres refuserait de toute façon un `.insert` sans les colonnes
`NOT NULL`.

Le premier réflexe — exiger que TOUS les chemins découverts appellent la source unique de
colonnes — cassait sur ces deux-là. Le bon découpage suit ce que chaque chemin FAIT : un
invariant universel (aucun chemin ne réénumère la liste de colonnes à la main, détecté par
la présence du marqueur `salaireAffiche:` dans un objet `.values({`/`.set({`) et un
invariant plus étroit (seuls les `.insert(offers)` doivent appeler `colonnesOffre`/
`colonnesSeed`, parce qu'eux seuls ont besoin de la liste complète). Un second test fige
que les deux chemins ciblés restent dans la population découverte, pour qu'une disparition
ou un troisième cas similaire se signale plutôt que de rétrécir silencieusement ce que le
premier test vérifie.

Une vacuité trouvée en cours de route, par mutation testing (perturber `if
(/\.insert\(offers\)/.test(source))` en `if (false)`) : ma première version de « au moins un
chemin insère réellement » relisait les fichiers avec le MÊME motif, mais dans une
expression SÉPARÉE du `if` testé — donc restée VRAIE même quand la branche du `if` était
débranchée. Le test restait vert alors que la garde qu'il prétendait vérifier ne tournait
plus. Remplacée par un compteur (`inserteurs`) incrémenté DANS la branche : lui seul peut
prouver qu'elle s'est exécutée. Reperturbé, il rougit correctement.

