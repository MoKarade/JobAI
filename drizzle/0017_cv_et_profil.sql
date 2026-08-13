CREATE TABLE "cvs" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom_fichier" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille_octets" integer NOT NULL,
	"contenu" text NOT NULL,
	"texte" text,
	"profil_propose" text,
	"erreur_extraction" text,
	"actif" boolean DEFAULT false NOT NULL,
	"profil_valide" text,
	"televerse_le" timestamp with time zone DEFAULT now() NOT NULL,
	"valide_le" timestamp with time zone,
	CONSTRAINT "cvs_actif_a_un_profil_ck" CHECK ("cvs"."actif" = false OR "cvs"."profil_valide" IS NOT NULL),
	CONSTRAINT "cvs_taille_ck" CHECK ("cvs"."taille_octets" > 0)
);
--> statement-breakpoint
CREATE INDEX "cvs_televerse_idx" ON "cvs" USING btree ("televerse_le");--> statement-breakpoint
CREATE UNIQUE INDEX "cvs_un_seul_actif_idx" ON "cvs" USING btree ("actif") WHERE "cvs"."actif" = true;