CREATE TABLE "registre_noms" (
	"id" serial PRIMARY KEY NOT NULL,
	"neq" text NOT NULL,
	"nom" text NOT NULL,
	"nom_cle" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "registre_noms_cle_idx" ON "registre_noms" USING btree ("nom_cle");--> statement-breakpoint
CREATE INDEX "registre_noms_neq_idx" ON "registre_noms" USING btree ("neq");