-- La borne la PLUS PROCHE, avec sa marque, sa vitesse et son tarif.
--
-- Deux choses à la fois, et c'est voulu : les colonnes ET le rattrapage. Séparer les deux
-- laisserait, entre les deux déploiements, une colonne `bornes_m` dont personne ne saurait
-- si elle porte l'ancien sens ou le nouveau.
--
-- POURQUOI ON EFFACE LES DATES
-- `bornes_m` changeait de définition : c'était « la plus proche À MOINS DE 350 m, sinon
-- NULL », c'est désormais « la plus proche, point ». Les valeurs déjà en base ont donc été
-- écrites sous une autre règle — et la quasi-totalité valent NULL, ce qui s'affichait
-- « aucune borne » pour presque tous les employeurs. Les garder reviendrait à mélanger deux
-- définitions dans une même colonne, et rien à l'écran ne pourrait les distinguer.
--
-- Effacer `bornes_le` suffit à tout faire remesurer : c'est cette date NULLE que
-- `bornesAMesurer` (lib/travaux.ts) retient. Le lot repasse à la prochaine passe de fond,
-- en une seule requête Overpass pour toutes les entreprises.

ALTER TABLE "entreprises_lieux" ADD COLUMN IF NOT EXISTS "bornes_rapide" boolean;
--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD COLUMN IF NOT EXISTS "bornes_tarif" text;
--> statement-breakpoint
UPDATE "entreprises_lieux" SET "bornes_le" = NULL, "bornes_m" = NULL, "bornes_nom" = NULL;
