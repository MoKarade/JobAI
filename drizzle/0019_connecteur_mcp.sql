CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text DEFAULT '' NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"empreinte" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"defi" text NOT NULL,
	"sujet" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"consomme_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_jetons" (
	"empreinte" text PRIMARY KEY NOT NULL,
	"genre" text NOT NULL,
	"client_id" text NOT NULL,
	"sujet" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"revoque_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
