# ADR-0010 — Lire les offres DEPUIS L'APP : sources candidates, mesure d'accès, extraction

- **Statut** : **Accepté** (décision Marc, 2026-08-19 : « TOUT et rajoute aussi Indeed,
  LinkedIn, Jobillico, ZipRecruiter »). Q1, Q2 et Q3 sont ouvertes ; quatre agrégateurs
  s'ajoutent au périmètre de MESURE. **Aucune source n'ingère encore quoi que ce soit.**
- **Date** : 2026-08-19
- **Exigé par** : garde-fou n°4 (« *Verrou : ADR-0002 avant toute nouvelle source* »)
- **Se lit après** : ADR-0005 (précision de la veille), et le retrait `[VEILLE-35]`

## Contexte — ce qui est mesuré aujourd'hui, pas supposé

La veille n'a plus **qu'une seule source** : `depot-fichier`, un lot que je dépose à la main
depuis une session Claude où vivent les connecteurs Indeed et ZipRecruiter. `RECHERCHES_GUICHET`
est vide (flux 404 prouvé) et les pages carrières sont parties avec `[VEILLE-35]`.
Marc veut que **l'app** lise les offres elle-même.

Trois faits mesurés le 2026-08-19 cadrent tout ce qui suit.

**1. Je ne peux PAS vérifier l'accès aux sources depuis ma session.** Onze sondes, onze
refus, tous au même endroit : `curl: (56) CONNECT tunnel failed, response 403`, et la page
d'état du proxy nomme les refus (`gateway answered 403 to CONNECT`) pour
`guichetemplois.gc.ca`, `jobbank.gc.ca`, `open.canada.ca`, `donneesquebec.ca`,
`boards-api.greenhouse.io`, `api.lever.co`, `api.smartrecruiters.com`, `recruitee.com`,
`apply.workable.com`. La passerelle de la session n'autorise que son allowlist
(`*.hubperso.com`, npm, pypi…). **Ces 403 ne disent RIEN du monde** — c'est la leçon déjà
consignée : « une mesure faite depuis une session bloquée par le proxy ne mesure que le
proxy », et un `0/180` en avait déjà découlé.

**2. L'app, elle, est joignable depuis ma session** (`emploi.hubperso.com/api/hub/summary`
→ 401 propre, donc la requête atteint la route). Et une route inexistante rend **401**, pas
404 : la middleware garde tout. Une sonde déployée y serait donc gardée par construction.

**3. La machinerie ATS a SURVÉCU à `[VEILLE-35]`.** Ce qui a été retiré est la **découverte**
(deviner l'identifiant d'une entreprise chez un ATS), pas le transport :

| Ce qui existe déjà | Où |
|---|---|
| `urlAts(famille, jeton)` — 5 familles | `lib/ingest/sources.ts:107` |
| `analyseurAts(famille)` — 5 analyseurs | `lib/ingest/sources.ts:123` |
| `sourceAts(ats)` — **orphelin, aucun appelant** | `lib/ingest/sources.ts:157` |
| `texteSimple(html)` — HTML → texte | `lib/ingest/analyseurs.ts:21` |
| 36 employeurs cibles (nom, ville, km, lecture) | `lib/reference.ts:74` |

Autrement dit : le tuyau est posé et testé, il ne lui manque qu'une **liste d'entrée**. Le
chantier est bien plus petit qu'il n'en a l'air — encore fallait-il le regarder avant de le
redessiner.

## Décision demandée

Trois questions distinctes, que Marc peut trancher séparément.

### Q1 — Ré-ouvre-t-on les API ATS, en liste CURÉE cette fois ?

⚠️ **Ce n'est pas revenir sur `[VEILLE-35]`, et la distinction est le cœur de cet ADR.**
Ce qui a été retiré, c'est le **devinage** : fabriquer un identifiant à partir d'un nom
d'entreprise et interroger cinq ATS pour voir. Trois semaines pour inscrire DEUX employeurs,
dont un (Dexterra) qui rendait cent offres pancanadiennes par passe, toutes refusées hors
région. Le verdict de Marc était juste.

