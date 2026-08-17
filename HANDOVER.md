# HANDOVER — JobAI

> État courant du projet, **à lire en premier** à chaque reprise de session.
> Antichronologique : la session la plus récente en haut. Ne rien inventer ici — si un point
> n'a pas été vérifié, écrire « à confirmer ».

---

## Session 2026-08-17 (fin) — les 47 « lieu inconnu » : nommés, puis mesurés

Compte rendu de Marc : `261 trouvée(s) · 1 nouvelle · 170 déjà connue(s) · 16 sous le
plancher · 27 hors région · 47 lieu inconnu`. La somme est exacte (1+170+16+27+47 = 261) :
le tri n'a pas de fuite. Le problème est ailleurs — **47 offres jetées parce que `situer()`
ne reconnaissait pas leur ville**, sans que rien ne dise lesquelles.

### Ce qui n'allait pas — la mécanique, pas le symptôme

`situer()` tranchait par une **liste blanche** de ~130 municipalités, écrite pour un rayon de
50 km, rallongée à la main quand le rayon est passé à 75. Un nom qui n'y figure pas est
refusé, qu'il soit à 20 km ou à 3 000. C'est un pari, et il était invérifiable : `refusees`
portait le motif et l'objet (entreprise, titre) mais **pas la ville** — le seul champ sur
lequel les deux motifs géographiques se décident.

### Livré, en deux temps

- **[VEILLE-30] nommer.** `Tri.refusees` porte la `ville`. `villesRefusees` (PURE) la
  regroupe et la trie par fréquence : une ligne remplace quarante-sept. Nommées dans la trace
  serveur, dans le compte rendu du bouton, et dans la réponse du point de dépôt.
- **[VEILLE-31] mesurer.** La question « cette ville est-elle à moins de 75 km ? » a une
  réponse mesurable, et le géocodeur qui la donne était déjà là. `lib/ingest/lieux.ts` tient
  un registre `nom normalisé → verdict`, alimenté par `geocoderMunicipalites` (nouvelle
  question dans `lib/geocodage.ts` : sans suffixe de province, **sans les bornes régionales** —
  savoir que Toronto est loin est l'information, pas un rejet) et par la distance réelle au
  domicile. `situer()` le consulte APRÈS les deux listes ; celles-ci gardent la priorité et ne
  coûtent aucune requête.

Bornes : 6 noms par passe (sous le cap interne de 8 — verrouillé par test), budget 12 s,
mesure AVANT le tri pour que le verdict serve au lot du jour, `try/catch` pour qu'une panne
du géocodeur ne coûte jamais l'intake. La dépense **s'éteint** : les sources répètent les
mêmes villes, un nom mesuré ne se redemande jamais. Un `introuvable` est retenté à des
paliers qui s'espacent (`[3, 14, 60]` jours) — jamais condamné à vie.

### Un quasi-incident de sécurité, trouvé par le build

`mesurerLieuxInconnus` a d'abord été écrite dans `lib/actions.ts`. Le build a refusé
(`Only async functions are allowed to be exported in a "use server" file` — sur la constante
de budget). En cherchant à réutiliser `domicile()`, j'allais l'exporter du même fichier : dans
un fichier `"use server"`, **toute fonction async exportée devient un point d'entrée HTTP
anonyme**. Les coordonnées du domicile de Marc seraient devenues récupérables par un POST.
Elles n'étaient protégées que par l'absence d'un mot-clé, et aucun test n'aurait bronché.
`domicile()` vit désormais dans `lib/domicile.ts`, un module ordinaire où aucun `export` ne
peut faire ça ; `mesurerLieuxInconnus` dans `lib/mesureLieux.ts`, même raison.

### À vérifier en production

- Le registre `veille-lieux` se remplit : chercher `[lieux] demandés=… jugés=…` dans les
  journaux, et la ligne `[veille] lieux refusés — inconnus : …` qui nomme ce qui reste.
- **Le compte de « lieu inconnu » doit BAISSER passe après passe**, et une partie doit
  basculer en « hors région » (on sait, et c'est trop loin) plutôt que rester inconnue.
  C'est le signal de convergence : s'il stagne, c'est que les noms ne sont pas géocodables
  et il faudra regarder ce que les sources écrivent vraiment dans ce champ.
- Les 16 « sous le plancher » restent **non nommées à l'écran** (elles le sont dans
  `refusees`) — proposé à Marc, sans réponse pour l'instant.

---

## Session 2026-08-17 (suite) — « sources=1 » expliqué, et la recherche mise entre les mains de Marc

### Pourquoi `sources=1` — c'était un compte exact, pas une panne

`rapport.sources.length` compte les sources INTERROGÉES. Trois familles, deux vides :

1. **Guichet-Emplois — zéro, par décision.** `RECHERCHES_GUICHET = []` : le flux RSS répond
   404 sur toutes les adresses testées, désactivé avec la preuve à côté.
2. **Pages carrières — zéro, faute de producteur.** `veille-ats` était vide depuis le premier
   jour : les analyseurs, `sourceAts` et `jetonProbable` existaient tous, mais rien n'écrivait
   la liste. C'est `[ATS-04]` qui l'a branché.
3. **Dépôt de la Routine — un.** Le seul canal vivant.

⚠️ **Correction d'un diagnostic donné plus tôt dans la session** : l'absence de ligne `[ats]`
au cron de 15:00 n'avait rien à voir avec la réservation. La passe tournait sur `658f603`
([ATS-03]), soit **un commit avant** [ATS-04], déployé 38 min plus tard.

### Ce qui n'a PAS pu être mesuré, et pourquoi

Le rendement réel de la découverte reste **inconnu**. Une tentative de mesure d'ici (180
essais sur les 36 cibles) a rendu 180 « absent » — chiffre **nul et non avenu** : les cinq
hôtes ATS répondent 403 par le proxy de la session, et `verifierAts` traduit un `fetch` qui
lève en `absent`. La mesure ne portait que sur le blocage local. La production n'a pas ce
proxy. Ne pas re-conclure de ce 0/180.

