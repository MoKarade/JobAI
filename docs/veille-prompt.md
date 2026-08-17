# Prompt de la veille quotidienne — Indeed + ZipRecruiter + Guichet-Emplois

> À coller dans la Routine. Écrit le 2026-08-14 à partir d'une exécution RÉELLE des deux
> connecteurs, pas d'hypothèses : chaque contrainte ci-dessous a été mesurée ce jour-là.
>
> **Pourquoi ce fichier existe** : jusqu'ici les termes de recherche et le protocole vivaient
> UNIQUEMENT dans le prompt de la Routine (ticket `[CV-08]`). Une session qui reprend la veille
> à la main ne les a donc pas, et les redevine — c'est arrivé aujourd'hui. Le prompt vit
> désormais dans le dépôt ; la Routine en est une COPIE, pas la source.

## ⚠️ La règle qui prime sur tout : UNE seule passe par jour

**Avant de déposer, savoir si la passe du jour a déjà eu lieu.** Ce n'est pas une précaution
de confort : `appliquerBalayage` incrémente les absences **par PASSE**
(`absences: precedent.absences + 1`), sans aucune garde de date. Toute offre absente du lot
prend donc une absence à chaque balayage, et à la troisième elle est **périmée**.

Conséquence, mesurée le 2026-08-14 : déposer par `POST /api/ingest/depot` alors que le cron a
déjà tourné le même jour compte une **deuxième** absence à tout le stock. Des offres bien
ouvertes se ferment à l'écran, non parce qu'elles ont fermé mais parce que deux passes ont eu
lieu dans la même journée. C'est la mécanique derrière le « −2 » signalé par Marc, et derrière
l'effondrement de stock 78 → 30 documenté dans `next.config.mjs`.

| Situation | Canal |
|---|---|
| Aucune passe n'a tourné **et** le lot re-présente tout le stock vivant | `POST` — il dépose ET balaie, c'est ce qu'on veut |
| Une passe a déjà tourné aujourd'hui | **fichier** `data/depot/<JOUR>.json` |
| Lot PARTIEL — les trouvailles du jour seulement | **fichier**, quoi qu'il arrive |

