CREATE TABLE "trajets" (
	"destination_nom" text PRIMARY KEY NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"origine_lat" real NOT NULL,
	"origine_lon" real NOT NULL,
	"duree_s" integer NOT NULL,
	"distance_m" integer NOT NULL,
	"polyline" text NOT NULL,
	"calcule_le" timestamp NOT NULL
);