Une **liste écrite à la main**, où chaque couple `(entreprise, famille, jeton)` a été
CONSTATÉ une fois — pas déduit — est un objet différent : pas de balayage, pas d'homonyme
d'Amsterdam, pas de budget dépensé à chercher. Le coût par passe est connu d'avance, une
requête par entreprise inscrite.

Ces cinq API sont **publiques et documentées**, faites pour être consommées : elles tombent
dans l'exception « API officielles » du garde-fou n°4, pas dans le scraping.

### Q2 — Ré-ouvre-t-on le Guichet-Emplois ?

C'est la source que le garde-fou n°4 nomme **explicitement** comme exception, et la seule
qui couvre la région sans partenariat. Elle a été déclarée morte sur deux constats — un flux
404, puis un hôte bloqué — dont **le second ne vaut que pour ma session**. Ce qui reste à
savoir : est-ce que *Vercel* la joint, et si oui, quelle URL rend des offres RÉELLES.
Le §3 y répond par la mesure, pas par l'espoir.

### Q3 — Lit-on des pages HTML de portails publics ?

**Recommandation : non, pas dans ce lot.** Une API publique se consomme ; une page HTML se
*scrape*, même sur un site gouvernemental, et le garde-fou n°4 ne l'exempte pas
automatiquement. Si on y vient, chaque site exige sa propre vérification (`robots.txt`,
conditions), site par site, dans un ADR séparé.

## §2 bis — Les quatre agrégateurs ajoutés par Marc, et ce que chacun permet vraiment

Marc a ouvert les trois questions et ajouté Indeed, LinkedIn, Jobillico et ZipRecruiter.
Ils entrent donc dans le périmètre. **Mesurer n'est pas ingérer**, et la distinction porte
tout le reste de cette section : une requête pour caractériser une réponse est légitime
partout ; en tirer un flux d'offres dépend de ce que le service AUTORISE.

Pour ces quatre-là, la sonde ne demande donc pas « est-ce joignable ? » — ils répondent
tous — mais **`robots.txt`**, c'est-à-dire ce qu'ils autorisent de leur propre main. C'est
la première question honnête pour n'importe quel site, et la seule qui décide de la suite.

| Source | Voie légale connue | Ce que la sonde tranche |
|---|---|---|
| **Indeed** | *aucune voie publique* — l'API Publisher est fermée aux nouveaux inscrits depuis 2024 (mesuré). Le connecteur Indeed vit dans une session Claude, **pas dans l'app**. | ce que `robots.txt` permet |
| **LinkedIn** | *aucune voie publique* — pas d'API d'offres ; Talent Solutions est réservée aux partenaires. | idem — et le risque porte sur le COMPTE de Marc, pas seulement sur l'accès |
| **Jobillico** | *partenaire* — MESURÉ : leur API est une API de PUBLICATION, tout y est scopé aux entreprises gérées par le compte. Voie côté employeur, pas côté chercheur. | reste-t-il un flux public ? |
| **ZipRecruiter** | *partenaire sur demande* — un programme Publisher existe et s'obtient par inscription ; l'API répond 401 sans clé. | **la seule des quatre dont la voie légale est à portée d'une démarche** |

⚠️ **Ce que la sonde ne pourra PAS rendre légitime.** Si `robots.txt` interdit et qu'aucun
programme partenaire n'est ouvert, il reste une seule façon technique d'ingérer : se faire
passer pour un navigateur. Ce n'est pas un détail d'implémentation — c'est exactement ce que
le garde-fou n°4 interdit, mot pour mot, et il a été écrit par Marc. Trois conséquences
qu'il faut avoir dites AVANT et non après :

1. **Ça exige de réviser le §4 du CLAUDE.md**, explicitement, dans un commit qui le dit.
   Contourner en silence une règle que le projet affiche serait pire que la règle elle-même.
2. **Ça casse en permanence.** Indeed et LinkedIn sont derrière une détection de robots ;
   une IP de fonction serverless est identifiée vite. Le CLAUDE.md le note déjà pour
   LinkedIn : « un pipeline qui casse en permanence et expose le compte n'est pas une feature ».
