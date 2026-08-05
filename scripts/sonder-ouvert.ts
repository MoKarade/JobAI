// scripts/sonder-ouvert.ts — chercher une source d'offres qui EXISTE VRAIMENT.
//
//   npx tsx scripts/sonder-ouvert.ts
//
// POURQUOI CE SCRIPT EXISTE
// Marc, le 2026-08-05 : « ça fait plusieurs jours y'a pas assez d'offres ». Le constat est
// juste, et la cause est connue : les sources automatiques ne produisent RIEN. Le flux RSS
// du Guichet-Emplois répond 404 sur cinq adresses (mesuré le 31/07, `sonder-sources.ts`),
// les ATS interrogés ne couvrent aucun employeur de la région, et tout le stock réel vient
// d'un dépôt manuel via une Routine — un seul en 72 h.
//
// Avant de coder quoi que ce soit, on MESURE ce qui répond. Ce script ne fait que lire et
// rapporter : ni base, ni fichier, ni secret. Il tourne sur un runner GitHub Actions, parce
// que la session de développement n'a aucun accès sortant (403 sur jobbank.gc.ca comme sur
// ouvert.canada.ca — vérifié le 05/08 avant d'écrire ces lignes).
//
// CE QU'ON CHERCHE, ET DANS QUEL ORDRE
//   1. Le portail de DONNÉES OUVERTES du Canada — nommément autorisé par le garde-fou n°4.
//      Une recherche du 05/08 indique qu'il publie les offres du Guichet-Emplois en CSV,
//      par mois. À vérifier : fraîcheur réelle, colonnes, volume, et s'il est filtrable sur
//      la région de Québec.
//   2. L'API du Guichet-Emplois si elle existe sans clé.
//   3. Les ATS que les employeurs d'ICI utilisent vraiment.
//
// ⚠️ AUCUN MOISSONNAGE (garde-fou n°4). On n'interroge que des points d'accès publiés comme
// tels : données ouvertes, API documentées, flux déclarés. Une page HTML qu'on lirait au
// chausse-pied n'est pas une source, c'est du scraping, et ce n'est pas négociable.
//
// ══ VERDICT DU 2026-08-05 — les sept sont MORTES, et voici de quoi ne pas y revenir ══
//
//   Guichet-Emplois RSS ............. 404 sur six formes d'URL
//   Guichet-Emplois API jobsearch ... 404
//   Données ouvertes — Guichet ....... CSV mensuels, contenu 2023
//   Données ouvertes — job postings .. Statistique Canada : des STATISTIQUES de postes
//                                      vacants (taux, nombres par région), aucune offre
//   Données Québec — « Offres d'emploi » ......... Ville de LAVAL, ses propres postes
//   Données Québec — « … et postulation » ....... Ville de MONTRÉAL, idem
//   Québec emploi / Placement en ligne .......... page HTML (200 + <html>), aucun flux
//
// Il n'existe AUCUN jeu de données provincial d'offres. Les deux jeux nommés « Offres
// d'emploi » étaient la dernière piste ouverte : leur titre promettait exactement ce qu'on
// cherchait, leur ORGANISME a clos la question en une ligne — c'est bien pour ça que le
// résumé rapporte l'organisme et pas seulement le titre.
//
// Ce script reste ici, mais il ne tourne QUE sur demande, jamais dans le cron. La leçon
// dit pourquoi : huit requêtes vouées à l'échec chaque matin, c'est du bruit dans le
// rapport, et surtout l'habitude de voir des sources en erreur — après quoi une vraie
// panne ne se remarque plus. On le relance le jour où l'on a une raison de croire qu'une
// source a bougé, avec la preuve ci-dessus à contredire.
//
// Le seul canal qui produit est le dépôt (`docs/ROUTINE-DEPOT.md`). Ce n'est pas un pis-
// aller faute d'avoir cherché : c'est ce qui reste après avoir mesuré tout le reste.

const DELAI_MS = 20_000;

interface Sonde {
  nom: string;
  url: string;
  /** Ce qu'on espère y trouver — sert à juger la réponse, pas seulement son code. */
  attendu: string;
}

/**
 * Le portail de données ouvertes expose une API CKAN, documentée et publique.
 * `package_show` décrit un jeu de données et ses ressources téléchargeables.
 */
const ID_JEU_GUICHET = "ea639e28-c0fc-48bf-b5dd-b8899bd43072";

