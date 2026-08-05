CREATE TABLE "registre_etablissements" (
	"id" serial PRIMARY KEY NOT NULL,
	"neq" text NOT NULL,
	"nom" text NOT NULL,
	"nom_cle" text NOT NULL,
	"adresse" text NOT NULL,
	"ville" text NOT NULL,
	"code_postal" text,
	"principal" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "registre_nom_cle_idx" ON "registre_etablissements" USING btree ("nom_cle");