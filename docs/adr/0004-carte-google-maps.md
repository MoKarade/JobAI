# ADR-0004 — Carte Google Maps : entreprises précises, domicile affiché, trajets

- **Statut** : accepté (décisions de Marc, 2026-07-29, quatre questions tranchées)
- **Décideur** : Marc

## Contexte

La première carte (Leaflet + épingles de municipalités, ADR implicite dans `[UX-04]`) a été
jugée insuffisante à l'usage : « la map est horrible ». Demandes explicites de Marc :
voir les **entreprises** (pas les villes), les **sélectionner** pour lire l'entreprise et
ses offres, **zoomer/se déplacer**, **chercher une adresse**, fond **Google Maps**, voir
**sa maison** et ses lieux, et la **durée de trajet** domicile → entreprise.

Deux demandes touchaient des règles établies ; les deux ont été tranchées par Marc :

1. **« Voir ma maison » contredisait le garde-fou n°1** (« le domicile n'est ni affiché ni
   envoyé au client »). Décision : **révisé**. Ce que le garde-fou protégeait vraiment,
   c'est le dépôt et le code : les coordonnées du domicile ne sont JAMAIS dans un fichier
   versionné (elles restent en variables d'environnement) et ne sortent JAMAIS vers un
   visiteur non authentifié. Mais la carte vit derrière un login Google mono-adresse :
   le « client » est Marc lui-même. Lui cacher sa propre maison sur sa propre carte privée
   protégeait le principe, pas la personne.
2. **« Zéro abonnement » (CLAUDE.md global) vs facturation Google Cloud obligatoire.**
   Décision : **facturation activée**. Usage perso très en dessous des ~10 000 requêtes
   gratuites/mois par produit (le crédit universel de 200 $ n'existe plus depuis mars
   2025) ; une **alerte de budget à 1 $** sert de filet — l'objectif reste 0 $/mois réel.

## Décisions

1. **Fond de carte : Google Maps** (`@vis.gl/react-google-maps`, la bibliothèque React
   maintenue par Google). Zoom, déplacement et recherche d'adresse natifs.
2. **On situe les ENTREPRISES, plus les municipalités.** Résolution automatique par Google
   Places (« Laserax, Québec » → adresse + position + `place_id`), persistée en base,
   **corrigeable dans l'app** : une position corrigée à la main (`source: "manuel"`) n'est
   plus jamais écrasée par l'automatique.
3. **Le domicile s'affiche** (épingle distincte) et sert d'origine aux **durées de trajet**
   (Routes API, calcul côté serveur, mis en cache en base — jamais un appel par affichage).
   Ses coordonnées viennent de `DOMICILE_LAT`/`DOMICILE_LON` et n'entrent jamais dans le code.
4. **Lieux personnels DANS JobAI** (garderie, gym…) : table dédiée, ajout par recherche
   d'adresse, affichés sur la carte. AUCUNE API Google ne donne accès aux « endroits
   enregistrés » d'un compte (vérifié — seule voie : export manuel Takeout) : on ne promet
   donc pas de synchronisation qui n'existe pas.
5. **Bouton « ouvrir dans Google Maps »** par entreprise : là, Marc est connecté à son
   compte et voit ses favoris et l'itinéraire complet — dans Google Maps lui-même.
6. **Deux clés API, deux périmètres.** Clé CLIENT (chargement de la carte JS uniquement,
   restreinte au domaine `emploi.hubperso.com`) ; clé SERVEUR (Places + Routes uniquement,
   jamais envoyée au navigateur). Une seule clé pour tout ferait porter les droits serveur
   par une valeur visible dans la page.

## Garde-fou n°1, version révisée

L'interdit qui RESTE absolu : aucune coordonnée du domicile ni d'un lieu personnel dans un
fichier versionné (env vars et base uniquement — `tests/piiGuard.test.ts` inchangé), et
aucune donnée de localisation servie à une requête non authentifiée. Ce qui CHANGE : la
page carte, derrière la session mono-adresse, peut afficher le domicile et les lieux
personnels de Marc. `CLAUDE.md` §2.1 est mis à jour dans le même esprit.

## Conséquences

- Leaflet, Nominatim (`lib/geocodage.ts`), `BoutonGeocoder` et la table `villes` seront
  RETIRÉS une fois la carte Google validée en production — pas avant (retour arrière
  facile), pas longtemps après (code mort qui ment).
- Le déclenchement des appels payants reste sobre : géocodage et trajets à la demande ou en
  cache, jamais par chargement de page. Seul le chargement de la carte JS compte par visite.
- Les appels réels Google ne peuvent PAS être exercés depuis la session Claude (réseau
  sortant restreint) : la logique est testée avec des clients injectés, et le premier essai
  réel appartient à Marc — comme pour Nominatim, et c'est écrit plutôt que découvert.

## Alternatives rejetées

- **Leaflet amélioré (100 % gratuit, sans carte bancaire)** — zoom/recherche/trajets
  possibles via OSM/OSRM, mais Marc a demandé Google explicitement, et l'écart d'expérience
  (fond de carte, recherche, fraîcheur des adresses) est réel. Rejeté par décision.
- **Afficher les « endroits enregistrés » Google** — techniquement impossible (pas d'API).
  Remplacé par les lieux propres à JobAI + le bouton vers Google Maps.
- **Une seule clé API** — plus simple, mais expose les droits Places/Routes dans la page.
