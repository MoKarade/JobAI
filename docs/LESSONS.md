# Leçons — JobAI

> Journal des leçons réutilisables. Une leçon se consigne ici **au moment où on la vit**,
> et sa règle durable remonte dans la §7 du `CLAUDE.md` **dans le même commit**.
>
> Format d'une entrée :
>
> ```
> ## AAAA-MM-JJ — <titre qui est une PHRASE-RÈGLE, pas un sujet>
> **Contexte** : ce qu'on faisait, en deux lignes.
> **Ce qui s'est passé** : le symptôme observé, pas l'interprétation.
> **Cause réelle** : vérifiée, avec fichier:ligne.
> **Règle durable** : la phrase à appliquer la prochaine fois.
> **Verrou** : le test ou le tripwire qui empêche la récidive (ou « aucun », honnêtement).
> ```
>
> Une leçon sans règle durable est une anecdote. Une règle durable sans verrou est un vœu.

---

## 2026-07-28 — Avant d'interpréter le verdict d'un outil de vérification, prouver que l'outil peut vérifier

**Contexte** : un hook signalait les commits comme non signés. J'ai voulu trancher par la
mesure plutôt que par le raisonnement.

**Ce qui s'est passé** : j'ai extrait la clé publique embarquée dans la signature du commit,
monté un fichier de signataires autorisés, et lancé la vérification. Verdict : `B`, mauvaise
signature. J'ai failli l'annoncer comme un fait.

**Cause réelle** : `ssh-keygen` n'existe pas dans le conteneur, et git ne peut pas vérifier
une signature SSH sans lui. Le `B` mesurait l'absence de l'outil, pas la qualité de la
signature. Le verdict avait toutes les apparences d'une mesure et n'en était pas une.

**Règle durable** : un outil de vérification qui rend un verdict négatif doit d'abord être
prouvé CAPABLE de rendre un verdict positif. Sinon « échec de vérification » et
« impossibilité de vérifier » se confondent — et la seconde se lit comme la première.
Corollaire : quand l'instrument manque, la réponse honnête est « je ne peux pas savoir
d'ici », pas un verdict par défaut.

**Verrou** : aucun (règle de méthode). Le même piège a frappé deux fois dans la même
session : un test de discrimination dont l'échec venait d'un SQL cassé, et ce verdict de
signature. Dans les deux cas, l'échec ressemblait à une preuve.

---

## 2026-07-28 — En français, un motif générique de nom de personne ne discrimine rien

**Contexte** : garde-fou n°1 — vérifier qu'aucun nom de personne de recrutement n'est
committé dans le jeu de départ. J'avais écrit un motif « prénom + nom composé à trait
d'union », la forme d'un patronyme québécois.

**Ce qui s'est passé** : le test a échoué au premier lancement, sur un seed pourtant
expurgé. Les correspondances mesurées : « Machines-Outils », « servo-contrôle »,
« Saint-Damien », « garde-fou », « là-bas », « un cran au-dessus ».

**Cause réelle** : en français, les mots composés à trait d'union sont partout — toponymes
(Saint-X-de-Y), termes techniques, adverbes. Le motif n'avait aucun pouvoir discriminant.

**Règle durable** : on ne détecte pas « un nom de personne » par sa forme. On détecte les
FORMES DE PRÉSENTATION d'une personne : une civilité, un nom après « avec », un nom entre
parenthèses après une mention de contact. Et on écrit dans le test que sa portée est
partielle — un garde qui promet plus qu'il ne fait est pire qu'un garde absent, parce qu'on
cesse de relire.

**Verrou** : `tests/seed.test.ts`, section « données personnelles ». Discrimination prouvée :
3 formes réelles détectées, 0 faux positif sur 3 formulations effectivement utilisées.

---

## 2026-07-28 — Un endpoint destiné à une machine ne doit jamais passer par un middleware qui redirige

**Contexte** : audit du squelette `jobtracker` produit le 27/07, avant de le porter.

**Ce qui s'est passé** : le `middleware.ts` du squelette capturait toutes les routes sauf
`/api/auth` et `/connexion`, et redirigeait vers la page de connexion. La route destinée au
hub serait donc tombée dans cette redirection.

**Cause réelle** : `middleware.ts:18`, matcher trop large. Le hub attend du JSON et
interprète tout le reste comme une panne — il aurait affiché « injoignable » en permanence,
sans que rien ne paraisse cassé côté app : la page de connexion s'affiche parfaitement dans
un navigateur.

**Règle durable** : un endpoint machine-à-machine porte **sa propre** authentification et
reste **hors** du middleware d'authentification utilisateur. Plus généralement : un
middleware qui **redirige** est incompatible avec tout consommateur non-navigateur — pour
ceux-là, l'échec doit être un code HTTP, jamais une redirection HTML.

**Verrou** : `tests/hubSummary.test.ts` teste le handler directement. ⚠️ Il ne testera la
non-interception qu'une fois le middleware écrit (`[V1-04]`) — à compléter à ce moment-là,
sinon la règle n'est pas verrouillée.

---

## 2026-07-28 — Une décision d'architecture prise sans lire les dépôts concernés est une hypothèse

**Contexte** : le handover du 27/07 posait comme question bloquante « réutiliser le scan
Gmail de DriveAI ? », en indiquant explicitement que la session n'avait pas inspecté DriveAI.

**Ce qui s'est passé** : la lecture du dépôt a tranché la question en quelques minutes.
DriveAI n'expose qu'un seul endpoint consommable de l'extérieur, son moteur Gmail vit dans
Apps Script à l'intérieur du compte Google de Marc, et sa surface Gmail est verrouillée par
un check CI requis.

**Cause réelle** : rien de cassé — mais une question était restée « bloquante » pendant une
session entière alors que la réponse était lisible dans le code.

**Règle durable** : avant de poser une question comme bloquante, vérifier si elle se répond
en lisant le code. Une question bloquante légitime porte sur une **intention** (ce que veut
Marc) ou sur un état **hors dépôt** (réglage GitHub, variable Vercel, DNS) — jamais sur un
fait vérifiable dans un dépôt accessible.

**Verrou** : aucun (règle de méthode, pas de code).
