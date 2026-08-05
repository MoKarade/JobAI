// scripts/sonder-adresses.ts — trouver l'adresse quand Nominatim ne la trouve pas.
//
//   npx tsx scripts/sonder-adresses.ts
//
// POURQUOI, ET CE QU'ON NE PEUT PAS FAIRE
// Marc, 2026-08-05 : « quand tu ne trouves pas l'adresse exacte je veux une recherche web
// ou maps pour trouver, et l'indiquer ». La demande est juste — 44 entreprises sur 52 sont
// posées au centre-ville faute d'adresse. Mais « recherche web ou maps » n'est pas
// disponible ici, et il vaut mieux le dire que de le contourner :
//
//   · L'API Google Maps / Places exige une clé ET un compte de facturation. Marc veut zéro
//     abonnement, et une carte Google a déjà été écartée de ce projet.
//   · Les API de recherche web (Google, Bing, Brave) sont toutes payantes.
//   · Lire les résultats d'un moteur ou de Google Maps au chausse-pied, c'est du
//     moissonnage : interdit par le garde-fou n°4, et par leurs conditions.
//
// EN REVANCHE, deux sources GRATUITES et OFFICIELLES restent inexplorées, et ce sont
// justement celles que le garde-fou n°4 nomme comme exception :
//
//   1. OVERPASS — déjà utilisé pour les bornes. Il cherche dans OpenStreetMap par NOM, à
//      travers toute la région. C'est un chemin de correspondance COMPLÈTEMENT différent
//      de Nominatim : là où le géocodeur classe des interprétations et n'en rend qu'une,
//      Overpass fait une recherche littérale sur le nom des objets. Une entreprise que
//      Nominatim ne sait pas classer peut très bien être dans OSM et sortir ici.
//
//   2. LE REGISTRAIRE DES ENTREPRISES DU QUÉBEC (REQ) — le registre officiel de toutes les
//      entreprises immatriculées au Québec, AVEC leur adresse, publié en données ouvertes.
//      C'est plus autoritaire qu'OpenStreetMap. ⚠️ Avec une réserve qu'il faudra DIRE à
//      l'écran : le REQ donne le DOMICILE LÉGAL, qui peut être le bureau du comptable et
//      non l'usine. Une adresse du registre n'est pas une adresse de lieu de travail, et
//      les confondre serait exactement le genre de donnée plausible et fausse que le
//      garde-fou n°3 interdit.
//
// Ce script ne fait que LIRE et rapporter. Il tourne sur un runner GitHub Actions, la
// session de développement n'ayant aucun accès sortant.

const DELAI_MS = 25_000;

/** Quelques entreprises RÉELLES du suivi, choisies pour couvrir plusieurs cas. */
const ENTREPRISES: readonly { nom: string; ville: string }[] = [
  { nom: "Laserax", ville: "Québec" },
  { nom: "Chantier Davie", ville: "Lévis" },
  { nom: "Canam Ponts", ville: "Québec" },
  { nom: "Robotiq", ville: "Lévis" },
  { nom: "P.H. Tech", ville: "Lévis" },
  { nom: "Poly-Robotics", ville: "Québec" },
];

/** La grande région de Québec, mêmes bornes que le reste de l'app. */
const BOITE = "46.4,-71.9,47.1,-70.6";

