// app/api/mcp/route.ts — le point d'entrée du connecteur MCP.
//
// ⚠️ GARDÉE AUTREMENT, PAS OUVERTE. Comme l'endpoint du hub et le point de dépôt : la garde
// de session lui renverrait une redirection HTML au lieu du JSON attendu, et un client MCP
// n'a pas de session Google. Elle porte donc sa propre authentification, en ÉCHEC FERMÉ —
// secret absent : 503 ; jeton faux : 401 ; comparaison en temps constant.
//
// ⚠️ `MCP_TOKEN` A ÉTÉ RETIRÉ EN MÊME TEMPS QU'OAUTH EST ARRIVÉ, comme promis au lot 2. Un
// second chemin d'entrée sur la même surface d'écriture, gardé par un secret partagé et
// laissé « au cas où », est exactement le genre de porte qu'on oublie de refermer. Il n'y a
// donc qu'une façon d'entrer : un jeton d'accès délivré par `/oauth/token`.
//
// ⚠️ L'APPARTENANCE SE VÉRIFIE ICI, À CHAQUE APPEL — pas seulement au moment où le jeton a
// été délivré. Un contrôle posé à l'émission laisse vivre les jetons déjà émis : vécu sur
// FinanceAI avec un cookie d'un an qui a survécu au verrou censé le fermer. Si
// `AUTHORIZED_EMAIL` change, les jetons en circulation cessent de valoir quelque chose au
// prochain appel.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { offers, syncState } from "@/lib/db/schema";
import { lireOffres } from "@/lib/donnees";
import { BUDGET_MS_MCP, diagnostiquerFlux } from "@/lib/ingest/diagnosticFlux";
import { mesurerBase, sonderEmployeurs } from "@/lib/ingest/sondeEmployeurs";
import { compterRegistre, lireClesRegistre } from "@/lib/registreBase";
import { creerServeur } from "@/lib/mcp/serveur";
import { lireEtat, lireEtatBrut } from "@/lib/etat";
import { CLE_COUT_LLM, relireCompteur } from "@/lib/coutLlm";
import { CLE_RESUME_DISTANCES } from "@/lib/resumePasse";
import { CLE_JOURNAL } from "@/lib/veilleComplete";
import type { JournalVeille } from "@/lib/veille";
import { empreinte, estProprietaire } from "@/lib/mcp/oauth";
import { origineDe } from "@/lib/mcp/origine";
import { lireJetonValide } from "@/lib/oauthStore";
import { classerPanne } from "@/lib/panne";
import { lireContenuPourAnalyse, listerCvs, majExtraction, profilActif, propositionDe } from "@/lib/cv/depot";
import { extraireTexte } from "@/lib/cv/texte";
import { extraireFaits } from "@/lib/cv/extraction";
import { resumeDesRefus } from "@/lib/competences";
import { lireMetiers } from "@/lib/actionsMetiers";
import { aujourdhui } from "@/lib/ajout";
import { CHAMPS_UTILISATEUR, type Offre } from "@/lib/types";
import { lireAnnonce } from "@/lib/lectureAnnonceLlm";
import { garderLecture, lireLectures } from "@/lib/lectureAnnonceStore";
import { enregistrerUsageLlm } from "@/lib/coutLlmStore";
import { enFileSerie } from "@/lib/serie";
import { configGmail } from "@/lib/gmail/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Le compteur de coût se met à jour par lecture-modification-écriture : les lectures d'un lot partent de front, mais leurs
 * relevés s'écrivent UN À LA FOIS (`lib/serie.ts`), sinon un appel facturé disparaîtrait du cumul.
 */
const comptabiliserEnSerie = enFileSerie(async (usage: unknown, modele: string) => enregistrerUsageLlm(usage, modele));

/** Le jeton porté par l'en-tête `Authorization`, ou `null`. */
function jetonPorteur(requete: Request): string | null {
  const entete = requete.headers.get("authorization") ?? "";
  if (!entete.toLowerCase().startsWith("bearer ")) return null;
  const valeur = entete.slice(7).trim();
  return valeur === "" ? null : valeur;
}

/**
 * Un 401 qui DIT où aller se connecter (RFC 9728).
 *
 * Sans l'en-tête `WWW-Authenticate`, un 401 est un mur : le client ne sait pas qu'il existe
 * un serveur d'autorisation ni où le trouver, et claude.ai abandonne sans proposer de
 * connexion. Avec lui, le refus devient une invitation.
 *
 * ⚠️ TOUS LES REFUS RENDENT LA MÊME CHOSE — jeton absent, invalide, expiré ou compte non
 * autorisé. Distinguer ces cas dans la réponse en ferait un oracle : on saurait qu'un jeton
 * a existé, ou qu'une adresse est la bonne. Le motif reste dans le corps pour Marc, jamais
 * dans le code de statut ni dans l'en-tête.
 */
