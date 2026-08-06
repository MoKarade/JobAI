# La Routine quotidienne — le seul canal qui produit des offres

> À copier dans une Routine claude.ai. Ce fichier est la **source de vérité** du prompt :
> tant qu'il ne vivait que dans la Routine, personne ne pouvait le lire, le corriger, ni
> même savoir ce qu'il cherchait — et c'est resté invisible pendant que Marc constatait
> « ça fait plusieurs jours y'a pas assez d'offres ».

## Pourquoi ce canal, et pourquoi lui seul

Sept sources automatiques ont été **mesurées**, pas supposées. Toutes mortes :

| Source | Verdict, mesuré |
|---|---|
| Guichet-Emplois — flux RSS | **404** sur six formes d'URL (31/07 puis 05/08) |
| Guichet-Emplois — API `jobsearch` | **404** |
| Données ouvertes Canada — jeu Guichet-Emplois | CSV **mensuels**, contenu 2023 |
| Données ouvertes Canada — « job postings » | Statistique Canada : des **statistiques** de postes vacants, aucune offre |
| Données Québec — « Offres d'emploi » | **Ville de Laval** — ses propres postes, à 250 km |
| Données Québec — « Offres d'emploi et postulation » | **Ville de Montréal** — idem |
| Québec emploi / Placement en ligne | **Page HTML** seulement, aucun flux (200 mais `<html>`) |

Il n'existe donc **aucun jeu de données provincial d'offres**. Les ATS interrogés
(Greenhouse, Lever, Recruitee, Workable, SmartRecruiters) ne couvrent aucun employeur de
la région — et deux « trouvailles » étaient des homonymes à Amsterdam.

Reste `POST /api/ingest/depot` : la Routine a le connecteur Indeed, l'app a la base. **Ce n'est pas une entorse au garde-fou n°4** : l'app ne va rien chercher, elle
reçoit — et elle applique au lot reçu exactement le tri du cron.

## Deuxième canal, sans jeton : `data/depot/AAAA-MM-JJ.json`

Depuis le 2026-08-06, un second chemin existe, et il ne demande **aucun geste de Marc**.

Une session de développement a le connecteur Indeed **et** le dépôt git, mais **aucun accès
réseau vers l'app** — mesuré : le proxy refuse `emploi.hubperso.com` comme il refuse
Overpass. Elle ne peut donc pas appeler le point de dépôt. Elle peut, en revanche, **écrire
un fichier et le pousser** : Vercel déploie, et l'app lit ce qu'elle porte elle-même.

    data/depot/2026-08-06.json
    { "source": "session-indeed", "jour": "2026-08-06", "offres": [ … ] }

Chaque offre peut porter une **`adresse`** — l'adresse civique du poste, **recopiée
verbatim de l'annonce**, jamais reconstituée. `get_job_details` d'Indeed la donne
parfois : mesuré le 2026-08-06 sur deux annonces, l'une porte un numéro civique, une voie
et un code postal complets (répétés deux fois), l'autre n'écrit que « Lieu du poste : En
présentiel ». Le champ reste **vide** dans ce second cas.

⚠️ **Jamais l'adresse d'une fiche entreprise, jamais celle de la mémoire du modèle.** La
fiche Indeed d'AMETEK rend son siège social de Pennsylvanie pour son usine de Lévis — une
adresse plausible et fausse envoie Marc à la mauvaise porte, ce qu'interdit le garde-fou
n°3. `adresseUtilisable` (pur, testé) écarte déjà « En présentiel », « Télétravail » et
« Québec » seul ; le géocodeur tranche ensuite, il exige un numéro civique ET une voie.

### Et quand l'annonce n'en donne pas : la recherche web

Demande de Marc, 2026-08-06. Le chercheur peut aller lire le **site officiel** de
l'entreprise (page « Contact »), et déclare alors `adresseSource: "recherche"` **plus
`adresseUrl`**, la page où il l'a lue.

⚠️ **C'est la source la plus risquée du projet**, et deux gardes la rendent acceptable :

1. **La page source est EXIGÉE.** Sans provenance, une adresse est invérifiable — ni Marc
   ni une session future ne peuvent la contrôler — et elle prend pourtant l'autorité d'un
   fait mesuré. L'URL est ce qui distingue une trouvaille d'une invention.
