# ADR-0010 — Lire les offres DEPUIS L'APP : sources candidates, mesure d'accès, extraction

- **Statut** : **Proposé** — en attente de la décision de Marc (aucune ligne de source écrite)
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

**Hors périmètre, et c'est définitif** : Indeed, LinkedIn, Jobillico, ZipRecruiter — conditions
d'utilisation, blocage actif, ou API réservée aux éditeurs. Mesuré et refermé.

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

## Ce que cet ADR ne fait pas

- Il n'autorise aucune source. Il autorise **une mesure**, et fixe ce qu'il faudra prouver.
- Il ne rouvre pas la découverte automatique : `[VEILLE-35]` tient.
- Il ne promet aucun volume. Tant que la sonde n'a pas tourné, « combien d'offres en plus »
  n'a pas de réponse honnête.