const SONDES: readonly Sonde[] = [
  {
    nom: "Données ouvertes — description du jeu Guichet-Emplois",
    url: `https://open.canada.ca/data/api/action/package_show?id=${ID_JEU_GUICHET}`,
    attendu: "la liste des ressources, leur format et leur date",
  },
  {
    nom: "Données ouvertes — recherche « job postings »",
    url: "https://open.canada.ca/data/api/action/package_search?q=job+postings+job+bank&rows=5",
    attendu: "d'autres jeux de données d'offres, au cas où celui-ci serait figé",
  },
  {
    nom: "Guichet-Emplois — API de recherche (sans clé ?)",
    url: "https://www.jobbank.gc.ca/api/jobsearch?searchstring=coordonnateur&locationstring=Quebec",
    attendu: "du JSON d'offres ; un 404 clôt la question",
  },
  {
    nom: "Guichet-Emplois — flux RSS, 6e forme",
    url: "https://www.jobbank.gc.ca/jobsearch/rss/jobsearch?searchstring=coordonnateur&locationstring=Quebec%2C+QC",
    attendu: "du XML ; les 5 formes précédentes ont rendu 404",
  },
  {
    nom: "Emploi-Québec / Placement en ligne",
    url: "https://placement.emploiquebec.gouv.qc.ca/mbe/ut/suivroffrs/apercuoffr.asp",
    attendu: "un point d'entrée exploitable, ou la preuve qu'il n'y en a pas",
  },
  {
    // Demande de Marc (2026-08-05) : « je veux que pour tout tu check si y'a une borne de
    // recharge à moins de 5 min à pied ». Les bornes sont dans OpenStreetMap
    // (`amenity=charging_station`) et s'interrogent par l'API Overpass — gratuite, sans
    // clé, même famille de données que le géocodage qu'on utilise déjà. On MESURE qu'elle
    // répond avant d'en dépendre.
    nom: "Overpass — bornes de recharge autour du centre de Québec",
    url:
      "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(
        '[out:json][timeout:20];node["amenity"="charging_station"](46.79,-71.25,46.83,-71.19);out body 20;',
      ),
    attendu: "des noeuds de bornes avec leurs coordonnées — sinon la fonctionnalité est morte-née",
  },
  {
    nom: "Données Québec — recherche « emploi »",
    url: "https://www.donneesquebec.ca/recherche/api/3/action/package_search?q=offres+emploi&rows=5",
    attendu: "un jeu de données provincial d'offres",
  },
  {
    // La seule piste encore ouverte au 05/08. Deux jeux s'appellent « Offres d'emploi » —
    // reste à savoir DE QUI : une seule ville publie souvent ses propres postes, ce qui
    // serait sans intérêt ici. Il faut voir l'organisme, la fréquence et le format.
    //
    // ⚠️ SURTOUT PAS DE `fl=` : le premier essai portait `fl=title,organization,notes`,
    // croyant DEMANDER ces champs. CKAN le passe à Solr, qui restreint la projection — et
    // `organization` n'y est pas un champ indexé sous ce nom. Résultat : le résumé a
    // affiché « organisme : ? · modifié : ? · formats : aucun » sur les DEUX jeux, et j'ai
    // failli en conclure que la source ne publiait rien. C'était ma requête qui avait
    // effacé la réponse. Une API rend son objet complet par défaut ; on ne l'ampute que si
    // le volume gêne, ce qui n'est pas le cas pour trois lignes.
    nom: "Données Québec — le jeu « Offres d'emploi » en détail",
    url: "https://www.donneesquebec.ca/recherche/api/3/action/package_search?q=title:%22Offres%20d%27emploi%22&rows=3",
    attendu: "l'organisme qui publie, la fréquence de mise à jour et le format",
  },
];

