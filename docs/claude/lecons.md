## 9. Leçons apprises (règles durables)

> **Les RÈGLES sont ici ; leurs HISTOIRES sont dans [`docs/LESSONS.md`](./docs/LESSONS.md).**
>
> ⚠️ Pourquoi ce découpage, et ce qu'il coûte (`[CV-11]`, 2026-09-17). Cette section faisait
> **1 536 lignes** — 83 % d'un fichier chargé EN ENTIER à chaque session, pour un plafond
> assumé de 150. Le déménagement garde en session ce qui change la façon de coder (la règle)
> et sort ce qui l'explique (l'incident, la mesure, la date). **C'est une PERTE, et elle est
> délibérée** : un `CLAUDE.md` ne charge rien hors de son arbre, donc les histoires
> n'arriveront plus dans la session — il faudra aller les lire. Une règle sans son histoire
> reste applicable ; l'inverse n'est pas vrai, et c'est ce qui décide du sens de la coupe.
>
> ⚠️ **Ajouter une leçon = DEUX écritures, dans le même commit** : son histoire dans
> `docs/LESSONS.md`, sa règle ici. Écrire la règle seule la rend invérifiable ; écrire
> l'histoire seule ne la fait pas descendre en session.
>
> ⚠️ **Le compte ci-dessous n'a pas été distillé à la main** : chaque ligne est le texte en
> GRAS de sa leçon, repris au caractère près. Ce gras avait été écrit comme la conclusion de
> chaque incident — c'était déjà l'index, il n'était simplement pas séparé du récit.