### Livré

- **[ATS-05]** — un nom présent dans les cibles ET dans les offres était planifié DEUX FOIS
  dans la même passe (mesuré : 10 essais pour 5 paires). Dédoublonnage dans
  `planifierDecouverte`, pour tous ses appelants.
- **[BORNE-04]** — la trace ne dit plus « (Google non configuré) » quand il n'y avait
  simplement rien à raffiner.
- **[ATS-06] délai de retente escaladant** (décision Marc). `verifierAts` rend `refute` sur
  une seule constatation qui recouvre deux situations : un homonyme (`recruitee/ace` →
  Amsterdam) et un **board mondial légitime** sans poste régional ce jour-là (`alstom`,
  `honeywell`, `domtar`, `labatt`, `dexterra`). Un délai fixe de 60 jours, calibré sur la
  première seule, mettait deux mois à l'étagère les plus gros employeurs de la liste.
  Paliers `[7, 21, 60]` selon le nombre de réfutations CONSÉCUTIVES ; le compteur se remet à
  zéro dès qu'un autre verdict rompt la série.
- **[ATS-07] écran `/sources`** (demande Marc). Il répond à « d'où viennent mes offres »
  depuis l'app, et porte le bouton qui lance la recherche de pages carrières : barre de
  progression, arrêt immédiat, journal de ce qui a été trouvé et écarté avec son motif.
  Douze lots suffisent à couvrir les 36 cibles — au lieu de quinze jours d'attente.

### État vérifié en production (2026-08-17, ~17:20 UTC)

- Déploiement `c093fc5` READY ; les deux crons répondent au format de la ROUTE
  (`{"ok":false,"erreur":"non autorisé"}`), donc le code est bien atteint.
