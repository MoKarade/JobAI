CREATE TABLE "sync_state" (
	"cle" text PRIMARY KEY NOT NULL,
	"valeur" text NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
