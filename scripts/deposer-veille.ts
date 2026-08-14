// scripts/deposer-veille.ts — dépose le lot de la veille du jour dans l'app.
//
// POURQUOI CE SCRIPT VIT ICI, ET PAS DANS UN /tmp
// Il DOIT importer `expurgerLot` du code de production (`lib/ingest/expurger.ts`). Une copie
// de la logique d'expurgation ailleurs serait une seconde implémentation de la même règle —
// et la leçon est écrite en §7 : « deux implémentations d'une règle, c'est une règle et
// demie », c'est toujours la moins relue qui garde la version permissive. Un script hors du
// dépôt ne peut pas importer ce module : il vivrait donc avec sa propre expurgation.
//
// CE QU'IL FAIT, DANS CET ORDRE
//   1. expurge les descriptions avec le VRAI code de production ;
//   2. valide le lot contre le VRAI schéma (`LotDeposeSchema`) — un lot hors contrat
//      échoue ICI, pas au bout du réseau, et le message dit quel champ ;
//   3. POST vers le point de dépôt.
//
// L'ORDRE N'EST PAS ARBITRAIRE : expurger APRÈS avoir validé laisserait passer une
// description non nettoyée si la validation échouait à mi-parcours.
//
// ⚠️ `expurgerLot` prend le TABLEAU d'offres, jamais l'enveloppe du lot.
//
// NOTE SUR LES DESCRIPTIONS : elles sont recopiées des annonces telles que le connecteur les
// rend. Les listes d'avantages en fin d'annonce (assurances, stationnement, tenue) ont été
// omises : elles sont identiques d'un employeur à l'autre et ne portent aucun signal pour la
// notation. Le corps du poste — missions et exigences — est intégral.

import { writeFile } from "node:fs/promises";
import { LotDeposeSchema } from "../lib/ingest/depotSchema";
import { expurgerLot } from "../lib/ingest/expurger";

const JOUR = "2026-08-14";
const POINT_DE_DEPOT = "https://emploi.hubperso.com/api/ingest/depot";

