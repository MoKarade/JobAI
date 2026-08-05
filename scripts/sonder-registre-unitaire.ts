// scripts/sonder-registre-unitaire.ts — interroger le registre UNE ENTREPRISE À LA FOIS.
//
//   npx tsx scripts/sonder-registre-unitaire.ts
//
// POURQUOI CE SECOND ANGLE
// Marc, 2026-08-05 : « pour chaque entreprise check avec le registre des entreprises
// aussi ». Le fichier de données ouvertes du REQ est hors d'atteinte depuis la CI —
// Cloudflare refuse l'IP des runners GitHub, mesuré deux fois, Ray ID à l'appui. Mais
// « télécharger tout le registre » et « demander UNE entreprise » sont deux questions
// différentes, et je n'ai mesuré que la première. Celle-ci ouvre la seconde.
//
// ⚠️ CE QU'ON N'A PAS LE DROIT DE FAIRE, ET QU'ON NE FERA PAS
// Le REQ a un moteur de recherche public, en HTML. Le lire au chausse-pied serait du
// moissonnage : interdit par le garde-fou n°4, et de toute façon derrière le même
// Cloudflare. On n'interroge donc QUE des points d'accès publiés comme des API.
//
// LES TROIS PISTES, ET CE QUI LES DISTINGUE
//   1. REGISTRES D'ENTREPRISES DU CANADA (ISED). Le fédéral agrège les registres
//      provinciaux — Québec compris — et publie une recherche. Hôte DIFFÉRENT de celui qui
//      nous bloque, donc l'échec de l'un ne dit rien de l'autre. C'est la piste la plus
//      prometteuse : une requête par entreprise, pas de téléchargement.
//   2. LE DATASTORE DE DONNÉES QUÉBEC. CKAN sait exposer une ressource en SQL
//      (`datastore_search`). Si le jeu du REQ y est chargé, on interroge par nom sans
//      jamais toucher au ZIP. La sonde du 05/08 ne montrait qu'un ZIP et un PDF, mais elle
//      ne posait pas la question au datastore — c'est différent.
//   3. LE REQ LUI-MÊME, au cas où l'accès se serait rouvert depuis. Une seule requête, et
//      on n'insiste pas : c'est déjà ce qui a produit deux refus.
//
// Ce script ne fait que LIRE et rapporter. Aucune base, aucun fichier, aucun secret.

const DELAI_MS = 20_000;

/** Des entreprises RÉELLES du suivi — dont deux qu'OpenStreetMap ne sait pas situer. */
const ENTREPRISES: readonly string[] = ["Laserax", "Robotiq", "Canam Ponts"];

/** L'identifiant du jeu « Registre des entreprises » sur Données Québec. */
const JEU_REQ = "registre-des-entreprises";

async function lire(url: string, quoi: string): Promise<{ statut: number; corps: string }> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "JobAI/1.0 (recherche d'emploi personnelle; contact via le depot)",
        Accept: "application/json, */*",
      },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    const corps = await r.text();
    return { statut: r.status, corps };
  } catch (err) {
    console.log(`   → ÉCHEC ${quoi} : ${err instanceof Error ? err.message : String(err)}`);
    return { statut: 0, corps: "" };
  }
}

/** Un extrait LISIBLE, pour que l'œil tranche — un 200 ne prouve jamais rien seul. */
function extrait(corps: string, n = 300): string {
  return corps.replace(/\s+/g, " ").slice(0, n);
}

async function parIsed(nom: string): Promise<void> {
  // L'API de recherche des Registres d'entreprises du Canada. Documentée et publique ;
  // c'est le fédéral qui agrège les registres provinciaux.
  const url = `https://searchregistries.ised-isde.canada.ca/api/v1/search?query=${encodeURIComponent(nom)}&jurisdiction=qc`;
  const { statut, corps } = await lire(url, "ISED");
  console.log(`   → ISED : HTTP ${statut}`);
  if (statut === 200) console.log(`      ${extrait(corps)}`);
  else if (corps) console.log(`      ${extrait(corps, 160)}`);
}

async function parDatastore(nom: string): Promise<void> {
  // CKAN `datastore_search` : si la ressource est chargée dans le datastore, on interroge
  // par nom SANS jamais toucher au fichier. `q` fait une recherche plein texte.
  const url =
    `https://www.donneesquebec.ca/recherche/api/3/action/datastore_search?` +
    `resource_id=${encodeURIComponent(JEU_REQ)}&q=${encodeURIComponent(nom)}&limit=3`;
  const { statut, corps } = await lire(url, "datastore");
  console.log(`   → Données Québec datastore : HTTP ${statut}`);
  console.log(`      ${extrait(corps, 220)}`);
}

async function principal(): Promise<void> {
  console.log("SONDE — INTERROGER LE REGISTRE UNE ENTREPRISE À LA FOIS.");
  console.log("Le fichier en bloc est refusé par Cloudflare depuis la CI (mesuré 2×).");
  console.log("Question DIFFÉRENTE : peut-on demander UNE entreprise ?\n");

  for (const nom of ENTREPRISES) {
    console.log(`── ${nom}`);
    await parIsed(nom);
    // Une seconde entre deux services publics : la leçon du jour, payée deux fois.
    await new Promise((r) => setTimeout(r, 1200));
    await parDatastore(nom);
    await new Promise((r) => setTimeout(r, 1200));
    console.log();
  }

  console.log("── Le REQ lui-même, UNE requête, pour voir si l'accès s'est rouvert");
  const { statut, corps } = await lire(
    "https://www.registreentreprises.gouv.qc.ca/RQAnonymeGR/GR/GR03/GR03A2_22A_PIU_RecupDonnPub_PC/FichierDonneesOuvertes.aspx",
    "REQ",
  );
  console.log(`   → HTTP ${statut} — ${corps.startsWith("PK") ? "ARCHIVE" : extrait(corps, 200)}`);

  console.log("\n──────────────────────────────────────────────");
  console.log("À LIRE À L'ŒIL : un 200 ne prouve rien. Ce qui compte est de voir un NOM");
  console.log("d'entreprise ET une ADRESSE dans la réponse — sinon le point d'accès existe");
  console.log("mais ne répond pas à notre question.");
}

void principal();

// `export {}` : sans lui, TypeScript traite ce fichier comme un script à portée GLOBALE et
// ses noms de premier niveau entrent en collision avec ceux des autres sondes.
export {};