2. **La ville doit CONCORDER** avec celle qu'annonce l'offre (`villeCoherente`, pur, testé).
   Deux faits venus de sources indépendantes qui se confirment valent infiniment mieux
   qu'un seul qui affirme. Mesuré : une recherche « Permafil » rend Sainte-Marguerite alors
   que l'offre annonce Lévis — on ne sait pas laquelle est bonne, donc on ne prend ni l'une
   ni l'autre.

Cette garde refuse aussi des cas justes : une adresse dans un arrondissement
(« Sainte-Foy » pour une offre annoncée à « Québec ») est rejetée. Le coût est **assumé** :
ne pas prendre une bonne adresse fait perdre une épingle, en prendre une mauvaise envoie
Marc à la mauvaise porte. Les deux erreurs ne se valent pas.

La même garde s'applique aux adresses d'ANNONCE : une annonce dont l'adresse contredit sa
propre ville se trompe quelque part, et on ne sait pas où. Une seule règle partout vaut
mieux qu'une exception à retenir. Quand les deux existent, l'**annonce l'emporte** sur la
recherche, quel que soit l'ordre d'arrivée.

L'adresse est écrite dans `entreprises_lieux` avec `adresse_source = "offre"` ou
`"recherche"`, **seulement si la ligne n'en a pas** : elle n'écrase jamais une adresse
d'OpenStreetMap, qui est un objet cartographié à sa position. L'écran distingue les quatre
origines — une adresse de recherche s'affiche « trouvée sur le web — à confirmer », parce
que personne ne l'a vue.

Même schéma que le corps HTTP — littéralement le même, `lib/ingest/depotSchema.ts` : deux
définitions auraient dérivé, et c'est le canal le moins relu qui aurait gardé la version la
plus permissive. La ville s'écrit **seule**, sans province (« Québec », pas « Quebec City,
QC »).

Le fichier est lu par `lib/ingest/depotFichier.ts`, déclaré comme une source **hors
rotation** dans `lib/ingest/passe.ts` : il ne fait aucune requête, donc rien ne justifie de
le sauter certains jours — et le sauter ferait périmer à tort les offres qu'il porte.

⚠️ **Seuls les sept derniers jours sont relus** (`FENETRE_DEPOT_JOURS`). Sans cette fenêtre,
plus aucune offre ne périmerait jamais : un lot de janvier serait « revu » chaque matin, et
une annonce fermée resterait ouverte à l'écran pour toujours.

**Premier lot réel** : 26 offres Indeed le 2026-08-06 (recherches « coordonnateur de
projet », « superviseur de production », « chargé de projet » sur Québec et Lévis) — 25
retenues par `trier()`, 1 sous le plancher d'adéquation. Mesuré, pas supposé.

Les deux canaux coexistent sans se gêner : le dédoublonnage se fait sur `refSource`, donc
une offre déposée par les deux n'entre qu'une fois.

## Le prompt de la Routine — SOURCE DE VÉRITÉ

