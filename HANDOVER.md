# HANDOVER — JobAI

> État courant du projet, **à lire en premier** à chaque reprise de session.
> Antichronologique : la session la plus récente en haut. Ne rien inventer ici — si un point
> n'a pas été vérifié, écrire « à confirmer ».

---

## Session 2026-08-06 — la borne la plus proche (et non plus « aucune » partout)

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**694**) + `lint` (0 avertissement) + `build` verts, jugés par exit code. |
| **Le vrai défaut des bornes** | La mesure fonctionnait (`bornes=81/81`, aucune ligne d'erreur, migration `0011` appliquée) — c'est le **plafond de 350 m** qui rendait la réponse inutile : presque aucun employeur industriel n'a de borne à trois coins de rue, donc l'écran affichait « aucune » partout. Exact, et sans valeur. |
| **[BORNE-05]** | Le plafond est retiré : `proximiteBorne` rend **la plus proche, quelle que soit sa distance**. La portée de la requête passe de 350 m à 15 km (`PORTEE_RECHERCHE_M`), et `ETENDUE_MAX_DEG` de 2 à 3 — la marge coûte ~0,4° en longitude, et un lot Portneuf↔Charlevoix arrivait à 1,99°, au bord du refus. |
| **Ce qu'on rapporte en plus** | La **marque** (`network` → `brand` → `operator` → `name` : le réseau AVANT le nom, qui porte souvent le stationnement d'accueil), la **vitesse** (`fast_charge`, prises à courant continu, puissance ≥ 25 kW) et le **tarif publié**. Nouvelles colonnes `bornes_rapide`, `bornes_tarif` ; migration `0012` efface les dates pour tout remesurer au nouveau sens. |
| **Prix moyen : non** | ⚠️ **OpenStreetMap ne porte pas de prix moyen.** Il porte `fee` (payant ou non) et, plus rarement, `charge` — le tarif relevé sur la borne. On rend ça, et « payante, tarif non publié » sinon. Fabriquer une moyenne à partir de tarifs de catalogue donnerait un chiffre crédible que personne n'a mesuré (garde-fou n°3). |
| **Couverture réelle** | Inconnue tant que la passe n'a pas tourné : le proxy de la session **refuse Overpass** (403 au CONNECT sur les trois instances), impossible de mesurer d'ici. D'où la ligne `[bornes] … marque=X/N vitesse=Y/N tarif=Z/N` — c'est la production qui répondra, pas une supposition. |

### Deux défauts trouvés en écrivant les tests

- **`prisePresente` rendait `true` sur un tag ABSENT.** Écrit `texte(v)?.toLowerCase()` puis
  comparé à `null`, le prédicat comparait en fait `undefined` à `null` : toutes les bornes
  passaient pour rapides, y compris celles qui déclarent `socket:chademo=no`. Le `null` se
  teste **avant** le `?.`, jamais après.
