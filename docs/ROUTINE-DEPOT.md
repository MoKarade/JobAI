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

## Le prompt à coller dans la Routine

> Fréquence : **une fois par jour**, le matin. Le stock ne monte pas parce qu'un dépôt a
> eu lieu une fois en 72 h.

```
Tu alimentes JobAI, le suivi de recherche d'emploi de Marc dans la région de Québec.

ÉTAPE 1 — CHERCHER
Avec le connecteur Indeed, fais une recherche pour CHACUN de ces termes, localisation
« Québec, QC » avec un rayon de 50 km :

  coordonnateur de projet · chargé de projet · superviseur de production
  chef d'équipe production · gestionnaire de projet · coordonnateur logistique
  automatisation industrielle · électromécanique · mise en service
  technicien automatisation · robotique · vision industrielle
  responsable maintenance · coordonnateur SST · planificateur de production

Refais la même série avec la localisation « Lévis, QC ».
Garde les offres publiées dans les 7 derniers jours.

ÉTAPE 2 — NE FILTRE RIEN TOI-MÊME
Envoie TOUT ce que tu as trouvé dans ces recherches. C'est l'app qui décide : elle note
chaque offre, écarte ce qui est hors région ou sous le plancher d'adéquation, et te REND
le motif de chaque refus. Si tu filtres de ton côté, deux règles différentes cohabitent et
Marc perd des offres sans jamais le savoir. Ta seule sélection est celle des recherches
ci-dessus.

ÉTAPE 3 — DÉPOSER
POST https://emploi.hubperso.com/api/ingest/depot
  Authorization: Bearer <le jeton INGEST_TOKEN que Marc t'a donné>
  Content-Type: application/json

{
  "source": "routine-indeed",
  "jour": "AAAA-MM-JJ",          // la date du jour, fuseau America/Toronto
  "offres": [
    {
      "titre": "Coordonnateur de projets",
      "entreprise": "Nom de l'employeur",
      "ville": "Québec",          // la ville SEULE, sans province ni code postal
      "lien": "https://…",        // URL complète de l'offre
      "description": "le texte de l'annonce, jusqu'à 20 000 caractères",
      "publieeLe": "AAAA-MM-JJ",  // ou null si l'annonce ne le dit pas
      "refSource": "identifiant Indeed de l'offre"
    }
  ]
}

Champs obligatoires : titre et lien. Tous les autres peuvent manquer — mais chacun qui
manque coûte des points à l'offre, et une VILLE absente la fait écarter d'office (une
ingestion automatique ne parie pas sur un lieu qu'elle ne connaît pas). La description
compte double : c'est elle qui porte les signaux d'adéquation et le salaire.

N'invente jamais un champ. Une ville supposée est pire qu'une ville absente.
Maximum 300 offres par dépôt ; au-delà, fais plusieurs envois.

ÉTAPE 4 — RENDRE COMPTE À MARC
L'app répond un rapport. Résume-lui en clair :
  reçues / ajoutées, puis le détail des refus (horsRegion, lieuInconnu, sousLePlancher,
  doublons), la liste `titres` des offres retenues, et la liste `refusees` — chaque refus
  y porte son motif et le nom de l'employeur.

Signale-lui explicitement si `ajoutees` vaut 0 alors que `recues` est élevé : ça veut dire
que le filtre a tout mangé, et c'est le filtre qu'il faut regarder, pas la recherche.
```

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