/** Une réponse jugée sur son CONTENU, pas sur son code de statut. */
async function sonder(s: Sonde): Promise<void> {
  console.log(`\n── ${s.nom}`);
  console.log(`   attendu : ${s.attendu}`);
  console.log(`   ${s.url}`);

  try {
    const r = await fetch(s.url, {
      headers: {
        // Se présenter honnêtement : c'est la moindre des choses envers un service public,
        // et beaucoup refusent un appelant anonyme.
        "User-Agent": "JobAI/1.0 (recherche d'emploi personnelle; contact via le dépôt)",
        Accept: "application/json, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(DELAI_MS),
    });

    const type = r.headers.get("content-type") ?? "(non déclaré)";
    console.log(`   → HTTP ${r.status} · ${type}`);
    if (!r.ok) return;

    const texte = await r.text();
    console.log(`   → ${texte.length} caractères`);

    // ⚠️ UN 200 NE PROUVE RIEN — leçon payée par ce projet : « 36 entreprises trouvées »
    // était faux parce que le code prenait un 200 pour une preuve. On regarde donc CE QUE
    // la réponse contient, et on en montre un échantillon à l'œil humain.
    if (type.includes("json")) {
      try {
        const j = JSON.parse(texte) as Record<string, unknown>;
        resumerJson(j);
      } catch {
        console.log("   ⚠️ content-type JSON mais corps illisible");
      }
    } else if (texte.trimStart().startsWith("<")) {
      const titres = [...texte.matchAll(/<title>([^<]{3,120})<\/title>/gi)]
        .slice(0, 4)
        .map((m) => m[1]);
      console.log(`   → balises <title> : ${titres.length === 0 ? "aucune" : ""}`);
      for (const t of titres) console.log(`      · ${t}`);
      if (texte.includes("<html")) console.log("   ⚠️ c'est une PAGE HTML, pas un flux");
    } else {
      console.log(`   → extrait : ${texte.slice(0, 200).replace(/\s+/g, " ")}`);
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.log(`   → ÉCHEC : ${m}`);
  }
}

/** Ce qu'on veut savoir d'une réponse CKAN : y a-t-il des fichiers, et de quand ? */
function resumerJson(j: Record<string, unknown>): void {
  const resultat = j.result as Record<string, unknown> | undefined;
  if (!resultat) {
    console.log(`   → clés : ${Object.keys(j).slice(0, 8).join(", ")}`);
    return;
  }

  const ressources = resultat.resources as
    | { name?: string; format?: string; url?: string; last_modified?: string }[]
    | undefined;

  if (Array.isArray(ressources)) {
    // ⚠️ TRIER PAR NOM, pas prendre la fin du tableau : l'ordre des ressources CKAN n'a
    // aucun rapport avec la chronologie. Une première lecture a montré « mars 2023 » et
    // conclu trop vite que le jeu était figé — c'était l'ordre du tableau, pas la
    // fraîcheur. La date du fichier (`last_modified`) est celle du DÉPÔT, pas celle des
    // offres : c'est le NOM qui porte le mois couvert.
    const parAnnee = [...ressources].sort((a, b) =>
      (b.name ?? "").localeCompare(a.name ?? "", "fr-CA", { numeric: true }),
    );
    const annees = new Set(
      ressources.map((r) => (r.name ?? "").match(/\b(20\d\d)\b/)?.[1] ?? "?"),
    );
    console.log(`   → ${ressources.length} ressource(s) ; années couvertes : ${[...annees].sort().join(", ")}`);
    console.log("   → les 6 premières par ordre alphabétique inverse du nom :");
    for (const res of parAnnee.slice(0, 6)) {
      console.log(
        `      · ${res.format ?? "?"} — ${res.name ?? "(sans nom)"} — ${res.last_modified ?? "date inconnue"}`,
      );
      console.log(`        ${res.url ?? ""}`);
    }
    return;
  }

  const trouves = resultat.results as
    | {
        title?: string;
        name?: string;
        notes?: string;
        organization?: { title?: string };
        metadata_modified?: string;
        resources?: { format?: string; url?: string }[];
      }[]
    | undefined;
  if (Array.isArray(trouves)) {
    console.log(`   → ${resultat.count ?? trouves.length} jeu(x) trouvé(s) ; premiers :`);
    for (const t of trouves.slice(0, 5)) {
      // L'ORGANISME et la FRAÎCHEUR décident de l'intérêt, pas le titre : « Offres
      // d'emploi » publié par une seule municipalité pour ses propres postes n'aiderait
      // en rien une recherche dans toute la région.
      const ressources = t.resources ?? [];
      const formats = [...new Set(ressources.map((r) => r.format).filter(Boolean))];
      console.log(`      · ${t.title ?? t.name}  [${t.name ?? "?"}]`);
      console.log(
        `        organisme : ${t.organization?.title ?? "?"} · modifié : ${t.metadata_modified ?? "?"} · formats : ${formats.join(", ") || "aucun"}`,
      );
      // La description dit souvent ce que le titre cache : « postes offerts à la Ville
      // de X » se lit là, et clôt la question sans télécharger le fichier.
      if (t.notes) console.log(`        « ${t.notes.replace(/\s+/g, " ").slice(0, 220)} »`);
      // L'URL de la ressource : c'est elle qu'il faudrait brancher, donc c'est elle qu'il
      // faut VOIR avant de décider.
      for (const r of ressources.slice(0, 3)) {
        console.log(`        ↳ ${r.format ?? "?"} ${r.url ?? ""}`);
      }
    }
    return;
  }

  console.log(`   → clés du résultat : ${Object.keys(resultat).slice(0, 10).join(", ")}`);
}

async function principal(): Promise<void> {
  console.log("SONDE DES SOURCES OUVERTES — lecture seule, aucune écriture.");
  console.log("Objectif : trouver une source d'offres qui réponde VRAIMENT.\n");

  for (const s of SONDES) await sonder(s);

  console.log("\n──────────────────────────────────────────────");
  console.log("À LIRE À L'ŒIL : un flux VALIDE n'est pas un flux UTILE.");
  console.log("Le RSS d'Espresso-Jobs répondait 200, en XML bien formé, avec 20 entrées —");
  console.log("c'était leur blogue. Vérifier que les titres ressemblent à des OFFRES.");
}

void principal();