3. **Le coût n'est pas symétrique.** Une source qui casse coûte une source ; un compte
   LinkedIn banni coûte le réseau professionnel de quelqu'un qui cherche un emploi.

**Recommandation, une fois, puis on suit la décision de Marc** : engager la démarche
ZipRecruiter Publisher (voie propre, effort réel mais borné), garder Indeed via le canal
qui marche déjà — le dépôt quotidien depuis la session Claude — et laisser LinkedIn de côté
tant qu'aucune voie ne s'ouvre. La sonde donnera les chiffres pour trancher autrement.

## §3 — L'étape 1 est une SONDE DÉPLOYÉE, et elle n'est pas négociable

**On ne peut pas écrire la liste des sources accessibles depuis ici.** Toute affirmation
d'accès écrite aujourd'hui serait une déduction, et ce projet a déjà payé deux fois pour ça
(les formes d'URL du Guichet-Emplois écrites avant d'être visitées ; le `0/180` du proxy).

Donc : **avant toute source, une route de diagnostic déployée**, qui mesure depuis Vercel —
là où le code tournera.

- `lib/ingest/sonde.ts` — la fonction PURE d'interprétation + le fetch borné. Elle vit dans
  `lib/ingest/` parce que c'est **le seul dossier autorisé à sortir vers une source d'offres**.
- `app/api/diagnostic/sources/route.ts` — gardée par la middleware (401 par défaut, vérifié),
  plus une revérification de session côté serveur, et `routesGardees.test.ts` la couvrira.
- Elle rapporte, par candidat : **code HTTP · content-type · taille · un ÉCHANTILLON du
  contenu**. L'échantillon est le point crucial : « un flux VALIDE n'est pas un flux UTILE »
  — le RSS d'Espresso-Jobs rendait 200, du XML bien formé, 20 entrées… de blogue.
- **Témoin négatif obligatoire** avant de croire un signal de présence : on interroge un
  identifiant qu'aucune entreprise ne porte. Mesuré en juillet : Greenhouse, Lever, Recruitee
  et Workable répondent 404 (donc leur réponse est exploitable) ; **SmartRecruiters répond
  200** — sa réponse ne vaut rien sans offres réelles.
- Bornée : 1 requête/s, plafond par passe, budget en ms, et un `try` par candidat — une sonde
  qui meurt sur le premier candidat ne mesure rien.
- **Elle parle même quand elle ne trouve rien** : « 0 candidat joignable » et « sonde jamais
  exécutée » sont deux situations opposées, et un outil de diagnostic muet ne diagnostique rien.

### Les candidats à soumettre à la sonde

| # | Candidat | Nature | Statut de l'accès |
|---|---|---|---|
| 1 | `boards-api.greenhouse.io/v1/boards/{jeton}/jobs?content=true` | API publique documentée | **à mesurer depuis Vercel** |
| 2 | `api.lever.co/v0/postings/{jeton}?mode=json` | API publique documentée | à mesurer |
| 3 | `{jeton}.recruitee.com/api/offers/` | API publique documentée | à mesurer |
| 4 | `apply.workable.com/api/v1/widget/accounts/{jeton}?details=true` | API publique documentée | à mesurer |
| 5 | `api.smartrecruiters.com/v1/companies/{jeton}/postings` | API publique documentée | à mesurer — ⚠️ 200 sur un nom bidon |
| 6 | Guichet-Emplois — flux et formes d'URL | source publique officielle (§4 la nomme) | à mesurer, **URL à constater** |
| 7 | `open.canada.ca` — jeux EDSC/Guichet (CKAN) | données ouvertes | à mesurer ; ⚠️ ne PAS amputer la requête avec `fl=` |
| 8 | `donneesquebec.ca` (CKAN) | données ouvertes | à mesurer |

| 9 | `ca.indeed.com/robots.txt` | agrégateur — voie publique inconnue | à mesurer (§2 bis) |
| 10 | `www.linkedin.com/robots.txt` | agrégateur — voie publique inconnue | à mesurer (§2 bis) |
| 11 | `www.jobillico.com/robots.txt` | agrégateur — partenaire | à mesurer (§2 bis) |
| 12 | `www.ziprecruiter.com/robots.txt` | agrégateur — partenaire sur demande | à mesurer (§2 bis) |
| 13-15 | `carrieres.gouv.qc.ca`, `ville.quebec.qc.ca`, Guichet `robots.txt` | portails publics | à mesurer |