> Fréquence : **une fois par jour**, le matin (11:00 UTC). Le stock ne monte pas parce qu'un
> dépôt a eu lieu une fois en 72 h.
>
> Ce bloc EST le prompt de la Routine `JobAI — veille Indeed quotidienne`. Le modifier ici
> sans le reporter dans la Routine (ou l'inverse) fait diverger deux versions dont une seule
> s'exécute — et c'est celle qu'on ne lit pas qui gagne.

```
Tu alimentes JobAI, le suivi de recherche d'emploi de Marc dans la région de Québec.
Tu tournes seul, chaque matin. Va jusqu'au bout sans poser de question.

═══ 0. PRÉPARER LE TERRAIN ═══
- `date` pour connaître le jour. Le fuseau de Marc est America/Toronto : si l'heure UTC est
  avant 05:00, la date locale est CELLE DE LA VEILLE. Cette date, notée <JOUR>, sert partout.
- Cloner `MoKarade/JobAI` si absent, sinon `git checkout main && git pull origin main`.
- `npm ci` (session vierge : `node_modules` n'existe pas, et sans lui le gate de l'étape 4
  échoue pour une raison qui n'a rien à voir avec ton travail).
- Si l'outil Indeed `search_jobs` n'est pas disponible : ARRÊTE-TOI, dis-le, n'écris rien.

═══ 1. CHERCHER LES OFFRES ═══
`search_jobs`, country_code « CA », pour « Québec, QC » PUIS « Lévis, QC », un appel par terme :

  coordonnateur de projet · chargé de projet · superviseur de production
  chef d'équipe production · gestionnaire de projet · coordonnateur logistique
  automatisation industrielle · électromécanique · mise en service
  technicien automatisation · robotique · vision industrielle
  responsable maintenance · coordonnateur SST · planificateur de production

DÉDOUBLONNE par lien AVANT toute autre chose : le même poste sort de plusieurs recherches, et
sans ça tu paies dix fois le même détail.

═══ 2. L'ADRESSE, EN DEUX TEMPS — LE CŒUR DU TRAVAIL ═══
Budget : environ 40 offres passent par cette étape, les PLUS RÉCEMMENT PUBLIÉES d'abord.
Au-delà, dépose-les quand même SANS adresse, et DIS combien tu as laissées de côté à
l'étape 5. Un plafond tu, c'est une couverture qu'on croit complète et qui ne l'est pas.

2a. DANS LE TEXTE. `get_job_details` avec le `job_id`. Lis TOUT le corps, pas seulement
l'en-tête : l'adresse civique (numéro + voie) se cache dans « Location : … »,
« Emplacements: … », « Notre usine située au… », un pied de page. Recopie-la VERBATIM.
→ `adresseSource: "annonce"`, `adresseUrl: null`.

2b. SEULEMENT SI 2a N'A RIEN DONNÉ. Cherche le SITE OFFICIEL de l'entreprise, page
« Contact » / « Nous joindre », et LIS-LA. → `adresseSource: "recherche"` et `adresseUrl` =
la page où tu l'as lue. Sans URL, l'app refuse l'adresse.

⚠️ TU RECOPIES, TU NE RECONSTITUES JAMAIS. Pas de mémoire, pas de déduction, pas
d'approximation, pas d'annuaire agrégateur. Mesuré : la fiche entreprise d'Indeed rend le
siège social de Pennsylvanie d'AMETEK pour son usine de Lévis. Une adresse plausible et
fausse envoie Marc à la mauvaise porte — c'est PIRE que pas d'adresse.

⚠️ LA VILLE DOIT CONCORDER avec celle qu'annonce l'offre. Sinon, champ VIDE. Mesuré : une
recherche « Permafil » rend Sainte-Marguerite alors que l'offre annonce Lévis — on ne sait
pas laquelle est bonne, donc on ne prend ni l'une ni l'autre. Ne « corrige » JAMAIS la ville
pour faire passer une adresse : l'app rejette le cas de toute façon, et tu aurais faussé la
seule vérification qui existe.

Un champ vide est une BONNE réponse. Trois annonces sur quatre n'en donnent aucune.

═══ 3. NE FILTRE RIEN D'AUTRE ═══
Dépose TOUT ce que les recherches ont rendu. C'est l'app qui décide : elle note, écarte le
hors-région et le sous-plancher, et trace le motif de chaque refus. Filtrer de ton côté fait
cohabiter deux règles, et Marc perd des offres sans jamais le savoir.

═══ 4. ÉCRIRE, VÉRIFIER, POUSSER ═══
Fichier `data/depot/<JOUR>.json` — le nom DOIT être la même date que le champ `jour` :

{
  "source": "routine-indeed",
  "jour": "<JOUR>",
  "offres": [
    { "titre": "…", "entreprise": "…", "ville": "Québec", "lien": "https://…",
      "adresse": "", "adresseSource": null, "adresseUrl": null,
      "description": "", "publieeLe": "AAAA-MM-JJ" }
  ]
}

⚠️ `ville` SEULE, sans province. Indeed rend « Quebec City, QC » → écris « Québec ».
« Saint-lambert-de-lauzon, QC » → « Saint-Lambert-de-Lauzon ». Une virgule dans `ville` fait
échouer un test. Le champ `adresse` garde les siennes.
⚠️ `description` vide si tu n'as pas le texte. N'invente jamais un résumé : l'offre serait
notée sur du vide.
⚠️ AUCUNE OFFRE TROUVÉE ⇒ N'ÉCRIS PAS DE FICHIER, ne commite pas. Un lot vide se lit « la
veille a tourné et n'a rien vu », ce qui fait périmer des offres encore ouvertes.

Gate, les quatre, jugés par leur code de sortie :
  npm run typecheck && npx vitest run && npx eslint . && npm run build
`tests/depotFichier.test.ts` relit ton fichier. S'il est rouge, CORRIGE LE FICHIER — jamais
le test. Gate rouge pour une raison étrangère à ton fichier : ne pousse pas, dis-le.

Puis, en un seul enchaînement :
  git add data/depot/<JOUR>.json && git commit -m "[VEILLE] dépôt du <JOUR> : N offres" &&
  git push -u origin main
Échec réseau au push : réessaie 4 fois (2s, 4s, 8s, 16s). Pas de PR — le dépôt va sur `main`.

═══ 5. RENDRE COMPTE ═══
Cinq lignes, pas plus :
  offres trouvées / après dédoublonnage / écrites
  adresses : N annonce · N recherche · N aucune
  offres passées SANS adresse faute de budget : N
  gate : vert / rouge (et pourquoi)
  push : ok / échec
```

### Ce que chaque garde protège, et pourquoi elle est là

| Garde | Ce qu'elle empêche |
|---|---|
| `npm ci` avant le gate | Une session vierge n'a pas `node_modules` : le gate échouerait pour une raison étrangère au travail, et le lot serait perdu. |
| Dédoublonnage par lien AVANT les détails | Le même poste sort de plusieurs recherches ; sans ça on paie dix fois le même appel. |
| Budget d'environ 40 détails, les plus récents d'abord | 30 recherches × ~10 résultats = trop d'appels pour une exécution. Le reste est déposé **sans** adresse plutôt qu'écarté. |
| Le plafond est **dit** à l'étape 5 | Un plafond tu, c'est une couverture qu'on croit complète et qui ne l'est pas. |
| Aucune offre ⇒ **aucun fichier** | Un lot vide se lit « la veille a tourné et n'a rien vu » — et fait périmer des offres encore ouvertes. |
| Gate rouge ⇒ **on ne pousse pas** | Un dépôt illisible fait rendre `ok: false` à la source, et la passe du jour perd TOUTES ses offres. |
| « Corrige le fichier, jamais le test » | Le test est la spécification ; l'assouplir pour faire passer un lot casse le canal pour tous les suivants. |

### L'autre canal : `POST /api/ingest/depot`

Le point de dépôt HTTP existe toujours, et il accepte **exactement le même contenu** — c'est
le même schéma Zod, `lib/ingest/depotSchema.ts`, consommé par les deux. Une Routine
claude.ai qui dispose du jeton peut donc envoyer le lot par HTTP plutôt que par fichier ; le
tri, la note et la péremption sont identiques, et le dédoublonnage par `refSource` fait que
les deux canaux ne se marchent pas dessus.

Ce qu'il rend en plus : un rapport immédiat (`recues`, `ajoutees`, le détail des refus par
motif, la liste `titres` des retenues et la liste `refusees` avec le nom de chaque employeur
écarté). À lire ainsi : `ajoutees` à 0 alors que `recues` est élevé veut dire que le FILTRE a
tout mangé — c'est le filtre qu'il faut regarder, pas la recherche.

