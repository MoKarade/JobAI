-- Une quatrième origine d'adresse : la recherche web.
--
-- POURQUOI ELLE EXISTE
-- Demande de Marc, 2026-08-06 : « je veux que ça trouve l'adresse dans le texte, que ça
-- fasse des recherches internet pour trouver l'adresse sinon ». Les trois autres sources
-- sont épuisées — OpenStreetMap ne cartographie pas les PME, le registre du Québec n'a pas
-- 53 des employeurs suivis sous ces noms, et l'annonce n'en donne une que dans un cas sur
-- quatre (mesuré sur quatre annonces réelles le 2026-08-06).
--
-- POURQUOI ELLE EST À PART, ET NON RANGÉE SOUS « offre »
-- C'est la source la plus RISQUÉE du projet. Une recherche « adresse AMETEK » rend le siège
-- social de Pennsylvanie pour une usine de Lévis : plausible, faux, et indiscernable d'une
-- bonne réponse une fois écrit en base. Deux choses la rendent acceptable — la ville de
-- l'adresse doit concorder avec celle que l'offre annonce (deux faits indépendants qui se
-- confirment), et sa page source est exigée. Elle reste néanmoins d'une autre nature que
-- les trois autres, et l'écran doit pouvoir le dire : « trouvée sur le web — à confirmer ».
-- La ranger sous « offre » aurait effacé cette différence exactement là où elle compte.

ALTER TABLE "entreprises_lieux" DROP CONSTRAINT IF EXISTS "entreprises_lieux_adresse_source_ck";
--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD CONSTRAINT "entreprises_lieux_adresse_source_ck"
  CHECK ("adresse_source" IN ('osm', 'registre', 'offre', 'recherche'));
