## 6. Après un merge : vérifier le DÉPLOIEMENT, pas seulement la CI

**CI verte ne veut pas dire « en ligne ».** Ce sont deux systèmes indépendants : la CI juge le
code, l'hébergeur construit et sert. Un merge peut passer le gate et ne jamais être déployé — la
branche reste verte, le site continue de servir l'ancien build, et rien n'est rouge nulle part.

Vécu le 31/07/2026 : quatre projets Vercel ont cessé de créer des déploiements pendant ~3 h.
JobAI a rattrapé au push suivant ; Hubperso et BatchChef n'en ont pas eu — leur commit d'en-têtes
de sécurité est resté **cinq jours** en attente sans que personne ne le voie.

Donc, après un commit qui change ce qui est SERVI : vérifier qu'un déploiement de production a
bien été créé et qu'il est `READY`, puis **contrôler l'effet sur la réponse réelle** — un en-tête
se lit dans la réponse, il ne se déduit pas du fichier source. Ici, c'est d'autant plus vrai que
les commits vont directement sur `main` : il n'y a aucune PR dont l'échec sauterait aux yeux.

Corollaire : un commit qui ne change QUE de la doc n'a pas de déploiement à vérifier. Le dire
plutôt que de laisser croire qu'on a vérifié.

