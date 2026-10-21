# ADR-0041 — Gmail en lecture seule : un client OAuth propre à JobAI, un jeton chiffré, échec fermé

**Date** : 2026-10-21 · **Statut** : proposé (JobAI#107, mission JobAI#105). Coût IA : aucun dans cette tâche (la proposition de statut est
JobAI#218). Décision de Marc du 2026-10-19 : mode **A, lecture seule** (`gmail.readonly`), projet Google en production, Marc seul utilisateur, aucune
écriture automatique, Marc confirme chaque statut proposé.

## Contexte

Le commentaire d'`auth.ts` (ADR 0001 de Hubperso) disait que les scopes Google restreints « devront passer par le HUB ». Marc a depuis tranché
pour un client OAuth propre à JobAI (JobAI#201) : la connexion à l'app reste celle du hub (aucun fournisseur dans `auth.ts`), **l'accès à Gmail est
un second flux, distinct**, qui ne crée aucune session et ne remplace rien.

## Décision

1. **Un seul scope : `https://www.googleapis.com/auth/gmail.readonly`.** Il est demandé, et **vérifié au retour** : si Google accorde autre chose
   (ou en plus), le jeton est refusé avant d'être gardé (`lib/gmail/oauth.ts`, `echangerCode`). La lecture seule est une propriété du code.
2. **Flux « code + PKCE (S256), hors ligne ».** `/api/gmail/connexion` (302 vers Google) et `/api/gmail/retour` (échange du code), toutes deux
   **derrière la garde de session** (non listées dans `estCheminPublic`) et qui revérifient la session. Le `state` et le verifier voyagent dans un cookie
   `HttpOnly; Secure; SameSite=Lax` de 10 minutes, limité au chemin `/api/gmail`, supprimé dans tous les cas ; le `state` se compare en temps constant.
3. **Échec fermé.** Tant que `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` ou `AUTH_SECRET` manque (ou est blanc), `configGmail()` rend `ok: false`, la route
   de connexion répond 503 et aucune requête ne part. `etat_synchro` rend une ligne `gmail` (`configure`, `manquantes` = **noms** de variables, `connecte`).
4. **Le jeton de rafraîchissement est chiffré** (AES-256-GCM) avant d'être posé dans `sync_state` (clé `gmail-jeton`) : pas de table, pas de migration. La
   clé est **dérivée d'`AUTH_SECRET`** (HKDF-SHA256, contexte `jobai-gmail-refresh-token-v1`) : Marc ne pose pas de variable de plus. Conséquence assumée :
   changer `AUTH_SECRET` rend le jeton illisible, donc l'accès se redemande (échec fermé, pas une panne). Le contenu n'en sort jamais (`etat_synchro` ne rend
   que le nom et la date d'écriture).
5. **Lecture bornée, en `GET` seulement** (`lib/gmail/lecture.ts`) : boîte de réception, 60 jours au plus, 50 courriels au plus, sans promotions, réseaux
   sociaux ni forums. On garde l'expéditeur, le sujet, la date et l'extrait (`snippet`) **après `expurgerPII`** ; jamais le corps ni une pièce jointe. Un test
   verrouille qu'aucune méthode d'écriture ni point d'écriture de l'API Gmail n'apparaît. Le texte d'un courriel est une donnée, jamais une consigne.
6. **`/api/gmail/courriels`** (session) rend les courriels récents ou un état nommé : `non-configure`, `non-connecte`, `jeton-illisible` (AUTH_SECRET a changé),
   `google-refuse` (jeton révoqué). C'est le point de contrôle de Marc et de Claude après le geste de JobAI#201, et ce que consommera JobAI#218.
7. **Les erreurs de Google ne sont jamais reprises telles quelles** : statut et code d'erreur standard seulement (le corps peut citer le client).

## Variables (à poser dans Vercel par Marc, JobAI#201 ; volontairement absentes de `.env.example`)

`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, et optionnellement `GMAIL_REDIRECT_URI` (par défaut `https://emploi.hubperso.com/api/gmail/retour`, l'adresse à
déclarer comme URI de redirection autorisée dans le client OAuth de type « Application Web »). `AUTH_SECRET` existe déjà. Elles ne figurent pas dans
`.env.example` : le Garde-fou traite toute variable secrète ajoutée à un fichier `.env*` comme un geste de Marc, et ce fichier n'aurait de toute façon porté
que des lignes vides.

## Ce que cette tâche ne fait pas

Aucune proposition de statut (JobAI#218), aucun écran (JobAI#219), aucune écriture dans le suivi. La lecture d'un vrai courriel attend le client OAuth
de Marc (JobAI#201) ; avant lui, la preuve en production est l'état « non configuré ».

## Limites connues [Probable]

- Projet Google en mode « Test » : le jeton expire tous les 7 jours (c'est pourquoi #201 demande « en production »).
- Une seule boîte (celle de Marc), un seul jeton : se reconnecter écrase le précédent.
