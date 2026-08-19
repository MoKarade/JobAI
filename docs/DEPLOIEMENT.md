# Mettre JobAI en ligne — la démarche complète

> Tout ce qui suit se fait **hors du dépôt** : ce sont les gestes que Claude ne peut pas
> faire à ta place (créer un compte, cliquer dans une console, poser une variable secrète).
> Le code, lui, est prêt.
>
> Compte ~45 minutes la première fois. Tu peux t'arrêter après l'étape 4 : à ce moment-là,
> l'app fonctionne déjà sur son URL Vercel. Les étapes 5 et 6 ajoutent le domaine propre et
> le widget sur le hub.
>
> **Toutes les commandes sont données pour PowerShell** (ton poste) — `openssl` n'y existe
> pas, donc rien n'en dépend ici.

## ⚠️ Avant tout : deux natures de blocs, à ne pas confondre

Ce document contient deux choses très différentes, et les confondre produit des erreurs
déroutantes :

| Marqueur | Ce que c'est | Ce qu'on en fait |
|---|---|---|
| 🖥️ **COMMANDE** | À exécuter | On la tape (ou colle) dans PowerShell |
| 📄 **CONTENU DE FICHIER** | Du texte à enregistrer | On l'écrit **dans un fichier**, jamais dans PowerShell |
| 💾 **CODE** | Du TypeScript | Ça va dans un fichier source — c'est mon travail, pas le tien |

Et une convention pour les valeurs : **`…`, `xxx`, `TON_…` et `COLLE-ICI-…` sont des espaces
réservés**. Ils signalent du texte à remplacer par ta vraie valeur, jamais à taper tel quel.
Une chaîne de connexion Neon fait plus de cent caractères — si ce que tu colles en fait
trois, c'est l'espace réservé.

Coller `DATABASE_URL=postgresql://…` dans PowerShell donne
`Le caractère perluète (&) n'est pas autorisé` ou `n'est pas reconnu comme nom d'applet de
commande` : c'est normal, ce n'est **pas une commande**, c'est une ligne de fichier.

---

## Vue d'ensemble

| # | Étape | Où | Durée |
|---|---|---|---|
| 1 | Créer la base Neon | neon.tech | 5 min |
| 2 | ~~Créer le client OAuth Google~~ — **supprimée**, JobAI n'en a plus | — | 0 min |
| 3 | Générer les deux secrets | ton poste | 2 min |
| 4 | Créer le projet Vercel et déployer | vercel.com | 10 min |
| 5 | Brancher le domaine `emploi.hubperso.com` | Cloudflare + Vercel | 10 min |
| 6 | Déclarer JobAI dans le hub | dépôt Hubperso | 5 min |

---

## Étape 1 — La base de données (Neon)

1. Va sur **https://neon.tech** et connecte-toi (le compte gratuit suffit largement :
   JobAI, c'est quelques dizaines de lignes).
2. **New project** → nomme-le `jobai` → région **AWS us-east-1** ou
   **AWS ca-central-1** (Montréal, plus proche).
