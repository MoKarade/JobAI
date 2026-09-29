## 1. Principes non négociables

Format : {l'interdit · l'exception nommée et bornée · le seul fichier autorisé · le verrou}.

1. **Dépôt PUBLIC (décision Marc, 2026-08-14) — donc aucune donnée personnelle, jamais.**
   Le dépôt était déclaré « privé » par ce document alors qu'il est public depuis le début ;
   Marc a tranché en connaissance de cause : **il reste public**. Ce qui change n'est pas la
   règle, c'est son filet. En privé, une PII commitée par erreur était une faute rattrapable
   entre nous. En public, elle est **lisible du monde entier à la seconde du push**, et un
   commit correctif ne la retire pas — l'historique, les forks et les miroirs la gardent.
   `tests/piiGuard.test.ts` n'est donc plus une ceinture : c'est le MUR, et c'est le seul.
   Le suivi de recherche d'emploi contient l'adresse du domicile, le statut migratoire,
   l'historique de refus et des noms de personnes tierces (conseillers RH). *Interdit* : tout
   commit portant l'un de ces éléments. *Exception* : aucune. Les coordonnées du domicile
   vivent dans `DOMICILE_LAT` / `DOMICILE_LON` (variables d'environnement) ; les noms de
   tiers ne sont jamais persistés dans un fichier versionné. **Version 3 (ADR-0016,
   décision Marc 2026-08-21)** : le domicile PEUT être affiché et envoyé au navigateur —
   derrière la session mono-adresse, le « client » est Marc, et lui cacher sa propre
   maison protégeait le principe, pas la personne. Ce qui reste ABSOLU et ne se
   re-négociera pas dans une phrase groupée : (a) aucune coordonnée du domicile ni d'un
   lieu personnel dans un fichier VERSIONNÉ ; (b) rien de servi à une requête NON
   authentifiée. ⚠️ Leçon des trois versions : « le domicile ne sort jamais » protégeait
   DEUX choses différentes — le dépôt public (invariant) et le navigateur de Marc
   (politique). Écrites dans la même phrase, elles sont tombées ensemble (ADR-0004),
   remontées ensemble (annulation), retombées ensemble (ADR-0016) — alors qu'une seule
   bougeait à chaque fois. Le lien Google Maps externe (`lib/lienTrajet.ts`) reste, en
   repli et pour l'itinéraire « avec trafic » côté compte Google.
   *Verrou* : `tests/piiGuard.test.ts` — scan des fichiers **réellement versionnés**
   (`git ls-files`), volume prouvé, discrimination prouvée motif par motif. Sa **portée est
   écrite dans le test** : il détecte des FORMES (adresse municipale, coordonnées, civilité,
   secret affecté), pas des noms isolés — un motif générique de patronyme est inutilisable en
   français (mesuré : il attrapait « Machines-Outils », « Saint-Damien », « garde-fou »).
   *Second verrou, né du texte ingéré* : les annonces lues par la veille portent la **PII de
   TIERS** (courriel nominatif, profil LinkedIn personnel, téléphone d'un recruteur — vécu le
   2026-08-12 sur une annonce Randstad). `lib/ingest/expurger.ts` (`expurgerPII`, PURE) est
   l'outil qui nettoie ; le test « aucune PII de tiers » est la garde qui **refuse**. Les deux
   sont nécessaires : un outil qu'on peut oublier d'appeler ne protège rien. La boîte de rôle
   (`carriere@…`) SURVIT — c'est l'adresse à laquelle Marc postule.
   ⚠️ **Sa portée est passée des `data/depot/*.json` à TOUT le dépôt le 2026-09-18**, et ce
   n'est pas du confort : le canal de dépôt a été supprimé, donc les deux motifs qui ne
   tournaient que sur lui auraient scanné une liste VIDE en restant verts. Élargis, ils ont
   trouvé du premier coup le vrai nom, le vrai courriel et le vrai identifiant LinkedIn du
   recruteur Randstad — recopiés de l'annonce dans les fixtures de `tests/expurger.test.ts`
   le 12/08, dans un dépôt PUBLIC, et invisibles depuis. L'exemption du champ `adresse` des
   dépôts a disparu avec eux : **`piiGuard` ne neutralise plus rien nulle part**.

2. **Le suivi appartient à Marc.** `statut`, `prio`, `dateEnvoi`, `userNote`
   (`USER_OWNED_FIELDS`) ne sont **jamais** écrasés par un rafraîchissement de seed, une
   ingestion ni un scan Gmail. *Exception* : aucune — le scan **propose**, Marc valide.
   *Seul module autorisé à les écrire* : `lib/suivi.ts` (`appliquerModification`, appelée
   depuis une Server Action déclenchée par un geste de Marc). *Verrou* :
   `tests/suivi.test.ts` — vérifie CHAQUE champ de `CHAMPS_UTILISATEUR` un par un, et sa
   discrimination est prouvée (fusion inversée ⇒ le test tombe).

3. **No fake data.** Une métrique non mesurée ne s'affiche pas : `status:"building"` tant que
   le moteur ne produit rien de réel, `—` plutôt qu'un 0 plausible, et une offre dont on ne
   sait plus si elle est active est marquée **périmée**, jamais présentée comme ouverte.
   Une note calculée par `scoring.ts` est plafonnée à 85 pour ne jamais dépasser une note
   vérifiée à la main. *Verrou* : `tests/hubSummary.test.ts` couvre aujourd'hui le volet hub
   (statut `building`, identité publiée) ; le plafond de notation reste à verrouiller `[V1-02]`.

4. **Aucun scraping.** Indeed et Jobillico l'interdisent par leurs conditions et le bloquent
   activement. *Exception nommée* : les sources publiques officielles (flux XML du
   Guichet-Emplois, données ouvertes EDSC) et les API officielles. *Seul fichier autorisé à
   faire un `fetch` sortant vers une source d'offres* : `lib/ingest/`. *Verrou* : ADR-0002
   avant toute nouvelle source.
   *Autre frontière réseau, distincte* : `lib/geocodage.ts` est le seul fichier autorisé à
   appeler Nominatim (OpenStreetMap). Il géocode des **municipalités** et des **entreprises
   cibles** (données publiques — frontière élargie le 2026-07-29, demande de Marc `[UX-09]`) ;
   **jamais le domicile, jamais un lieu personnel**. Service bénévole : une requête par
   seconde, déclenchée par un geste de Marc, jamais au chargement d'une page. Une entreprise
   introuvable est posée au centre de sa ville avec `precision: "ville"` DITE à l'écran —
   jamais présentée comme son adresse (garde-fou n°3).

5. **Échec fermé, server-side only.** Jetons et appels LLM restent côté serveur. Chaque
   Server Action revérifie la session (`requireSession`). `HUB_TOKEN` absent → 503 ;
   `x-hub-token` faux → 401 ; comparaison en temps constant. Jamais de secret en dur.
   *Verrou* : `tests/routesGardees.test.ts` — il DÉCOUVRE les routes depuis `app/` et exige
   que chacune soit gardée, sauf exemption **motivée dans le test**. Une nouvelle page non
   exemptée le fait échouer tant qu'on n'a pas tranché son cas : le risque n'est jamais la
   route qu'on écrit aujourd'hui, c'est la sixième.

6. **Le texte non maîtrisé n'entre pas nu dans un prompt.** Une description d'offre ou un
   courriel de recruteur est une surface d'injection : tout passe par `sanitizePromptText`
   + balisage de données (patron `promptSafety` de FinanceAI). Le LLM ne décide jamais seul
   d'une écriture : il propose, le code valide contre un schéma Zod, Marc confirme.

