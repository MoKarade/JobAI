-- RATTRAPAGE : rendre re-mesurables les bornes gelées par une non-réponse d'Overpass.
--
-- ⚠️ SANS CETTE MIGRATION, LE CORRECTIF NE CHANGE RIEN POUR L'EXISTANT.
--
-- Le défaut : Overpass répond **HTTP 200**, corps JSON valide, `elements: []` et un champ
-- `remark` disant que la requête a expiré. Le code lisait ça comme « aucune borne de
-- recharge », inscrivait le résultat pour tout le lot — et posait `bornes_le` du même coup.
-- Or `bornesAMesurer` ne retient que les lignes dont cette date est NULLE : un seul
-- incident transitoire figeait donc « aucune borne » sur toutes les entreprises, à vie,
-- sans qu'aucune erreur ne soit jamais levée. C'est ce que Marc voit à l'écran.
--
-- Le correctif (lecture du `remark`, refus d'un lot vide sur une étendue régionale) empêche
-- que ça se reproduise. Il ne défige RIEN de ce qui est déjà en base : ces lignes portent
-- une date de mesure, donc plus personne ne les regarde. La règle du dépôt, payée quatre
-- fois — `ville`, `adresse`, `adresse_source`, puis le délai de retente — s'applique
-- encore : **le chemin de rattrapage se livre DANS le même lot que la correction.**
--
-- CE QU'ELLE REMET À ZÉRO, ET RIEN D'AUTRE : les lignes qui déclarent « mesuré, aucune
-- borne trouvée ». Une entreprise pour laquelle une borne a RÉELLEMENT été trouvée
-- (`bornes_m` non nul) garde sa mesure — elle est vraie, et la re-chercher coûterait une
-- interrogation pour rien.
UPDATE "entreprises_lieux"
SET "bornes_le" = NULL
WHERE "bornes_le" IS NOT NULL
  AND "bornes_m" IS NULL;
