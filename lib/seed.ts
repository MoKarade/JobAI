// lib/seed.ts — le jeu de départ : la recherche telle qu'elle était au 2026-07-27.
//
// 23 offres actives repérées et notées À LA MAIN, plus 15 candidatures de la campagne 2025.
// Ces notes viennent de la lecture réelle des offres : elles font autorité sur toute note
// calculée (`scoreSource: "manuel"`, et le barème plafonne les notes calculées à 85).
//
// CE QUI N'EST PAS ICI, ET NE DOIT JAMAIS Y ÊTRE (garde-fou n°1) :
//   - l'adresse du domicile : seules les DISTANCES apparaissent, calculées à partir de
//     DOMICILE_LAT / DOMICILE_LON (variables d'environnement) ;
//   - le nom des personnes rencontrées en recrutement : ce sont les données personnelles
//     d'un tiers, qui n'a pas à figurer dans un dépôt. Un contact se note « contact établi »,
//     et son nom vit dans la note personnelle de Marc, hors du code ;
//   - les adresses municipales des entreprises : la ville suffit, et l'adresse ferait
//     échouer le garde-fou de la CI pour rien.
//
// Ces offres EXPIRERONT (voir [V1-08]) : une offre dont on ne sait plus si elle est ouverte
// doit être marquée périmée, jamais affichée comme active.

import type { Offre } from "./types";

/** Raccourci de lecture : toutes les entrées du jeu de départ ont la même provenance. */
const base = { source: "seed", statut: "Identifiee", dateEnvoi: "", histo: false } as const;