- **La boîte et la distance n'utilisaient pas le même modèle de Terre.** Les boîtes
  employaient 111 320 m par degré (WGS84 à l'équateur), `distanceM` une sphère de 6 371 km,
  soit 111 195 m. La boîte était 0,11 % plus petite que la portée demandée, mesurée par la
  fonction même qui filtre ensuite : 17 m de manque sur 15 km — invisible à 350 m. Un seul
  `RAYON_TERRE_M`, partagé.

### Ce qui reste ouvert

- **`[LIEU-01]`** — « toutes les offres et entreprises aient un emplacement ». Les pistes
  mesurées en production montrent que **Adecco** (« ADECCO QUÉBEC ») et **S Huot**
  (« RÉAL HUOT INC. ») existent bien au registre : c'est le nettoyage de nom qui échoue,
  pas le registre. `Permafil`, `Agilean`, `AMETEK` en sont réellement absents.
- **`[VEILLE-05]`** — « qu'il m'en trouve des nouvelles chaque jour ». Les sept sources
  automatiques sont closes ; le seul canal vivant reste `POST /api/ingest/depot`.
- **Signature des commits** : toujours bloquée (clé de signature de 0 octet dans le conteneur).

---

## Session 2026-08-05 (soir) — le registre des entreprises, et les adresses qui viennent avec

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**649**) + `lint` (0 avertissement) + `build` verts, jugés par exit code. CI consultée après chaque push. |
| **Bornes de recharge** | ✅ **Mesuré en production, 76/76.** C'était `2/6 (3 en échec) · budget restant=0 ms` : une requête Overpass PAR entreprise, et un échec coûte le délai × trois instances de repli. Désormais **une seule requête pour tout le lot** (boîte englobante, proximité calculée en local), et le coût réseau ne dépend plus du nombre de lieux. La passe rend maintenant 27 s de budget sur 35. |
| **Registre des entreprises** | Importé : **28 821 établissements** de la région + **59 194 dénominations** (`registre_etablissements`, `registre_noms`). Fichier officiel téléchargé par Marc — l'IP des runners GitHub est refusée par Cloudflare, et le datastore de Données Québec ne contient qu'une page d'erreur (leur propre moissonneur a heurté le même mur). Aucun fichier de personnes n'est lu (garde-fou n°1). |
| **Adresses sans réseau** | `adressesDepuisRegistre` comble les adresses manquantes **sans aucun appel réseau**, donc sans budget de temps. Deux chemins de recherche : le nom d'établissement, puis les **dénominations** — le second manquait, et c'est lui qui a fait passer le rapprochement de `11/73` à un chiffre en progression. |
| **Position par l'adresse** | ✅ **Mesuré : `precisees=4/6 (4 par adresse)`.** Quand on tient une adresse du registre, on la géocode **elle** au lieu du nom de l'entreprise — OpenStreetMap ne cartographie pas les raisons sociales, mais une adresse civique est son cœur de métier. La première passe après le rattrapage a rendu 4 positions exactes sur 6 candidates (1 hors rayon écartée, 1 introuvable). |
| **Source de l'adresse** | Colonne `adresse_source` (`osm` \| `registre`), contrainte en base « l'une sans l'autre, jamais ». Dite à l'écran : les deux ne valent pas la même chose. |
| **Diagnostic** | Les refus du registre sont **nommés**, pas seulement comptés (`[registre] absentes — …`). « 53 absentes » ne se vérifie pas ; trois causes possibles appellent trois correctifs opposés. |

### Ce qui reste ouvert

- **Les 53 absentes du registre** : les noms sont connus (`AMETEK`, `Evident Scientific`,
  `Permafil Inc.`, `Groupe Mundial`, `Garoy Construction inc.`…). Ce qui manque encore,
  c'est ce que le registre porte SOUS ces noms — la ligne `[registre] pistes` le dira à la
  prochaine passe. Ne rien élargir avant : une clé de rapprochement trop stricte, un
  organisme absent du registre régional et une marque ≠ raison sociale se corrigent de
  trois façons contraires. `Groupe Laberge (118)` est un cas à part : 118 établissements
  dans la région, le refus est défendable tant qu'on ne sait pas auquel le poste se rattache.
- **Rappel de fonctionnement** : la passe ne tourne **que** quand Marc ouvre l'app — la
  session ne peut pas s'authentifier à sa place pour la déclencher.
- **Refonte visuelle totale** — demandée explicitement par Marc comme chantier suivant,
  séquencée après le ratio.
- **Signature des commits** : toujours bloquée (clé de signature de 0 octet dans le
  conteneur).

### Le piège du jour, en une phrase

Une passe de fond lancée par `after()` **vit dans l'invocation de la page** : elle hérite
de son `maxDuration`, elle ne s'y ajoute pas. Trois `GET /carte` d'affilée sont morts en
« Task timed out after 30 seconds » sans qu'une ligne de trace ne sorte, parce qu'un budget
laissé à `null` n'est pas un grand budget — c'est aucune borne. Verrouillé par
`tests/budgetPasse.test.ts`, qui relit les trois exemplaires du fait sur le disque.

---