⚠️ **La deuxième condition n'est pas une nuance, et elle m'a échappé à la première écriture
de ce document (corrigée le 2026-08-15, preuve à l'appui).** La route POST construit ses
« offres vues » à partir du SEUL lot reçu (`app/api/ingest/depot/route.ts` : `const vues =
apresAjout.filter((o) => idsDeposes.has(o.id))`). Le cron, lui, balaie avec TOUTES ses
sources, dépôts des sept derniers jours inclus. Poster un lot de huit trouvailles donne donc
une absence aux quarante autres offres suivies — pas de péremption immédiate, mais un
décompte enclenché que seule une passe complète peut remettre à zéro.

Autrement dit : **le vrai critère n'est pas « une passe a-t-elle tourné », c'est « mon lot
est-il exhaustif »**. Une veille quotidienne rapporte les NOUVEAUTÉS : son lot est partiel
par nature, donc son canal est le fichier.

Comment savoir : les logs d'exécution Vercel portent la ligne `[veille] <déclencheur> —
ingérées=…` depuis `[VEILLE-12]`. Une passe qui a tourné aujourd'hui y est visible.
Dans le doute, prendre le canal fichier : il n'a aucun effet de bord, et la passe suivante
ingérera le lot normalement.

**Le canal fichier n'est pas un repli dégradé.** `data/depot/` et `lib/ingest/depotSchema.ts`
existent, sont tracés dans `next.config.mjs` pour les deux crons, et c'est exactement ce que
la passe a ingéré le 2026-08-14 à 14:24. Déposer par fichier demande un commit et un push —
donc le gate complet — alors que le POST n'en demande aucun.

Bonus du canal fichier : la fenêtre de relecture étant de sept jours, un lot déposé garde
« vues » les offres qu'il contient à chaque passe suivante, ce qui remet leur compteur
d'absences à zéro au lieu de le pousser.

## ⚠️ Le lot est une OBSERVATION du jour, pas une liste de nouveautés

**Déposer uniquement les offres INÉDITES fait mourir les autres.** C'est la faute qui a
produit la décroissance signalée par Marc le 2026-08-17 : « à chaque nouvelle passe j'ai
moins d'offres ».

Le mécanisme de péremption ne demande pas « quoi de neuf », il demande **« qu'as-tu vu
aujourd'hui »**. Une offre absente du lot prend une absence, et à la troisième elle est
périmée. Or Indeed listait encore Laserax, Systèmes Stekar, Cimota, Taveo — elles étaient
donc bel et bien OUVERTES — mais comme elles avaient déjà été déposées les jours précédents,
le protocole les écartait. Elles ne survivaient plus que par leur ANCIEN fichier, tant qu'il
restait dans la fenêtre de sept jours ; passé ce délai elles s'éteignaient comme si elles
avaient fermé.

Mesuré : passe du 15 août, +3 net ; passe du 16 août, **−16** (1 ingérée, 17 périmées).

**La règle** : le lot du jour contient TOUT ce que la recherche a rendu et qui est dans la
cible — les nouveautés ET les offres déjà connues qu'on vient de revoir. Le dédoublonnage se
fait DANS le lot du jour (deux résultats pour la même offre), jamais contre l'historique.
« Elle était déjà connue » n'est pas une raison de ne pas dire qu'on l'a vue.

Corollaire : c'est aussi ce qui rend le canal fichier supérieur au POST sur la durée. Un
fichier est relu à chaque passe pendant sept jours ; une offre entrée par POST n'est jamais
rejouée par personne.

## Les six outils, et ce que chacun a le droit de décider

Mesurés le 2026-08-14, un par un. Le tableau dit surtout ce qu'ils n'ont PAS le droit de faire.

| Outil | Sert à | Ne sert JAMAIS à |
|---|---|---|
| `Indeed / get_resume` | calibrer les termes sur le parcours RÉEL de Marc | être persisté — c'est sa donnée personnelle (garde-fou n°1) |
| `Indeed / search_jobs` | trouver les offres | situer une offre (le lieu de la liste ment, cf. plus bas) |
| `Indeed / get_job_details` | lire l'annonce, corriger la ville, prendre l'adresse | — |
| `Indeed / get_company_data` | juger un employeur : avis, salaires, taille | **remplir `adresse`** |
| `ZipRecruiter / search_jobs` | élargir le balayage | fournir une description (il n'en rend pas) |
| `WebSearch` / `WebFetch` | vérifier une adresse d'entreprise, avec son URL | moissonner des offres (garde-fou n°4) |

⚠️ **`get_company_data` ne doit jamais toucher à `adresse`, et c'est mesuré** : il rend
`addresses: ["Charlotte, NC"]` pour une offre Honeywell à Québec — le siège social mondial —
et il échoue sur les PME (`Laserax` → « Unknown error »). Le brancher sur le champ adresse
automatiserait la faute déjà consignée (« adresse AMETEK » → Pennsylvanie pour une usine de
Lévis) : une donnée fausse qui a l'air précise, et qui franchit la validation par la distance.
Il est utile ailleurs — il dit si un employeur est bien noté et ce qu'il paie.

⚠️ **`get_resume` se LIT, ne s'écrit nulle part.** Il rend le parcours d'Indeed (chargé de
projet et responsable technique en robotique, master, C++/Python/conception de cellules
robotiques, cible « Project Manager »). Ça sert à choisir les termes de recherche — pas à
alimenter un fichier versionné, où rien de personnel n'entre.

## Ce que les deux connecteurs font vraiment

| | Indeed | ZipRecruiter |
|---|---|---|
| Lecture de l'annonce | `get_job_details` — texte intégral | **aucun outil de détail** |
| Adresse civique | parfois dans l'annonce | jamais |
| `lien` | stable par offre | **jeton de redirection forgé par recherche** (pourrira) |
| Paramètre de lieu | **sans effet** (même contenu pour Québec et Lévis) | effectif (`location` + `radius_miles`) |
| Identifiant | `JOBSEARCH_<n>` = **compteur par réponse**, pas un identifiant | aucun |

Deux conséquences non négociables :

1. **Le dédoublonnage se fait par IDENTITÉ** (entreprise + titre + ville), jamais par lien ni
   par identifiant. Mesuré le 2026-08-12 sur 64 offres : le lien capte **zéro** doublon,
   l'identité en capte **quinze**.
2. **Une offre ZipRecruiter entre sans description.** Elle est déposée quand même — une offre
   réelle vaut mieux qu'un trou dans la carte — mais sa note n'est PAS un jugement, c'est un
   défaut de lecture, et le rapport doit le dire.

## ⛔ Le Guichet-Emplois — ÉCRIT, PUIS BLOQUÉ LE MÊME JOUR. NE PAS L'EXÉCUTER.

**Mesuré le 2026-08-17, après l'écriture de cette section :**

```
curl https://www.guichetemplois.gc.ca/accueil   -> CONNECT tunnel failed, response 403
curl https://www.jobboom.com/fr                 -> CONNECT tunnel failed, response 403
```

Le refus vient de la **politique réseau de l'environnement**, au niveau du tunnel CONNECT :
la requête ne part jamais. Et la Routine tire dans la MÊME session que Claude
(`persistent_session_id`), donc elle hérite exactement du même accès. **Elle ne peut pas
joindre ce site.** Ne dépense pas ton budget à le découvrir : saute l'étape 4 bis et dis-le
en une ligne dans ton rapport.

⚠️ **Comment cette section a été écrite AVANT d'être vérifiée** — c'est la faute à retenir,
la troisième de la même famille dans la journée. Les formes d'URL venaient de TITRES de
résultats de recherche, jamais d'une visite. Marc a ouvert le premier lien : il tombe sur
l'accueil du Guichet-Emplois, pas sur la page employeur. Un `curl` de trente secondes
tranchait la question ; je l'ai écrite d'abord. **Un lien lu dans une liste de résultats
n'est pas un lien vérifié.**

**CE QUI LA DÉBLOQUERAIT** — un geste de Marc, pas une ligne de code : ajouter
`guichetemplois.gc.ca` (et `jobboom.com`) à l'allowlist de l'environnement, comme il l'a
fait pour `*.hubperso.com`. Tant que le `curl` ci-dessus rend 403, cette section reste morte.
Le jour où il rend 200, la relire ENTIÈREMENT — y compris les formes d'URL, qui restent
non vérifiées.

<details>
<summary>Le protocole rédigé, gardé pour le jour où l'accès s'ouvre</summary>

Ajoutée le 2026-08-17, après la mesure qui a fermé les autres portes. Les deux connecteurs
ne voient qu'Indeed et ZipRecruiter ; or la plupart des 36 cibles publient ailleurs — sur
leur propre portail (canam.com, robotiq.com, laserax.com, techsolmarine.com) et sur le
**Guichet-Emplois**, qui leur tient une page employeur. C'est la seule source officielle,
gratuite et sans partenariat qui les couvre : le garde-fou n°4 la nomme explicitement.

*(Deux autres routes ont été essayées et fermées le même jour, pour ne pas les rouvrir :
l'API Jobillico est une API de PUBLICATION — tout y est scopé aux « entreprises gérées par
ce compte », donc illisible de l'extérieur ; et le flux XML du Guichet-Emplois exige un
statut d'entreprise que Marc n'a pas.)*

**Piège 1 — ne fabrique JAMAIS une URL d'employeur à partir de notre nom.** Cherche la page,
suis le lien trouvé, et rapporte l'URL que tu as réellement utilisée. Les deux graphies
semblent marcher (`Techsol Marine` comme `TECHSOL MARINE INC.`), mais « semble » n'est pas
« mesuré ». Deux fois le 2026-08-17, un identifiant DEVINÉ depuis un nom a produit un faux
négatif silencieux : `chantierdavie` au lieu de `ChantierDavieCanada`, une page carrières
bien vivante classée « absente ». Un identifiant se constate, il ne se déduit pas.

**Piège 2 — la région AVANT les employeurs.** Une recherche par terme sur la région ramène
aussi les employeurs qu'on ne connaît pas encore, pour un seul appel ; trente-six pages
employeur ne couvrent que trente-six employeurs, pour trente-six lectures. L'ordre est donc :
région d'abord (le neuf), pages employeur ensuite (le ciblé), et on s'arrête au budget en
disant où on s'est arrêté.

**Piège 3 — le premier passage est une SONDE, pas une source.** On ne sait pas si ta session
joint `guichetemplois.gc.ca` : celle de Claude ne le peut pas (proxy). Si tu ne l'atteins
pas, DIS-LE et n'invente rien. « Je n'ai pas pu chercher » et « il n'y avait rien » sont
deux phrases opposées, et c'est exactement la confusion qui a coûté 40 offres le 12 août.

Formes d'URL observées le 2026-08-17 (à confirmer par toi, pas à supposer) :

| Usage | URL |
|---|---|
| Province | `https://www.guichetemplois.gc.ca/parcourirlesoffresdemploi/province/QC` |
| Recherche | `https://www.guichetemplois.gc.ca/trouverunemploi` (`searchstring`, `page`, `sort`) |
| Employeur | `https://www.guichetemplois.gc.ca/parcourirlesoffresdemploi/employeur/<Nom>/QC` |

`source` du lot : `"Guichet-Emplois"`. Le dédoublonnage reste par IDENTITÉ (entreprise +
titre + ville) — une même offre paraît souvent sur Indeed ET sur le Guichet-Emplois, et
c'est `trier()` qui l'écarte, pas toi.

</details>

## Le prompt

```
Fais la veille JobAI du jour.

1. Date à Québec (America/Toronto), format AAAA-MM-JJ. C'est le `jour` du lot.

2. Resynchronise le dépôt AVANT toute écriture :
   git fetch origin main && git checkout -B main origin/main
   Le conteneur peut avoir reverti l'arbre : compare git rev-parse HEAD à
   git ls-remote origin main. Le serveur est la seule vérité.

3. Appelle get_resume UNE fois et lis-le. Il dit le parcours réel de Marc
   (robotique, cellules robotisées, gestion de projet technique) et sa cible
   déclarée. Sers-t'en pour choisir les termes ci-dessous et pour repérer un
   intitulé qu'ils rateraient. Ne le recopie NULLE PART : ni dans le lot, ni
   dans un fichier, ni dans le rapport.

4. Cherche sur LES DEUX connecteurs, séquentiellement, jamais en parallèle
   (le quota Indeed se referme en s'aggravant ; après TROIS refus malgré
   l'attente annoncée, arrête — la fenêtre est dépensée, ce n'est pas une
   question de patience).

   TERMES — lis-les dans `PROFIL_DEFAUT.recherches` (lib/profil.ts). Ne les
   recopie pas ici : la liste vivait en double, et l'exemplaire du prompt a
   fini par diverger de celle du code (huit d'un côté, douze de l'autre).

   ⚠️ N'INTERROGE PAS TOUTE LA LISTE. Elle compte ~28 termes depuis le
   2026-08-17 (français ET anglais — Honeywell, Alstom, AMETEK et Domtar
   publient en anglais dans la région, et Marc est bilingue). Les interroger
   tous chaque jour ferait sauter le quota Indeed, qui se referme en
   s'aggravant. C'est un BASSIN, pas une liste à épuiser.

   Prends `PROFIL_DEFAUT.termesParJour` termes par jour (DIX-HUIT depuis le
   2026-08-17), en TOURNANT : départ = (jour du mois × ce nombre) modulo la
   longueur du bassin, puis autant à la suite en repartant au début quand tu
   atteins la fin. Déterministe, sans état à garder, et la couverture fait le
   tour du bassin de 48 termes en trois jours.

   ⚠️ SI LE QUOTA INDEED REFUSE TROIS FOIS MALGRÉ L'ATTENTE ANNONCÉE, ARRÊTE.
   La fenêtre est dépensée et aucune patience ne la rend (mesuré : neuf essais
   espacés, zéro succès, le délai annoncé oscillant sans jamais s'éteindre).
   Dis-le dans le rapport : c'est ce nombre-là qu'on redescendra en premier.

   ⚠️ DIS DANS TON RAPPORT quels termes tu as tirés. Sans ça, « 100 offres
   trouvées » ne se compare pas d'un jour à l'autre — deux tirages différents
   ne mesurent pas la même chose.

   Indeed : location "Québec, QC", country_code "CA". Le rayon retenu par
   l'app est passé à 75 km le 2026-08-17 (Beauce, Lotbinière, Portneuf ouest,
   Charlevoix, Bellechasse) : ne rejette plus une offre de ces secteurs, c'est
   `estDansLaRegion` qui tranche, pas toi. Ne double PAS par ville —
   mesuré, le lieu n'a aucun effet sur ce connecteur, c'est le terme qui
   discrimine. Douze appels, pas vingt-quatre.

   ZipRecruiter : location "Quebec City, Quebec" ET "Levis, Quebec",
   country_admin_code "CA", radius_miles 40. Là, le lieu compte.

4 bis. GUICHET-EMPLOIS — ÉTAPE SUSPENDUE, ne la fais pas.
   L'hôte est refusé par la politique réseau de l'environnement (403 au tunnel
   CONNECT, mesuré le 2026-08-17), et ta session est CELLE de Claude : tu as le
   même accès, donc le même refus. Une ligne dans le rapport : « Guichet-Emplois
   sauté — hôte bloqué ». Ne cherche pas de contournement.
   Elle se rouvre le jour où `curl https://www.guichetemplois.gc.ca/accueil`
   rend 200 — voir la section qui lui est consacrée.

5. Écarte, en NOMMANT chaque rejet et son motif (un compte seul ne se vérifie
   pas) : hors région (Chapais, Saguenay, Montréal…), hors cible (marketing,
   journalier, restauration, finance, stagiaire), et les doublons par identité
   — une même offre paraît souvent sur Indeed ET sur le Guichet-Emplois.

6. Lis les annonces Indeed avec get_job_details, une retente maximum chacune.
   Si tu dois plafonner le nombre de lectures, DIS-LE dans le rapport et dis
   lesquelles sont entrées sans description. Un plafond tu se lit comme une
   couverture complète.
   ⚠️ La liste et l'annonce se contredisent parfois sur le lieu : c'est
   l'ANNONCE qui dit la ville. Corrige `ville` d'après elle.

7. Construis le lot selon OffreDeposeeSchema / LotDeposeSchema
   (lib/ingest/depotSchema.ts). Ni note, ni priorité, ni statut : ce sont des
   jugements, ils appartiennent à trier() et à Marc.

8. Expurge la PII de TIERS avec le CODE DE PRODUCTION — expurgerLot, importé de
   lib/ingest/expurger.ts, et il prend le TABLEAU d'offres, pas l'enveloppe du
   lot. Le script doit donc vivre physiquement dans /home/user/JobAI : hors du
   dépôt il ne peut pas importer le module, et il vivrait avec sa propre règle.
   La boîte de rôle (carriere@, rh@) SURVIT — c'est là que Marc postule.

9. Dépose — MAIS CHOISIS LE CANAL D'ABORD (voir « une seule passe par jour ») :
   · aucune passe n'a tourné aujourd'hui  -> POST, il dépose ET balaie ;
   · une passe a déjà tourné aujourd'hui  -> FICHIER, il dépose sans balayer.
   Poster deux fois le même jour périme des offres qui n'ont pas fermé. Dans le
   doute : fichier.

   POST : https://emploi.hubperso.com/api/ingest/depot
   Authorization: Bearer <JETON_DEPOT, jamais écrit dans un fichier>
   Si l'hôte est hors allowlist réseau : NE CONTOURNE PAS, nomme l'hôte bloqué
   et bascule sur le fichier.

   FICHIER : fusionner dans data/depot/AAAA-MM-JJ.json (dédoublonner avec
   `cleCanonique`, la clé de l'app), puis gate + commit + push — contrairement
   au POST, ce canal touche le dépôt git.

10. Pour les offres RETENUES dont l'employeur t'est inconnu, tu peux appeler
    get_company_data (avis, salaires, taille) — c'est du contexte pour Marc.
    N'écris JAMAIS son champ `addresses` dans `adresse` : il rend le siège
    social, pas l'établissement (mesuré : Honeywell Québec => "Charlotte, NC").
    Pour une adresse, seule l'annonce fait foi ; à défaut, WebSearch offre par
    offre avec l'adresseUrl qui rend la trouvaille relisable.

11. Gate : SANS OBJET si tu as posté (aucun fichier modifié). Si tu as déposé
    par FICHIER : typecheck, test, lint, build. Si le build échoue sur
   fonts.gstatic.com, c'est l'egress de la session, pas le code : dis-le, ne
   maquille pas un gate vert. Commit sur main, push, PUIS consulte la CI —
   sans PR, rien n'affiche un échec tout seul.

12. Rapporte en six lignes : sources interrogées, offres retenues, écartées avec
    motifs, lues vs non lues, PII retirée, et l'état du dépôt (HTTP ou fichier).
```

## Ce que ce prompt ne fait pas

- Il ne cherche pas d'adresse civique par recherche web. Ça existe (`adresse_source:
  "recherche"`, `[LIEU-04]`) et ça reste la source la plus RISQUÉE du projet : une recherche
  « adresse AMETEK » rend le siège social de Pennsylvanie pour une usine de Lévis. À faire
  seulement offre par offre, avec l'`adresseUrl` qui rend la trouvaille relisable.
- Il ne touche à aucun champ de Marc (`statut`, `prio`, `dateEnvoi`, `userNote`) : le dépôt
  propose, Marc tranche.