*(La ligne « hors périmètre définitif » qui figurait ici est retirée : Marc a ouvert ces
quatre sources à la MESURE le 2026-08-19. Ce qui reste interdit sans révision du §4, c'est
l'INGESTION de ce qu'elles interdisent — voir §2 bis.)*

## §4 — La liste d'entrée : d'où viennent les jetons

`sourceAts` est orphelin faute de liste. Elle se constitue **par constat, jamais par
devinage** — c'est toute la leçon de `[VEILLE-35]`, et `recruitee/robert` (des postes à
Amsterdam) en est la preuve.

1. Les **36 employeurs cibles** de `lib/reference.ts` sont le point de départ.
2. Pour chacun, l'identifiant se **constate** : on ouvre sa page carrières, on lit l'URL
   réelle de son ATS, on inscrit ce qu'on a vu. Un identifiant deviné a déjà produit deux
   faux négatifs silencieux (`chantierdavie` au lieu de `ChantierDavieCanada`).
3. **Deux vérifications indépendantes** avant d'inscrire : l'API répond ET son contenu est
   dans la région. Une seule ne suffit pas.
4. La liste vit en clair dans le dépôt (`lib/ingest/atsCibles.ts`) — aucun secret, et un
   ajout se relit.

## §4 bis — Recensement des ATS, 2026-08-19 : ce que les 36 cibles utilisent VRAIMENT

Constaté par recherche web (WebSearch fonctionne depuis la session ; **WebFetch NON** — même
proxy d'egress, `EGRESS_BLOCKED` — donc je peux trouver un jeton, jamais lire la page qui le
porte ; la vérification appartient à la sonde déployée).

| Employeur | Système constaté | Dans nos 5 familles ? |
|---|---|---|
| Robotiq | SmartRecruiters — jeton `ROBOTIQInc` | **oui** |
| Chantier Davie | Oracle Cloud HCM (`fa.ocs.oraclecloud.com`) | non |
| Techsol Marine | Glow in the Cloud + **Jobillico** | non |
| Revtech Systèmes | page carrières sur son propre site | non |
| Laserax | rien de constaté — **ne pas inventer** | ? |

⚠️ **CE RECENSEMENT RENVERSE LA PRIORITÉ DU §2 bis.** Les cinq familles d'ATS visées sont
celles des entreprises technologiques de taille moyenne ; les 36 cibles de Marc sont en
majorité des **PME industrielles** et de **grands groupes**. Les premières publient sur
Jobillico ou sur leur propre site, les seconds sur Workday / Oracle HCM / SuccessFactors.
Une recherche sur `careers.smartrecruiters.com` restreinte au Québec a rendu Vidéotron,
CIMA+, Vosker, O-I — aucune des 36.

Trois conséquences, à trancher avec les chiffres de la sonde :

1. **Le rendement des 5 familles est probablement FAIBLE sur cette liste précise.** Elles
   restent gratuites à brancher (le transport existe), mais promettre du volume serait
   exactement le chiffre-titre non mesuré que ce projet s'interdit.
2. **Jobillico monte en priorité, et passe devant ZipRecruiter.** C'est là que publient
   Chantier Davie et Techsol Marine — deux cibles réelles. Son `robots.txt` ne bloque que
   `/ajax/`, `/social/` et les pages de test A/B ; les chemins de recherche d'emploi n'y
   sont pas interdits. ⚠️ Mais un `robots.txt` dit ce qu'un moteur peut INDEXER, pas ce
   qu'on peut faire des données : ses **conditions d'utilisation** restent à lire, et ce
   sont elles qui lient.
3. **Oracle Cloud HCM mérite d'être évalué comme 6ᵉ famille.** Son interface candidat
   s'appuie sur une API REST publique (`recruitingCEJobRequisitions`) ; Davie l'utilise, et
   les grands groupes de la liste probablement aussi. Ce serait une **nouvelle famille**
   dans `FAMILLES_ATS`, donc du code et un test — pas un simple ajout de jeton.