export const SEED: Offre[] = [
  {
    ...base,
    id: "iel-superviseur-tech",
    dateReperage: "2026-07-21",
    entreprise: "IEL Technologie agricole",
    poste: "Superviseur du service technique",
    lien: "https://to.indeed.com/aa8ftvd8bnt8",
    km: 33,
    salaireAffiche: "40 $/h+ (~83 k$)",
    priorite: "Haute",
    score: 92,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "Le sosie du poste actuel : coordination quotidienne des techniciens, support téléphonique, priorités d'intervention, développement de l'équipe, indicateurs.",
      },
      {
        ton: "atout",
        texte:
          "Formation acceptée large : DEP, DEC ou BAC en électromécanique, automatisation ou génie. 80 % coordination, 20 % terrain.",
      },
      {
        ton: "reserve",
        texte: "Demande 5 à 10 ans en service technique, contre environ 3 aujourd'hui.",
      },
    ],
    notes:
      "Saint-Anselme, 33 km. Publiée le 21/07/2026. Le meilleur fit de la liste : c'est déjà le travail fait chez l'employeur actuel.",
    userNote: "",
  },
  {
    ...base,
    id: "robotiq-specialiste-solutions",
    dateReperage: "2026-07-27",
    entreprise: "Robotiq",
    poste: "Spécialiste en solutions robotiques",
    lien: "https://robotiq.com",
    km: 15,
    salaireAffiche: null,
    priorite: "Haute",
    score: 88,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "Robotique collaborative et rôle de service, sous le directeur des services : exactement le positionnement visé.",
      },
      {
        ton: "atout",
        texte: "Contact RH déjà établi, et une entrevue passée en mars 2025.",
      },
      {
        ton: "reserve",
        texte:
          "Candidature 2025 non retenue après l'entrevue : comprendre pourquoi avant de repostuler.",
      },
    ],
    notes:
      "Saint-Nicolas, 15 km via le pont. Confirmé actif. La relance la plus rentable de la liste.",
    userNote: "",
  },
  {
    ...base,
    id: "laserax-charge-projets",
    dateReperage: "2026-05-22",
    entreprise: "Laserax",
    poste: "Chargé(e) de projets",
    lien: "https://to.indeed.com/aamq2r62gpyl",
    km: 3.5,
    salaireAffiche: "52 260 – 120 727 $",
    priorite: "Haute",
    score: 86,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "3,5 km, et une fourchette salariale très ouverte vers le haut." },
      {
        ton: "atout",
        texte:
          "Liaison client, coordination, budgets et délais, sous le directeur des opérations. Bilinguisme requis, c'est un atout.",
      },
      { ton: "reserve", texte: "Demande 5 ans d'expérience et un BAC en génie ; PMP en atout." },
    ],
    notes: "Laser industriel, siège social à Québec. Télétravail partiel mentionné.",
    userNote: "",
  },
  {
    ...base,
    id: "davie-coord-projet",
    dateReperage: "2026-07-27",
    entreprise: "Chantier Davie",
    poste: "Coordonnateur(trice) de projet",
    lien: "https://www.jobillico.com/fr/employeurs/chantier-davie-canada-inc-mmxwau/voir-liste-emplois",
    km: 9.8,
    salaireAffiche: "marché 51-74 k$",
    priorite: "Haute",
    score: 85,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "Plus gros chantier naval du Canada, 244 postes ouverts, croissance portée par la Stratégie navale nationale.",
      },
      { ton: "atout", texte: "Coordination de projet pure, à 9,8 km." },
      { ton: "reserve", texte: "Milieu syndiqué, sans expérience de ce contexte." },
    ],
    notes: "Lévis-Lauzon. L'employeur le plus dynamique de la région.",
    userNote: "",
  },
  {
    ...base,
    id: "leclerc-charge-projet-auto",
    dateReperage: "2026-04-07",
    entreprise: "Groupe Leclerc",
    poste: "Chargé de projets ingénierie — volet automatisation",
    lien: "https://to.indeed.com/aamvczvxcv4y",
    km: 15.4,
    salaireAffiche: null,
    priorite: "Haute",
    score: 84,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte: "Coordination de projets, expertise automatisation et formation des équipes.",
      },
      {
        ton: "atout",
        texte:
          "Demande explicitement des systèmes robotiques, de la vision et du servo-contrôle : c'est la formation MSIR.",
      },
      {
        ton: "reserve",
        texte: "5 ans en manufacturier demandés ; ordre professionnel en atout, pas obligatoire.",
      },
    ],
    notes: "Saint-Augustin-de-Desmaures. Publiée en avril — vérifier si encore active.",
    userNote: "",
  },
  {
    ...base,
    id: "davie-mise-en-service-auto",
    dateReperage: "2026-07-27",
    entreprise: "Chantier Davie",
    poste: "Responsable mise en service — systèmes d'automatisation",
    lien: "https://www.jobillico.com/fr/employeurs/chantier-davie-canada-inc-mmxwau/voir-liste-emplois",
    km: 9.8,
    salaireAffiche: "marché ~89 k$",
    priorite: "Haute",
    score: 82,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "Mise en service de systèmes d'automatisation : le cœur technique de la formation, avec la responsabilité en prime.",
      },
      {
        ton: "atout",
        texte: "Un titre « automatisation » place l'offre dans une fourchette salariale supérieure.",
      },
    ],
    notes:
      "Lévis, 9,8 km. À croiser avec les autres postes Davie : postuler à un seul, le mieux ciblé.",
    userNote: "",
  },
  {
    ...base,
    id: "steris-ing-auto",
    dateReperage: "2026-07-27",
    entreprise: "STERIS",
    poste: "Ingénieur électrique automatisation",
    lien: "https://www.jobillico.com/fr/employeurs/steris/voir-liste-emplois",
    km: 11,
    salaireAffiche: null,
    priorite: "Haute",
    score: 80,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "11 km sur la rive nord, sans pont à traverser." },
      { ton: "atout", texte: "Multinationale médicale, équipe automatisation en expansion." },
      { ton: "reserve", texte: "Poste orienté ingénierie technique plutôt que coordination." },
      { ton: "reserve", texte: "Titre « ingénieur » : vérifier si un permis d'ordre est exigé." },
    ],
    notes: "Beauport. Deux affichages vus en avril 2026.",
    userNote: "",
  },
  {
    ...base,
    id: "davie-electromeca-gestion",
    dateReperage: "2026-07-27",
    entreprise: "Chantier Davie",
    poste: "Électromécanique/automatisation + gestion de personnel",
    lien: "https://www.jobillico.com/fr/employeurs/chantier-davie-canada-inc-mmxwau/voir-liste-emplois",
    km: 9.8,
    salaireAffiche: null,
    priorite: "Haute",
    score: 79,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte: "Électromécanique automatisée et encadrement : très proche du profil.",
      },
      {
        ton: "reserve",
        texte: "Exige 5 ans de gestion de personnel et un milieu syndiqué — deux points courts.",
      },
    ],
    notes:
      "Lévis, 9,8 km. Argument à préparer : compter l'ampleur (taille d'équipe, volume) plutôt que les années.",
    userNote: "",
  },
  {
    ...base,
    id: "laserax-spec-auto",
    dateReperage: "2026-04-02",
    entreprise: "Laserax",
    poste: "Spécialiste automatisation",
    lien: "https://to.indeed.com/aagfj4hq49cl",
    km: 3.5,
    salaireAffiche: "à partir de 65 000 $",
    priorite: "Haute",
    score: 78,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "3,5 km et seulement 2 ans d'expérience demandés : l'exigence de séniorité la plus accessible du lot.",
      },
      {
        ton: "atout",
        texte: "Automates Codesys, Allen-Bradley et Siemens, interfaces, schémas électriques.",
      },
      { ton: "reserve", texte: "Rôle purement technique, aucune composante de coordination." },
    ],
    notes:
      "Publiée en avril 2026. Bon plan B pour consolider le technique avant de viser la gestion.",
    userNote: "",
  },
  {
    ...base,
    id: "evident-spec-auto",
    dateReperage: "2026-07-27",
    entreprise: "Evident Scientific",
    poste: "Spécialiste en Automatisation",
    lien: "https://emplois.ca.indeed.com",
    km: 3.6,
    salaireAffiche: "marché ~89 k$",
    priorite: "Moyenne",
    score: 76,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte: "3,6 km. BAC ou technique en génie électrique, automation ou robotique : ça coche.",
      },
      { ton: "atout", texte: "Ex-Olympus, groupe international." },
      { ton: "reserve", texte: "Périmètre du rôle à clarifier : technique pur ou coordination ?" },
    ],
    notes: "Parc technologique de Québec.",
    userNote: "",
  },
  {
    ...base,
    id: "leclerc-coord-fiabilite",
    dateReperage: "2026-07-06",
    entreprise: "Groupe Leclerc",
    poste: "Coordonnateur Fiabilité Maintenance",
    lien: "https://to.indeed.com/aajsdhlqvkdy",
    km: 15.4,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 75,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "Coordination et fiabilité maintenance en manufacturier : transfert direct de l'expérience actuelle (planification des techniciens, pièces).",
      },
      { ton: "reserve", texte: "Moins de robotique que le poste ingénierie du même employeur." },
    ],
    notes: "Saint-Augustin. Publiée le 06/07/2026, plus fraîche que l'autre poste Leclerc.",
    userNote: "",
  },
  {
    ...base,
    id: "evident-spec-robotique",
    dateReperage: "2026-07-27",
    entreprise: "Evident Scientific",
    poste: "Spécialiste robotique",
    lien: "https://emplois.ca.indeed.com",
    km: 3.6,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 74,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "3,6 km. Caractériser les exigences de performance robotique du système et fournir les spécifications.",
      },
      {
        ton: "atout",
        texte: "Deuxième poste ouvert chez le même employeur : signe d'une équipe qui grossit.",
      },
      { ton: "reserve", texte: "Très spécialisé, peu de coordination." },
    ],
    notes: "Repéré le 27/07/2026.",
    userNote: "",
  },
  {
    ...base,
    id: "abbatiello-resp-auto",
    dateReperage: "2026-07-16",
    entreprise: "Groupe Abbatiello",
    poste: "Responsable automatisation et optimisation des processus",
    lien: "https://to.indeed.com/aagfnf8gvc9n",
    km: 2.8,
    salaireAffiche: "à partir de 70 000 $",
    priorite: "Moyenne",
    score: 72,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte: "2,8 km, le plus proche de tous. Plancher à 70 k$ et 2 ans d'expérience exigés.",
      },
      {
        ton: "atout",
        texte:
          "Automatisation logicielle (N8N, Monday, OpenAI, JavaScript) : exactement ce qui se bricole déjà en projets perso.",
      },
      {
        ton: "reserve",
        texte: "Zéro robotique industrielle : c'est un virage de carrière, pas une continuité.",
      },
    ],
    notes:
      "Publiée le 16/07/2026. À considérer sérieusement si automatiser des processus motive plus que le terrain.",
    userNote: "",
  },
  {
    ...base,
    id: "ph-tech-superviseur",
    dateReperage: "2026-06-10",
    entreprise: "P.H. Tech",
    poste: "Superviseur(e) de maintenance",
    lien: "https://to.indeed.com/aax7qxdnqbw2",
    km: 10.6,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 70,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte:
          "Supervision de maintenance industrielle à 10,6 km, manufacturier établi à Lévis. Transfert correct du profil coordination.",
      },
      { ton: "reserve", texte: "Détails à vérifier ; probablement peu d'automatisation." },
    ],
    notes: "Publiée le 10/06/2026 — vérifier si toujours active.",
    userNote: "",
  },
  {
    ...base,
    id: "labatt-superviseur-maint",
    dateReperage: "2026-07-17",
    entreprise: "Labatt",
    poste: "Superviseur(e) Maintenance — Archibald",
    lien: "https://to.indeed.com/aagls9cjxkqh",
    km: 3.7,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 68,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte: "3,7 km, grande entreprise aux avantages solides, supervision d'équipe de maintenance.",
      },
      { ton: "reserve", texte: "Brasserie : milieu probablement syndiqué, automatisation secondaire." },
    ],
    notes: "Publiée le 17/07/2026.",
    userNote: "",
  },
  {
    ...base,
    id: "ametek-expert-technique",
    dateReperage: "2026-04-21",
    entreprise: "AMETEK",
    poste: "Expert Technique",
    lien: "https://to.indeed.com/aaqtmc8tfhkc",
    km: 9.4,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 66,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "Multinationale à Lévis, 9,4 km, rôle d'expert technique." },
      {
        ton: "reserve",
        texte: "Contenu du poste à vérifier : pourrait très bien matcher, ou pas du tout.",
      },
    ],
    notes: "Publiée le 21/04/2026. À creuser au prochain passage.",
    userNote: "",
  },
  {
    ...base,
    id: "dubreton-gest-maint",
    dateReperage: "2026-02-25",
    entreprise: "duBreton",
    poste: "Gestionnaire maintenance",
    lien: "https://to.indeed.com/aask9xgn2vbz",
    km: 27.6,
    salaireAffiche: null,
    priorite: "Basse",
    score: 63,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte: "Poste de gestion complet, un cran au-dessus de superviseur. Agroalimentaire.",
      },
      { ton: "reserve", texte: "27,6 km, et publiée en février 2026 : probablement pourvue." },
    ],
    notes: "Saint-Charles-de-Bellechasse.",
    userNote: "",
  },
  {
    ...base,
    id: "automatech-ing-meca",
    dateReperage: "2026-07-22",
    entreprise: "AutomaTech Robotik",
    poste: "Ingénieur en conception mécanique",
    lien: "https://to.indeed.com/aa7gmlqplqsk",
    km: 29.9,
    salaireAffiche: null,
    priorite: "Basse",
    score: 62,
    scoreSource: "manuel",
    raisons: [
      {
        ton: "atout",
        texte: "Ancien employeur (2023) : réseau interne, culture connue, réintégration facile.",
      },
      {
        ton: "reserve",
        texte: "Conception mécanique pure : ni coordination ni automatisation, et 29,9 km.",
      },
    ],
    notes:
      "Saint-Apollinaire. Publiée le 22/07/2026. À garder comme porte de service : un contact là-bas peut signaler d'autres postes.",
    userNote: "",
  },
  {
    ...base,
    id: "canam-tech-auto",
    dateReperage: "2026-07-27",
    entreprise: "Canam Ponts",
    poste: "Technicien(ne) en automatisation",
    lien: "https://www.jobillico.com",
    km: 2,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 62,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "2 km : l'usine Ponts est à Québec, pas à Lévis." },
      {
        ton: "reserve",
        texte:
          "Titre « technicien » : recul hiérarchique et probablement salarial par rapport au poste actuel.",
      },
    ],
    notes: "Correction de localisation faite le 27/07/2026.",
    userNote: "",
  },
  {
    ...base,
    id: "qualtech-tech-auto",
    dateReperage: "2026-04-09",
    entreprise: "Qualtech",
    poste: "Technicien en automatisation",
    lien: "https://to.indeed.com/aa6crhqvmskm",
    km: 2.3,
    salaireAffiche: null,
    priorite: "Basse",
    score: 60,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "2,3 km." },
      {
        ton: "reserve",
        texte: "Poste de technicien : même réserve que Canam, pas de progression.",
      },
    ],
    notes: "Publiée le 09/04/2026.",
    userNote: "",
  },
  {
    ...base,
    id: "hershey-tech-auto",
    dateReperage: "2026-07-20",
    entreprise: "The Hershey Company",
    poste: "Technicien en automatisation",
    lien: "https://to.indeed.com/aany72qwfp29",
    km: 8.6,
    salaireAffiche: null,
    priorite: "Basse",
    score: 58,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "Multinationale à 8,6 km, avantages généralement bons." },
      { ton: "reserve", texte: "Niveau technicien, pas de coordination." },
    ],
    notes: "Publiée le 20/07/2026.",
    userNote: "",
  },
  {
    ...base,
    id: "exos-superviseur-maintenance",
    dateReperage: "2026-07-27",
    entreprise: "Exo-s Saint-Damien",
    poste: "Superviseur de la maintenance",
    lien: "https://www.jobillico.com/fr/offre-d-emploi/exo-s-saint-damien-inclxvcze/superviseur-de-la-maintenance/16747374",
    km: 51.7,
    salaireAffiche: null,
    priorite: "Basse",
    score: 57,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "Le trio automatisation, coordination et projets : bon sur le fond." },
      {
        ton: "reserve",
        texte:
          "51,7 km à vol d'oiseau, donc hors du rayon de 50 km — sans doute plus de 60 km par la route.",
      },
    ],
    notes: "Déclassée après calcul de la distance exacte.",
    userNote: "",
  },
  {
    ...base,
    id: "ace-coord-services",
    dateReperage: "2026-07-27",
    entreprise: "Groupe ACE",
    poste: "Coordonnateur des services techniques — télécom",
    lien: "https://www.qc.guichetemplois.gc.ca/jobsearch/jobposting/49765163",
    km: 12,
    salaireAffiche: null,
    priorite: "Basse",
    score: 55,
    scoreSource: "manuel",
    raisons: [
      { ton: "atout", texte: "Coordination technique pure, et proche." },
      {
        ton: "reserve",
        texte: "Télécom : hors robotique et hors industrie, n'ajoute rien au récit professionnel.",
      },
    ],
    notes: "Filet de sécurité, pas une cible.",
    userNote: "",
  },

  // ── Campagne 2025 ────────────────────────────────────────────────────────────
  // 15 candidatures réellement envoyées, 7 réponses, 2 processus avancés. Ce n'est pas
  // de la décoration : c'est ce qui justifie les priorités actuelles.
  ...historique([
    ["h25-abb", "2025-02-10", "ABB Canada", "Project Engineer", "Refusee", "Refus reçu le 17/02/2025."],
    ["h25-abb-mech", "2025-02-20", "ABB Canada", "Mechanical Engineer — R&D", "CVenvoye", "Accusé de réception, jamais de suite."],
    ["h25-abb-pmapp", "2025-02-20", "ABB Canada", "Project Manager, Applications Engineering", "CVenvoye", "Accusé de réception, jamais de suite."],
    ["h25-abb-planner", "2025-02-20", "ABB Canada", "Project Planner and Controller", "CVenvoye", "Accusé de réception, jamais de suite."],
    ["h25-cae", "2025-02-10", "CAE Inc.", "Project manager", "Refusee", "Refus reçu le 28/02/2025."],
    ["h25-alstom", "2025-02-10", "Alstom", "REM — Coordonnateur T&C SLV", "CVenvoye", "Accusé de réception, jamais de suite."],
    ["h25-alstom-pem", "2025-03-11", "Alstom", "Project Engineering Manager", "Refusee", "Refus reçu le 24/03/2025. Deuxième refus Alstom."],
    ["h25-andritz", "2025-02-10", "Andritz Automation", "Young Graduate", "CVenvoye", "Accusé de réception, jamais de suite."],
    ["h25-cognex", "2025-02-10", "Cognex Corporation", "Project Manager (Evergreen)", "CVenvoye", "Accusé de réception, jamais de suite."],
    ["h25-mtl", "2025-02-10", "EATON (MTL Instruments)", "Project Engineer — Early Talent LDP", "Refusee", "Processus complet : recruteur le 04/03, entretiens, test en ligne le 13/03, refus final le 09/04/2025."],
    ["h25-fives", "2025-02-10", "Fives Intralogistics", "Chef de Projets Machines-Outils", "Refusee", "Refus le 13/02/2025, trois jours après l'envoi."],
    ["h25-hq", "2025-02-10", "Hydro-Québec", "Ingénieur(e) intégrateur(trice)", "Refusee", "Refus le 13/03/2025."],
    ["h25-baker", "2025-02-10", "Baker Hughes Canada", "Project Manager", "CVenvoye", "Accusé de réception, jamais de suite."],
    ["h25-robotiq", "2025-02-08", "Robotiq", "Project manager", "Entrevue", "Présélection puis entrevue en visioconférence le 18/03/2025 avec les RH, ensuite silence."],
    ["h25-renault", "2025-03-11", "Renault Group (France)", "Graduate Program Manufacturing / Industrie 4.0", "CVenvoye", "Candidature en France. Jamais de suite."],
  ]),
];

/**
 * Construit les entrées de la campagne 2025.
 * Elles n'ont ni note ni distance : elles ne sont pas des cibles, elles sont un historique.
 * `score: null` et non 0 — « pas évaluée » n'est pas « mauvaise ».
 */
function historique(
  lignes: readonly (readonly [string, string, string, string, Offre["statut"], string])[],
): Offre[] {
  return lignes.map(([id, date, entreprise, poste, statut, notes]) => ({
    id,
    source: "seed" as const,
    dateReperage: date,
    entreprise,
    poste,
    lien: "",
    km: null,
    salaireAffiche: null,
    priorite: "Basse" as const,
    statut,
    dateEnvoi: date,
    score: null,
    scoreSource: null,
    raisons: [],
    notes,
    userNote: "",
    histo: true,
  }));
}
