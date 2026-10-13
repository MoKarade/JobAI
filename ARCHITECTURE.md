# JobAI - Architecture et contrats

> Carte du dépôt pour NotebookLM (carnet du dépôt et Carnet Maître inter-apps). À mettre à jour dans la même PR quand une interface publique, une dépendance externe ou un terme métier change. Rédigé à partir de main au commit a1c89a6edfaa, le 2026-10-13.

## 1. Responsabilité du dépôt
**Domaine :** recherche d'emploi de Marc dans la région de Québec.
**Rôle :** collecter des offres d'emploi (veille quotidienne sur le flux du Guichet-Emplois), les noter selon un barème pondéré par le profil, mesurer la distance depuis le domicile, afficher une carte et suivre les statuts de candidature. Publie un widget au hub perso et expose ses données à Claude par un connecteur MCP.
**Déploiement :** Vercel, sur `emploi.hubperso.com`. Dépôt PUBLIC (aucune donnée personnelle ne doit y entrer), branche par défaut `main`.

## 2. Interfaces publiques (contrats)
*Ce que les autres dépôts, Hubperso, Claude ou l'utilisateur peuvent appeler.*
- `GET /api/hub/summary` : résumé pour le hub, conforme à `@mokarade/hub-contract`. Authentifié par l'en-tête `x-hub-token` (comparaison en temps constant), `Cache-Control: no-store`. Réponses : 503 si l'intégration n'est pas configurée côté serveur, 401 si le jeton est absent ou faux, 405 si la méthode n'est pas GET, 200 sinon. Route volontairement hors du middleware d'authentification utilisateur.
- `GET|POST /api/mcp` : connecteur MCP pour Claude (ADR-0011 « connecteur MCP claude.ai »). Méthode exacte : [à compléter]. Outils exposés : [à compléter] (définis dans `lib/mcp/lecture.spec.ts` et `lib/mcp/ecriture.spec.ts`, serveur dans `lib/mcp/serveur.ts`).
- Flux OAuth du connecteur MCP : `/oauth/authorize`, `/oauth/register`, `/oauth/token`, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` (méthodes : ?).
- `/api/cron/veille` : passe de veille planifiée (ingestion du flux Guichet-Emplois, tri, géocodage), déclenchée par un cron Vercel (`vercel.json`).
- `/api/cron/geocodage` : passe de géocodage seule, cron Vercel (`vercel.json`).
- `/api/diagnostic/flux-guichet` et `/api/diagnostic/sources` : diagnostics de la veille (méthode : ?).
- `/api/sante` : sonde de santé (méthode : ?).
- `/api/auth/[...nextauth]` : point d'entrée Auth.js ; aucune session n'est émise ici (`providers: []`), la session est celle du hub.
- Pages : `/` (accueil, liste des offres), `/offre/[id]`, `/carte`, `/references`, `/archives`, `/profil`, `/sources`, `/connexion`.
- Server Actions (`lib/actions*.ts`, `lib/cv/actions.ts`) : chacune appelle `requireSession`.
- Contrat Hub : expose le summary (bloc `usage` publié seulement après un premier appel LLM réel, période `total`, devise `USD`) ; consomme la session partagée posée par le hub sur `.hubperso.com` ; demande au hub qui a le droit d'entrer (`lib/accesHub.ts`).

## 3. Dépendances externes
*Ce que ce dépôt appelle.*
- **Autres dépôts de Marc :** `hub-contract` (paquet `@mokarade/hub-contract`, épinglé dans `package.json`) ; Hubperso (session partagée, contrôle d'accès, déclaration de l'app dans `lib/sources.ts` du dépôt Hubperso).
- **Services externes :**
  - Vercel (hébergement, crons) ; Neon Postgres (base, via Drizzle).
  - Guichet-Emplois : flux complet, seule source d'offres active depuis le 2026-09-18 (les recherches RSS, les pages carrières d'ATS et le dépôt `POST /api/ingest/depot` ont été supprimés).
  - Anthropic (modèle Haiku 4.5) : seul appel LLM du dépôt, extraction du CV (`lib/cv/extraction.ts`).
  - Nominatim et le registre du Québec : géocodage ; Google Maps Geocoding en troisième repli (ADR-0007), optionnel.
  - Google Places : autocomplétion du nom d'entreprise et fiches enrichies (même clé optionnelle que Google Maps).
  - Autres modules aux noms explicites dont le rôle n'est pas documenté : `lib/overpass.ts`, `lib/bornes.ts` [à compléter].
- **Données :** une base Neon (schéma `lib/db/schema.ts`, migrations SQL dans `drizzle/`, appliquées automatiquement au démarrage par `lib/migrations.ts`). Domicile géocodé une fois et conservé en base.

## 4. Carte structurelle
*L'arbre complet est généré automatiquement dans la source 00 ; ici, seulement le rôle des dossiers.*
```text
app/              -> pages Next.js (App Router), routes HTTP sous app/api/, OAuth du connecteur MCP (app/oauth, app/.well-known)
app/api/hub/      -> endpoint summary pour le hub
app/api/cron/     -> crons de veille et de géocodage
app/api/mcp/      -> point d'entrée du connecteur MCP
components/       -> composants d'interface (liste d'offres, carte, filtres, tableau de bord, CV)
lib/              -> logique métier : notation, suivi, profil, distances, relances, export
lib/ingest/       -> pipeline de veille : lecture du flux Guichet-Emplois, région, lieux, expurgation PII
lib/cv/           -> dépôt et lecture du CV, proposition de profil, renotation
lib/mcp/          -> serveur MCP, spécifications des outils de lecture et d'écriture, OAuth
lib/db/           -> client et schéma Drizzle
drizzle/          -> migrations SQL générées (et leurs instantanés dans drizzle/meta/)
scripts/          -> scripts de maintenance (registre, seed, migration, sondes), hooks de commit
tests/            -> suite Vitest, dont le verrou anti-PII tests/piiGuard.test.ts
qualite/          -> portes qualité (cliquet, seuils)
modeles/          -> kit de fusion automatique partagé (auto-merge)
docs/             -> ADR (docs/adr/), règles de travail (docs/claude/), leçons, déploiement
.github/          -> CI, fusion automatique, sondes planifiées (registre, sources)
```

## 5. Glossaire métier (anti-hallucination)
- **Offre :** annonce d'emploi ingérée par la veille ou ajoutée à la main ; une offre incertaine est traitée comme périmée.
- **Veille :** passe planifiée qui lit le flux du Guichet-Emplois et applique le tri (filtre régional, plancher de score, dédoublonnage, péremption).
- **Note / barème :** score déterministe d'une offre, pondéré par le profil et le domaine ; une note calculée est plafonnée à 85 (`lib/scoring.ts`).
- **Profil :** critères de Marc qui pilotent la note ; peut être proposé à partir du CV (ADR-0009, ADR-0014).
- **Code de profession :** code servant au tri des offres par métier (ADR-0012, `lib/nocProfession.ts`).
- **Suivi :** champs `statut`, `prio`, `dateEnvoi`, `userNote` d'une offre ; écrits seulement par `lib/suivi.ts`, sur un geste de Marc.
- **Relances :** logique de rappel à 14 et 45 jours (`lib/relances.ts`), codée et testée mais pas encore branchée à l'interface.
- **Distance / géocodage :** mesure depuis le domicile géocodé ; au plus 8 requêtes Nominatim par passe (limite de sécurité liée au délai de 60 s d'une fonction Vercel).
- **building :** statut honnête du summary tant qu'aucune donnée réelle n'existe (règle « no fake data »).
- **Bloc `usage` :** coûts LLM publiés au hub ; absent tant qu'aucun appel n'a eu lieu, jamais `amount: 0` par défaut.
- **expurgerPII :** fonction qui retire les données personnelles d'une annonce ingérée.
- **sanitizePromptText :** nettoyage de tout texte non maîtrisé (offre, courriel) avant de le passer à un LLM.
- **requireSession :** vérification de session appelée par chaque Server Action.
- **Garde-fous :** les six règles non négociables de `CLAUDE.md` (dépôt public sans PII, suivi appartenant à Marc, no fake data, aucun scraping, échec fermé côté serveur, texte non maîtrisé balisé).

## 6. Pour aller plus loin
- `CLAUDE.md` : règles de travail et garde-fous · `HANDOVER.md` : état courant (à lire en premier) · `BACKLOG.md` : plan
- `docs/adr/` : décisions (24 ADR) · `docs/claude/` : règles détaillées (principes, conventions, déploiement, hub, protocole de notation)
- `docs/DEPLOIEMENT.md` : déploiement · `docs/LESSONS.md` et `docs/claude/lecons.md` : leçons apprises
- Aucun `docs/ARCHITECTURE.md` dans ce dépôt : ce fichier en tient lieu.