/** Offres lues EN ENTIER (connecteur Indeed, `get_job_details`). */
const LUES = [
  {
    titre: "Chargé(e) de projets",
    entreprise: "Laserax",
    ville: "Québec",
    lien: "https://to.indeed.com/aamfyzhrc9l8",
    publieeLe: "2026-05-22",
    refSource: "indeed:JOBSEARCH_954",
    description: `Laserax cherche son(sa) prochain(e) chargé(e) de projet. À notre siège social de Québec, tu auras les deux mains dans la réalisation de projets de grande envergure avec nos clients internationaux. Sous la responsabilité du directeur des opérations, tu agiras à titre d'agent de liaison entre Laserax et ses clients tout en faisant preuve de leadership au quotidien.

Participe à la définition des projets dès la soumission en plus de suivre la progression du projet jusqu'à son installation ; coordonne et planifies le projet afin d'assurer la livraison dans les délais tout en respectant les budgets alloués ; participe aux réunions de suivi de projets ; participe à la rédaction de documents dans le cadre de la gestion de projets technologiques ; gère et contrôle les coûts des projets et des produits ; négocie les révisions, les changements et les ajouts avec les clients, sous-traitants et fournisseurs ; passe en revue et coordonne le flux d'information interne avec les parties prenantes et les clients.

Ce qu'on recherche : BAC en génie ou toute autre formation et/ou expérience jugée pertinente ; bilinguisme (anglais et français) ; minimum de 5 années d'expérience pertinentes ; expérience de travail dans un contexte de développement de produit ; capacité de respecter les échéanciers ; aptitude en négociation ; certification PMP (atout).

Rémunération : 52 260,55 $ à 120 727,28 $ par an. Lieu du poste : en présentiel.`,
  },
  {
    titre: "Spécialiste automatisation",
    entreprise: "Laserax",
    ville: "Québec",
    lien: "https://to.indeed.com/aajmvnlqx7nf",
    publieeLe: "2026-04-02",
    refSource: "indeed:JOBSEARCH_958",
    description: `Laserax est à la recherche de son ou sa prochain·e Spécialiste en automatisation. Basé·e à notre siège social de Québec, tu participeras activement au développement de systèmes industriels à la fine pointe. Tu mettras à profit ton expertise en automatisation en collaborant avec une équipe multidisciplinaire pour concevoir des solutions laser industrielles innovantes.

Participe au développement de nouvelles solutions laser industrielles ; effectue la programmation PLC, principalement avec l'environnement Codesys ; développe des interfaces opérateurs (HMI) ; participe à l'élaboration de protocoles de test ; soutiens les équipes à l'intégration des produits développés ; participe au maintien et aux améliorations de l'offre de produits ; participe à l'élaboration et à la tenue de formations.

Ce qu'on recherche : diplôme technique ou universitaire en automatisation ou domaine connexe ; plus de 2 ans d'expérience pertinente ; maîtrise de plusieurs environnements de programmation (Codesys, Allen Bradley, Siemens) ; connaissances en électricité et capacité à lire des schémas électriques ; expérience dans le secteur manufacturier (atout).

Rémunération : à partir de 65 000,00 $ par an. Lieu du poste : en présentiel.`,
  },
  {
    titre: "Chargé(e) de projets en automatisation",
    entreprise: "LM 1947",
    ville: "Québec",
    lien: "https://to.indeed.com/aadngnxfkn8s",
    publieeLe: "2026-07-07",
    refSource: "indeed:JOBSEARCH_962",
    description: `Spécialisée dans la distribution, la vente, la location et la réparation de machines rotatives et de leurs systèmes de commande, LM 1947 est une entreprise québécoise reconnue pour son expertise. Notre division Maritime est spécialisée dans la fabrication sur mesure de systèmes électriques, de panneaux électriques, de systèmes d'alarme et d'automatisation.

Gestion de projets et relation client : proposer des solutions techniques adaptées aux besoins des clients ; effectuer la gestion de projets en relation avec les clients de la division maritime ; rédiger et présenter des propositions techniques ; rédiger les propositions budgétaires ; assurer la coordination et le suivi des travaux avec les contracteurs, professionnels, fournisseurs et sous-traitants.

Suivi technique des projets : participer à l'exécution des projets (programmation, conception électrique, plan, mise en service) ; assurer le respect de la qualité et de la conformité ; effectuer des visites sur le terrain ; rédiger et coordonner les documents de fin de projets. Suivi administratif : suivi des coûts, validation des factures et facturation.

Profil : diplôme d'étude collégial en génie électrique ou tout autre diplôme pertinent ; minimum 5 ans d'expérience dans la gestion de projet dans le domaine électrique ; connaissance du logiciel Siemens TIA Portal (un atout) ; aisance à l'informatique (Suite Office, SharePoint, Autodesk AutoCAD). Horaire flexible 40 h/semaine, télétravail partiel.`,
  },
  {
    titre: "Chargé de projets internes (technique)",
    entreprise: "Systèmes Stekar inc.",
    ville: "Lévis",
    lien: "https://to.indeed.com/aamv9lsvvctr",
    publieeLe: "2026-06-11",
    refSource: "indeed:JOBSEARCH_949",
    description: `Située à Beauceville et Lévis, Systèmes Stekar est une entreprise reconnue qui se spécialise dans la fabrication et l'installation de systèmes architecturaux pour façades d'édifices. Équipe de plus de 130 personnes.

En tant que chargé(e) de projets interne (technique), vous êtes l'interface clé entre les équipes projets, les achats et les opérations. Vous validez la conformité des documents techniques, participez à la conception et au suivi complet des projets, de la planification à la livraison.

Principales responsabilités : analyser et valider les documents techniques du projet (plans, devis, fiches techniques) ; coordonner la conception technique avec les équipes internes (dessin, ingénierie, projets) ; planifier et animer les réunions techniques ; définir les besoins en matériel pour la fabrication et le chantier ; assurer le suivi technique en production ; gérer les coûts et la facturation des projets ; coordonner les communications et livrables.

Compétences requises : formation en architecture ; expérience de 5 à 10 ans dans un rôle technique en gestion de projets (idéalement enveloppe du bâtiment) ; excellente compréhension des documents techniques ; solide connaissance des processus de fabrication en usine et d'installation sur chantier ; maîtrise des outils de gestion de projets et de coûts.

Rémunération : à partir de 60 000,00 $ par an. Lieu du poste : télétravail hybride à Lévis.`,
  },
  {
    titre: "Ingénieur(e) développement de produit",
    entreprise: "Base Camp Connect",
    ville: "Lévis",
    lien: "https://to.indeed.com/aac7t6hpsj9g",
    publieeLe: "2026-08-14",
    refSource: "indeed:JOBSEARCH_969",
    description: `Depuis près de 15 ans, notre mission est claire : transformer les communications pour protéger les vies humaines. Nous concevons et fabriquons localement des solutions de communication tactiques et stratégiques pour la Défense et les forces spéciales de police.

Tu contribueras directement à l'évolution de nos produits en transformant des besoins opérationnels complexes en solutions fiables, innovantes et manufacturables. Tu travailleras au sein d'une équipe multidisciplinaire et participeras activement à la conception, au prototypage, à l'intégration, aux essais et à l'amélioration continue des produits.

Responsabilités : concevoir et développer des solutions techniques répondant aux exigences fonctionnelles et opérationnelles ; participer à la conception et à l'intégration des composantes électroniques, mécaniques et électromécaniques ; développer, assembler et évaluer des prototypes ; planifier et réaliser les essais ; collaborer avec les équipes produit, expérience client et fabrication pour assurer la transition vers la production.

Profil : environ 3-5 ans d'expérience en développement de produits, conception matérielle ou R-D ; baccalauréat en génie électrique, mécatronique, robotique ou domaine connexe ; expérience en conception de produits électroniques, mécaniques ou mécatroniques ; à l'aise avec le prototypage, les essais et la validation. Un plus : systèmes embarqués, normes de certification et de conformité, environnement Agile.

Horaire flexible de 40 h/semaine. Lieu du poste : en présentiel.`,
  },
];

