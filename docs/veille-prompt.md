# Prompt de la veille quotidienne — Indeed + ZipRecruiter

> À coller dans la Routine. Écrit le 2026-08-14 à partir d'une exécution RÉELLE des deux
> connecteurs, pas d'hypothèses : chaque contrainte ci-dessous a été mesurée ce jour-là.
>
> **Pourquoi ce fichier existe** : jusqu'ici les termes de recherche et le protocole vivaient
> UNIQUEMENT dans le prompt de la Routine (ticket `[CV-08]`). Une session qui reprend la veille
> à la main ne les a donc pas, et les redevine — c'est arrivé aujourd'hui. Le prompt vit
> désormais dans le dépôt ; la Routine en est une COPIE, pas la source.

## Ce que les deux connecteurs font vraiment

| | Indeed | ZipRecruiter |
|---|---|---|
| Lecture de l'annonce | `get_job_details` — texte intégral | **aucun outil de détail** |
| Adresse civique | parfois dans l'annonce | jamais |
| `lien` | stable par offre | **jeton de redirection forgé par recherche** (pourrira) |
| Paramètre de lieu | **sans effet** (même contenu pour Québec et Lévis) | effectif (`location` + `radius_miles`) |
| Identifiant | `JOBSEARCH_<n>` = **compteur par réponse**, pas un identifiant | aucun |

Deux conséquences non négociables :

1. **Le dédoublonnage se fait par IDENTITÉ** (entreprise + titre + ville), jamais par lien ni
   par identifiant. Mesuré le 2026-08-12 sur 64 offres : le lien capte **zéro** doublon,
   l'identité en capte **quinze**.
2. **Une offre ZipRecruiter entre sans description.** Elle est déposée quand même — une offre
   réelle vaut mieux qu'un trou dans la carte — mais sa note n'est PAS un jugement, c'est un
   défaut de lecture, et le rapport doit le dire.

## Le prompt

```
Fais la veille JobAI du jour.

1. Date à Québec (America/Toronto), format AAAA-MM-JJ. C'est le `jour` du lot.

2. Resynchronise le dépôt AVANT toute écriture :
   git fetch origin main && git checkout -B main origin/main
   Le conteneur peut avoir reverti l'arbre : compare git rev-parse HEAD à
   git ls-remote origin main. Le serveur est la seule vérité.

3. Cherche sur LES DEUX connecteurs, séquentiellement, jamais en parallèle
   (le quota Indeed se referme en s'aggravant ; après TROIS refus malgré
   l'attente annoncée, arrête — la fenêtre est dépensée, ce n'est pas une
   question de patience).

   Termes (dérivés de PROFIL_DEFAUT, lib/profil.ts) :
     coordonnateur automatisation · chargé de projet · automatisation ·
     robotique · superviseur production · mise en service ·
     automate programmable · électromécanique · mécatronique ·
     chef d'équipe production · gestionnaire de projet industriel ·
     technicien automatisation

   Indeed : location "Québec, QC", country_code "CA". Ne double PAS par ville —
   mesuré, le lieu n'a aucun effet sur ce connecteur, c'est le terme qui
   discrimine. Douze appels, pas vingt-quatre.

   ZipRecruiter : location "Quebec City, Quebec" ET "Levis, Quebec",
   country_admin_code "CA", radius_miles 40. Là, le lieu compte.

4. Écarte, en NOMMANT chaque rejet et son motif (un compte seul ne se vérifie
   pas) : hors région (Chapais, Saguenay, Montréal…), hors cible (marketing,
   journalier, restauration, finance, stagiaire), et les doublons par identité.

5. Lis les annonces Indeed avec get_job_details, une retente maximum chacune.
   Si tu dois plafonner le nombre de lectures, DIS-LE dans le rapport et dis
   lesquelles sont entrées sans description. Un plafond tu se lit comme une
   couverture complète.
   ⚠️ La liste et l'annonce se contredisent parfois sur le lieu : c'est
   l'ANNONCE qui dit la ville. Corrige `ville` d'après elle.

6. Construis le lot selon OffreDeposeeSchema / LotDeposeSchema
   (lib/ingest/depotSchema.ts). Ni note, ni priorité, ni statut : ce sont des
   jugements, ils appartiennent à trier() et à Marc.

7. Expurge la PII de TIERS avec le CODE DE PRODUCTION — expurgerLot, importé de
   lib/ingest/expurger.ts, et il prend le TABLEAU d'offres, pas l'enveloppe du
   lot. Le script doit donc vivre physiquement dans /home/user/JobAI : hors du
   dépôt il ne peut pas importer le module, et il vivrait avec sa propre règle.
   La boîte de rôle (carriere@, rh@) SURVIT — c'est là que Marc postule.

8. Dépose :
   POST https://emploi.hubperso.com/api/ingest/depot
   Authorization: Bearer <JETON_DEPOT, jamais écrit dans un fichier>
   Si l'hôte est hors allowlist réseau : NE CONTOURNE PAS. Nomme l'hôte bloqué
   et écris le lot dans data/depot/AAAA-MM-JJ.json — c'est le second canal
   prévu, et le cron l'ingère.

9. Gate avant commit : typecheck, test, lint, build. Si le build échoue sur
   fonts.gstatic.com, c'est l'egress de la session, pas le code : dis-le, ne
   maquille pas un gate vert. Commit sur main, push, PUIS consulte la CI —
   sans PR, rien n'affiche un échec tout seul.

10. Rapporte en six lignes : sources interrogées, offres retenues, écartées avec
    motifs, lues vs non lues, PII retirée, et l'état du dépôt (HTTP ou fichier).
```

## Ce que ce prompt ne fait pas

- Il ne cherche pas d'adresse civique par recherche web. Ça existe (`adresse_source:
  "recherche"`, `[LIEU-04]`) et ça reste la source la plus RISQUÉE du projet : une recherche
  « adresse AMETEK » rend le siège social de Pennsylvanie pour une usine de Lévis. À faire
  seulement offre par offre, avec l'`adresseUrl` qui rend la trouvaille relisable.
- Il ne touche à aucun champ de Marc (`statut`, `prio`, `dateEnvoi`, `userNote`) : le dépôt
  propose, Marc tranche.
