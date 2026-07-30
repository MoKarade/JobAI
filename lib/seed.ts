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
const base = {
  source: "seed",
  statut: "Identifiee",
  dateEnvoi: "",
  histo: false,
  // Réputées ouvertes au moment du relevé. Elles se périmeront — c'est Marc qui le
  // constate, jamais le jeu de départ qui le présume.
  perimeeLe: null,
} as const;

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

  // ── Repérage du 2026-07-29 ───────────────────────────────────────────────────
  // Six offres RÉELLES trouvées via le connecteur Indeed de la session de travail, chez
  // des employeurs qui n'étaient pas encore suivis. Chaque annonce a été LUE : les atouts
  // et réserves ci-dessous en viennent, ce ne sont pas des impressions.
  //
  // Leurs notes sont CALCULÉES (`scoreSource: "calcule"`, plafond 85) — pas manuelles.
  // Une note manuelle vient de la lecture de Marc, et lui seul peut la poser ; annoncer
  // « vérifié à la main » pour une note que la machine a produite viderait la distinction
  // de son sens, alors que c'est elle qui fait autorité dans tout le barème.
  //
  // Leur `km` est `null` — INCONNU, jamais un chiffre plausible. Le domicile ne vit que
  // dans `DOMICILE_LAT`/`DOMICILE_LON` (garde-fou n°1) : la session ne peut pas mesurer
  // ces distances, et une distance estimée « à peu près » serait exactement la donnée
  // inventée que le garde-fou n°3 interdit. Le barème traite `null` comme neutre (10/20),
  // ce qui les pénalise honnêtement face aux offres dont la distance est mesurée.
  {
    ...base,
    id: "specialistes-superviseur-entretien",
    dateReperage: "2026-07-29",
    entreprise: "Spécialistes en Services",
    poste: "Superviseur(e) entretien mécanique",
    lien: "https://to.indeed.com/aaf97jjqqm94",
    km: null,
    salaireAffiche: "à partir de 55 $/h (annoncé)",
    priorite: "Moyenne",
    score: 74,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Supervision d'équipe ET planification technique : mécaniciens industriels, tuyauteurs, soudeurs et sous-traitants, avec responsabilité des échéanciers, des budgets et des arrêts planifiés.",
      },
      {
        ton: "atout",
        texte:
          "DEC ou DEP en mécanique industrielle suffit, et la gestion de projets n'est qu'un atout — l'exigence de séniorité n'est pas chiffrée.",
      },
      {
        ton: "reserve",
        texte:
          "Poste par agence de placement : l'employeur final n'est pas nommé (« important employeur du secteur manufacturier de la région de Québec »), donc ni la distance ni la culture ne sont vérifiables avant l'entretien.",
      },
      {
        ton: "reserve",
        texte:
          "Le taux annoncé (55 $/h, soit ~114 k$) est inhabituellement élevé pour le titre : à confirmer avant d'en faire un argument de négociation.",
      },
    ],
    notes:
      "Repérée le 29/07/2026 via Indeed. Publiée le 02/07/2026. Note calculée : le salaire annoncé pèse 15/15, la distance inconnue coûte 10 points sur 20.",
    userNote: "",
  },
  {
    ...base,
    id: "apn-coordonnateur-planification",
    dateReperage: "2026-07-29",
    entreprise: "APN",
    poste: "Coordonnateur(trice) à la planification",
    lien: "https://to.indeed.com/aaflc77z4246",
    km: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 70,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Coordination avec encadrement réel : supervision de l'équipe de planification, suivi des KPI, amélioration continue des performances opérationnelles.",
      },
      {
        ton: "atout",
        texte:
          "Trois ans d'expérience demandés — l'exigence la plus proche du profil parmi les offres de coordination trouvées. Usinage de précision pour l'aéronautique et le médical.",
      },
      {
        ton: "reserve",
        texte:
          "Formation universitaire en administration des affaires demandée, là où le parcours est technique.",
      },
      {
        ton: "reserve",
        texte:
          "Le contenu est logistique (plans de production, inventaires, capacité) plutôt qu'automatisation : le volet technique du profil n'y sert presque pas.",
      },
    ],
    notes:
      "Repérée le 29/07/2026 via Indeed. Publiée le 23/06/2026. Groupe Schivo (Irlande, Canada, USA, Mexique, Suisse).",
    userNote: "",
  },
  {
    ...base,
    id: "dexterra-superviseur-technique",
    dateReperage: "2026-07-29",
    entreprise: "Dexterra",
    poste: "Superviseur technique",
    lien: "https://to.indeed.com/aarjkhgwpdlm",
    km: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 68,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Coordination multidisciplinaire : sous-traitants et corps de métier, échéancier directeur, gestion des changements, analyses de coûts et budgets. Aucune exigence de séniorité chiffrée.",
      },
      {
        ton: "reserve",
        texte:
          "Le parc est résidentiel (unités de logement) : entretien de bâtiments, pas d'automatisation industrielle. Le volet technique du profil ne s'y applique guère.",
      },
      {
        ton: "reserve",
        texte:
          "Situé à Courcelette, sur la base militaire de Valcartier : accès au site probablement conditionné à une habilitation, à vérifier avant d'investir du temps.",
      },
    ],
    notes:
      "Repérée le 29/07/2026 via Indeed. Publiée le 09/03/2026 — annonce ancienne, vérifier qu'elle est toujours ouverte avant de postuler.",
    userNote: "",
  },
  {
    ...base,
    id: "techsol-coordonnateur-qualite",
    dateReperage: "2026-07-29",
    entreprise: "Techsol Marine",
    poste: "Coordonnateur qualité",
    lien: "https://to.indeed.com/aa97ysrqmtmt",
    km: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    score: 66,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Coordination d'audits ISO 9001, suivi des actions correctives et des projets d'amélioration : de la méthode et du pilotage, dans un environnement d'ingénierie électrique maritime.",
      },
      {
        ton: "atout",
        texte:
          "Publiée le jour même du repérage, horaire flexible et télétravail partiel annoncés.",
      },
      {
        ton: "reserve",
        texte:
          "Cinq ans d'expérience minimum dans un rôle similaire, contre environ trois aujourd'hui.",
      },
      {
        ton: "reserve",
        texte:
          "Rôle qualité/documentaire : peu de contenu automatisation, et il relève d'un spécialiste en amélioration continue plutôt que d'une équipe à encadrer.",
      },
    ],
    notes:
      "Repérée le 29/07/2026 via Indeed, publiée le 29/07/2026. Société liée au Groupe Océan.",
    userNote: "",
  },
  {
    ...base,
    id: "honeywell-regulation-cvac",
    dateReperage: "2026-07-29",
    entreprise: "Honeywell",
    poste: "Technicien(ne) en régulation automatique/CVAC",
    lien: "https://to.indeed.com/aaklqnn9bfnt",
    km: null,
    salaireAffiche: null,
    priorite: "Basse",
    score: 58,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Deux ans d'expérience seulement, et l'automatisation du bâtiment est acceptée au même titre que l'industrielle : c'est l'exigence de séniorité la plus accessible du lot.",
      },
      {
        ton: "atout",
        texte:
          "Contenu technique dense et transférable : programmation, mise en route, protocoles Bacnet, Modbus et OPC, plus la livraison de projets dans les budgets et délais.",
      },
      {
        ton: "reserve",
        texte:
          "Poste de technicien sans équipe à encadrer — un recul par rapport à la coordination visée : le barème le pénalise à 14/40 sur le fit de rôle.",
      },
      {
        ton: "reserve",
        texte:
          "Garde (stand-by) à assurer, déplacements jusqu'à 10 % dans la province, et approbations de sécurité exigées par les clients.",
      },
    ],
    notes:
      "Repérée le 29/07/2026 via Indeed. Publiée le 22/06/2026. Sainte-Foy, donc probablement proche — mais la distance n'a pas été mesurée.",
    userNote: "",
  },
  {
    ...base,
    id: "dracon-controle-qualite",
    dateReperage: "2026-07-29",
    entreprise: "Dracon Automatisation",
    poste: "Technicien — contrôle de qualité (panneaux de contrôle)",
    lien: "https://to.indeed.com/aazq7jdvxtqy",
    km: null,
    salaireAffiche: null,
    priorite: "Basse",
    score: 54,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Cœur de métier automatisation et robotique : test et conformité des panneaux de contrôle, collaboration avec les chargés de projets, dépannage technique des clients.",
      },
      {
        ton: "atout",
        texte:
          "Formation acceptée large (DEC, AEC ou DEP), partage annuel des profits et REER avec contribution de l'employeur.",
      },
      {
        ton: "reserve",
        texte:
          "Poste de technicien sans encadrement, et trois à cinq ans d'expérience demandés.",
      },
      {
        ton: "reserve",
        texte:
          "Publiée le 11/05/2026 : l'annonce a près de trois mois, son ouverture est à vérifier.",
      },
    ],
    notes:
      "Repérée le 29/07/2026 via Indeed. À Lévis. Une porte d'entrée chez un intégrateur en automatisation, plus qu'un poste de coordination.",
    userNote: "",
  },

  // ── Balayage du 30/07/2026 ───────────────────────────────────────────────────
  // Neuf offres lues une à une sur Indeed. Trois candidates repérées à la même passe ont
  // été ÉCARTÉES après lecture, et c'est le travail utile : Groupe Laberge (« Responsable
  // de l'entretien et service ») est de l'entretien d'immeubles locatifs — plomberie de
  // base et déneigement —, et deux annonces d'agences ne nomment pas l'employeur. Un titre
  // ne dit pas ce qu'est un poste ; seule l'annonce le dit.

  {
    id: "sanitech-superviseur-technique",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "Groupe Sani-Tech",
    poste: "Superviseur(e) technique — dessin et conception",
    lien: "https://to.indeed.com/aa7xftrrxfwl",
    km: null,
    salaireAffiche: null,
    priorite: "Haute",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 70,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "L'annonce chiffre elle-même la répartition : 70 % leadership, 30 % technique. C'est la formulation la plus proche du poste recherché — encadrer sans quitter le contenu technique — vue dans tout le jeu.",
      },
      {
        ton: "atout",
        texte:
          "Exigences atteignables : DEC, 3 à 5 ans en manufacturier et 2 à 3 ans en gestion d'équipe, sans baccalauréat ni ordre professionnel.",
      },
      {
        ton: "atout",
        texte:
          "Mode hybride (3 jours au bureau, 2 en télétravail) et fins de semaine devancées le vendredi midi — rare pour un poste en usine.",
      },
      {
        ton: "reserve",
        texte:
          "Le volet technique est du dessin d'atelier sur AutoCAD, pas de l'automatisation : la maîtrise d'AutoCAD est demandée comme excellente, et c'est le vrai filtre.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed, publiée le jour même. Lévis. Note calculée : la distance inconnue coûte 10 points sur 20, aucun salaire n'est affiché.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "robert-coord-qualite-ac",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "Groupe Robert",
    poste: "Coordonnateur(ice) qualité, formation et amélioration continue",
    lien: "https://to.indeed.com/aaqdfvt6mjcy",
    km: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 68,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Coordination transversale réelle : audits internes, implantation de changements, accompagnement des équipes et maintien des certifications.",
      },
      {
        ton: "atout",
        texte:
          "Exigence de scolarité très basse (diplôme d'études secondaires) pour 2 à 3 ans d'expérience en qualité ou amélioration continue : le profil dépasse largement le seuil.",
      },
      {
        ton: "reserve",
        texte:
          "Autorité d'influence, pas hiérarchique : on forme et on accompagne, on ne dirige pas d'équipe. Recul par rapport à un poste de supervision.",
      },
      {
        ton: "reserve",
        texte:
          "Centre de distribution logistique : le contenu technique est de la conformité documentaire, pas de l'équipement industriel.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed. Publiée le 27/07/2026. Lévis. Bilinguisme demandé à l'oral comme à l'écrit.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "domtar-superviseur-entretien",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "Domtar",
    poste: "Superviseur entretien",
    lien: "https://to.indeed.com/aa6jqdcmgyzt",
    km: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 68,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Supervision d'entretien chez un grand manufacturier, poste permanent à temps plein, à Château-Richer — proche de Québec.",
      },
      {
        ton: "reserve",
        texte:
          "L'annonce ne décrit NI les responsabilités NI les exigences : sous « Expérience pertinente » il n'y a rien. Tout — séniorité, taille d'équipe, quarts — reste à valider au premier contact.",
      },
      {
        ton: "reserve",
        texte:
          "Publiée le 01/03/2026 : cinq mois d'ancienneté, l'ouverture réelle est douteuse.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed. Note calculée sur un texte d'annonce très pauvre : elle vaut moins que d'habitude, et c'est l'annonce qui est en cause.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "mundial-tech-amelioration-continue",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "Groupe Mundial",
    poste: "Technicien(ne) en amélioration continue",
    lien: "https://to.indeed.com/aaprclwlkty8",
    km: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 68,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Coordination de toutes les phases de projet avec la production, la SST, la qualité et la maintenance : le volet transversal du poste recherché, sans le titre.",
      },
      {
        ton: "atout",
        texte:
          "Outillage Lean explicite (VSM, Kaizen, KPI, standardisation) et animation d'ateliers avec les superviseurs — de l'encadrement par l'expertise.",
      },
      {
        ton: "reserve",
        texte:
          "Titre de technicien : pas d'équipe en propre, et l'annonce ne chiffre aucune exigence d'expérience.",
      },
      {
        ton: "reserve",
        texte:
          "Saint-Lambert-de-Lauzon, au sud de Lévis : à vérifier contre le rayon de 50 km.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed. Publiée le 30/06/2026. Division Metal Bernard. Horaire de jour, du lundi au vendredi.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "nutriart-adjoint-dir-maintenance",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "Nutriart",
    poste: "Adjoint(e) au directeur de la maintenance",
    lien: "https://to.indeed.com/aatxdpb4mygh",
    km: null,
    salaireAffiche: "à partir de 20 $/h",
    priorite: "Basse",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 64,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Coordination directe d'un département de maintenance : planification préventive, tableaux de bord, indicateurs, liaison entre maintenance, production et administration.",
      },
      {
        ton: "reserve",
        texte:
          "Le taux affiché part de 20 $/h, soit environ 41 600 $ par an. C'est très bas pour la responsabilité décrite, et c'est la raison de la priorité basse — le reste du poste, lui, correspond.",
      },
      {
        ton: "reserve",
        texte:
          "Rôle d'adjoint : on soutient le directeur, on ne décide pas. Aucune équipe en propre.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed. Publiée le 27/05/2026. Chocolaterie propriétaire de Laura Secord. Retenue malgré le salaire parce que le contenu du poste, lui, est aligné : à Marc de trancher.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "opsens-tech-genie-manufacturier",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "Opsens",
    poste: "Technicien(ne) en génie manufacturier",
    lien: "https://to.indeed.com/aa4lk6ytj7gp",
    km: null,
    salaireAffiche: "à partir de 80 000 $/an",
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 59,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Salaire de départ annoncé à 80 000 $ — le plus élevé du jeu pour un titre de technicien, et affiché plutôt que promis.",
      },
      {
        ton: "atout",
        texte:
          "Assemblage, qualification et mise en route d'équipements de production et de test, plus projets Lean et Kaizen : le contenu technique est réel.",
      },
      {
        ton: "reserve",
        texte:
          "Aucun encadrement d'équipe : on assiste les ingénieurs manufacturiers. Le barème pénalise ce recul hiérarchique, d'où la note malgré le salaire.",
      },
      {
        ton: "atout",
        texte:
          "Domaine médical réglementé : une expérience transférable vers l'aéronautique et le pharmaceutique.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed, publiée le jour même. Québec. Capteurs à fibre optique pour la cardiologie.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "opsens-tech-genie-industriel",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "Opsens",
    poste: "Technicien(ne) en génie industriel",
    lien: "https://to.indeed.com/aabjmdy6tgvg",
    km: null,
    salaireAffiche: "à partir de 80 000 $/an",
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 59,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Même échelle salariale que le poste voisin (80 000 $ de départ) avec un volet formation des opérateurs et documentation ERP en plus.",
      },
      {
        ton: "reserve",
        texte:
          "Poste très proche de l'autre ouverture Opsens : postuler aux deux demande d'assumer clairement laquelle est visée, sous peine de brouiller la candidature.",
      },
      {
        ton: "reserve",
        texte:
          "Aucun encadrement d'équipe, et l'anglais fonctionnel est exigé plutôt que souhaité.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed. Publiée le 08/06/2026. Québec. Doublon partiel assumé avec l'autre poste Opsens : les deux sont ouverts simultanément.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "jeldwen-planificateur-production",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "JELD-WEN",
    poste: "Planificateur de production",
    lien: "https://to.indeed.com/aadzc7x9l7tp",
    km: null,
    salaireAffiche: null,
    priorite: "Basse",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 50,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "L'annonce parle de coordination quotidienne d'une équipe et de projets d'amélioration continue, et accepte un DEC avec 3 à 5 ans d'expérience.",
      },
      {
        ton: "reserve",
        texte:
          "Le cœur du poste est le lissage de charge, les kanbans et l'approvisionnement : de la planification logistique, pas de la coordination technique.",
      },
      {
        ton: "reserve",
        texte:
          "Laurier-Station est à une quarantaine de kilomètres de Québec : proche de la limite du rayon déclaré, à mesurer avant de postuler.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed. Publiée le 30/06/2026. JELD-WEN était déjà une entreprise cible sans offre suivie : c'est la première.",
    userNote: "",
    histo: false,
    perimeeLe: null,
  },

  {
    id: "tardif-charge-projets-elevation",
    source: "seed",
    dateReperage: "2026-07-30",
    entreprise: "TARDIF",
    poste: "Chargé(e) de projets — solutions d'élévation",
    lien: "https://to.indeed.com/aawrv7bwln6v",
    km: null,
    salaireAffiche: "75 000 $ à 95 000 $/an",
    priorite: "Basse",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 47,
    scoreSource: "calcule",
    raisons: [
      {
        ton: "atout",
        texte:
          "Fourchette salariale affichée et large (75 000 à 95 000 $), sur de la gestion de projets manufacturiers complexes de bout en bout.",
      },
      {
        ton: "atout",
        texte:
          "Coordination de huit fonctions — estimation, approvisionnement, ingénierie, production, qualité, logistique, installation, client : exactement le rôle de chef d'orchestre visé.",
      },
      {
        ton: "reserve",
        texte:
          "Barrière ferme : baccalauréat en ingénierie ET appartenance à l'Ordre des ingénieurs du Québec (ou admissibilité). C'est ce qui fait chuter la note, pas le contenu du poste.",
      },
      {
        ton: "reserve",
        texte:
          "5 à 10 ans d'expérience en gestion de projets industriels complexes exigés, et l'anglais est requis pour la clientèle hors Québec.",
      },
    ],
    notes:
      "Repérée le 30/07/2026 via Indeed. Publiée le 07/07/2026. Saint-Augustin-de-Desmaures. Conservée malgré la note : si l'admissibilité à l'OIQ est acquise, le poste remonte immédiatement.",
    userNote: "",
    histo: false,
    perimeeLe: null,
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
    perimeeLe: null,
  }));
}
