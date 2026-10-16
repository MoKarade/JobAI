# ADR-0025 — Une seule façon de noter une offre

**Date** : 2026-10-16 · **Statut** : Proposé — tâche JobAI#149 (mission JobAI#146, plan « refonte de la
note », étape 1). Le choix de garder un extrait d'annonce est soumis à Marc sur une carte du fil JobAI ;
l'implémentation suit l'option recommandée, et l'enlever est un changement local (voir « Retour arrière »).

## Contexte

La note d'une offre se calculait de trois façons (quatre, avec l'ajout manuel) :

| Chemin | Profil | Métiers | Code de profession | Conditions | Texte lu |
|---|---|---|---|---|---|
| Ingestion (`lib/ingest/pipeline.ts`) | défaut | oui | oui | oui | l'annonce entière |
| Re-notation après un CV (`lib/cv/renotation.ts`) | actif | non | non | non | la note de provenance |
| Mesure de distance (`lib/distances.ts`) | défaut, rayon réglé | non | non | non | les justifications |
| Ajout manuel (`lib/ajout.ts`) | défaut | non | non | non | aucun |

La même offre pouvait donc valoir trois notes selon le moment. Le chemin « distance » lisait en plus les
`raisons`, que l'ingestion écrit APRÈS la note, à partir d'elle (« le titre et l'annonce portent à la fois de la
coordination et du contenu technique » dès 70) : un texte qui contient les deux familles de mots du barème.

## Décision

1. **Une fonction**, `noterOffre` (`lib/noteOffre.ts`), pure, qui lit ce qui est GARDÉ avec l'offre : titre, code de
   profession, type de poste, durée d'emploi, extrait d'annonce. Le profil et les métiers sont des paramètres
   REQUIS (`Bareme`), sans défaut permissif. Les quatre chemins l'appellent, avec le profil actif et les métiers
   retenus.
2. **Trois colonnes facultatives** sur `offers` (migration 0025, ajout seulement) : `type_poste`, `duree_emploi`,
   `texte_note`. `null` là où la source n'en donne pas ; l'absence reste neutre à la note.
3. **L'extrait d'annonce** : 2 000 caractères, passés par `expurgerPII`, espaces repliés. Les mots-clés du fit, les
   années d'expérience et les mentions de statut migratoire se trouvent au début d'une annonce. Une annonce SANS
   texte garde un extrait vide (pas une absence), sinon la re-notation relirait le repli et divergerait.
4. **Repli pour les offres déjà en base** (aucune n'a de texte) : leur note de provenance, et RIEN d'autre. Jamais
   les `raisons` : elles justifient la note, elles ne la fondent pas.
5. **Si le barème de Marc est illisible** : l'ingestion échoue bruyamment (un autre barème noterait les offres du
   jour autrement que le reste du suivi) ; la mesure de distance écrit les km mais ne touche pas aux notes ; la
   validation de CV et l'ajout manuel refusent. Aucun chemin ne retombe sur le profil par défaut.

## Ce que ça ne fait pas

- Aucune note existante n'est réécrite. Les offres déjà en base gardent leur note jusqu'à leur prochaine
  re-notation (validation d'un CV) ou mesure de distance.
- Le salaire reste inerte (JobAI#150), le domaine reste jugé par code de profession (JobAI#151).
- Le texte ne rejoint JAMAIS un prompt de LLM par ce chemin : il ne sert qu'au barème (mots-clés, regex).

## Impact coût LLM

Nul. Aucun appel nouveau.

## Impact en base

~2 000 caractères par offre nouvelle : ≈ 13 Mo pour 6 500 offres [Probable, borne haute ; à mesurer après la
première passe]. Migration additive, sans perte ; appliquée au démarrage par `lib/migrations.ts`.

## Audit sur du réel (protocole §11)

Le texte source n'étant pas conservé jusqu'ici (ADR-0024), l'audit rejoue les 30 offres CALCULÉES du seed
(23 des 53 sont des notes manuelles, jamais touchées), profil par défaut, sans métiers :

- **Re-notation : 0 note sur 30 change** (le repli est la note de provenance, comme avant).
- **Mesure de distance : 10 notes sur 30 baissent ou bougent**, toutes parce que le chemin ne lit plus les
  justifications. Écarts de « note après » − « ancienne note de distance » : APN −14, Dexterra −12, Techsol Marine
  −10, Groupe Sani-Tech −12, Honeywell −4, Groupe Robert −4, Dracon −2, Mundial −2, JELD-WEN −2, TARDIF +2.

Le seul mouvement de masse attendu en production est donc la disparition du bonus que la mesure de distance tirait
des justifications. C'est une hypothèse de cause pour le meilleur résultat plafonné à 77 (JobAI#148) ; elle reste
[À vérifier] sur les données réelles.

## Risques

- **Mots de l'annonce au-delà de 2 000 caractères** : ignorés. Une exigence d'expérience rejetée en fin d'annonce
  ne compte plus ; l'ingestion lisait l'annonce entière. Mesure à faire sur la première passe.
- **Texte de tiers en base** : retiré par `expurgerPII` avant écriture (test), pas affiché, pas envoyé au LLM.
- **Profil illisible** : l'ingestion s'arrête, dite dans le journal, plutôt que de noter autrement.

## Retour arrière

Les colonnes sont facultatives : ne plus les écrire (`extraitPourNote` rend `""`) ramène le repli. Rien à migrer à
l'envers.