## Session 2026-08-05 — filtres partout, bornes de recharge, et la chasse aux sources close

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (562 à ce moment-là, **641** au soir) + `lint` + `build` verts. Jugé par **exit code**, jamais derrière un `\| grep`. |
| **Sources d'offres** | ❌ **Les sept sont mortes, mesurées.** Le verdict complet est en tête de `scripts/sonder-ouvert.ts` et dans `docs/ROUTINE-DEPOT.md`. Les deux jeux Données Québec nommés « Offres d'emploi » — la dernière piste — sont ceux des **villes de Laval et de Montréal**, leurs propres postes, à 250 km. Il n'existe aucun jeu provincial d'offres. |
| **Le seul canal qui produit** | `POST /api/ingest/depot`, alimenté par une Routine claude.ai. Son prompt vivait **uniquement dans la Routine** — invisible, non versionné, incorrigible ; il est désormais dans `docs/ROUTINE-DEPOT.md`, avec les recherches à lancer et la lecture du rapport de refus. |
| **Filtres** | Identiques sur la liste et la carte (`lib/filtres.ts`, `components/Filtres.tsx`). `proches: boolean` est devenu `distanceMaxKm` à paliers (10 / 25 / 50) ; `sansDistanceMesuree` distingue « loin » de « pas mesuré ». |
| **Carte** | Part des offres, se complète **sans clic** (`after()` + `reserverPasse`). Le gate est `km === null` (le résultat visé), jamais `!positions.has(nom)` — ce dernier ne converge pas quand la position est inscrite sous un autre nom. Un seul `after()`, travaux en série : deux `after()` s'exécutent en parallèle (mesuré). |
| **Bornes de recharge** | `[BORNE-01..03]` livré : `lib/bornes.ts` (pur) + `lib/overpass.ts` + migration `0006`. **Trois états, pas deux** : `bornesLe` NULL = jamais interrogé, posé sans distance = aucune à moins de 350 m, posé avec = la distance. Un échec de sonde n'écrit **pas** la date, donc la ligne est retentée. ✅ **A tourné, et le premier résultat était mauvais** : `2/6 (3 en échec)`, budget épuisé. Corrigé le soir même par la requête unique — voir la section du soir. |
| **Adresses** | `rattraperAdresses` valide la position obtenue par la **distance à l'ancre** (`> RAYON_VALIDATION_KM` ⇒ écartée) : sans ça, un homonyme d'ailleurs s'inscrivait « exacte » à vie — mesuré à 233 km. Budget partagé avec `situerLot` par un chrono unique, sinon chacun repartait à zéro et le total doublait. ⚠️ **À confirmer en production.** |
| **Interface** | `[UX-13]` : les 22 tailles de police sont devenues une **échelle de six pas** (zéro `font-size` littéral restant), fond neutre (il tirait sur le crème), espacements +25 %, interlignage 1,65, mesure de lecture à 68 caractères. |
| **Schéma** | Tout chemin de lecture garantit désormais son schéma : `getTrackerState` (sondage du hub) était le seul à ne pas appeler `assurerMigrations` — ça marchait par chance, ses colonnes datant de la première migration. |

### Ce qui reste ouvert

- **Vérifier en production** que `rattraperAdresses` et `mesurerBornes` ont réellement
  tourné — journaux Vercel, pas déduction. Les deux sont livrés et testés sur du simulé.
- **Faire tourner la Routine tous les jours** avec le prompt de `docs/ROUTINE-DEPOT.md`.
  C'est la réponse à « pas assez d'offres » : un dépôt en 72 h ne remplit pas une liste.
- **Analyse LLM des offres** et **lecture Gmail via DriveAI** : acceptés, non commencés.
- **Signature des commits** : bloquée — la clé de signature de l'environnement est un
  fichier vide (0 octet). Il faut une vraie clé SSH dans le conteneur, déclarée comme
  *Signing key* sur le compte GitHub de Marc.

---

## Session 2026-07-31 — la veille produit du réel, et la carte le montre