- [BORNE-03] **confirmé** : `[bornes] 67 borne(s) dans la boîte · 2 lieu(x) mesuré(s)` à
  15:52, contre trois instances perdues par timeout à 15:00 sur l'ancien déploiement.
  Réserve : `marque=0/2 vitesse=0/2 tarif=0/2` — OSM ne renseigne aucun de ces trois champs
  pour ces deux employeurs. À surveiller quand le lot grossira.
- Réservation de veille libre le **18/08 à 11:00 UTC** ; première ligne `[ats]` attendue au
  cron de 15:00 UTC — sauf si Marc lance le balayage depuis `/sources` avant.

---

## Session 2026-08-14 (suite) — la veille ne tournait plus depuis trois jours

### Ce qui a été constaté, pas supposé

La Routine de veille du jour n'a pas pu chercher : **le connecteur Indeed s'est déconnecté**
en cours de session (outils absents, confirmé deux fois ; `ListConnectors` le donne pourtant
installé et activé — c'est son serveur MCP qui a lâché). Zéro offre trouvée, rien inventé.

En vérifiant si l'app avait au moins reçu des offres par son propre canal, j'ai trouvé bien
pire : **`/api/cron/veille` n'apparaît dans AUCUN journal Vercel les 12, 13 et 14 août**,
pendant que `/api/cron/geocodage` y figure chaque nuit avec son compte rendu complet
(vérifié : 03:00:29 UTC le 14, HTTP 200, journal détaillé). Les deux crons sont déclarés
côte à côte dans le même `vercel.json`, les deux routes sont structurellement identiques.

Trois jours sans veille. Rien ne le disait : les offres cessent de se rafraîchir, l'app
affiche les anciennes, la péremption les éteint une par une.

### Ce qui est corrigé

Le vrai défaut n'est pas le cron : c'est qu'une action quotidienne dépendait d'un
**déclencheur unique dont le silence est invisible**. Le géocodage et la mesure de distances
avaient chacun leur réservation ; l'ingestion, elle, n'en avait aucune.

- `lib/veilleComplete.ts` — la passe entière, appelable par n'importe quel déclencheur.
  Déplacement **VERBATIM** depuis la route, prouvé sur le COMPTE de chaque écriture et sur
  leur ORDRE (la garantie « les offres d'abord, le journal ensuite » tient à cet ordre).
- `CLE_VEILLE` / `DELAI_VEILLE_MS` (20 h) — bornes **dérivées** de l'écart de 12 h entre les
  deux crons : > 12 h sinon double passe, < 24 h sinon jour sauté. Discrimination prouvée
  dans les deux sens.
- Le cron de géocodage — celui dont on a la preuve qu'il tourne — reprend la passe quand elle
  est en retard, et rend la main après (un seul travail par invocation, comme avant).

Quand le cron de veille reviendra, il reprendra naturellement la main : c'est la réservation
qui arbitre, pas l'ordre des déclencheurs.

### Mise en ligne — elle a demandé un second push

`a30409d` (CI #178 verte) n'a produit **aucun déploiement Vercel** : pas un build raté, pas un
vieux SHA rejoué — zéro entrée, quarante minutes durant, alors que les deux déploiements
précédents étaient apparus en trois secondes. Troisième occurrence du webhook GitHub non
livré (07-31, 08-12, 08-14).

Deux fausses pistes écartées avant d'agir : un « Redeploy » du tableau de bord aurait rejoué
`150e54b`, dont l'arbre est ANTÉRIEUR au correctif ; et un commit de docs poussé ensuite aurait
été IGNORÉ par `build-necessaire.sh` (il ne compare que `HEAD^..HEAD`), laissant le correctif
hors ligne sans qu'aucun voyant ne change.

Remède appliqué : **commit vide** `ce682c7` — aucun fichier touché, donc aucun risque sur le
code, et un diff vide sort en `exit 1` (« aucun fichier lisible ») ⇒ build LANCÉ, vérifié par
sonde avant le push. Déploiement créé **2 s** après, `READY` en 46 s,
`dpl_8MJ8FwFMyoSYTYM1CbUZdA1NL71v`, alias `emploi.hubperso.com`. Production vivante (401 propre
du endpoint hub). Le premier passage utile est celui du cron de géocodage, à 03:00 UTC.

⚠️ Le conteneur a reverti l'arbre **une seconde fois** pendant l'opération, au même point
(`[BORNE-02]`) : le premier commit vide s'était posé sur la base périmée et a été JETÉ, pas
rejoué. Le tell : `scripts/build-necessaire.sh: No such file or directory` sur un fichier lu
quinze minutes plus tôt.

### Ce qui reste à faire

- **`[VEILLE-11]`, côté Marc** : voir dans Vercel POURQUOI le cron ne part plus (Settings →
  Cron Jobs, ou `vercel crons ls`). Illisible depuis une session Claude — pas de jeton, et le
  MCP Vercel n'expose pas les crons. Le filet rend la panne inoffensive, il ne la corrige pas
  à la source.
- **`[VEILLE-12]`** : publier la fraîcheur de la dernière passe dans le résumé hub (alerte
  au-delà de 36 h). C'est ce qui manquait le plus — trois jours ont passé faute d'un écran
  qui dise « la veille n'a pas tourné ».

## Session 2026-08-14 — la bulle de la carte, et un revert de conteneur

### Ce que Marc a signalé

« Dans la carte, quand je clique sur une offre l'info-bulle n'est pas celle qu'il y avait
dans le preview. Je veux que ce soit la même et les mêmes couleurs. »

### Ce que la vérification a montré AVANT de coder

Les quatre neutres de l'app et ceux de la maquette « Poste de nuit » sont **identiques au
hex près** (`#1e1b12`, `#332e20`, `#a79e88`, `#f0eadb`). L'écart ne venait donc pas des
jetons. Trois causes réelles :

1. **Deux couleurs EN DUR du thème clair** avaient survécu dans cette bulle : `#a2540a`
   (orange foncé, mention de position approximative — quasi éteint sur le charbon) et
   `#ccc3` (gris clair, filet des groupes). Aucun test ne les voyait.
2. **La structure différait** : la maquette met le poste à gauche et la note à droite en
   monospace tabulaire sur une ligne à filet ; le code faisait une puce avec « 85/100 » en
   dessous — donc des notes à des abscisses variables, illisibles en colonne.
3. **Le caractère `↗`** dépendait de la police. La maquette le dessinait ; c'est le cas
   maintenant (SVG, suit `currentColor`).

Verrou posé : `tests/styles.test.ts` refuse tout `#rrggbb` dans une règle. La feuille est à
zéro couleur en dur, donc **aucune exemption**. Discrimination prouvée.

### ⚠️ Le conteneur a reverti l'arbre de travail EN PLEINE TÂCHE

`git log` local remonté de sept commits (jusqu'à `[BORNE-02]`), `node_modules` amputé des
paquets du jour. Rien de perdu — `git ls-remote` donnait le bon tip — **mais j'avais
commencé à éditer la version périmée du fichier**, qui ne connaissait ni les bornes de
recharge, ni le site, ni le téléphone, ni les horaires. Cette édition les aurait toutes
supprimées sous couvert d'un restylage. Jetée, refaite sur la bonne base.

Corollaire : après le revert, `refs/remotes/origin/main` MANQUAIT (la refspec de ce clone ne
suit qu'une branche), donc `@{u}` ne résolvait plus et le garde d'arrêt annonçait « 173
commits non poussés » sur un dépôt parfaitement à jour. Ref rétabli.

**Réflexe à garder** : un fichier qui montre du code supprimé récemment = suspecter le
revert AVANT toute autre hypothèse, et repartir du serveur.

## Session 2026-08-13 (suite) — le CV pilote le profil (ADR-0009)

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**907**) + `lint` (0 erreur) + `build` verts. `npm audit --omit=dev` = **0**. |
| **La demande** | Marc : « je veux la possibilité d'uploader mon CV pour que la recherche de job se fasse par rapport à ça, et que tout s'update, les scores, les SWOT, les critères ». Il a demandé un plan et des questions d'abord — quatre posées, quatre tranchées. |
| **Le constat qui a changé la forme du travail** | Le profil de Marc EXISTAIT déjà, éclaté dans trois fichiers qui ne savaient pas qu'ils décrivaient un profil (`scoring.ts`, `reference.ts`, `ingest/sources.ts`). Le vrai travail n'était pas « analyser un PDF ». |
| **Ses quatre choix** | CV **conservé en base** · **rien ne s'applique sans sa validation** · **re-notation immédiate** à la validation · **chantier livré entier**. |
| **Ce qui n'était PAS négociable** | Une note `scoreSource: "manuel"` n'est jamais écrasée par un recalcul. Pas dans la question — c'est la règle du barème. |

### Ce qu'il reste à faire, côté Marc

**`ANTHROPIC_API_KEY` dans l'environnement Vercel.** Sans elle, le téléversement fonctionne,
le fichier est stocké, et l'extraction rend un échec NOMMÉ (« clé absente ») — jamais un
profil inventé. Une fois la clé posée, « ré-analyser » suffit : pas besoin de re-téléverser.

### Trois erreurs que j'ai faites, et ce qu'elles ont appris

1. **J'ai écrit un lecteur de PDF à la main.** Il passait ses propres tests. Sur les deux
   premiers PDF réels rencontrés : un faux « c'est un scan » sur un document plein de texte,
   et — bien pire — **76 784 caractères de binaire d'image annoncés comme un SUCCÈS**, prêts
   à produire un profil entièrement inventé. Remplacé par `unpdf`, correct sur les deux.
2. **J'ai mis la CI au rouge** en exigeant la présence de PDF qui n'existent que sur ma
   machine. Les committer était exclu (l'un montre du contenu réel du Drive de Marc). Les
   cas sont désormais construits et lus par pdf.js.
3. **Le garde PII m'a corrigé deux fois de suite** : les coordonnées d'un rectangle
   ressemblaient à un NAS, puis le commentaire qui citait la valeur fautive a rejoué
   l'échec. C'est la donnée d'épreuve qui s'adapte, jamais le motif.

### Une garde manquante, trouvée en vérifiant

`routesGardees.test.ts` ne voyait PAS la disparition du `await auth()` d'une page — il
éprouve la middleware, ce qui est son périmètre. Mais chaque page porte une revérification
que les commentaires appellent « défense en profondeur », et rien ne la protégeait.
L'invariant tenait partout ; il est maintenant verrouillé.

### La revue a trouvé sept défauts, tous réels, tous corrigés

Panel lancé sur le diff complet (pannes muettes + sécurité/vie privée). Aucun faux positif.

**Le plus grave, et il l'était vraiment** : `extraireFaits` nettoyait les coordonnées dans un
objet… que personne ne lisait. Ce qui partait en base était un étalement de la réponse BRUTE
du modèle avec trois champs seulement ré-écrits par-dessus — `langues`, `diplomes`, `outils`,
`titresOccupes` et la provenance traversaient intacts, jusqu'au profil et jusqu'à l'écran.
L'app promet le contraire à Marc en toutes lettres sur l'écran de dépôt. Corrigé en composant
un objet nettoyé champ par champ (ajouter un champ au schéma sans le nettoyer casse désormais
le typage), et verrouillé par `tests/cvExtraction.test.ts` — qui éprouve **le champ
réellement persisté**, avec discrimination prouvée sur la version fautive.

**Les six autres** : le filtre anti-évasion acceptait `[ \t]` là où il fallait `\s` (une
balise coupée par un retour à la ligne refermait le bloc de données) ; le `catch` de
`/references` était totalement muet là où `/profil` disait la même panne ; la boucle de
re-notation n'était pas gardée et l'écran restait vide sur rejet ; `activerProfil` pouvait
laisser zéro CV actif sans le dire ; une proposition illisible était indiscernable de
« pas de proposition » ; et `profilVersion` — dont mon propre commentaire disait qu'il
« empêche de confondre les notes de plusieurs barèmes » — n'était **jamais persisté**.
Colonne ajoutée (migration 0018), écrite à chaque re-notation : un lot mi-ancien mi-nouveau
se voit désormais en base.

### Ce qui reste ouvert

- **La Routine quotidienne porte ses termes de recherche dans son prompt**, hors du dépôt :
  un CV validé enrichit le profil sans changer ce qu'elle tape le matin. Divergence réelle,
  écrite dans l'ADR plutôt que laissée croire résolue (`[CV-08]`).
- `lib/cv/actions.ts` et `lib/cv/depot.ts` (les I/O) ne sont pas testés — la logique pure
  l'est, à 46 tests (`[CV-09]`).
- Un PDF scanné reste illisible : l'app le dit et donne le remède (`[CV-10]`).
- **`CLAUDE.md` fait 867 lignes pour un « plafond assumé : 150 »**, et il se charge à chaque
  session (`[CV-11]`).

## Session 2026-08-13 — « on dirait un logiciel de gestion » : la refonte visuelle

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**834**, +6) + `lint` (0 erreur) + `build` verts, jugés par exit code. |
| **Le grief** | Marc : « on dirait un logiciel de gestion tellement c'est moche et plat ». |
| **La cause, écrite** | L'épure du 5 août n'a procédé que par SOUSTRACTION (ombres, contours, liserés, 4 tuiles sur 5, ambre « rare »). Chaque geste était juste, mais rien n'a remplacé ce qui partait : il restait des rectangles blancs sur du gris. Voir [ADR-0008](./docs/adr/0008-poste-de-nuit.md). |
| **Ce qui est livré** | « Poste de nuit » : neutre CHAUD (~90°), **sombre imposé — le thème clair est retiré** (révision d'ADR-0008, voir plus bas), contour de retour sur les surfaces, densité 1,20, tableau de bord en ENTONNOIR, jauge de distance, tuiles de carte assombries. |
| **Comment ça a été décidé** | Sur maquette, avant d'écrire une ligne de CSS : trois directions rendues sur les VRAIES offres, Marc en choisit une, puis règle la densité au curseur (1,20) et tranche l'échelle de couleur. |
| **Ce qui NE change pas** | L'ambre `#f2a31b` (`app.color` publiée au hub), `lib/couleurNote.ts`, les routes, les composants, les tests. Refonte de la peau, pas du squelette — réversible par `git revert`. |

### Deux pièges rencontrés, tous deux consignés en leçon

1. **Ma maquette avait supprimé le dégradé de couleur par note** — sans voir que
   `lib/couleurNote.ts` le faisait déjà, à la demande de Marc du 6 août. Il l'a lu comme une
   nouvelle demande : c'était une RÉGRESSION que je lui faisais valider. Recenser ce que
   l'écran fait déjà AVANT de le redessiner.
2. **« Le contraste suffit » n'avait jamais été chiffré.** L'écart de clarté fond↔carte vaut
   4 points en sombre et 2,9 en clair : insuffisant dans les DEUX thèmes. C'est ce qui
   justifie le retour du contour, et c'est une mesure, pas un goût.

### Fin de session — le thème clair est retiré

Marc, devant la version déployée : « c'est pas exactement comme ton preview […] les couleurs
sont pas les mêmes ». Cinq écarts signalés, **quatre étaient de vraies régressions** (halo
ambre absent, bulles Leaflet blanches, lueur de la marque perdue, carte dépliée non surélevée,
cercle de note à 3 rem au lieu de 3,3) — corrigées en `b3856f2`.

**Le cinquième n'en était pas une** : son système est réglé en clair, il regardait donc le
pendant fade pendant que la maquette validée était sombre. Question posée, réponse de Marc :
**« Sombre imposé, point. »**

L'app n'a plus qu'un thème. `:root` porte les jetons sombres, plus une seule
`@media (prefers-color-scheme: …)` dans `app/globals.css`, `viewport.themeColor` et le
manifeste passent à `#141209`. Le verrou est un **test**, pas une promesse de `grep` :
`tests/styles.test.ts` → « l'app n'a qu'un thème » (discrimination prouvée — en réintroduisant
une media query de thème, il tombe).

La leçon vaut au-delà de la couleur : **un second thème jamais montré à la validation n'est
pas une option offerte, c'est une version non validée de l'app servie au hasard du réglage
système** — et le jour où elle s'affiche, elle se lit comme un défaut.

Deux voisins réglés au passage : l'encre des épingles de la carte était une COPIE de
`encreSurNote()` figée dans le CSS (même classe que la table des paliers de distance) — elle
vient maintenant de `lib/couleurNote.ts`, posée en ligne avec le fond ; et le fond des `code`
gardait la teinte bleu-gris 265° d'avant ADR-0008.

### Ce qui reste ouvert

- **Plus de thème clair du tout.** Qui travaille en plein jour n'a pas de version claire.
  Assumé : app privée à un seul utilisateur, qui vient de choisir. Un clair reviendra le jour
  où il sera dessiné et validé comme le sombre l'a été.
- **La demande suivante de Marc n'est pas commencée** : téléverser son CV pour que la
  recherche, les notes, les SWOT et les critères s'alignent dessus. Il a demandé **un plan et
  des questions**, pas du code.
- **Le filtre CSS des tuiles** donne un rendu moins juste qu'un vrai fond sombre (les teintes
  de l'eau et des parcs virent). Assumé pour ne pas ajouter de domaine externe.
- **Non vérifié à l'écran par moi** : cette session n'a pas d'accès authentifié à l'app.
  Le rendu réel est à confirmer par Marc après déploiement.

## Session 2026-08-11 — la Routine poussait dans le vide, et je regardais le mauvais blocage

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**735**) + `lint` + `build` verts, jugés par exit code. |
| **Ce qui s'est passé les 9 et 11** | La Routine a tourné deux fois, correctement : 142 offres trouvées, 66 après dédoublonnage, gate vert. **Les deux fois, `git push` a été refusé 403** — et les deux commits sont morts avec leur conteneur. |
| **La cause, mesurée** | `MoKarade/JobAI` n'est pas dans les sources d'une session fraîchement allumée, et la liste d'outils autorisés d'une telle session ne contient **aucun `mcp__*`** : elle ne peut donc même pas s'ajouter le dépôt. `add_repo` existe pourtant — mais seulement depuis une session de développement. |
| **Ma faute** | J'ai relayé **deux fois** à Marc le message d'erreur (« ajoutez le dépôt aux sources ») comme si c'était un geste à sa portée, sans vérifier que ce chemin existait de son côté. Il n'existait pas. |
| **Correctif** | La Routine ne crée plus de session : elle tire dans la session de développement (`persistent_session_id`), qui a déjà le dépôt, Indeed et la recherche web. Ancien déclencheur supprimé. **Rien à faire côté Marc.** |
| **Prix assumé** | Si cette session est archivée, la Routine perd sa cible et se recrée depuis la nouvelle. Plus petit que le prix d'un commit perdu chaque matin. |

### Ce que j'ai vérifié plutôt que repris sur parole

La session de la Routine rapportait `OPTIONS …/api/ingest/depot` → **204**, et en concluait
que l'en-tête de `lib/ingest/depotFichier.ts` était périmé. Re-mesuré depuis cette session le
11/08, sur `OPTIONS` **et** sur `POST` : **403 au CONNECT**, les deux fois. La prémisse de
l'en-tête tient donc pour cette session, et elle n'a pas été réécrite. L'asymétrie est réelle
mais inverse de ce qui était supposé — c'est la session NEUVE qui a le réseau, pas celle de
développement.

### Ce que la Routine a bien fait, et qui est maintenant dans le prompt

Elle a **exclu les agences de placement** de la recherche d'adresse (Manpower, Randstad,
Groupe RP, Horus, Recrutement Harmonie) : l'adresse d'une agence est le bureau du recruteur,
pas le lieu de travail — exactement le défaut AMETEK. Idem Voyages Laurier (quatre
succursales, aucune adresse complète) et Wabtec (siège américain). Elle a préféré le vide à
l'approximation. La règle est passée dans `docs/ROUTINE-DEPOT.md` : un jugement qui dépend de
la lucidité d'une exécution à l'autre n'est pas une garde.

### Ce qui reste ouvert

- **Le quota Indeed se referme en s'aggravant** : 26 s → 29 → 51 → 58 à chaque appel refusé.
  La veille du 11 n'a pas pu être reprise à la main dans la foulée de l'exécution du matin.
- **Cinq reverts de conteneur** dans la journée. Deux éditions non poussées ont été perdues
  et refaites. La règle « seul un push protège » se paie à chaque fois qu'on l'oublie.
- **Signature des commits** : toujours bloquée (clé de signature de 0 octet dans le conteneur).

---

## Session 2026-08-06 — la borne la plus proche, le registre épuisé, la veille débloquée

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**715**) + `lint` (0 avertissement) + `build` verts, jugés par exit code. |
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

### `[LIEU-01]` — le registre est épuisé comme levier, et c'est mesuré

`registre=0/58 (5 ambigues) (53 absentes)`. La ligne `[registre] pistes` nomme enfin les
cas, et elle tranche dans les deux sens :

- **Ce qui se corrigeait** : le complément entre parenthèses. `Adecco (Papiers White Birch -
  Stadacona)` ne trouvait rien pendant que le registre contient « ADECCO » ; idem `JDHM
  (Après sinistre)`. `clesDeRecherche` cherche donc AUSSI sans la parenthèse — du côté de la
  question, jamais dans `cleNom` (dont dérive le `nomCle` déjà stocké à l'import : y toucher
  désaccorderait les deux en silence).
- **Ce qu'il ne faut PAS corriger** : `S Huot Inc` → « RÉAL HUOT INC. » (autre entreprise),
  `Groupe Mundial` (division Metal Bernard) → « Casino Mundial », `Evident Scientific` →
  « RADIO EVIDENTIA ». Trois adresses fausses, trois mauvaises portes. Un test verrouille ces
  trois cas : il tombe si quelqu'un ajoute un retrait de mot générique ou un préfixe.
- **Ce qui n'est nulle part** : `Permafil`, `Agilean`, `AMETEK` — « rien sous X ».

Reste donc ouvert : la plupart des employeurs sont épinglés au **centre de leur ville**, et
ni OpenStreetMap (qui ne cartographie pas les PME) ni le registre ne les placeront. Le
prochain levier honnête est une **adresse saisie par Marc** (`adresseSource: "manuelle"`),
pas un rapprochement plus souple.

### `[VEILLE-05]` — un second canal, sans jeton

Livré : `data/depot/AAAA-MM-JJ.json`, lu par `lib/ingest/depotFichier.ts`, déclaré source
**hors rotation** dans `passe.ts`. Une session de développement a le connecteur Indeed **et**
le dépôt git, mais aucun accès réseau vers l'app — elle écrit un fichier et le pousse.
**Premier lot réel : 26 offres, 25 retenues par `trier()`, 1 sous le plancher.**

⚠️ **La Routine quotidienne est créée mais SANS le connecteur Indeed.** `create_trigger` a
refusé de le transmettre (« the connectors parameter is not available for this
organization »), et les sessions qu'elle allume n'auront donc pas `mcp__Indeed__*`. Le prompt
s'arrête proprement dans ce cas plutôt que d'écrire un lot vide — un lot vide se lirait
« la veille a tourné et n'a rien vu », et ferait périmer des offres encore ouvertes. **Geste
de Marc, un seul** : ajouter le connecteur Indeed à la Routine
« JobAI — veille Indeed quotidienne » (`trig_01PBbNZQEnNu4tXuQ6He9yFs`, 11:00 UTC) depuis
l'écran Routines de claude.ai.

### Ce qui reste ouvert

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