1. Avant d'écrire un fichier ou d'annoncer une tâche, vérifier qu'elle n'est pas DÉJÀ faite.
2. Un document vivant qui décrit un verrou doit nommer le fichier EXACT, et se met à jour dans le commit qui livre le verrou.
3. Sans PR, la CI ne se regarde pas toute seule : la vérifier fait partie du push.
4. Une même règle tenue dans deux langages diverge, et le mauvais exemplaire gagne.
5. Un garde qui s'exclut d'un dossier entier s'en exclut pour toujours.
6. Lire un fichier écrit sous Windows = retirer le BOM, tolérer CRLF.
7. Un outil qui échoue en SILENCE est pire qu'un outil qui plante.
8. Ce que Next.js fait pour toi, les outils en ligne de commande ne le font pas.
9. Un message d'erreur FAUX coûte plus cher qu'un message générique.
10. Toute date que l'app ÉCRIT se calcule dans le fuseau de Marc, jamais en UTC.
11. Un invariant de COMPTAGE additionne des grandeurs de MÊME unité.
12. Un traitement automatique qui RETIRE quelque chose se conçoit à l'envers : d'abord ce qu'il n'a pas le droit de toucher.
13. « Redeploy » rejoue le commit du déploiement existant, PAS le dernier commit.
14. Un revert de conteneur peut effacer un travail non commité EN PLUS DE la plomberie git
15. Le FORMAT d'une erreur dit d'où elle vient.
16. Quand deux acteurs détiennent chacun la moitié d'un accès, la solution n'est pas de compléter l'un — c'est de vérifier que l'accès manquant est nécessaire.
17. Compter un refus ne suffit pas : il faut le NOMMER.
18. Un flux VALIDE n'est pas un flux UTILE : lire le contenu, pas le format.
19. Un HTTP 200 ne prouve rien tant qu'on n'a pas mesuré ce que l'API répond à une question ABSURDE.
20. Un identifiant deviné trouve des homonymes, et ils sont crédibles.
21. Ne jamais laisser tourner une source prouvée morte.
22. Un seuil se pose sur la composante qui MESURE, pas sur le total.
23. Une expression composée ne survit pas à l'écriture inclusive.
24. Supprimer un geste manuel déplace son coût : il faut le borner AVANT de le supprimer.
25. Un travail de fond va APRÈS la réponse, pas dedans.
26. Un déclencheur automatique se calibre sur ce qui doit VRAIMENT le réveiller.
27. Un mécanisme qui ne peut pas atteindre sa source doit le DIRE, pas rendre un résultat vide.
28. Un `| grep` masque le code de sortie : ne jamais chaîner un gate derrière lui.
29. Un test qui désigne une donnée par son INDEX se met à tester autre chose en silence.
30. Diagnostiquer AVANT de corriger : « trop peu d'offres » n'était pas un bug de carte.
31. Un jeu de données qui change de nature casse les tests qui décrivaient son état — et c'est le moment de distinguer la DESCRIPTION de l'INVARIANT.
32. Une sonde qui tourne dans un état local différent du distant ne prouve rien.
33. Un message de commit ne passe jamais par une chaîne interpolée par le shell.
34. Ce qui doit bloquer vit dans le gate ; ce qui change sans le code vit à côté.
35. Une liste de colonnes recopiée à N endroits perd le champ suivant, et personne ne le voit.
36. Une colonne ajoutée à une table dont le traitement SAUTE les entrées déjà présentes est une colonne morte pour tout l'existant.
37. « Cette liste-là sert à autre chose » n'immunise pas contre l'oubli qu'on vient de corriger.
38. Une heuristique peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.
39. Un choix qui dépend de l'ordre d'un `SELECT` sans `ORDER BY` est un tirage au sort.
40. Un écart « assumé par un commentaire » reste un écart.
41. Un travail de fond a besoin d'un gate qui CONVERGE, pas d'un gate qui a l'air juste.
42. Deux `after()` ne s'exécutent pas l'un après l'autre.
43. Une plainte sur ce qu'on VOIT ne désigne presque jamais ce qu'il faut CHANGER.
44. Un export de données est une surface d'exécution, pas un dump.
45. Retirer ce qui est laid ne produit pas du beau : ça produit du NEUTRE.
46. Une règle d'apparence vraie en CLAIR peut être fausse en SOMBRE — la vérifier sur les jetons, pas au jugé.
47. Une maquette de refonte doit partir du code EXISTANT, pas d'une page blanche.
48. Un second thème jamais montré à la validation n'est pas une option, c'est une version NON VALIDÉE de l'app servie au hasard du réglage système.
49. Une lecture de format binaire écrite à la main s'éprouve sur des fichiers TIERS, ou elle ment.
50. Un test qui EXIGE un fichier absent de la CI transforme une dépendance de machine en rouge permanent.
51. Un garde de données personnelles fait des faux positifs, et c'est le garde qui a raison.
52. Une bibliothèque peut DÉTACHER le tampon qu'on lui passe.
53. Composer un objet par `{ ...brut, quelquesChamps: netto(…) }` laisse passer TOUT LE RESTE.
54. Un test qui n'éprouve qu'UNE variante d'un motif fait croire que le motif entier est couvert.
55. Le garde PII se déclenchera sur tes FIXTURES et sur tes COMMENTAIRES, et il aura raison.
56. Le conteneur peut REVERTIR l'arbre de travail en pleine tâche — `origin` est la seule vérité.
57. Après un revert, `refs/remotes/origin/main` peut MANQUER alors que le tracking est configuré.
58. Une couleur écrite EN DUR ne se plaint jamais d'un changement de thème : elle devient fausse, en silence.
59. Un travail périodique qui dépend d'un déclencheur UNIQUE meurt en silence.
60. Un saut de build se décide contre `HEAD^`, en SUPPOSANT que `HEAD^` a été déployé — et cette supposition tombe précisément le jour où un déploiement manque.
61. `deploy_to_vercel` n'est pas « déploie ce dépôt ».
62. Un revert de conteneur RÉCIDIVE dans la même session, et il revient au même point.
63. Un garde qui tombe pendant un refactor a raison : on met à jour sa LISTE, jamais son assertion.
64. Prouver qu'une extraction est VERBATIM se fait sur les EFFETS, pas sur les lignes.
65. Un contrôle promis en prose (« il suffira de grep ») ne verrouille rien.
66. Un test « la garde couvre-t-elle X ? » se vérifie en RETIRANT la garde.
67. Ajouter un paramètre à une fonction d'un seul argument piège tous les `map(fn)`.
68. Quand une passe fait PLUSIEURS travaux, son déclencheur doit couvrir CHACUN d'eux.
69. Un travail de fond qui ne journalise QUE ses échecs est indiagnosticable.
70. Une amputation de requête se fait passer pour une source vide.
71. Un travail de fond hérite de la durée de vie de sa page — il ne s'y ajoute pas.
72. Le coût d'une frontière réseau se dimensionne sur le PIRE CAS, pas sur le cas nominal.
73. Une déduction écrite au présent dans un commentaire devient un fait pour la prochaine session — donc elle se mesure ou elle se dit comme déduction.
74. Un délai de retente encode une PRÉMISSE : quand elle tombe, le délai doit tomber avec.
75. Un service qui ne trouve pas ne dit pas toujours non — il répond à côté, et à côté peut passer les contrôles.
76. Un garde dont la PORTÉE est « ce que git suit » arrive un commit trop tard.
77. Un OUTIL DE DIAGNOSTIC qui se tait quand il ne trouve rien ne diagnostique rien.
78. Un quota de déploiement est une ressource PARTAGÉE, et pousser à chaque correctif la brûle.
79. Un revert de conteneur n'emporte pas que le travail : il emporte la PLOMBERIE GIT, et tous les outils qui s'y fient se mettent à mentir.
80. Une Routine qui allume une session NEUVE n'hérite de rien : ni des dépôts attachés, ni des outils MCP de la session qui l'a créée.
81. Un quota d'API partagé ne se mesure qu'en le heurtant, et il se referme en s'aggravant.
82. Lire du texte écrit par un tiers, c'est l'INGÉRER — et un garde de forme ne suffit plus.
83. Un identifiant fourni par une source externe n'est pas forcément un identifiant.
84. Une liste et son détail se contredisent : c'est le détail qui dit le lieu.
85. Un fichier commité n'existe pas en serverless tant que le traceur ne le voit pas — et l'absence du chemin doit être une PANNE DITE.
86. Un plan écrit d'après un TABLEAU de symptômes se trompe ; il se vérifie contre le CODE avant d'être promis.
87. Un plafond « configurable » peut être un LEURRE si un cap interne, plus bas, tronque déjà tout ce qui le dépasse.
88. Un garde « déjà connu, ne pas retoucher » doit distinguer « à jour » de « obsolète depuis un événement précis » — sinon il fige une valeur périmée pour toujours.
89. Un mécanisme demandé peut déjà exister sous un nom qu'on ne cherchait pas.
90. `drizzle-kit generate` peut proposer un diff halluciné si l'historique des snapshots a un trou.
91. `node_modules` PRÉSENT ne veut pas dire PAQUETS présents.
92. Une configuration indexée PAR ROUTE ne suit pas un refactor qui PARTAGE du code.
93. Un gate ne peut pas être vert dans une session sans egress — et ça se DIT.
94. Les paramètres d'une API se mesurent en les FAISANT VARIER, avant d'écrire un protocole autour.
95. Un connecteur « activé » peut n'exposer AUCUN outil.
96. Une donnée d'entreprise renvoie le SIÈGE SOCIAL, jamais l'établissement local.
97. Un verdict qui recouvre DEUX situations ne peut pas porter UN délai — il porte une ÉCHELLE.
98. Un travail trop long pour une fonction serverless se découpe en LOTS que le NAVIGATEUR enchaîne, et sa progression se relit de l'état, jamais d'un compteur local.
99. Une mesure faite depuis une session bloquée par le proxy ne mesure que le proxy.
100. Dans un fichier `"use server"`, TOUTE fonction async exportée est un point d'entrée HTTP anonyme — un `export` n'y est pas un choix de portée, c'est une PUBLICATION.
101. Une liste blanche est un pari ; quand la question a une réponse MESURABLE, la mesurer.
102. Nommer le refus AVANT de le corriger — et le NOMMER, c'est nommer son OBJET.
103. Rendre un paramètre RÉGLABLE périme tout ce qui a été décidé sous son ancienne valeur — et ce qui sauve la mise, c'est d'avoir stocké la MESURE, pas la conclusion.
104. Une source qui lit une FENÊTRE ne peut pas se taire : elle répète l'avant-veille, et le silence prend l'apparence d'un résultat.
105. Chercher un défaut est le meilleur moment pour recenser ce qui reste debout.
106. Une règle de PII écrite dans UNE seule langue laisse l'autre entrer, et le dépôt est public.
107. Un plafond de lecture qu'on s'impose se dit AVEC la liste de ce qu'il a laissé de côté.
108. Le gate ne vaut que pour l'arbre qu'il a VU : éditer après l'avoir lancé, c'est ne pas l'avoir lancé.
109. Un compte d'octets écrit en tranches de trois EST un numéro d'assurance sociale pour un scan de source.
110. Un test de NETTOYAGE ne discrimine que si le nettoyage a encore quelque chose à faire.
111. Borner la mémoire ne borne PAS le réseau.
112. Quand on ne peut pas LIRE la source, l'analyseur doit RAPPORTER ce qu'il a vu.
113. Un recensement qui rend un ENSEMBLE ne conclut RIEN sur une absence.
114. Un plafond atteint transforme toutes les mesures d'une passe en PRÉFIXES.
115. Une entité HTML non décodée ne casse rien — elle fait juste disparaître des données.
116. Le VOLUME d'une source n'est pas sa VALEUR, et ça se regarde avant de brancher.
117. Savoir qu'un champ EXISTE ne dit rien de ce qu'il PORTE.
118. Une liste blanche qui compare par SOUS-CHAÎNE ne s'étend pas par simple ajout : un nom court avale ses composés.
119. Le VOLUME d'une source est une question de TRI, pas de branchement.
120. Un échantillon décrit la population dont il est TIRÉ, jamais celle qui t'intéresse — et c'est la troisième fois en une session.
121. Un gabarit de texte servi par une source tierce n'est pas stable, même à quelques minutes d'intervalle.
122. Un module qui documente CE QUI LE PROTÈGE devient FAUX quand on change les conditions — et c'est lui qu'il faut relire AVANT d'ajouter la fonctionnalité, pas après.
123. Une exception à un garde-fou non négociable se livre avec ses CONDITIONS, jamais seule.
124. Zod STRIPPE les clés inconnues : un test qui croit éprouver un REJET éprouve peut-être un silence.
125. Une règle qui ne vit que dans un document se reperd — il lui faut un test-scan.
126. Éprouver un serveur par son PROTOCOLE, pas par ses handlers.
127. Une liste écrite à la main devient fausse au chantier suivant — et deux d'entre elles l'étaient déjà.
128. Un contrôle de sécurité se teste avec les chaînes d'attaque EXACTES, pas avec des cas plausibles.
129. Une garantie d'unicité vit dans l'ÉCRITURE, jamais dans une lecture qui la précède.
130. Un automatisme « pour ne plus jamais y penser » ne s'applique QUE là où quelqu'un l'a appelé — donc tout module qui ajoute des tables en hérite.
131. Sur un endpoint authentifié, une PANNE n'est pas un REFUS.
132. Quand je demande la même mesure une quatrième fois, le problème n'est plus la mesure : c'est que je n'ai pas d'accès.
133. Un réglage qui exige une session Claude n'est pas un réglage — c'est une dépendance, et elle se supprime en livrant l'ÉCRAN, pas la donnée.
134. Un `\b` placé après une alternation dont une branche finit par un POINT ne matche jamais — et la branche est morte en silence.
135. Une doc qui déduit une conclusion d'un fait devient FAUSSE en silence quand le fait change — et la conclusion, elle, avait des conséquences.
136. Deux populations sans instrument commun : mesurer chacune dans SON unité, conclure sur les ORDRES DE GRANDEUR ABSOLUS.
137. `git checkout <fichier>` pour défaire UNE mutation efface TOUT le travail non commité du fichier.
138. Un mécanisme de troncature ne protège que la PROFONDEUR qu'il parcourt.
139. Un budget plus long que le MUR de sa fonction ne borne rien.
140. Une garde qui EXCLUT une population d'un mécanisme la prive aussi de ce que ce mécanisme DISAIT.
141. Deux plaintes d'un même message peuvent n'avoir qu'UNE cause, et seule la mesure le montre.
142. Un mot-clé cherché N'IMPORTE OÙ dans une URL classe mal exactement ce qui marche.
143. « Quasi tout X » se MESURE avant d'être corrigé — et l'outil de mesure se livre d'abord.
144. La garde qu'on copie du voisin peut être INOPÉRANTE chez soi, et elle a l'air prudente.
145. Un seuil se mesure avec l'instrument qu'on a déjà construit.
146. Un témoin d'intégration peut être protégé par la BORNE plutôt que par la garde qu'il prétend éprouver.
147. Un document PERSISTÉ est daté par le schéma qui l'a écrit : ajouter un champ requis le rend illisible, et personne ne le voit avant des semaines.
148. Un diagnostic tiré d'un message d'erreur décrit le SYMPTÔME, pas la portée — y compris quand c'est moi qui l'ai écrit une heure plus tôt.
149. Un garde-fou qui REFUSE un lot entier se transforme en panne permanente dès qu'un seul membre est mauvais — et le bon remède n'est jamais de relever le seuil, c'est de DÉCOUPER.
150. Un test qui vérifie ce qu'une fonction REND ne prouve rien sur ce qui est ÉCRIT — et la liste que la persistance parcourt EST le contrat.
151. Un message qui DÉDUIT sa cause d'un code de statut envoie au mauvais endroit — et il le fait avec aplomb.
152. Libérer de la place au-dessus d'un élément qui est à son PLANCHER ne lui donne RIEN.
153. Un frein qui compte ce que PERSONNE n'a dépensé ne protège rien : il enferme.
154. Un recensement de commandes d'installation s'énumère par ce qu'elles FONT, jamais par le nom de l'une d'elles — `npm ci` recensé, `npx` oublié, et `npx` installe ET exécute des scripts.
155. Un champ additif s'écrit `.nullable().optional()`, jamais `.nullable().default(null)` : un `default` Zod rend le champ REQUIS en SORTIE, donc obligatoire sur tout objet construit à la main.
156. Avant de nommer un champ dans un type déjà large, grep le nom DANS ce type — savoir ce qu'on veut exprimer ne dit rien de ce que le nom porte déjà.
157. Avant de retirer un filtre, lister ce que son chemin PRODUIT en plus du refus : ce qui sert à DÉCIDER meurt avec la décision, ce qui sert à OBSERVER doit survivre sous un nom qui ne ment plus.
158. Le LIBELLÉ d'une métrique publiée à un consommateur est une CLÉ chez lui, jamais un titre — le renommer jette l'historique en silence, et un libellé qui porte une part VARIABLE (entreprise, date) ne peut structurellement pas avoir de courbe.
159. Avant de prescrire un remède depuis un JOURNAL, ouvrir le code qui produit la ligne — sinon on décrit ce qu'on ferait à partir de rien, pas ce qui manque à ce qui existe (« déjà fait ? » vaut pour le DIAGNOSTIC autant que pour la tâche).
160. Devant une garde qui laisse passer ce qu'elle devrait arrêter, se demander si elle ne remplit pas DÉJÀ un autre rôle légitime : c'est alors une SECONDE garde qu'il faut, jamais un seuil plus serré.
161. Un seuil qui dépend de la DENSITÉ autant que de la surface ne se devine pas : on ÉCOUTE la réponse (couper sur échec, recommencer) plutôt que d'inventer un nombre — avec un plafond, sinon une panne fait doubler le travail à chaque tour.
162. Quand un comparateur a un SECOND critère, une fixture où le premier est CONSTANT teste le second : faire varier toutes les clés du tri, ou la mutation reste verte.
163. Deux lecteurs pour la MÊME question et le plus permissif en DÉFAUT : la série la moins gardée est celle qu'on obtient en ne choisissant pas — rendre le choix REQUIS, le compilateur garde mieux que la discipline.
164. Une garde de plausibilité posée à l'ÉCRITURE doit être re-posée à la LECTURE quand ce n'est pas la même entité qui porte le critère : un employeur a une position, une offre a SA ville.
165. Élargir ce qu'on INGÈRE sans élargir ce qu'on sait SITUER transforme une garde régionale en plafond invisible — et le refus se compte comme « introuvable », indistinguable de « la source ne sait pas ».
166. Un identifiant d'ENTITÉ n'est pas l'identifiant du FAIT : une clé primaire par employeur fait hériter une position à des offres qui n'ont rien à voir, et le chiffre qui en sort est plausible.
167. Un scan de source qui cherche un JETON prouve qu'on l'a TAPÉ, jamais qu'il s'affiche : une assertion de rendu vise la CONDITION de rendu, sinon remplacer celle-ci par `false` laisse le test vert.
168. Un COMPTE affiché et le GROUPE affiché doivent être le même ensemble, calculé une fois : deux calculs séparés appliquent deux sous-ensembles de filtres et l'un des deux ment sans que rien ne rougisse.
169. Le poids d'un payload se mesure COMPRESSÉ, jamais en JSON brut : l'hébergeur compresse par défaut (`content-encoding: br` vérifié), 4,93 Mo de JSON répétitif valent 0,12 Mo sur le fil — prescrire un dégraissage depuis la taille brute, c'est proposer un lot que le réseau ne verra pas.
170. Un coût en O(n × m) est invisible tant que n et m sont petits : tout lot qui multiplie le VOLUME oblige à relire les boucles qui balayent une liste PAR ÉLÉMENT, pas seulement les bornes qu'on s'était données.
171. Une recommandation donnée AVANT la mesure engage l'utilisateur dans le mauvais lot : mesurer d'abord, recommander ensuite — et quand la mesure dément la recommandation, le dire avant de faire le travail qu'elle a fait approuver.
172. Une heuristique de REGROUPEMENT (affichage) peut porter le MÊME défaut qu'une heuristique de DONNÉES qu'on a déjà corrigée — un faux regroupement visuel se corrige à l'œil, il ne cesse pas d'être faux pour autant, et personne ne le signale.
173. Rendre O(1) un regroupement par SOUS-CHAÎNE exige une ÉGALITÉ, pas un meilleur index : une égalité a une clé de Map native, une sous-chaîne n'en a pas — le passage à l'égalité change la RÈGLE, pas seulement la vitesse.
174. Cinq lectures indépendantes `await`ées l'une après l'autre coûtent cinq allers-retours réseau payés en série — un `Promise.all` ne change aucun résultat, seulement l'ordonnancement, et se vérifie par scan de source à défaut de harnais de rendu.
175. Un scan de découverte qui remplace une liste écrite à la main peut révéler des membres LÉGITIMEMENT différents : ne pas forcer un invariant unique sur une population hétérogène — le scinder par ce que chaque chemin FAIT réellement. Et une assertion « au moins un cas existe » qui relit les fichiers séparément du reste du test ne prouve pas que la branche visée s'est exécutée : compter DANS la branche.

