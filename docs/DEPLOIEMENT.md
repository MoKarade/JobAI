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

---

## Vue d'ensemble

| # | Étape | Où | Durée |
|---|---|---|---|
| 1 | Créer la base Neon | neon.tech | 5 min |
| 2 | Créer le client OAuth Google | Google Cloud Console | 10 min |
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

## Étape 2 — Le client OAuth Google

C'est ce qui permet la connexion. **Le même projet Google Cloud que le hub fait l'affaire**
— pas besoin d'en créer un nouveau.

1. Va sur **https://console.cloud.google.com/apis/credentials**.
2. Sélectionne le projet que tu utilises déjà pour le hub (celui où vivent les identifiants
   OAuth de `hubperso.com`).
3. **Create credentials** → **OAuth client ID** → type **Web application**.
4. Nom : `JobAI`.
5. Dans **Authorized redirect URIs**, ajoute ces **trois** entrées :

   ```
   http://localhost:3000/api/auth/callback/google
   https://<ton-projet>.vercel.app/api/auth/callback/google
   https://emploi.hubperso.com/api/auth/callback/google
   ```

   La deuxième, tu ne la connaîtras qu'après l'étape 4 : tu pourras revenir l'ajouter.
   Google accepte de modifier la liste à tout moment, la prise en compte est immédiate.
6. Valide. Google affiche un **Client ID** et un **Client secret** — garde-les.

> Si tu préfères réutiliser le client OAuth existant du hub plutôt que d'en créer un
> nouveau, c'est possible : ajoute simplement les trois URIs ci-dessus à sa liste. Un
> client séparé reste plus propre (révocable indépendamment).

---

## Étape 3 — Les deux secrets

Ouvre PowerShell dans le dossier du dépôt.

**Le secret de session** (signe les cookies de connexion) :

```powershell
npx auth secret
```

Cette commande écrit directement `AUTH_SECRET` dans ton `.env.local`. Si tu préfères la
valeur à la main :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Le jeton du hub** (celui que le hub enverra pour lire ton widget) :

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

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
   | `GOOGLE_CLIENT_ID` | le Client ID | étape 2 |
   | `GOOGLE_CLIENT_SECRET` | le Client secret | étape 2 |
   | `AUTH_SECRET` | le secret de session | étape 3 |
   | `AUTHORIZED_EMAIL` | `marc.richard4@gmail.com` | ton adresse |
   | `HUB_TOKEN` | le jeton du hub | étape 3 |

   Coche les trois environnements (Production, Preview, Development) pour chacune.

5. **Deploy**. Vercel te donne une URL en `https://jobai-xxxx.vercel.app`.
6. **Retourne à l'étape 2** et ajoute cette URL exacte dans les redirect URIs Google
   (avec `/api/auth/callback/google` à la fin).

### Appliquer le schéma et charger tes offres

Toujours dans PowerShell, à la racine du dépôt :

```powershell
# 1. Mets la connection string dans ton .env.local (une fois)
#    DATABASE_URL=postgresql://...

# 2. Crée les tables
npm run db:migrate

# 3. Charge tes 38 offres
npm run db:seed
```

Si `npm run db:migrate` ne lit pas ton `.env.local`, passe la variable directement :

```powershell
$env:DATABASE_URL="postgresql://..."; npm run db:migrate
$env:DATABASE_URL="postgresql://..."; npm run db:seed
```

`db:seed` est **relançable sans risque** : ton suivi (statut, priorité, date d'envoi, note
personnelle) est préservé, seuls les champs de recherche sont rafraîchis.

**À ce stade, l'app fonctionne.** Va sur ton URL Vercel, connecte-toi avec ton compte
Google, tu dois voir tes 23 offres actives et tes 15 candidatures de 2025.

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

Deux choses, et la première est du **code** : poser la variable ne suffit pas, il faut
committer et redéployer le hub.

**a. Dans le dépôt `Hubperso`**, ajouter une entrée à `lib/sources.ts` :

```ts
  {
    id: "jobai",
    name: "JobAI",
    defaultUrl: "https://emploi.hubperso.com/api/hub/summary",
    urlEnv: "JOBAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_JOBAI",
  },
```

⚠️ Le fichier `tests/sources.test.ts` est **exhaustif** : il liste les apps attendues et
leurs URLs. Il faut le mettre à jour aux **trois** endroits concernés, sinon la suite de
tests casse. Dis-le-moi et je fais cette modification — c'est du code, c'est mon travail.

**b. Dans les variables Vercel du projet du hub** : ajouter `HUB_TOKEN_JOBAI`, avec
**exactement la même valeur** que le `HUB_TOKEN` de JobAI (étape 3).

**c. Redéployer le hub** pour que l'entrée prenne effet.

> Tant que le jeton n'est pas posé, le widget affiche « non configurée » — et les autres
> apps continuent de s'afficher normalement. Rien ne casse.

---

## Vérifier que tout marche

**L'app** : `https://emploi.hubperso.com` → connexion Google → tes offres s'affichent.
Change un statut : il doit rester après un rafraîchissement de la page.

**Le refus d'accès** : connecte-toi avec une autre adresse Google. Tu dois être refusé.

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
| « Configuration » au login, ou redirection en boucle | Redirect URI Google absent ou mal orthographié. Il doit finir par `/api/auth/callback/google`, protocole et domaine exacts. |
| Connexion refusée avec ton adresse | `AUTHORIZED_EMAIL` absent, mal orthographié, ou pas déployé (une variable ajoutée après le déploiement exige un redéploiement). |
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
