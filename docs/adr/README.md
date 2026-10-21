# Décisions d'architecture (ADR)

Une décision structurante = un fichier `NNNN-slug.md`, numéroté à la suite, jamais réécrit
après acceptation (on en publie un nouveau qui remplace l'ancien).

**Statuts** : `Proposé` · `Accepté` · `Remplacé par ADR-NNNN` · `Abandonné`.

> **Accepté ≠ Implémenté.** Un ADR fixe la décision ; l'avancement vit dans `BACKLOG.md`
> et l'état courant dans `HANDOVER.md`. Ne jamais déduire d'un ADR accepté que le code existe.

**Sections attendues** : Contexte · Décision · Impact quotas/coût · Analyse de risques ·
Méthode de test · Conséquences (positif / négatif / risques acceptés) · Alternatives rejetées
(avec le pourquoi du rejet) · Réversibilité.

| ADR | Titre | Statut |
|---|---|---|
| [0001](./0001-fondations-jobai.md) | Fondations de JobAI (identité, stack, phases, périmètre) | Accepté — volet workflow git modifié par ADR-0002 |
| [0002](./0002-developpement-direct-sur-main.md) | Développement direct sur `main`, sans branche ni PR | Accepté |
| [0003](./0003-direction-visuelle.md) | Direction visuelle : densité FinanceAI, accent ambre conservé | Accepté |
| [0004](./0004-carte-google-maps.md) | Carte Google Maps : entreprises précises, domicile affiché, trajets | Annulé le jour même |
| [0005](./0005-precision-de-la-veille.md) | Précision de la veille | Révisé (3 conclusions sur 4 réfutées par la mesure) |
| [0006](./0006-variantes-de-raison-sociale.md) | Dédoublonner malgré les variantes de raison sociale | Accepté |
| [0007](./0007-google-maps-geocoding-repli.md) | Google Maps Geocoding, en repli étroit de Nominatim | Accepté |
| [0008](./0008-poste-de-nuit.md) | « Poste de nuit » : le sombre en identité, l'épure cesse d'être une soustraction | Accepté — révisé le jour même (thème clair retiré) ; supersède la direction du 2026-08-05 ; ADR-0003 tient sur l'ambre |
| [0009](./0009-profil-pilote-par-le-cv.md) | Le profil sort du code, et le CV le remplit | Accepté — retire `[V3-00]` (CV via Google Drive) ; amendé par 0028 |
| [0010](./0010-sources-lues-par-lapp.md) | Lire les offres depuis l'app : sources candidates, mesure d'accès, extraction | Accepté (Marc, 2026-08-19) — sonde livrée ; aucune ingestion ouverte |
| [0011](./0011-connecteur-mcp-claude-ai.md) | Un connecteur MCP pour claude.ai, avec écriture | Accepté (Marc, 2026-08-19) |
| [0012](./0012-tri-par-code-de-profession.md) | Trier le flux du Guichet par le code de profession (NOC 2021) | Proposé — décision Marc « go pour le tri par noc2021 » (2026-08-19) ; volet « filtre, pas note » révisé par ADR-0013 |
| [0013](./0013-le-domaine-pondere-la-note.md) | Le domaine pondère la note, et le flux entre en entier | Proposé — décisions Marc du 2026-08-20 |
| [0014](./0014-la-note-suit-le-profil.md) | La note suit le profil : distance re-calibree, conditions lues, carriere cadree | Propose — volet carriere BLOQUE tant que le CV n'est pas depose |
| [0015](./0015-le-bareme-cesse-de-punir-le-technicien.md) | Le bareme cesse de punir le titre de technicien | Propose — debloque le volet D3 d'ADR-0014 |
| [0016](./0016-la-carte-google-revient.md) | La carte Google revient, et le domicile avec elle | Propose — ressuscite ADR-0004, revise le garde-fou n1 |
| [0017](./0017-le-bareme-cesse-de-buter-sur-un-accent.md) | Le barème cesse de buter sur un accent | Accepté (Marc, 2026-09-17) — ligne d'index ajoutée le 2026-09-17, elle manquait |
| [0018](./0018-la-bande-postale-tranche-les-lieux-que-personne-ne-nomme.md) | La bande postale tranche les lieux que personne ne sait nommer | Accepté (Marc, 2026-09-17) — calibré sur une passe complète mesurée |
| [0019](./0019-toutes-les-quebecoises-entrent.md) | Toutes les offres québécoises entrent, le filtre de distance tranche à l'écran | Accepté (Marc, 2026-09-18) |
| [0020](./0020-le-gros-chiffre-de-la-carte-devient-l-arrivage.md) | Le gros chiffre de la carte devient l'arrivage | Accepté (Marc, 2026-09-21) — révise le volet « Widget hub » d'ADR-0001 |
| [0021](./0021-la-ville-de-l-offre-decide-de-sa-distance.md) | La ville de l'OFFRE décide de sa distance, et un centre de ville doit être une ville | Accepté (Marc, 2026-09-21) — retire des km faux avant d'en ajouter d'approchés ; élargit les bornes ouvertes par ADR-0019 |
| [0022](./0022-la-carte-cesse-de-reallouer-et-de-relire-en-serie.md) | L'identité d'un employeur devient la même partout, et la carte cesse de lire en série | Accepté (Marc, 2026-09-21) — le regroupement d'affichage rejoint la règle stricte des données ; cinq lectures Neon passent en parallèle |
| [0023](./0023-une-table-d-alias-fermee-pour-les-employeurs-deja-rencontres.md) | Une table d'alias FERMÉE pour les employeurs déjà rencontrés | Accepté (Marc, 2026-09-21) — implémenté le jour même |
| [0024](./0024-la-seniorite-se-lit-aussi-en-toutes-lettres.md) | La séniorité se lit aussi en toutes lettres | Accepté (gérant, 2026-09-29) — signalé à Marc ; implémenté le jour même |
| [0025](./0025-une-seule-facon-de-noter-une-offre.md) | Une seule façon de noter une offre | Proposé — JobAI#149 ; l'extrait d'annonce gardé en base est soumis à Marc |
| [0026](./0026-le-salaire-et-l-experience-du-flux-sont-lus.md) | Le salaire et l'expérience exigée du flux sont lus | Proposé — JobAI#150 ; borne basse et 2 080 h soumises à Marc |
| [0027](./0027-les-annees-d-experience-se-calculent-depuis-les-dates.md) | Les années d'expérience se calculent depuis les dates du CV | Proposé — JobAI#154 ; année seule en juillet et stages exclus, visibles dans le détail |
| [0028](./0028-la-revue-du-cv-coche-d-avance-ce-qui-a-une-preuve.md) | La revue du CV coche d'avance ce qui a une preuve | Proposé — JobAI#156 ; amende 0009 : fait établi et sourcé coché, conséquences décochées |
| [0029](./0029-les-signaux-d-un-employeur-viennent-du-suivi.md) | Les signaux d'un employeur viennent du suivi, rien d'autre | Proposé — JobAI#159 ; ouvertes, plus ancienne ouverte, médiane des fermées dès 3, intitulés repris |
| [0030](./0030-sources-ouvertes-sur-les-employeurs.md) | Les sources ouvertes sur les employeurs : ce qui est admis, et comment on les lit | Proposé — JobAI#160 ; REQ, RENA et catalogue des salaires admis à la mesure, sans scraping ni notation |
| [0031](./0031-les-erreurs-partent-a-sentry-expurgees.md) | Les erreurs partent à Sentry, expurgées, et seulement si un DSN est posé | Proposé — JobAI#117 ; éteint sans `SENTRY_DSN`, aucune donnée personnelle (message expurgé, requête et fil d'Ariane retirés) |
| [0032](./0032-le-salaire-passe-en-premier-dans-la-note.md) | Le salaire passe en premier dans la note, appliqué après un aperçu avant/après | Proposé — JobAI#152 ; poids 32/28/20/10/5/5, interrupteur `salaireDansLaNote` dans le profil, application par un geste de Marc sur `/profil` |
| [0033](./0033-la-fiche-de-competences-prouvees-par-le-cv.md) | La fiche de compétences prouvées par le CV, en vocabulaire fermé | Proposé — JobAI#155 ; chaque ligne cite sa phrase et son poste (retrouvés dans le CV), mots entiers et non morceaux de mots, les outils libres n'entrent plus dans le vocabulaire du barème |
| [0034](./0034-comparer-les-exigences-d-une-offre-a-la-fiche.md) | Comparer les exigences d'une offre à la fiche de compétences, au clic, pour les 100 meilleures offres | Proposé — JobAI#157 ; le modèle extrait les exigences (phrases de l'annonce), le code compare à la fiche, rien n'est conservé ni noté |
| [0035](./0035-l-analyse-du-cv-passe-a-sonnet-5-5.md) | L'analyse du CV passe à Sonnet 5.5, les autres appels à Haiku 5.5, et le coût se chiffre par modèle | Proposé — JobAI#158 ; CV : appel non forcé, sans pensée avant l'outil ; les trois autres appels à Haiku 5.5 (choix de Marc) ; prix par modèle dans le compteur du hub |
| [0036](./0036-une-annonce-du-guichet-est-une-seule-offre.md) | Une annonce du Guichet est une seule offre, même quand l'employeur change de nom | Proposé — JobAI#195 ; mesure en production : 40 annonces en double sur 8 800 offres ; lecture, signaux (par enseigne) et ingestion, sans réécrire le suivi |
| [0037](./0037-le-dossier-employeur-a-b-c-ne-cite-que-le-suivi.md) | Le dossier employeur A, B ou C ne cite que le suivi, et dit « inconnu » sans source | Proposé — JobAI#161 ; seuils 60 j, 45 j, 2 intitulés repris, 3 et 6 offres observées soumis à Marc sur 5 employeurs |
| [0038](./0038-le-domaine-est-gradue-et-les-metiers-se-proposent.md) | Le domaine est gradué (retenu, voisin, autre) et les métiers précis se proposent depuis le CV | Proposé — JobAI#151 ; plafonds 55 (voisin) et 40 (autre), seuils de la proposition soumis à Marc sur l'aperçu |