## Ce que le jeton n'est pas

`INGEST_TOKEN` est une variable d'environnement Vercel. Il **n'apparaît ni ici, ni dans
un commit, ni dans le chat** (garde-fou n°1 et n°5). Marc le colle dans la Routine, une
fois. Sans lui la route répond **503** (« dépôt désactivé ») ; avec un mauvais jeton,
**401**. Les deux se distinguent volontairement : « pas configuré » n'est pas « refusé ».

## Lire le rapport

- `ajoutees` élevé → le canal fait son travail.
- `doublons` élevé, `ajoutees` bas → normal au deuxième dépôt du même jour ; l'app ne
  réécrit jamais une offre déjà suivie.
- `horsRegion` élevé → la recherche déborde ; resserrer le rayon dans la Routine.
- `lieuInconnu` élevé → la source a cessé d'indiquer les villes. Ce n'est **pas** que le
  marché s'est éloigné, et c'est pour ça que les deux comptes sont séparés.
- `sousLePlancher` élevé → les recherches ramènent des métiers hors profil. Regarder
  `refusees` avant de toucher au plancher : il est à 14/40 sur la seule composante qui
  mesure vraiment l'adéquation au rôle (`fitRole`), et un plancher sur la note TOTALE ne
  filtrerait rien — « Caissier » note 48/100 par accumulation de points d'inconnues.
- `villesCompletees` → des offres déjà suivies ont gagné leur ville grâce à ce dépôt,
  donc leur position et leur distance. C'est ce compteur qui manquait quand 40 offres
  réelles sont entrées sans ville, sans que rien ne le signale.