> ⚠️ Les entrées des 29 et 30 juillet n'ont jamais été consignées : ce qui suit rattrape
> l'état à partir du code réel, pas d'une mémoire de session. Ce qui n'a pas été vérifié
> aujourd'hui est marqué « à confirmer ».

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**534**) + `lint` (0 avertissement) + `build` verts. Jugé par **exit code**, jamais derrière un `\| grep` — un filtre masque le code de sortie. |
| **Base** | Migrations **appliquées automatiquement au démarrage** (`lib/migrations.ts`, demande de Marc : « plus jamais à faire run db:migrate »). Mémorisée par processus, n'échoue jamais vers l'appelant. `0004` = colonne `offers.ville`. |
| **Veille** | ✅ **Produit du réel.** Premier vrai lot le 2026-07-31 : 45 offres reçues, 40 ajoutées (38 → 78 actives), vérifié dans les journaux Vercel. Le chemin est `POST /api/ingest/depot` — une Routine claude.ai envoie, l'app trie (même filtre région, même plancher `fitRole`, même dédoublonnage que le cron). Les sources automatiques restent mortes : Guichet-Emplois 404 sur 5 URL, ATS américains sans employeur local, Jobillico/Québec emploi/Isarta sans flux. |
| **Distance** | `DOMICILE_ADRESSE` géocodée une fois et conservée en base (`sync_state`), sinon `DOMICILE_LAT`/`LON`. Mesure automatique après réponse (`after()`), bornée à une passe / 5 min. |
| **Carte** | Part des **offres** depuis `[CARTE-01]`, plus des seules 36 entreprises cibles. Deux manques distincts : `aSituer` (se règle à la prochaine passe) et `sansLieu` (la source n'annonce pas de ville — aucune passe n'y changera rien). |
| **Employeurs** | Un seul endroit décide que deux noms désignent le même employeur : `lib/employeurs.ts` (`apparier`, `positionDe`), appelé par la carte ET la mesure des distances (`[DIST-02]`). Avant, la mesure comparait littéralement et re-géocodait ce qui était déjà situé. |
| **Adresse** | Récupérée d'OpenStreetMap (`display_name`) et stockée (`entreprises_lieux.adresse`, migration 0005), **uniquement sur une position exacte** — sur un repli au centre-ville ce serait l'adresse de la mairie. `rattraperAdresses` complète l'existant : les entreprises situées avant la colonne ne seraient jamais retentées. ⚠️ **Jamais tourné en vrai au 31/07** — testé sur du simulé seulement. |
| **Relances** | ✅ Branchées (`components/Relances.tsx` sur l'accueil). `lib/aFaire.ts` consomme désormais `lib/relances.ts` : il portait sa propre règle et ne surveillait que `CVenvoye`, si bien qu'une candidature déjà relancée disparaissait à jamais. |
| **Déploiement** | ⚠️ **Le webhook GitHub → Vercel a manqué trois pushes le 31/07** (`8145e4c`, `f479ae0`, `92d6dc6` n'ont AUCUN déploiement). Vérifier le SHA servi en production, pas l'existence d'un déploiement récent — et « Redeploy » rejoue l'ancien commit, il ne rattrape pas. |
| **Ville d'une offre** | Trois chemins la remplissent : l'ingestion (dépôt et cron, rattrapage compris — on complète, on n'écrase jamais), et le formulaire d'ajout manuel où elle est **facultative**. Une saisie vide vaut absence, jamais une chaîne vide. |
| **Interface** | Refonte « épurée » livrée (`[UX-11]`) : ombres douces à la place des bordures, pastilles, champ de recherche en pill. L'identité (ambre `#f2a31b`, logo monospace) est conservée. |
| **Relances** | `lib/relances.ts` livré et testé (seuils 14 j / 45 j, `Relance` n'est PAS une réponse du recruteur). ⚠️ **Pas encore branché à l'interface** — la logique existe, rien ne l'affiche. |

### Le défaut le plus coûteux de la session, et sa correction

La colonne `ville` n'était écrite par **aucun** des quatre chemins d'insertion : chacun
recopiait sa propre liste de colonnes, et l'ajout de `ville` a été oublié dans les quatre.
Le type la porte, la lecture la lit, l'écriture la perd — sans erreur, sans log. Les 40
offres du premier lot réel sont donc en base sans ville, donc sans position, donc sans
distance et absentes de la carte : le critère numéro un de Marc, perdu en silence.

Correction à la cause (`[CARTE-01]`) : `lib/persistance.ts` porte l'unique copie des
colonnes, `tests/persistance.test.ts` la verrouille en DÉRIVANT la liste attendue de
`OffreSchema`, et un second garde interdit à un cinquième chemin de réénumérer les colonnes.
Le rattrapage des 40 passe par `/api/ingest/depot`, qui complète — sans jamais écraser — la
ville d'une offre déjà suivie, et le compte remonte au rapport (`villesCompletees`).

### Ce qui reste ouvert

- **Rejouer un dépôt** pour rattraper les villes des 40 offres, puis vérifier qu'elles
  apparaissent sur la carte. Le prompt de la Routine est INCHANGÉ.
- **Brancher le suivi des relances à l'interface** (`lib/relances.ts` est prêt).
- **Analyse LLM des offres** et **lecture Gmail via DriveAI** : acceptés par Marc, non
  commencés. Passer par DriveAI évite un scope Google restreint sur JobAI.
- La liste d'améliorations UX que Marc a proposé d'envoyer.

---

## Session 2026-07-28 — cadrage, fondations, fork personnalisé

### État en une page

| | |
|---|---|
| **Dépôt** | `MoKarade/JobAI`, **privé**, créé par Marc. Forké depuis `app-template` (contenu identique, un commit `Initial commit`). |
| **Branches** | **Développement direct sur `main`**, sans branche de travail ni PR (ADR-0002). `main` est la branche par défaut du dépôt (réglé par Marc). ⚠️ La branche `claude/hopeful-lovelace-4d09zx` (ancienne branche par défaut) traîne encore sur le distant, sans usage — `[B-07]`. |
| **Gate** | `typecheck` + `test` + `lint` + `build` verts. Rejoué par la CI à chaque push. |
| **CI** | `.github/workflows/ci.yml` : un seul job `gate` (typecheck · tests · lint · build). Node épinglé par `.nvmrc` (**22**, pas 20 comme les autres dépôts : Node 20 est en fin de support et cette session développe en 22). ⚠️ Le job `garde-fous` a été retiré le 2026-07-28 : ses deux `git grep` doublaient `tests/piiGuard.test.ts` en moins précis, avaient divergé, et tenaient la CI au rouge depuis quatre commits. **Sans PR, une CI rouge ne se voit pas toute seule — la consulter fait partie du push.** |
| **Endpoint hub** | `GET /api/hub/summary` branché sur les vraies données via `getTrackerState()`. `503` si `HUB_TOKEN` absent · `401` si jeton invalide · `200` + `building` tant qu'aucune donnée réelle · `200` + `error` si l'état est illisible (jamais un 500 muet). Métrique en position 0 = la meilleure offre du moment. |
| **Base de données** | Neon (`us-east-2`), migration `0000` **appliquée**. Migrations `0001` (villes) appliquée par Marc le 2026-07-29 ; ⚠️ **la `0002` (table `entreprises_lieux`, carte par entreprises) reste à appliquer** — `npm run db:migrate` (le script vérifie lui-même le résultat). Jeu de départ **chargé**. Connexion paresseuse : le module s'importe au build sans `DATABASE_URL`, l'erreur ne part qu'à la première requête réelle. ⚠️ Le mot de passe initial a été exposé en conversation le 2026-07-28 et **doit avoir été régénéré** — à confirmer. |
| **Sécurité des dépendances** | `npm audit --omit=dev` → **0 vulnérabilité**. drizzle-orm monté en 0.45.2 (injection SQL), Next en 15.5.22 (8 avis HIGH), `postcss`/`sharp` forcés par `overrides`. ✅ **BatchChef corrigé** le 2026-07-28 (PR #22 mergée) : drizzle 0.45.2 + overrides, `npm audit --omit=dev` → 0. ⚠️ Reste ouvert là-bas : **aucune CI**. |
| **Auth utilisateur** | ✅ **Fonctionnelle en production.** Auth.js v5 + Google, une seule adresse (`AUTHORIZED_EMAIL`), middleware **fail-closed** (503 si `AUTH_SECRET`/`AUTHORIZED_EMAIL` manquent). Décision de garde en fonctions pures testées. La page `/connexion` traduit les codes d'erreur d'Auth.js en cause actionnable. |
| **Logique métier** | Complète, testée et branchée : `lib/types.ts` (schémas Zod), `lib/scoring.ts` (barème), `lib/seed.ts` (38 offres), `lib/suivi.ts` (fusion, modification, résumé), `lib/filtres.ts`, `lib/hubSummary.ts`, `lib/actions.ts`, `lib/export.ts`, `lib/ajout.ts`, `lib/aFaire.ts`, `lib/carte.ts`, `lib/geocodage.ts`, `lib/lienTrajet.ts`, `lib/chargerEnv.ts`, `lib/panne.ts`. **340 tests**, dont 19 d'intégration sur PGlite. |
| **UI** | **Navigation par onglets** (vraies routes) : `Suivi` (`/`), `Carte` (`/carte` — épingles par ENTREPRISE depuis [UX-09], repli honnête au centre-ville, fiches avec offres + trajet) et `Références` (`/references`), cadre partagé `components/Cadre.tsx`, direction visuelle actée par [ADR-0003](./docs/adr/0003-direction-visuelle.md) — densité FinanceAI, accent ambre conservé. L'onglet Suivi s'ouvre sur **« À faire maintenant »** (entrevues, relances échues, candidatures à envoyer, offres à vérifier — chacune justifiée par un fait du suivi), puis tableau de bord, ajout manuel et liste (recherche + 5 filtres) ; barème, entreprises, salaires et SWOT sont passés sous `Références`. **Écriture** (statut, priorité, note perso), **vue détaillée** `/offre/[id]`, marquage **périmée**, **export CSV** qui suit les filtres affichés, **lien « Trajet dans Google Maps »** par offre (destination seule — l'origine vient du compte Google de Marc, jamais de l'app ; le chantier carte Google ADR-0004 a été ANNULÉ au profit de ce lien). Styles bi-thème reprenant l'identité de l'artifact. |
| **Chargement du suivi** | `npm run db:seed` charge les 38 offres. **Idempotent et non destructif** : relançable après une mise à jour du jeu de départ, le suivi de Marc est préservé. |
| **Déploiement** | ✅ **EN LIGNE** sur `https://emploi.hubperso.com` (projet Vercel `job-ai`, DNS Cloudflare en DNS only). Vérifié le 2026-07-28 : dernier déploiement production `READY` sur le SHA de `main`, **zéro erreur runtime**. ⚠️ **Vercel ne bloque pas sur la CI** — les quatre commits à CI rouge ont été déployés normalement. Les deux chaînes sont indépendantes : vérifier les deux. ⚠️ Le proxy réseau de la session Claude **refuse `emploi.hubperso.com`** (403 au CONNECT) : la vérification passe par les outils Vercel, pas par `curl`. |
| **Widget hub** | ✅ **ACTIF**. PR #12 de Hubperso mergée (entrée `jobai`), `HUB_TOKEN_JOBAI` posé, hub redéployé. |
| **Chantier courant** | **Chantiers #01 (V1) et #05 terminés côté Claude** sauf `[UX-05]` (agrégateur — décision de Marc requise, pas du code). `[UX-09]` (carte par entreprises) est livré et revu ; son exercice réel (migration `0002` + « Situer ») est côté Marc. Voir `BACKLOG.md`. |

### Ce qui a été fait

- Lecture intégrale des 8 dépôts de l'écosystème (hub-contract, app-template, Hubperso,
  FinanceAI, DriveAI, BatchChef, claude-config, claude-code-toolkit) pour établir le contrat,
  la procédure de branchement au hub et la méthode de travail.
- Analyse des trois pièces fournies par Marc : l'artifact `tracker-emploi-v4.html` (référence
  UI et métier), le `HANDOVER.md` de la session du 27/07 et le squelette `jobtracker`.
- **ADR-0001** : identité, stack, phases V1→V4, périmètre, alternatives rejetées.
- `CLAUDE.md` (constitution, 6 garde-fous non négociables), `BACKLOG.md`, `docs/adr/`.
- Fork personnalisé : identité JobAI, route déplacée sous `/api/`, contrat d'échec 503,
  `.env.example` complété, `package.json` renommé, tests adaptés et étendus.
- **PR #1 mergée** (en merge commit `53b17ff`, pas en squash) — c'était la première et la
  dernière : **ADR-0002** acte le développement direct sur `main`, décidé après le
  va-et-vient de cette PR. Le filet perdu est remplacé par la CI.
- **CI en place** `[B-05]`. Ses deux garde-fous en bash ont été retirés le 2026-07-28 au
  profit du seul `tests/piiGuard.test.ts` — voir `BACKLOG.md` `[B-05]` pour le détail de
  l'incident (CI rouge quatre commits durant, non vue faute de PR).

### Décisions de cette session (détail dans ADR-0001)

IA : analyse d'offres + rédaction de CV/lettres + notation automatique + tri des réponses
Gmail · V1 = port fidèle + hub · Neon + Drizzle · scan Gmail dans JobAI (pas via DriveAI) ·
widget avec la meilleure offre en position 0 · CV lu depuis Google Drive · outillage niveau
DriveAI · dépôt privé.

### Réponses aux questions ouvertes du 27/07

1. **Réutiliser le scan Gmail de DriveAI ? Non.** Vérifié dans le dépôt : DriveAI n'expose
   que `api/hub/summary.ts` vers l'extérieur ; son moteur Gmail vit dans Apps Script à
   l'intérieur du compte Google de Marc, et sa surface Gmail est verrouillée par un check CI
   requis (`test/surface-gmail-ecriture.test.js`). JobAI implémente son propre scan.
   ⚠️ **DriveAI archive les courriels** : une requête limitée à `in:inbox` raterait tout ce
   qu'il a déjà rangé.
2. **Publier un schéma JobAI dans `hub-contract` ? Non.** Le contrat est générique par
   construction. JobAI expose un `HubSummary` standard ; son résumé interne reste privé.
3. **Le scan modifie-t-il les statuts ? Non.** Il propose, Marc valide.

### Risques et points ouverts

1. ⚠️ **Deux scopes Google restreints sur la même app OAuth.** La V2 demande
   `gmail.readonly`, et le choix « CV lu depuis Drive » ajoute un scope Drive. Ce sont des
   scopes *restreints* chez Google : en mode Test, les refresh tokens expirent au bout de
   7 jours [Probable — à confirmer dans la console Google Cloud] ; en production, ils
   déclenchent une vérification lourde. Les autres apps de Marc ne demandent que
   `openid/email/profile`, donc c'est un terrain neuf. **Piste** : `drive.file` + sélecteur
   de fichier Google (l'app ne voit que le fichier explicitement choisi) — satisfait le choix
   « depuis Drive » sans le scope large. À trancher par ADR-0002 avant la V2.
2. **Le contrat est pinné en `v1.0.0`**, donc **sans** le bloc `usage`. Sans effet en V1
   (aucun coût à publier) ; bloquant en V3. Un champ inconnu est stripé silencieusement.
3. **Ajouter JobAI au hub exige un redéploiement du hub** : `SOURCE_DEFS` est du code
   (`Hubperso/lib/sources.ts`), pas de la configuration, et `tests/sources.test.ts` est
   exhaustif — il cassera tant que les trois endroits ne sont pas mis à jour.
4. ~~**Le garde-fou n°1 n'a pas encore de vrai test-garde**~~ — **résolu** le 2026-07-28
   (`tests/piiGuard.test.ts`, `[V1-10]`). Ce qui reste ouvert est sa **portée assumée** :
   il détecte des FORMES (adresse, coordonnées, civilité, secret affecté), pas un nom de
   personne isolé — un motif générique de patronyme est inutilisable en français. Les six
   garde-fous ont désormais un verrou codé, sauf le n°4 (aucun scraping), qui reste tenu par
   l'ADR et la revue.

### Mise en ligne — FAITE le 2026-07-28

Neon, client OAuth Google, secrets, projet Vercel, DNS `emploi.hubperso.com`, déclaration
au hub : tout est en place et vérifié par les journaux. La procédure reste dans
[`docs/DEPLOIEMENT.md`](./docs/DEPLOIEMENT.md) pour la prochaine app.

**Trois pièges rencontrés à la mise en ligne, tous corrigés dans le code** :
1. La page rendait l'écran d'erreur générique de Next quand le schéma n'était pas appliqué.
   Elle explique désormais la panne et donne la commande à lancer.
2. La page de connexion disait « connexion refusée » sans distinguer un mauvais compte
   d'une variable manquante. Les codes d'Auth.js sont maintenant traduits.
3. Le hub applique `.trim()` à son jeton, JobAI ne le faisait pas : un espace invisible
   dans une variable Vercel donnait un 401 permanent entre deux valeurs d'apparence
   identique. Corrigé des deux côtés, verrouillé par tests.

### Reste à faire côté Marc (action humaine)

- [x] ~~Changer la branche par défaut en `main`~~ — fait le 2026-07-28.
      *(L'auto-merge et la protection de branche sont sans objet depuis l'ADR-0002 :
      décision de Marc, on n'y revient pas sans nouvel ADR.)*
- [x] ~~Neon, projet Vercel + DNS, client OAuth Google, les deux `HUB_TOKEN`~~ —
      **tout fait le 2026-07-28** `[V1-11]` `[V1-12]` `[V1-13]` `[V1-15]`. Cette liste est
      restée cochée « à faire » pendant que l'app était en ligne : le genre de dérive qui
      fait recommencer une étape déjà faite à la session suivante.

**Ce qui reste réellement côté Marc — deux points, aucun lié à la V1 :**

- [ ] ⚠️ **Confirmer que le mot de passe Neon a été régénéré.** Il a été exposé en
      conversation le 2026-07-28. Tant que ce n'est pas confirmé, considérer qu'il ne l'est pas.
- [x] ~~BatchChef vulnérable (injection SQL drizzle)~~ — **corrigé et mergé** le
      2026-07-28 (PR `batchchef-#22`). 🧭 Reste à trancher : BatchChef n'a **aucune CI**,
      lui poser le job `gate` de JobAI ?
- [ ] ⚠️ **Appliquer la migration `0002` (`npm run db:migrate`)** — table
      `entreprises_lieux`, sans laquelle l'onglet Carte affiche « Tables de la carte
      absentes ». *(La `0001` a été appliquée le 2026-07-29.)* Puis, une fois en ligne,
      **cliquer « Situer N entreprises »** sur l'onglet Carte, plusieurs passes (~6 par
      passe, cadence Nominatim) : c'est le seul vrai signal que le géocodage fonctionne (le
      proxy de la session Claude refuse Nominatim, donc l'appel réel n'a pas pu être exercé).
- [ ] Accorder (ou refuser) la suppression de la branche distante
      `claude/hopeful-lovelace-4d09zx` `[B-07]`.

### Comment reprendre

1. `git fetch origin && git status` — vérifier l'état réel avant de juger quoi que ce soit.
   On travaille **directement sur `main`** : un commit poussé est en ligne, il n'y a pas de
   revue pour rattraper. Le gate avant commit n'est pas une formalité.
2. Lire `BACKLOG.md`. Le chantier #01 (V1) est livré à une tâche près ; l'essentiel du
   travail restant est au chantier #05.
3. Le chantier #05 est livré sauf `[UX-05]`. ⚠️ `[UX-05]` (agrégateur
   multi-sources) attendent une **décision de Marc**, pas du code : ne pas les démarrer
   sans elle. `[NOTE-SALAIRE]` exige un ADR avant la moindre ligne (protocole §8).
4. Les trois pièces de référence de Marc (artifact HTML, squelette `jobtracker`, handover du
   27/07) ne sont **pas** dans le dépôt : elles ont été fournies en pièces jointes de session.
   L'artifact reste la référence pour le portage de l'UI `[V1-06]`.
