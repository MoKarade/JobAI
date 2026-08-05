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
// LES DEUX PISTES QUI RESTENT
//   1. LE DATASTORE DE DONNÉES QUÉBEC. CKAN sait exposer une ressource en SQL
//      (`datastore_search`) : si la ressource du registre y est chargée, on interroge par
//      NOM, une entreprise à la fois, sans jamais toucher au fichier. C'est exactement ce
//      que Marc demande. Hôte différent de celui qui nous bloque, et il a déjà répondu
//      aujourd'hui — l'échec du REQ ne dit rien de lui.
//   2. LE REQ LUI-MÊME, au cas où l'accès se serait rouvert. Une seule requête, et on
//      n'insiste pas : deux refus suffisent.
//
// (Une troisième piste — une API fédérale agrégeant les registres provinciaux — a été
// écrite puis RETIRÉE : je l'avais inventée. Voir plus bas.)
//
// Ce script ne fait que LIRE et rapporter. Aucune base, aucun fichier, aucun secret.

const DELAI_MS = 20_000;

/** Des entreprises RÉELLES du suivi — dont deux qu'OpenStreetMap ne sait pas situer. */
const ENTREPRISES: readonly string[] = ["Laserax", "Robotiq", "Canam Ponts"];

/**
 * L'UUID de la RESSOURCE du registre sur Données Québec.
 *
 * ⚠️ CE N'EST PAS LE SLUG DU JEU, ET C'EST LA CORRECTION D'UNE ERREUR DE MA PART.
 * Le premier essai passait « registre-des-entreprises » — le nom du JEU de données — là où
 * CKAN attend l'identifiant d'une RESSOURCE. Réponse : « Resource "registre-des-entreprises"
 * was not found ». J'ai failli lire ça comme « le registre n'est pas dans le datastore »,
 * alors que ça disait seulement « ce n'est pas un identifiant de ressource ». Troisième
 * fois aujourd'hui qu'une requête malformée de ma part se fait passer pour un verdict sur
 * la source ; l'UUID vient de la page publique de la ressource.
 */
const RESSOURCE_REQ = "eac1b5f1-d8c0-4690-9c51-316d44ed9d94";

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

// ⚠️ LA SONDE ISED A ÉTÉ RETIRÉE, ET IL FAUT DIRE POURQUOI.
//
// J'avais écrit `searchregistries.ised-isde.canada.ca/api/v1/search?...` en la présentant
// comme « documentée et publique ». Je l'avais INVENTÉE : elle a rendu `fetch failed`,
// HTTP 0 — l'hôte ne répond pas à cette adresse. Une URL fabriquée qui échoue ne mesure
// rien du tout, et la garder ici ferait croire que la piste fédérale a été testée. Si on
// veut l'explorer un jour, il faudra d'abord TROUVER sa documentation, pas la deviner.

async function parDatastore(nom: string): Promise<void> {
  // CKAN `datastore_search` : la ressource EST chargée dans le datastore (mesuré le 05/08,
  // HTTP 200 + success:true). On interroge par nom, sans jamais toucher au fichier.
  const url =
    `https://www.donneesquebec.ca/recherche/api/3/action/datastore_search?` +
    `resource_id=${encodeURIComponent(RESSOURCE_REQ)}&q=${encodeURIComponent(nom)}&limit=3`;
  const { statut, corps } = await lire(url, "datastore");
  console.log(`   → Données Québec datastore : HTTP ${statut}`);
  if (statut !== 200) {
    console.log(`      ${extrait(corps, 200)}`);
    return;
  }

  // ⚠️ UN 200 NE PROUVE RIEN — c'est écrit au bas de ce fichier, et le premier essai est
  // tombé dans le piège : l'extrait tronqué à 220 caractères montrait « success: true »
  // sans montrer un seul ENREGISTREMENT. « L'API accepte ma question » et « l'API répond à
  // ma question » sont deux choses différentes. On regarde donc le CONTENU.
  try {
    const j = JSON.parse(corps) as {
      result?: { total?: number; records?: Record<string, unknown>[] };
    };
    const total = j.result?.total ?? 0;
    const recs = j.result?.records ?? [];
    console.log(`      total=${total} · ${recs.length} enregistrement(s) rendus`);
    if (recs.length === 0) {
      console.log("      → le datastore répond, mais ne connaît pas ce nom.");
      return;
    }
    // Les NOMS DE CHAMPS d'abord : ce sont eux qui disent si une adresse est disponible.
    console.log(`      champs : ${Object.keys(recs[0] ?? {}).join(", ")}`);
    for (const r of recs.slice(0, 2)) {
      console.log(`      · ${JSON.stringify(r).slice(0, 500)}`);
    }
  } catch {
    console.log("      ⚠️ corps illisible malgré un 200");
  }
}

async function principal(): Promise<void> {
  console.log("SONDE — INTERROGER LE REGISTRE UNE ENTREPRISE À LA FOIS.");
  console.log("Le fichier en bloc est refusé par Cloudflare depuis la CI (mesuré 2×).");
  console.log("Question DIFFÉRENTE : peut-on demander UNE entreprise ?\n");

  for (const nom of ENTREPRISES) {
    console.log(`── ${nom}`);
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