3. Une fois créé, Neon affiche la **connection string**. Prends la version **Pooled
   connection** (elle contient `-pooler` dans le nom d'hôte) — c'est celle qui convient à
   un hébergement serverless comme Vercel.
4. Garde-la de côté : c'est ta valeur de `DATABASE_URL`. Elle ressemble à
   `postgresql://user:motdepasse@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require`.

> ⚠️ Cette chaîne contient un mot de passe. Elle ne va **jamais** dans le dépôt, seulement
> dans `.env.local` (ignoré par git) et dans les variables Vercel.

---

## Étape 2 — ~~Le client OAuth Google~~ (supprimée)

> ⚠️ **Cette étape n'existe plus, et la suivre ferait perdre une soirée.** Elle demandait de
> créer un client OAuth pour JobAI et de déclarer trois redirect URIs. Depuis l'étape 1 de
> l'ADR 0001 du hub, **JobAI ne parle plus à Google du tout** : `auth.ts` déclare
> `providers: []` (« AUCUN FOURNISSEUR, ET C'EST LE POINT »), il n'y a plus de bouton de
> connexion — `app/connexion/page.tsx` redirige vers `hubperso.com/login` — et
> `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ont disparu de l'environnement.
>
> Un client créé pour JobAI ne servirait donc à rien, et le symptôme « redirect URI absent »
> ne peut plus se produire ici.

### Ce qu'il faut à la place : brancher la session partagée

JobAI **lit** la session que le hub pose sur `.hubperso.com`. Trois conditions, toutes
nécessaires — il en manque une et la connexion boucle sans message d'erreur :

1. **`AUTH_SECRET` IDENTIQUE à celui du hub.** Le JWT est chiffré avec : un secret différent
   et JobAI reçoit bien le cookie, mais n'en tire rien. Elle renvoie sur `/login`, le hub
   reconnecte, et ça recommence.
2. **`AUTH_COOKIE_DOMAIN=.hubperso.com`, en PRODUCTION seulement.** Un cookie portant ce
   domaine est rejeté sur `localhost` et sur `<projet>.vercel.app` — et **silencieusement**.
3. **Le domaine `emploi.hubperso.com` branché** (étape 5). Sur une adresse en `.vercel.app`,
   le cookie ne franchit pas la frontière entre les deux domaines : la connexion unique ne
   peut pas marcher, quoi qu'on configure.

Corollaire pour le développement local : sans `AUTH_COOKIE_DOMAIN`, il n'y a pas de session
partagée sur `localhost`. C'est normal, pas une panne.

---

## Étape 3 — Les deux secrets

Ouvre PowerShell dans le dossier du dépôt.

🖥️ **COMMANDE** — le secret de session (signe les cookies de connexion) :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

🖥️ **COMMANDE** — le jeton du hub (celui que le hub enverra pour lire ton widget) :

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Copie les deux valeurs affichées : elles iront dans le fichier `.env.local` à l'étape
suivante, et dans les variables Vercel.

> `npx auth secret` fait la même chose pour `AUTH_SECRET` et l'écrit directement dans
> `.env.local`. Les commandes ci-dessus se contentent d'**afficher** la valeur, ce qui te
> laisse la coller où tu veux — c'est plus prévisible quand on configure deux endroits.

Garde cette seconde valeur : elle servira **deux fois**, à l'identique — côté JobAI
(`HUB_TOKEN`) et côté hub (`HUB_TOKEN_JOBAI`). Si les deux diffèrent, le widget affichera
« non autorisée ».

---

## Étape 4 — Le projet Vercel

1. Sur **https://vercel.com** → **Add New** → **Project** → importe le dépôt
   **`MoKarade/JobAI`**.
2. **Root Directory : laisse la racine** (contrairement à BatchChef, JobAI n'a pas de
   sous-dossier `web/`).
3. Framework : Vercel détecte **Next.js** tout seul, ne touche à rien.
4. Avant de cliquer *Deploy*, ouvre **Environment Variables** et ajoute :

   | Nom | Valeur | Provenance |
   |---|---|---|
   | `DATABASE_URL` | la chaîne *pooled* | étape 1 |
   | `AUTH_SECRET` | **la valeur EXACTE du hub**, pas une nouvelle | variables Vercel du hub |
   | `AUTHORIZED_EMAIL` | `marc.richard4@gmail.com` | le propriétaire |
   | `HUB_TOKEN` | le jeton du hub | étape 3 |
   | `AUTH_COOKIE_DOMAIN` | `.hubperso.com` — **Production UNIQUEMENT** | étape 2 |
   | `NEXT_PUBLIC_HUB_URL` | `https://hubperso.com` (optionnel, c'est le défaut) | — |

   Coche les trois environnements (Production, Preview, Development) pour toutes **sauf**
   `AUTH_COOKIE_DOMAIN`, qui ne va qu'en Production (voir étape 2).

   Il n'y a **plus** de `GOOGLE_CLIENT_ID` ni de `GOOGLE_CLIENT_SECRET` : JobAI ne parle plus
   à Google.

5. **Deploy**. Vercel te donne une URL en `https://jobai-xxxx.vercel.app`. Elle sert à
   vérifier que l'app démarre — mais **la connexion n'y marchera pas** : le cookie du hub ne
   franchit pas la frontière `.vercel.app` / `.hubperso.com`. Ce n'est pas une panne, c'est
   l'étape 5 qui manque.

### Appliquer le schéma et charger tes offres

**1. Créer le fichier `.env.local`** à la racine du dépôt.

🖥️ **COMMANDE** — ouvre le Bloc-notes sur un fichier neuf :

```powershell
notepad .env.local
```

Windows demande de confirmer la création : accepte.

📄 **CONTENU DE FICHIER** — colle ceci dans le Bloc-notes, remplace par tes vraies valeurs,
puis enregistre (Ctrl+S) et ferme :

```
DATABASE_URL=postgresql://user:motdepasse@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
AUTH_SECRET=...
AUTHORIZED_EMAIL=marc.richard4@gmail.com
HUB_TOKEN=...
```

> ⚠️ Ces lignes **ne se tapent pas dans PowerShell**. Le `&` de la chaîne Neon y est un
> opérateur réservé, d'où l'erreur `Le caractère perluète (&) n'est pas autorisé`. Dans un
> fichier, il n'a aucune signification particulière : il est pris tel quel.
>
> `.env.local` est ignoré par git (vérifié dans `.gitignore`) : il ne partira jamais sur
> GitHub.

**2. Installer les dépendances** — à faire UNE FOIS, avant toute autre commande.

🖥️ **COMMANDE** :

```powershell
npm install
```

> Sans cette étape, `npm run db:migrate` répond `'drizzle-kit' n'est pas reconnu` et
> `npm run db:seed` répond `'tsx' n'est pas reconnu` : ces outils sont des dépendances du
> projet, ils n'existent pas tant qu'elles ne sont pas installées. Ça prend une à deux
> minutes et ça ne se refait qu'après un changement de dépendances.

**3. Créer les tables et charger les offres.**

🖥️ **COMMANDES** — une par une :

```powershell
npm run db:migrate
npm run db:seed
```

> ⚠️ **`npm run db:migrate` ne passe plus par `drizzle-kit`** (depuis le 2026-07-28).
> `drizzle-kit migrate` utilisait le pilote websocket de Neon, qui échouait à se connecter
> et sortait **avec le code 0, sans erreur et sans créer de table**. La commande passe
> maintenant par `scripts/migrer.ts` : même pilote HTTP que l'app, et il RELIT la base pour
> confirmer que les tables existent — il échoue bruyamment sinon.
>
> Depuis le 2026-07-28, ces deux commandes **lisent `.env.local` toutes seules**. Ce
> n'était pas le cas avant : `drizzle-kit` et `tsx` tournent hors de Next.js, qui est le
> seul à charger ce fichier automatiquement. `npm run db:migrate` échouait donc sur
> `[x] url: ''` alors que la chaîne était dans le fichier juste à côté.

Si `DATABASE_URL` est signalée absente, le message affiché dit maintenant où la poser. Le
plus probable est que `.env.local` n'existe pas encore, ou que la ligne y est vide.

En dernier recours seulement, tu peux passer la variable pour la session en cours — **avec
des guillemets SIMPLES**, sans quoi PowerShell interprète le `&` et le `$` :

```powershell
$env:DATABASE_URL='COLLE-ICI-TA-VRAIE-CHAINE-NEON'
npm run db:migrate
npm run db:seed
```

> ⚠️ **`COLLE-ICI-TA-VRAIE-CHAINE-NEON` est un espace réservé**, à remplacer intégralement
> par la chaîne copiée depuis neon.tech. Elle commence par `postgresql://` et fait plusieurs
> dizaines de caractères. Partout dans ce document, `…`, `xxx` et `TON_…` signalent la même
> chose : **du texte à remplacer**, jamais à taper tel quel.

La variable ainsi posée ne vaut que pour cette fenêtre PowerShell — c'est voulu : elle ne
traîne pas sur ta machine.

🖥️ **VÉRIFIER** que la chaîne est bien celle de Neon avant de lancer quoi que ce soit :

```powershell
$env:DATABASE_URL.Length
```

Doit afficher un nombre autour de 130. Si tu vois `0`, la variable est vide ; si tu vois
moins de 50, c'est l'espace réservé qui a été collé au lieu de la vraie valeur.

`db:seed` est **relançable sans risque** : ton suivi (statut, priorité, date d'envoi, note
personnelle) est préservé, seuls les champs de recherche sont rafraîchis.

**À ce stade, l'app démarre.** Sur l'URL `.vercel.app`, tu verras la redirection vers
`hubperso.com/login` — mais pas tes offres : le cookie de session ne traverse pas d'un
domaine à l'autre. Les données ne s'afficheront qu'une fois `emploi.hubperso.com` branché
(étape 5). C'est attendu, ce n'est pas un problème de configuration.

---

## Étape 5 — Le domaine `emploi.hubperso.com`

Le domaine `hubperso.com` est chez **Cloudflare Registrar** (nameservers
`elsa.ns.cloudflare.com` et `michael.ns.cloudflare.com`).

**Côté Vercel** :
1. Projet JobAI → **Settings** → **Domains** → **Add** → `emploi.hubperso.com`.
2. Vercel affiche l'enregistrement DNS attendu — en général un **CNAME** vers
   `cname.vercel-dns.com`.

**Côté Cloudflare** :
3. Tableau de bord Cloudflare → zone **hubperso.com** → **DNS** → **Add record**.
4. Type **CNAME**, nom **`emploi`**, cible **`cname.vercel-dns.com`**.
5. ⚠️ **Proxy status : DNS only (nuage GRIS), pas Proxied.** C'est le réglage que FinanceAI
   a fini par adopter après avoir retiré Cloudflare Access : en mode *Proxied*, Cloudflare
   s'interpose et le certificat de Vercel ne se met pas en place correctement.
6. Attends la validation côté Vercel (quelques minutes, parfois jusqu'à une heure).

**Puis** :
7. Ajoute `https://emploi.hubperso.com/api/auth/callback/google` aux redirect URIs Google
   (étape 2) si ce n'est pas déjà fait.

---

## Étape 6 — Déclarer JobAI dans le hub

**a. Le code : ✅ déjà fait.** L'entrée `jobai` est ajoutée à `lib/sources.ts` du dépôt
`Hubperso`, avec la mise à jour de `tests/sources.test.ts` (exhaustif, trois assertions) et
de son `.env.example` — voir la **PR #12** du dépôt Hubperso. Il te reste à la merger.

**b. La variable :** dans les variables Vercel du projet **hubperso**, ajouter
`HUB_TOKEN_JOBAI` avec **exactement la même valeur** que le `HUB_TOKEN` de JobAI (étape 3).

**c. Redéployer le hub** pour que l'entrée prenne effet — `SOURCE_DEFS` est du code, poser
la variable seule ne suffit pas.

> Tant que le jeton n'est pas posé, le widget affiche « non configurée » — et les autres
> apps continuent de s'afficher normalement. Rien ne casse.

---

## Vérifier que tout marche

**L'app** : `https://emploi.hubperso.com` → redirection vers `hubperso.com/login` →
connexion → retour sur JobAI, tes offres s'affichent. Change un statut : il doit rester après
un rafraîchissement.

**La connexion unique** : connecte-toi d'abord sur `hubperso.com`, puis ouvre
`emploi.hubperso.com` directement. Tu dois entrer **sans repasser par le login**. Si tu
repasses par le login, c'est `AUTH_SECRET` qui diffère ou `AUTH_COOKIE_DOMAIN` qui manque.

**Le refus d'accès** : connecte-toi avec une autre adresse Google, sans lui avoir accordé
JobAI dans `hubperso.com/administration`. Tu dois être refusé.

**L'ACCÈS ACCORDÉ** — le test qui compte vraiment, et le seul que l'ancienne procédure ne
faisait pas : dans `hubperso.com/administration`, coche `jobai` pour cette adresse. Elle doit
entrer **dans la minute**, sans redéploiement et sans toucher à `AUTHORIZED_EMAIL`. Décoche :
elle doit ressortir, dans la minute aussi. Se connecter avec sa propre adresse ne prouve rien
d'autre que le chemin du propriétaire, qui court-circuite le hub par construction.

**L'endpoint du hub**, depuis PowerShell :

```powershell
curl.exe -s -H "x-hub-token: TON_JETON" https://emploi.hubperso.com/api/hub/summary
```

Tu dois recevoir du JSON avec `"status":"ok"` et tes vraies métriques. Sans le header, tu
dois recevoir **401** — c'est le comportement attendu, pas une panne.

**Le widget** : va sur `hubperso.com`, le widget JobAI doit apparaître avec ta meilleure
offre en gros chiffre.

---

## Si quelque chose ne marche pas

| Symptôme | Cause la plus probable |
|---|---|
| Redirection en boucle entre JobAI et le hub | `AUTH_SECRET` différent de celui du hub (JobAI reçoit le cookie et n'arrive pas à le lire), ou `AUTH_COOKIE_DOMAIN` absent en Production. Ce n'est **jamais** un redirect URI Google : JobAI n'en a plus. |
| Connexion refusée avec ton adresse | `AUTHORIZED_EMAIL` absent, mal orthographié, ou pas déployé (une variable ajoutée après le déploiement exige un redéploiement). |
| Une personne INVITÉE est refusée alors que le hub la montre avec l'accès | `HUB_TOKEN` absent (JobAI ne peut pas interroger le hub → échec fermé), ou `NEXT_PUBLIC_HUB_URL` qui pointe ailleurs. Attendre une minute : le cache des réponses positives. Un refus, lui, n'est jamais mis en cache. |
| Tout répond 503 avec `auth_non_configuree` | `AUTH_SECRET` ou `AUTHORIZED_EMAIL` manquant. C'est voulu : sans authentification configurée, l'app ne sert rien. |
| « Base de données non configurée » à l'écran | `DATABASE_URL` absent des variables Vercel. |
| « Aucune offre enregistrée » | La base répond mais elle est vide : lance `npm run db:seed`. |
| Widget « injoignable » sur le hub | L'URL déclarée dans `sources.ts` ne correspond pas au chemin réel (`/api/hub/summary`, pas `/hub/summary`). |
| Widget « non autorisée » | `HUB_TOKEN` et `HUB_TOKEN_JOBAI` diffèrent. |
| Widget « en construction » | L'app répond bien, mais la base est vide ou non configurée. |

---

## Ce que ça ne couvre pas encore

Le scan Gmail (V2) et l'assistance IA (V3) demanderont d'autres réglages — scopes Google
supplémentaires, clé Anthropic. Ils feront l'objet d'un ADR avant d'être branchés :
`gmail.readonly` et l'accès Drive sont des **scopes restreints**, qui changent le régime de
vérification de l'application Google entière. Rien de tout ça n'est nécessaire aujourd'hui.
