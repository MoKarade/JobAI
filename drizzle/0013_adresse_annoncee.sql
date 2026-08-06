-- L'adresse peut désormais venir de l'ANNONCE elle-même.
--
-- POURQUOI UNE TROISIÈME SOURCE
-- OpenStreetMap ne cartographie pas les PME, et le registre du Québec ne contient pas 53
-- des employeurs suivis sous les noms où on les connaît. Restait une source jamais
-- exploitée : l'annonce, où l'employeur écrit lui-même où est le poste. Mesuré le
-- 2026-08-06 sur deux annonces Indeed — l'une porte une adresse civique complète, l'autre
-- rien. Le canal existe sans être garanti, ce qui suffit pour valoir la peine.
--
-- C'est aussi la plus PERTINENTE des trois pour Marc : c'est là qu'il irait travailler, et
-- un même employeur affiche des postes sur plusieurs sites. Mais elle vient d'un TEXTE, pas
-- d'une carte — d'où une valeur distincte dans la contrainte plutôt qu'un rangement sous
-- « registre », qui aurait effacé la nuance à l'écran.
--
-- La contrainte est REMPLACÉE, jamais retirée : une colonne de source laissée libre
-- accepterait n'importe quelle chaîne, et le typage TypeScript ne survit ni à un `any`, ni
-- à une écriture faite hors de l'app.

ALTER TABLE "entreprises_lieux" DROP CONSTRAINT IF EXISTS "entreprises_lieux_adresse_source_ck";
--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD CONSTRAINT "entreprises_lieux_adresse_source_ck"
  CHECK ("adresse_source" IN ('osm', 'registre', 'offre'));