async function lire(url: string, description: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "JobAI/1.0 (recherche d'emploi personnelle; contact via le dépôt)",
        Accept: "application/json, */*",
      },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!r.ok) {
      console.log(`   → HTTP ${r.status} — ${description}`);
      return null;
    }
    return await r.json();
  } catch (err) {
    console.log(`   → ÉCHEC ${description} : ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Overpass, par NOM, sur toute la région.
 *
 * `~"nom",i` est une recherche insensible à la casse sur l'étiquette `name`. On interroge
 * les trois types d'objets : un bâtiment industriel est souvent une `way`, pas un `node`.
 */
async function parOverpass(nom: string): Promise<void> {
  const echappe = nom.replace(/["\\]/g, "");
  const requete =
    `[out:json][timeout:20];` +
    `(node["name"~"${echappe}",i](${BOITE});` +
    `way["name"~"${echappe}",i](${BOITE});` +
    `relation["name"~"${echappe}",i](${BOITE}););` +
    `out center tags 5;`;

  const j = (await lire(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(requete)}`,
    "Overpass",
  )) as { elements?: Record<string, unknown>[] } | null;

  if (!j || !Array.isArray(j.elements)) return;
  if (j.elements.length === 0) {
    console.log("   → Overpass : aucun objet de ce nom dans la région");
    return;
  }

  console.log(`   → Overpass : ${j.elements.length} objet(s)`);
  for (const e of j.elements.slice(0, 3)) {
    const tags = (e.tags ?? {}) as Record<string, string>;
    // L'adresse d'OSM est en morceaux (`addr:*`) : c'est ce qui la rend UTILISABLE, là où
    // le `display_name` de Nominatim est une chaîne à recomposer.
    const rue = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    const adresse = [rue, tags["addr:city"], tags["addr:postcode"]].filter(Boolean).join(", ");
    console.log(
      `      · ${e.type}/${e.id} — ${tags.name ?? "(sans nom)"} — ${adresse || "PAS d'adresse taguée"}`,
    );
  }
}

/** Le jeu de données du Registraire des entreprises, s'il existe et s'il est exploitable. */
async function sonderRegistraire(): Promise<void> {
  console.log("\n── Registraire des entreprises du Québec (REQ) — données ouvertes");
  const j = (await lire(
    "https://www.donneesquebec.ca/recherche/api/3/action/package_search?q=registre+des+entreprises&rows=5",
    "Données Québec",
  )) as { result?: { count?: number; results?: Record<string, unknown>[] } } | null;

  const trouves = j?.result?.results;
  if (!Array.isArray(trouves) || trouves.length === 0) {
    console.log("   → aucun jeu trouvé");
    return;
  }

  console.log(`   → ${j?.result?.count ?? trouves.length} jeu(x) ; premiers :`);
  for (const t of trouves.slice(0, 5)) {
    const org = (t.organization as { title?: string } | undefined)?.title ?? "?";
    const res = (t.resources ?? []) as { format?: string; url?: string; size?: number }[];
    console.log(`      · ${t.title as string}  [${t.name as string}]`);
    console.log(`        organisme : ${org} · modifié : ${(t.metadata_modified as string) ?? "?"}`);
    for (const r of res.slice(0, 4)) {
      const taille = r.size ? ` (${Math.round(r.size / 1_048_576)} Mo)` : "";
      console.log(`        ↳ ${r.format ?? "?"}${taille} ${r.url ?? ""}`);
    }
  }
}

async function principal(): Promise<void> {
  console.log("SONDE DES SOURCES D'ADRESSE — lecture seule.");
  console.log("Objectif : trouver une adresse là où Nominatim se replie au centre-ville.\n");
  console.log("⚠️ « Recherche web / Google Maps » n'est PAS testée ici : clé payante");
  console.log("   obligatoire, ou moissonnage interdit. Voir l'en-tête du fichier.\n");

  console.log("── Overpass : chercher l'entreprise par NOM dans OpenStreetMap");
  for (const e of ENTREPRISES) {
    console.log(`\n   ${e.nom} (${e.ville})`);
    await parOverpass(e.nom);
    // Overpass est bénévole : on ne le mitraille pas.
    await new Promise((r) => setTimeout(r, 1500));
  }

  await sonderRegistraire();

  console.log("\n──────────────────────────────────────────────");
  console.log("CE QU'IL FAUT LIRE : une adresse TAGUÉE (addr:housenumber + addr:street)");
  console.log("est utilisable telle quelle. Un objet trouvé SANS adresse taguée ne donne");
  console.log("qu'une position — utile pour l'épingle, insuffisant pour afficher une rue.");
}

void principal();

// ⚠️ `export {}` FAIT DE CE FICHIER UN MODULE, ET C'EST NÉCESSAIRE.
// Sans lui, TypeScript le traite comme un script à portée GLOBALE : ses noms de premier
// niveau (`DELAI_MS`, `principal`) entrent alors en collision avec ceux des autres sondes,
// et le typecheck tombe sur « Cannot redeclare block-scoped variable » — dans deux fichiers
// à la fois, dont un qui n'a pas bougé. Un fichier de script sans le moindre import n'est
// pas isolé par défaut.
export {};
