# ADR-0011 — Un connecteur MCP pour claude.ai, avec écriture

**Statut** : Accepté (décision Marc, 2026-08-19)
**Amende** : garde-fou n°2 du `CLAUDE.md` (« le suivi appartient à Marc »)

## Contexte

Marc veut parler à JobAI depuis claude.ai — donc depuis son téléphone, hors de l'app. Deux
questions ont été posées avant toute ligne de code, parce qu'elles changent l'ampleur du
travail d'un ordre de grandeur. Ses réponses :

1. **claude.ai tout de suite**, pas Claude Code d'abord.
2. **Écriture large**, pas lecture seule.

Les deux ont un coût qu'il faut nommer honnêtement plutôt que de le découvrir en route.

## Décision 1 — claude.ai impose OAuth 2.1, et rien d'autre

Mesuré sur FinanceAI (2026-07-13) : **les connecteurs personnalisés de claude.ai n'acceptent
que OAuth 2.0/2.1**. Il n'y a pas de champ « jeton statique » dans leur interface. Le patron
éprouvé de ce dépôt — le jeton `x-hub-token` comparé en temps constant — ne s'applique donc
pas ici : il faut un **serveur d'autorisation complet**.

Ce qu'il faut écrire, et qu'on ne peut pas raccourcir :

| Pièce | Pourquoi elle n'est pas optionnelle |
|---|---|
| Découverte (`/.well-known/oauth-*`) | claude.ai refuse de se connecter sans |
| Enregistrement dynamique de client | claude.ai s'enregistre lui-même, il n'y a pas de client pré-partagé |
| PKCE **S256** | Obligatoire en OAuth 2.1 ; sans lui, un code intercepté suffit |
| Code à usage **unique** | Un design sans état les autorise à être rejoués |
| Rotation du jeton de rafraîchissement | Idem |

### ⚠️ Le piège CRITIQUE, déjà payé une fois