/**
 * Offres repérées mais NON LUES — elles entrent sans description.
 *
 * ⚠️ ET ÇA SE PAIE : sans description, la notation n'a que le titre pour discriminer, et le
 * barème accorde ses points d'inconnue à tout le monde pareil (mesuré : un poste hors sujet
 * part déjà à 40). Elles sont déposées quand même parce qu'une offre RÉELLE et ouverte vaut
 * mieux qu'un trou dans la carte — mais leur note n'est PAS un jugement, c'est un défaut de
 * lecture. Le plafond de lecture d'aujourd'hui est dit dans le rapport, jamais tu.
 */
const NON_LUES = [
  // — Indeed (le lieu de la recherche est sans effet sur ce connecteur : mesuré, même
  //   contenu pour « Québec » et « Lévis » ; c'est le TERME qui discrimine.)
  { titre: "directeur ingénierie", entreprise: "Randstad", ville: "Lévis", lien: "https://to.indeed.com/aah6j4nj9xz7", publieeLe: "2026-08-07", refSource: "indeed:JOBSEARCH_941" },
  { titre: "Chargé de projets", entreprise: "Eddy Fugère inc.", ville: "Québec", lien: "https://to.indeed.com/aaw74qpwmhlj", publieeLe: "2026-08-13", refSource: "indeed:JOBSEARCH_946" },
  { titre: "Estimateur(trice) / Chargé(e) de projet", entreprise: "Système E Inc.", ville: "Québec", lien: "https://to.indeed.com/aafrwlmzqf2n", publieeLe: "2026-08-13", refSource: "indeed:JOBSEARCH_947" },
  { titre: "Chargé de projets en usine", entreprise: "Gabriel Miller Inc.", ville: "Québec", lien: "https://to.indeed.com/aawmybzxy92z", publieeLe: "2026-08-13", refSource: "indeed:JOBSEARCH_952" },
  { titre: "Chargé(e) de projets", entreprise: "SIRIUS CONSEILS", ville: "Québec", lien: "https://to.indeed.com/aas6dd2btxgf", publieeLe: "2026-08-10", refSource: "indeed:JOBSEARCH_951" },
  { titre: "Chargé(e) de projets", entreprise: "Urbanex Construction inc.", ville: "Québec", lien: "https://to.indeed.com/aa7f6vkskgkt", publieeLe: "2026-07-16", refSource: "indeed:JOBSEARCH_948" },
  { titre: "Chargé de projets ingénierie - volet automatisation", entreprise: "Leclerc Foods", ville: "Saint-Augustin-de-Desmaures", lien: "https://to.indeed.com/aaykd8kqgmgp", publieeLe: "2026-04-07", refSource: "indeed:JOBSEARCH_956" },
  { titre: "Superviseur du service technique", entreprise: "IEL Technologie agricole", ville: "Saint-Anselme", lien: "https://to.indeed.com/aabp6f994t4h", publieeLe: "2026-08-11", refSource: "indeed:JOBSEARCH_961" },
  { titre: "Expert technique", entreprise: "AMETEK", ville: "Lévis", lien: "https://to.indeed.com/aabfk4qxjmsz", publieeLe: "2026-04-21", refSource: "indeed:JOBSEARCH_968" },
  { titre: "Dessinateur - électrique", entreprise: "Franklin Empire", ville: "Québec", lien: "https://to.indeed.com/aawrb2wxvj6b", publieeLe: "2026-07-24", refSource: "indeed:JOBSEARCH_940" },
  { titre: "Développeur logiciel", entreprise: "Eddyfi Technologies", ville: "Québec", lien: "https://to.indeed.com/aav2fypzxhld", publieeLe: "2026-07-27", refSource: "indeed:JOBSEARCH_970" },
  { titre: "Superviseur(e) de production", entreprise: "Taveo", ville: "Lévis", lien: "https://to.indeed.com/aajgbpymyw8k", publieeLe: "2026-07-27", refSource: "indeed:JOBSEARCH_978" },
  { titre: "Superviseur(e) de production", entreprise: "Recrutement Harmonie", ville: "Québec", lien: "https://to.indeed.com/aaxy42p9fgbt", publieeLe: "2026-08-05", refSource: "indeed:JOBSEARCH_971" },
  { titre: "Contremaître de production, jour", entreprise: "Groupe RP", ville: "Québec", lien: "https://to.indeed.com/aagnkxw7hvfm", publieeLe: "2026-08-06", refSource: "indeed:JOBSEARCH_973" },
  { titre: "Superviseur(e) de production", entreprise: "SBI - Fabricant de poêles international inc.", ville: "Saint-Augustin-de-Desmaures", lien: "https://to.indeed.com/aakdyzwmppdh", publieeLe: "2026-08-12", refSource: "indeed:JOBSEARCH_974" },
  { titre: "Gestionnaire maintenance", entreprise: "duBreton inc.", ville: "Saint-Charles-de-Bellechasse", lien: "https://to.indeed.com/aamyvl7rd6md", publieeLe: "2026-02-25", refSource: "indeed:JOBSEARCH_959" },
  { titre: "Superviseur de production", entreprise: "Groupe Novatech Inc.", ville: "Saint-Apollinaire", lien: "https://to.indeed.com/aa7zqz76jn9v", publieeLe: "2026-03-02", refSource: "indeed:JOBSEARCH_972" },

  // — ZipRecruiter. ⚠️ Ce connecteur ne rend NI description NI adresse, et il n'expose
  //   AUCUN équivalent de `get_job_details` : ces offres ne peuvent pas être lues, ce n'est
  //   pas un plafond que je me suis donné. Son `lien` est un jeton de redirection forgé PAR
  //   RECHERCHE — il pourrira. C'est le ticket [ZR-01].
  { titre: "Chargé de projet, maintenance", entreprise: "Davie", ville: "Lévis", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZLZjRDWmJnZy1XTXk5UjBJa0JRSmhnEiQwMWEwMDA1YS0wMzk2LTdkODctODliNy05NzI1YTMxZDI1MDQaS0FBR3h1Q29rdVZGM2VHcXZoNEF1c1BSWThkVnFUTDRyMF9MLXdka1Nsb0xKcl9NVnJGRUdXNnlVWEJUeUxXb0dnMnNHRXhsdEpOVSDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-08-13", refSource: "ziprecruiter" },
  { titre: "Spécialiste intégration robotique", entreprise: "Wabtec", ville: "Québec", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZZX1hMUURjbC1aVXVHb01jclJfUnVBEiQwMWEwMDA1OS1iM2RkLTc0MDgtYTc3Ny04MzYyMGM3MGExNjEaS0FBRXFiUEprTUNvVkM2Njh5V0x4Mkd5ek5PeklndVlVWlVWTU1JcXY1dEhzc2FiZ2JkSFZHV2R5WjB5alI2bnFPYkdVZkZiRkZDYyDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-08-11", refSource: "ziprecruiter" },
  { titre: "Panel builder", entreprise: "Dracon Automatisation", ville: "Lévis", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZSbElmNTY1NVBYRFNHblV0WTliNHdBEiQwMWEwMDA1OS0wZTI4LTc0NDUtYTUyOS1iOGQxZGU2NzQwMWMaS0FBR0ltUVpNRzlfT0t4U0hBc0ZJQ293M0xjY19ONDlrbjRIMVpHaGc3MVR2OE1Td1VHTFpOQ19udXlZekE1WE1UUFFBNm15RVNvNCDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-08-10", refSource: "ziprecruiter" },
  { titre: "Ingénieur(e) en électronique embarquée - robotique", entreprise: "Robotiq", ville: "Lévis", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZkR3hJUXJnX2dLZEVnV1RjYW1IbHFnEiQwMWEwMDA1OS1iM2RkLTc0MGQtYjQ1Ny0xOTUyMmUxN2YxMDEaS0FBSHlzMVlsNC0xYjJsanpDcXFSNXhGNlRXWTlLNWx4d1hXLXZWWkxOSHpsS1JpLXRyWHRBSnFhQUZsX3Q3N3BlaHVHaDdVVUtFbyDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-07-31", refSource: "ziprecruiter" },
  { titre: "Ingénieur(e) en automatisation", entreprise: "LAPORTE L.E.C.", ville: "Québec", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZ6R3VtamNFamJReDlXMTRYbGdKczhBEiQwMWEwMDA1OS0wZTI4LTc0MmMtODU0Zi0wOThmOWQxYjJmNGUaS0FBR1VVUWIwbmVhbUZDNERJNWQ5RnFYUlg5OEplTExPdHhtMXA0a2pOaUVwZWJ2UzI5bGFHZDBsNjBDTFB2eDJEVTVlS256VE1RMCDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-07-16", refSource: "ziprecruiter" },
  { titre: "Technicien(ne) en automatisation", entreprise: "Bibby-Ste-Croix", ville: "Sainte-Croix", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZoVXkyRHJ1UGJ5SkIxamFiTkJtUkNnEiQwMWEwMDA1OS0wZTI4LTc0NDQtODExZS02MTIwNmQwOWFhYzcaS0FBSGI3dDRNRDhyWkktNmRleWhyRy14R21HRkE0WmFlVlNQV3pFTFY5dmxEWkhIdDVkOE1NTjVPZTJTaXF0X0NRcC1wTEpoZlY3NCDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-08-06", refSource: "ziprecruiter" },
  { titre: "Chargé(e) de projet - acoustique", entreprise: "CIMA+", ville: "Lévis", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZSWUgyYzZ4UTRTMUFZc0ZlbzV4VnJBEiQwMWEwMDA1YS0wMzk2LTdkODYtYmNhYy04MDFlZDM2YjQ4MTUaS0FBSFQwZnN1eW5uYU9YbTlWVTd0endKcWdXX1IwcU9KUHk4V1pPQXNmcjNQSEM2VU1LTy1XemF5ckx1WVgyZ2FqSkFXekFzandhWSDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-08-05", refSource: "ziprecruiter" },
  { titre: "Chargé(e) de projet", entreprise: "Regulvar", ville: "Québec", lien: "https://www.ziprecruiter.com/job-redirect?match_token=Co8BChZ1T2xuN3ZFd2d1RWpSNk96M0FSc2p3EiQwMWEwMDA1YS0wMzk2LTdkYTItYTg5NC0yZDUzMDk1ZjU4MzcaS0FBRmxFN1FEOHFkN09sR01vYTdjYjQxVE9lMUJzcXdON2s5Q3R6V2R0WXVYeGZ5d2NVMTJrS0dNU2tWNWx5Q2IzcGRFSmhyOFdGQSDJrQUQARjJrQU%3D&tsid=100000502", publieeLe: "2026-08-03", refSource: "ziprecruiter" },
  { titre: "Électromécanicien(ne)", entreprise: "Matrec", ville: "Québec", lien: "https://www.ziprecruiter.com/job-redirect?match_token=CpoBChZXb1d2UjY1eXY2VmhGS2tWMWpIOUF3EiQwMWEwMDA1OS05ODgzLTcwNjgtYWMyYi0zN2NkNDE3MDAyMDkaVkFBSEJqcHA2eGdCUVFMQ3NqcmIwT0lzOXFtVU5qb1RSRDJTM3NfcDNpblpJZW5FVDQ5SWlwR2YycGs5NmNlYlVxVzdHV3g4MnVOT1RiZHlYeVYtUVBBIMmtBRABGMmtBQ%3D%3D&tsid=100000502", publieeLe: "2026-08-01", refSource: "ziprecruiter" },
];

async function principal() {
  const brutes = [
    ...LUES,
    ...NON_LUES.map((o) => ({ ...o, description: "" })),
  ];

  // 1. EXPURGATION — avec le code de production, sur le TABLEAU.
  const { offres, retires, touchees } = expurgerLot(brutes);
  console.log(`expurgation : ${touchees}/${offres.length} description(s) touchée(s)`);
  if (retires.length > 0) console.log(`  catégories retirées : ${retires.join(", ")}`);

  // 2. VALIDATION — contre le vrai schéma, avant le réseau.
  const lot = LotDeposeSchema.parse({ source: "veille-indeed-ziprecruiter", jour: JOUR, offres });
  console.log(`lot valide : ${lot.offres.length} offres, jour ${lot.jour}`);

  // 3. CANAL FICHIER — écrit TOUJOURS, pas seulement en repli.
  //
  // C'est le canal prévu par `depotSchema.ts` pour « une session qui a le connecteur Indeed
  // mais pas d'accès réseau vers l'app ». Il est écrit AVANT la tentative réseau parce que
  // c'est le seul des deux qui survit à la fin de ce conteneur : un POST réussi ne laisse
  // aucune trace relisable, un fichier commité si.
  const chemin = new URL(`../data/depot/${JOUR}.json`, import.meta.url).pathname;
  await writeFile(chemin, `${JSON.stringify(lot, null, 2)}\n`, "utf8");
  console.log(`écrit : data/depot/${JOUR}.json`);

  // 4. DÉPÔT HTTP — best effort. L'hôte peut ne pas être joignable depuis cette session
  //    (politique réseau de l'environnement) : ce n'est PAS un échec du lot, et on ne
  //    contourne jamais un blocage — on le nomme.
  const jeton = process.env.JETON_DEPOT;
  if (!jeton) {
    console.log("JETON_DEPOT absent : canal fichier seul.");
    return;
  }

  let rep: Response;
  try {
    rep = await fetch(POINT_DE_DEPOT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: JSON.stringify(lot),
    });
  } catch (e) {
    console.log(`dépôt HTTP impossible depuis cette session : ${e instanceof Error ? e.message : e}`);
    return;
  }
  const corps = await rep.text();
  console.log(`HTTP ${rep.status}`);
  console.log(corps.slice(0, 500));
}

principal().catch((e) => {
  console.error("échec :", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