## §5 — Traiter le texte : « voir toutes les subtilités »

`texteSimple` retire les balises. Ça ne suffit pas : ce qui décide du tri vit DANS la prose.
Quatre besoins, tous en **fonctions pures testables**, hors des I/O — la convention du projet.

| Ce qu'on extrait | Pourquoi ça change une décision | Piège déjà mesuré |
|---|---|---|
| **Ville réelle** | l'en-tête de liste MENT | « Quebec Province » ⇒ Saguenay (vécu 2×, dont ce matin) |
| **Adresse civique** | position, donc distance | numéro **ET** voie, sinon Nominatim rend la municipalité et elle passe pour exacte |
| **Salaire** | classement | horaire vs annuel : « 55 $/h » ≠ « 55 000 $/an » |
| **Mode de travail** | présentiel / hybride / télétravail | un « télétravail » hors région n'est pas hors région |
| **Séniorité, exigences** | note de fit | clearance, permis de travail, bilinguisme |
| **Type d'emploi** | stage/temporaire à écarter | « stage » se dit aussi « Internship / Co-op » |

Deux exigences transversales, non négociables :

- **`expurgerPII` s'applique à TOUT texte ingéré, et le garde refuse.** Le couple outil+garde
  a échoué ce matin même sur une civilité anglaise ; élargir ce qu'on lit élargit la surface
  de PII, et le dépôt est **public**.
- **Le vocabulaire doit être BILINGUE.** C'est la classe de défaut la plus fréquente de ce
  projet — `[VEILLE-32]` (barème), `[VEILLE-34]` (accents), la fuite PII de ce matin
  (civilités FR seules). Toute liste de mots qui décide de quelque chose se écrit dans les
  deux langues, ou le plus restrictif des deux gagne en silence.

⚠️ **L'extraction alimente le barème, donc le §8 du CLAUDE.md s'applique** : ADR, puis audit
sur les 38 offres du seed avec le tableau avant/après, AVANT de brancher quoi que ce soit.

## §6 — Ordre d'exécution proposé

1. **Sonde déployée** + son rapport lisible. *Rien d'autre.* Elle seule peut écrire la liste
   des sources réellement accessibles.
2. **Lire le rapport avec Marc** et trancher Q1/Q2 sur des chiffres.
3. Liste ATS **constatée** (§4), puis `sourceAts` re-branché dans `selectionnerSources` —
   avec la contre-pression et la rotation déjà en place.
4. Extraction (§5) en fonctions pures + tests, **sans** toucher au barème.
5. Branchement au barème : ADR séparé + audit sur les 38 offres (§8).

Les étapes 1 à 3 ne touchent NI `lib/scoring.ts` NI la logique de matching : elles n'appellent
donc pas le §8. L'étape 5, oui.

## Livré avec cet ADR (2026-08-19)

- `lib/ingest/sondeSources.ts` — 15 candidats, mesure en série, contre-pression 1,1 s,
  10 s par candidat, un `try` par candidat. **Ne réutilise PAS `recuperer`**, qui LÈVE sur
  un non-2xx et écrase donc la seule information cherchée : le code.
- `app/api/diagnostic/sources/route.ts` — gardée par la middleware **et** revérifiée côté
  serveur ; `routesGardees.test.ts` la découvre et l'exige (vérifié, pas supposé).
- `tests/sondeSources.test.ts` — 17 cas, dont les deux discriminants qui comptent :
  « 200 sans offre » ≠ « 200 avec offres » (le piège SmartRecruiters) et « 403 » ≠
  « injoignable » (la confusion qui avait produit le 0/180).

## Ce que cet ADR ne fait pas

- Il n'ouvre aucune ingestion. Il livre **une mesure**, et fixe ce qu'il faudra prouver.
- Il ne rouvre pas la découverte automatique : `[VEILLE-35]` tient.
- Il ne promet aucun volume. Tant que la sonde n'a pas tourné, « combien d'offres en plus »
  n'a pas de réponse honnête.