FinanceAI a livré `uri.startsWith("http://127.0.0.1")` pour valider un `redirect_uri`. Deux
agents l'ont prouvé exploitable : `http://127.0.0.1.evil.com/cb` (sous-domaine) et
`http://127.0.0.1@evil.com/cb` (la partie « userinfo » — l'hôte réel est `evil.com`) passent
tous les deux. Sur un endpoint d'enregistrement PUBLIC, c'est une prise de contrôle de compte
par hameçonnage.

**Ici, un `redirect_uri` se valide par `new URL()` et une comparaison d'ORIGINE EXACTE**, avec
rejet de tout `username`/`password` dans l'URL. Jamais de comparaison de préfixe. Verrou : un
test qui essaie ces deux formes précises.

### ⚠️ Un contrôle fait à l'ÉMISSION n'arrête pas les jetons déjà émis

Autre leçon FinanceAI : un cookie d'un an vérifié seulement au callback a survécu au verrou
qui devait le fermer. L'appartenance à l'adresse autorisée se vérifie donc **à chaque usage**
du jeton, pas seulement au moment de le délivrer — et le kill-switch d'incident reste la
rotation de la clé de signature, qui invalide tout d'un coup.

### Mono-adresse

Le seul compte admis est `AUTHORIZED_EMAIL`, comme la middleware de l'app. Un autre compte
Google qui traverserait tout le flux OAuth reçoit un refus, pas un jeton.

## Décision 2 — l'écriture, et ce qui remplace l'écran

Le garde-fou n°2 dit aujourd'hui : *« `statut`, `prio`, `dateEnvoi`, `userNote` ne sont jamais
écrasés par un rafraîchissement de seed, une ingestion ni un scan Gmail. Exception : aucune —
le scan propose, Marc valide. »*

Marc crée une exception. Elle est **nommée et bornée**, sinon elle avale la règle :

1. **L'exception ne couvre QUE ce que Marc demande explicitement dans la conversation.** Un
   traitement automatique (seed, ingestion, scan) reste interdit d'écrire ces champs — la
   règle d'origine est intacte pour eux. Ce qui change, c'est qu'une demande de Marc peut
   désormais arriver par claude.ai au lieu d'un clic.
2. **Toute écriture passe par `lib/suivi.ts`** (`appliquerModification`, `marquerEnvoi`).
   L'MCP n'écrit jamais de SQL directement, et n'a donc aucun pouvoir que l'interface n'a pas.
   Verrou : un test qui interdit à `lib/mcp/` d'importer `lib/db` ou `drizzle-orm`.
3. **Ce qui remplace l'écran : l'AVANT/APRÈS rendu au modèle.** Dans l'app, Marc voit ce qu'il
   change. Dans une conversation, il ne voit rien — sauf si l'outil le lui dit. Chaque écriture
   rend donc l'état avant et après, champ par champ. Une écriture qui ne dirait que « fait »
   serait une modification invisible du jeu de données, exactement ce que le garde-fou n°2
   protège.
4. **Ce qui reste hors de portée** : le score calculé, la péremption, les raisons, le profil,
   et tout champ que le moteur produit. Marc possède son suivi ; le moteur possède ses calculs.
   Les mélanger ferait qu'une note « corrigée » par une conversation ne serait plus
   reproductible — et la note décide de ce que Marc regarde en premier.

## Ce qui ne bouge PAS

- **Garde-fou n°1** — l'adresse du domicile ne traverse jamais l'MCP. `lib/domicile.ts` reste
  un module ordinaire (jamais `"use server"`), appelé seulement par les deux calculateurs de
  distance, qui ne rendent qu'un nombre de kilomètres. Aucun outil ne rend `lat`/`lon`.
  Verrou : un test qui scanne la surface des outils.
- **Garde-fou n°6** — le texte des annonces est du texte non maîtrisé qui part vers un
  modèle : il passe par `sanitizePromptText`, **par allowlist de clés** et jamais en aveugle
  (leçon `MCP-PROMPT-SCRUB` : un scrub appliqué à toute chaîne a tronqué en silence des mises
  en garde RÉDIGÉES PAR LE CODE, donc des garde-fous). Le texte d'un tiers se nettoie ; le
  nôtre et celui de Marc passent intacts.

### ⚠️ Mais l'écriture RETIRE ce qui rendait une injection sans conséquence

En relisant `lib/promptSafety.ts` pour écrire cette section, j'ai trouvé que son propre
en-tête énonce ce qui protégeait vraiment l'app — et que **ce n'était pas lui** :

> *« le modèle ne fait que PROPOSER — un schéma Zod valide sa sortie, et Marc valide ensuite ;
> aucun outil n'est exposé au modèle : il ne peut rien écrire, rien appeler. Ce module réduit
> la surface. Ce sont les deux règles ci-dessus qui rendent une injection réussie sans
> conséquence. »*

**Un connecteur qui écrit casse les deux règles.** Et `sanitizePromptText` ne comble pas
l'écart : il neutralise ce qui fait FRONTIÈRE (balises de rôle, nos délimiteurs de données),
jamais ce qui fait sens — une phrase impérative dans un nom d'employeur traverse intacte, par
conception. Le vecteur est réel : `entreprise`, `poste` et `ville` viennent du flux du
Guichet, donc de texte que n'importe quel employeur rédige.

Ce qui borne le dégât n'est donc plus l'assainissement, c'est la **surface d'écriture** — et
c'est pour ça qu'elle est étroite :

| Borne | Effet sur une injection réussie |
|---|---|
| Quatre champs seulement (`CHAMPS_UTILISATEUR`) | Elle ne peut pas toucher un calcul du moteur |
| Refus sur une offre périmée | Elle ne peut pas ressusciter un dossier clos |
| Aucun outil sortant (ni réseau, ni courriel, ni fichier) | Elle ne peut rien EXFILTRER |
| Aucune suppression | Rien n'est perdu ; au pire un champ est faux |
| Avant/après rendu à chaque écriture | Une écriture parasite APPARAÎT dans la conversation |

Le pire cas est donc « un statut ou une note faux, visibles » — ennuyeux, réversible, et
jamais destructeur. C'est un risque assumé par la décision de Marc, pas un risque ignoré.
Ce qui le refermerait vraiment, si on veut aller plus loin un jour : ne PAS exposer à l'MCP le
texte des offres non lues par Marc, ou exiger une confirmation hors bande pour l'écriture.
- **`.finite()` sur tout nombre** d'un schéma Zod. `.positive()` et `.min()` n'excluent pas
  `Infinity` (leçon `MCP-WHATIF`), et un handler appelé directement en test contourne la
  validation du SDK — donc la logique garde aussi, en ceinture.

## Architecture — la frontière est un FICHIER, pas une intention

Le SDK MCP tire `express` et `cors`. Le tree-shaking n'est pas une garantie. On reprend donc
le découpage éprouvé de FinanceAI (`AITOOLS-A`) :

- `lib/mcp/<outil>.spec.ts` — la logique, les schémas Zod, aucun import du SDK.
- `lib/mcp/serveur.ts` — le seul fichier autorisé à importer `@modelcontextprotocol/sdk`.
- `app/api/mcp/route.ts` — le transport HTTP.
- `app/api/oauth/**` — le serveur d'autorisation.

Verrou : `tests/mcpSurface.test.ts` — aucun `.spec.ts` n'importe le SDK, aucun n'importe la
base, et le volume du scan est prouvé (un scan qui ne trouve aucun fichier passe à vide).

## Livraison par lots

| Lot | Contenu | État |
|---|---|---|
| 1 | Les outils (`*.spec.ts`), lecture ET écriture, testés, sans SDK ni réseau | livré |
| 2 | Le serveur MCP + le transport HTTP | livré |
| 3 | OAuth 2.1 (découverte, enregistrement, PKCE, rotation) | livré |
| 4 | Branchement dans claude.ai, vérifié par un appel RÉEL | **Marc** |

### Ce que le lot 3 a livré, et ce qu'il PROUVE

- `lib/mcp/oauth.ts` — la logique pure. `jugerRedirectUri` est le contrôle critique : les
  **deux chaînes exactes** qui traversaient le `startsWith` de FinanceAI
  (`http://127.0.0.1.evil.com/cb`, `http://127.0.0.1@evil.com/cb`) sont dans les tests, et
  réintroduire la version fautive les fait tomber — vérifié.
- `lib/oauthStore.ts` — l'état, **hors de `lib/mcp/`** pour que le garde de frontière reste
  absolu. Rien n'est stocké en clair : codes et jetons vivent par leur empreinte, donc le
  kill-switch d'incident est de vider la table.
- Les cinq routes : découverte (RFC 8414 et 9728), enregistrement dynamique (RFC 7591),
  autorisation, jeton. **`/oauth/authorize` reste derrière la garde de session** : le
  middleware envoie Marc au login Google et le ramène. On n'écrit aucun écran de connexion,
  et l'ajouter aux chemins publics délivrerait des jetons à qui les demande.
- `/api/mcp` répond désormais aux jetons OAuth, et **`MCP_TOKEN` a été retiré dans le même
  commit**, comme promis : un second chemin d'entrée laissé « au cas où » est une porte qu'on
  oublie de refermer.
- **Usage unique et rotation prouvés sur une VRAIE Postgres** (PGlite, avec le SQL de
  migration réellement committé) : deux échanges simultanés du même code, un seul gagne. Le
  motif naïf « lire puis écrire » en fait gagner deux — mesuré.

### Ce qu'il n'y a PAS à configurer

Aucun nouveau secret. L'appartenance se juge sur `AUTHORIZED_EMAIL`, qui existe déjà, et les
clients s'enregistrent eux-mêmes. Il reste à appliquer la migration `0019_connecteur_mcp`.

⚠️ **Un lot n'est fini que MESURÉ.** « Le déploiement est vert » ne prouve rien sur ce qui
tourne — leçon déjà payée trois fois sur ce dépôt (webhook non livré, `Redeploy` qui rejoue un
vieux SHA, CI rouge ignorée quatre commits). Le seul signal valable au lot 4 est une
conversation réelle depuis claude.ai.

## Alternatives rejetées

- **Jeton statique dans l'app** (le patron `x-hub-token`) — écarté par la mesure : claude.ai ne
  l'accepte pas. Il aurait suffi pour Claude Code, que Marc n'a pas retenu.
- **Serveur stdio local** — le plus simple, mais il ne marche que sur le PC où il est installé
  et il contourne l'app, donc les gardes de `lib/suivi.ts`. Écarté pour cette raison autant que
  pour la mobilité.
- **Service séparé (Cloud Run) comme FinanceAI** — écarté : JobAI est déjà une app Next sur
  Vercel avec Auth.js et la session de Marc. Un second service ajouterait un déploiement, une
  chaîne de secrets et une frontière réseau, sans rien apporter ici.