function defi(requete: Request, motif: string): Response {
  const metadonnees = `${origineDe(requete)}/.well-known/oauth-protected-resource`;
  return new Response(JSON.stringify({ ok: false, erreur: motif }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer resource_metadata="${metadonnees}"`,
    },
  });
}

function refus(statut: number, erreur: string): Response {
  return new Response(JSON.stringify({ ok: false, erreur }), {
    status: statut,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Écrit UNIQUEMENT les champs qui appartiennent à Marc.
 *
 * ⚠️ PAS TOUTE LA LIGNE, ET C'EST LA CONDITION N°2 DE L'ADR-0011. `preparerEcriture` a déjà
 * fait passer la demande par `appliquerModification`, donc seuls ces champs ont pu bouger —
 * mais écrire la ligne entière donnerait quand même à ce chemin le POUVOIR d'écraser un
 * score ou une péremption le jour où quelqu'un modifierait la règle en amont. On écrit ce
 * qu'on a le droit d'écrire, pas ce qui se trouve dans l'objet.
 */
async function enregistrer(offre: Offre): Promise<void> {
  const champs = Object.fromEntries(CHAMPS_UTILISATEUR.map((c) => [c, offre[c]]));
  await db
    .update(offers)
    .set({ ...champs, majLe: new Date() })
    .where(eq(offers.id, offre.id));
}

export async function POST(requete: Request): Promise<Response> {
  const porteur = jetonPorteur(requete);
  if (porteur === null) return defi(requete, "jeton absent");

  let jeton: Awaited<ReturnType<typeof lireJetonValide>>;
  try {
    jeton = await lireJetonValide(empreinte(porteur), "acces", new Date());
  } catch (err) {
    // ⚠️ UNE PANNE N'EST PAS UN REFUS. Rendre 401 ici ferait croire au client que son jeton
    // est mauvais — il le jetterait et redemanderait une connexion, en boucle, pendant que
    // le vrai problème est ailleurs. Un 503 nommé se distingue, et se corrige.
    const panne = classerPanne(err);
    console.error("[api/mcp] lecture du jeton impossible", { panne, err });
    return refus(
      503,
      panne === "schema-absent"
        ? "schéma du connecteur pas encore appliqué ; réessaie dans un instant"
        : "la base n'a pas répondu",
    );
  }
  if (jeton === null) return defi(requete, "jeton invalide ou expiré");

  // Échec fermé : sans `AUTHORIZED_EMAIL`, `estProprietaire` rend faux et on refuse. On ne
  // laisse pas passer « faute de règle » — une variable peut disparaître d'un déploiement à
  // l'autre, et ce jour-là l'app doit se taire, pas s'ouvrir.
  if (!estProprietaire(jeton.sujet, process.env.AUTHORIZED_EMAIL ?? "")) {
    return defi(requete, "compte non autorisé");
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Sans état : chaque requête est autonome. Une fonction serverless ne garde rien entre
    // deux invocations, et un identifiant de session y survivrait le temps d'une instance —
    // donc parfois, ce qui est pire qu'un « jamais » assumé.
    sessionIdGenerator: undefined,
    // Réponses JSON plutôt qu'un flux SSE : un flux ouvert sur une fonction serverless est
    // facturé jusqu'à son mur de temps et se ferme sans prévenir.
    enableJsonResponse: true,
  });

  const serveur = creerServeur({
    lireOffres,
    enregistrer,
    // ⚠️ Le fuseau de Marc, jamais UTC : Vercel tourne en UTC et Marc vit à UTC−4, donc un
    // CV marqué envoyé après 20 h locale daterait du lendemain.
    aujourdhui: () => aujourdhui(new Date()),
    // ⚠️ LE `fetch` VERS LE GUICHET RESTE DANS `lib/ingest/` — garde-fou n°4, qui nomme ce
    // dossier comme le seul autorisé à contacter une source d'offres. Le budget est celui du
    // MUR de CETTE route (60 s), pas celui de la route HTTP de diagnostic qui en a 300 : un
    // budget plus long que le mur ne bornerait rien, et l'appel serait coupé par le dehors
    // sans rendre le `fin` qui dit si la lecture était complète.
    diagnostiquerFlux: () => diagnostiquerFlux(fetch, BUDGET_MS_MCP),
    // ⚠️ MÊME RÈGLE : le `fetch` vers les registres reste dans `lib/ingest/`, et le budget de la
    // sonde (45 s) tient sous le mur de 60 s de cette route.
    sonderEmployeurs: async () => {
      const offres = await lireOffres();
      if (offres === null) return null;
      // Le registre déjà en base d'abord (rapide), puis les sources en ligne (budget de 45 s).
      const base = await mesurerBase(offres, lireClesRegistre);
      const lignes = await compterRegistre().catch(() => null);
      return { base: { ...base, lignesEnBase: lignes }, ...(await sonderEmployeurs(offres, fetch)) };
    },
    // ⚠️ DÉGRADE, NE LÈVE PAS. Le journal sert à NUANCER le résumé ; s'il est illisible, le
    // suivi doit rester lisible — avec un bloc `veille` qui dit zéro confirmée, ce qui est
    // vrai de ce qu'on sait, plutôt qu'une panne sur toute la lecture.
    lireJournal: () =>
      lireEtat<JournalVeille>(CLE_JOURNAL, {}).catch((err) => {
        console.error("[mcp] journal de veille illisible", err);
        return {} as JournalVeille;
      }),
    // ⚠️ `cle`/`majLe` SEULEMENT — jamais `valeur` (`[OBS-01]`). Certaines lignes portent un
    // JSON de plusieurs dizaines de milliers de caractères ; ce diagnostic sert à dater un
    // passage, pas à le relire.
    lireConfigGmail: () => {
      const cfg = configGmail();
      return cfg.ok ? { configure: true, manquantes: [] } : { configure: false, manquantes: cfg.manquantes };
    },
    lireEtatSynchro: () =>
      db
        .select({ cle: syncState.cle, majLe: syncState.majLe })
        .from(syncState)
        .catch((err) => {
          console.error("[api/mcp] lecture de sync_state impossible", err);
          return null;
        }),
    // ⚠️ LA SEULE VALEUR DE `sync_state` QUI SORT (`[OBS-02]`) : le serveur la fait passer par
    // `lireResume` (liste blanche de compteurs) avant de la rendre. Une panne de lecture rend
    // `null` et NON `{ brut: null }` : « la base n'a pas répondu » ≠ « aucune passe terminée ».
    lireResumeDistances: () =>
      lireEtatBrut(CLE_RESUME_DISTANCES).then(
        (brut) => ({ brut }),
        (err) => {
          console.error("[api/mcp] lecture du résumé de passe impossible", err);
          return null;
        },
      ),
    // ⚠️ LE PROFIL ACTIF OU RIEN. `profilActif` lève sur un profil illisible, et un diagnostic
    // qui retomberait sur le profil par défaut mesurerait un barème que Marc n'a pas : on
    // rend `null`, le serveur le dit.
    lireBareme: async () => {
      try {
        const [profil, metiers] = await Promise.all([profilActif(), lireMetiers()]);
        return { profil, metiers };
      } catch (err) {
        console.error("[api/mcp] lecture du barème impossible", err);
        return null;
      }
    },
    lirePreuvesProfil: async () => {
      try {
        const [profil, cvs] = await Promise.all([profilActif(), listerCvs()]);
        if (cvs === null) return null;
        const cvPropose = cvs.find((c) => c.aUneProposition && !c.actif);
        const proposition = cvPropose ? await propositionDe(cvPropose.id) : null;
        return { profil, proposition };
      } catch (err) {
        console.error("[api/mcp] lecture des preuves impossible", err);
        return null;
      }
    },
    // ⚠️ LECTURE BRUTE PUIS `relireCompteur`, comme `lireCoutPublie` : un JSON corrompu se rend `illisible` (et le bloc
    // `usage` le dit), jamais « aucun appel ». Rien n'est écrit. Une panne de lecture rend `null`, pas un compteur vide.
    lireCompteurUsage: () =>
      lireEtatBrut(CLE_COUT_LLM).then(
        (brut) => relireCompteur(brut),
        (err) => {
          console.error("[api/mcp] lecture du compteur d'usage impossible", err);
          return null;
        },
      ),
    listerCvs: async () => {
      try {
        return await listerCvs();
      } catch (err) {
        console.error("[api/mcp] lecture des CVs impossible", err);
        return null;
      }
    },
    lireLecturesGardees: lireLectures,
    lireUneAnnonce: (offre, profil) => lireAnnonce(offre, profil, { comptabiliser: comptabiliserEnSerie }),
    garderLecture,
    reanalyserCv: async (id: number) => {
      const stocke = await lireContenuPourAnalyse(id);
      if (!stocke) return { ok: false, erreur: "CV introuvable." };

      let texte = stocke.texte;
      if (!texte) {
        const lecture = await extraireTexte(new Uint8Array(Buffer.from(stocke.contenu, "base64")));
        if (!lecture.ok) return { ok: false, erreur: lecture.raison };
        texte = lecture.texte;
      }

      const faits = await extraireFaits(texte);
      await majExtraction(id, {
        texte,
        extraction: faits.ok ? faits.brut : null,
        erreur: faits.ok ? null : faits.raison,
      });

      return faits.ok
        ? { ok: true, message: `Analyse refaite.${resumeDesRefus(faits.competencesRejetees)}` }
        : { ok: false, erreur: faits.raison };
    },
  });

  await serveur.connect(transport);
  try {
    return await transport.handleRequest(requete);
  } finally {
    // Rien ne survit à la requête : sans cette fermeture, chaque invocation laisserait un
    // serveur et son transport attachés l'un à l'autre dans l'instance recyclée.
    await transport.close().catch(() => undefined);
  }
}

/**
 * Le protocole permet à un client d'ouvrir un flux d'événements par `GET`.
 *
 * On ne le sert pas : sans état, il n'y a rien à y pousser, et un flux ouvert sur une
 * fonction serverless coûte son mur de temps pour ne rien transporter. Un 405 explicite vaut
 * mieux qu'une connexion qui pend jusqu'au délai.
 */
export function GET(): Response {
  return refus(405, "flux d'événements non servi : ce connecteur est sans état");
}
