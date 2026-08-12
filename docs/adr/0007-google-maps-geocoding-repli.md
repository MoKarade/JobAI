# ADR-0007 — Google Maps Geocoding, en repli étroit de Nominatim

**Date** : 2026-08-12 · **Statut** : accepté

## Contexte

`[CARTE-03]` : Nominatim (OpenStreetMap) ne reconnaît pas la plupart des PME par leur nom —
c'est un service communautaire, pas un annuaire d'entreprises. Le registre du Québec comble
une partie du trou (adresse civique déclarée), mais des dizaines d'employeurs suivis restent
introuvables des deux côtés, épinglés au centre-ville faute de mieux.

Question posée à Marc : quelle source de repli pour ces cas ? Quatre options présentées
(Google Maps Geocoding, recherche web générale, lecture par un modèle, aucune). **Marc a
choisi Google Maps Geocoding**, informé du coût (compte + facturation Google Cloud à
activer, volume attendu très en dessous du crédit gratuit mensuel).

### Ce que cette décision N'EST PAS : ADR-0004 ne revient pas

ADR-0004 (2026-07-29) proposait un remplacement COMPLET du fond de carte (Leaflet →
Google Maps JS), avec Places pour situer les entreprises, Routes pour les trajets, le
domicile de Marc affiché, deux clés API (client + serveur). **Accepté puis ANNULÉ le jour
même** : Marc a préféré Leaflet + Nominatim + un simple lien « ouvrir dans Google Maps »,
pour éviter la facturation, la complexité de deux clés, et l'exposition de coordonnées.

Cette décision-ci est délibérément **beaucoup plus étroite** :
- Le fond de carte reste Leaflet. Aucune UI ne change.
- Une seule clé, **serveur uniquement**, jamais envoyée au navigateur (garde-fou n°1 intact
  — elle ne géocode que des entreprises publiques, jamais le domicile de Marc).
- **Un seul usage** : la Geocoding API, en repli, uniquement pour les entreprises que
  Nominatim ET le registre ont déjà ratées. Pas de Places, pas de Routes, pas de domicile.
- **Optionnelle par construction** : `GOOGLE_MAPS_API_KEY` absente ⇒ le repli ne se
  déclenche simplement pas, zéro erreur, zéro changement de comportement.

Les deux décisions ne se contredisent pas : ADR-0004 refusait un remplacement large et
coûteux de l'UI ; celle-ci ajoute un filet étroit et désactivable derrière une donnée
existante (le géocodage serveur d'une entreprise), sans toucher à ce qu'ADR-0004 a annulé.

## Décision

**Google Maps Geocoding comme TROISIÈME repli**, après le registre (gratuit, local) et
Nominatim par nom (gratuit, communautaire) — jamais à leur place :

1. `raffinerPositions` (`lib/actions.ts`) tente Google UNIQUEMENT pour les entreprises que
   Nominatim vient de rater cette passe (introuvable OU hors rayon), jamais pour reconfirmer
   ce qui a déjà marché.
2. **Même garde de plausibilité que Nominatim** : le résultat doit porter le nom cherché
   (`nomEchoDansResultat`, la même fonction — pas une copie) ET être à moins de
   `RAYON_VALIDATION_KM` du centre de la ville annoncée. Un géocodeur payant n'est pas
   dispensé du garde-fou n°3 : il peut approximer vers l'adresse la plus proche au lieu de
   rendre « introuvable », et ce serait le même risque d'homonyme que Nominatim.
3. `components=country:CA` restreint DUR la requête au Canada — un filtre en plus de la
   validation par distance, pas à sa place.
4. **Nouvelle origine d'adresse `google`** (`adresse_source`), distincte de `recherche` :
   une réponse de géocodeur structurée n'a pas besoin de la mise en garde « à confirmer »
   qui s'applique à une page web lue par un agent — les deux sont de nature différente.
5. **Pas de cadence imposée** (contrairement à Nominatim, qui exige 1,1 s entre requêtes en
   tant que service bénévole) : Google reste sous le budget de temps global de la passe, pas
   sous une contre-pression éthique envers un service communautaire.
6. **Panne Google non bloquante** : une erreur (quota, clé invalide, réseau) est journalisée
   et arrête le repli pour cette passe SANS faire perdre ce que Nominatim a déjà résolu —
   même principe que les autres étapes de `mesurerDistances` (registre, bornes).

## Coût

Google factue la Geocoding API au-delà d'un crédit mensuel (~200 $ US, ≈ 40 000 requêtes).
Le volume de JobAI (quelques dizaines d'entreprises à retenter par jour, plafonné par le
même `maxSituations` que Nominatim) reste très en dessous. Aucune alerte de budget n'est
posée par ce chantier — décision explicitement laissée à Marc côté Google Cloud (comme pour
la clé elle-même), documentée dans `.env.example`.

## Trade-offs assumés

- **Deux copies de la même politique de validation** (nom + distance) existent maintenant,
  une par fournisseur — mais elles appellent la MÊME fonction (`nomEchoDansResultat`,
  `distanceKm`), jamais une logique dupliquée. Le risque de divergence reste sur les points
  d'appel, pas sur la règle.
- **La clé API est un secret de plus à gérer** (garde-fou n°1) : serveur uniquement, jamais
  dans un fichier versionné, restreinte côté Google à la seule Geocoding API.

## Alternatives rejetées

- **Recherche web générale** (Brave/Bing + extraction) — écarté par Marc : moins fiable,
  plus dur à valider qu'une réponse structurée de géocodeur.
- **Lecture par un modèle** — écarté par Marc : introduirait un premier appel LLM dans
  JobAI, ce que le README présente explicitement comme une absence assumée (« aucun appel
  LLM dans l'app »), avec un risque d'hallucination à garder sous contrôle.
- **Ne rien ajouter** — écarté : le reliquat « sans adresse » ne baisse plus une fois le
  registre et Nominatim épuisés ; c'est une vraie limite de données, pas un bug de code,
  mais Marc a choisi d'y répondre par un troisième fournisseur plutôt que de l'accepter.

## Vérification

- `lib/geocodage.ts` : `urlRechercheGoogle`, `lireReponseGoogle`, `geocoderEntrepriseGoogle`
  — fetch injecté (la session de développement n'a pas accès au réseau Google non plus),
  testés dans `tests/geocodage.test.ts` (statuts `OK`/`ZERO_RESULTS`/pannes, bornes
  régionales, garde du nom).
- `lib/actions.ts` : le câblage dans `raffinerPositions` n'appelle Google QUE sur ce que
  Nominatim a raté, jamais sur ce qu'il a résolu — observable dans `Raffinage.parGoogle` /
  `Raffinage.googleTente`, exposés dans les logs `[distances]` des deux crons.
- Migration `drizzle/0015_adresse_google.sql` : la contrainte `entreprises_lieux_adresse_source_ck`
  accepte `google` en plus des quatre valeurs existantes.
