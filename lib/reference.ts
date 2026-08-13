// lib/reference.ts — les données de référence de la recherche.
//
// Ce sont des CONSTATS datés et sourcés, pas des calculs : repères de salaire relevés à une
// date, entreprises cibles avec leur distance, analyse SWOT. Ils ne changent que si Marc les
// met à jour, et chacun porte sa provenance — un chiffre de marché sans source ni date est
// invérifiable six mois plus tard, donc inutilisable.
//
// GARDE-FOU N°1 : aucune adresse municipale ici. La ville suffit à situer un employeur, et
// une adresse ferait échouer la vérification de la CI pour rien.

/** Un repère de salaire du marché. La source et la date font partie de la donnée. */
export interface RepereSalaire {
  poste: string;
  fourchette: string;
  source: string;
}

/**
 * Relevés de juin-juillet 2026. À re-vérifier avant de s'en servir comme argument de
 * négociation : un repère de marché vieilli se retourne contre celui qui le cite.
 */
export const SALAIRES_MARCHE: readonly RepereSalaire[] = [
  {
    poste: "Coordonnateur de projet — ville de Québec",
    fourchette: "51 600 – 73 750 $ · médiane 60 000 $",
    source: "Glassdoor, 127 salaires, juin 2026",
  },
  {
    poste: "Coordonnateur (tous types) — Québec",
    fourchette: "60 448 – 91 542 $ · moyenne 74 180 $",
    source: "Glassdoor, 30 salaires, juin 2026",
  },
  {
    poste: "Coordonnateur(trice) de projets — province",
    fourchette: "moyenne 74 115 $",
    source: "Indeed, 318 salaires, juin 2026",
  },
  {
    poste: "Spécialiste en automatisation — province",
    fourchette: "moyenne 89 399 $",
    source: "Indeed, 41 salaires, mai 2026",
  },
  {
    poste: "Superviseur service technique (offre réelle)",
    fourchette: "40 $/h+ ≈ 83 000 $",
    source: "Offre IEL, juillet 2026",
  },
  {
    poste: "Chargé de projets (offre réelle)",
    fourchette: "52 260 – 120 727 $",
    source: "Offre Laserax, mai 2026",
  },
];

export interface EntrepriseCible {
  nom: string;
  ville: string;
  /**
   * Distance MESURÉE depuis le domicile, ou `null` quand elle ne l'a pas été.
   *
   * `null` n'est pas « zéro » ni « proche » : c'est « on ne sait pas ». Les 23 premières
   * entrées ont une distance relevée à la main ; celles ajoutées depuis un repérage
   * automatique n'en ont pas, et la session de travail ne peut pas la calculer — le
   * domicile ne vit que dans `DOMICILE_LAT`/`DOMICILE_LON` (garde-fou n°1). Écrire une
   * distance « à peu près » serait exactement la donnée inventée qu'interdit le garde-fou
   * n°3, et elle passerait ensuite pour mesurée partout où elle s'affiche.
   */
  km: number | null;
  /** Pourquoi elle est dans la liste, et ce qu'elle vaut. */
  lecture: string;
}

/** Les employeurs repérés dans le rayon, du plus proche au plus loin. */
export const ENTREPRISES_CIBLES: readonly EntrepriseCible[] = [
  { nom: "Canam Ponts", ville: "Québec", km: 2, lecture: "Grand groupe québécois. L'usine Ponts est à Québec, pas à Lévis. Poste de technicien en automatisation." },
  { nom: "Qualtech", ville: "Québec", km: 2.3, lecture: "Poste de technicien en automatisation." },
  { nom: "Groupe Abbatiello", ville: "Québec", km: 2.8, lecture: "Automatisation de processus d'affaires (N8N, Monday, OpenAI). Croisement direct avec les projets perso." },
  { nom: "Laserax", ville: "Québec (parc technologique)", km: 3.5, lecture: "Systèmes laser industriels. Deux postes ouverts : chargé de projets et spécialiste automatisation (2 ans d'expérience seulement)." },
  { nom: "Evident Scientific", ville: "Québec", km: 3.6, lecture: "Ex-Olympus. Deux postes : spécialiste automatisation et spécialiste robotique." },
  { nom: "Labatt", ville: "Québec (Archibald)", km: 3.7, lecture: "Superviseur maintenance. Grande entreprise, avantages solides, probablement syndiqué." },
  { nom: "Poly-Robotics", ville: "Québec", km: 4.4, lecture: "Intégrateur robotique et vision, très petite équipe. Aucun poste ouvert repéré — candidature spontanée possible." },
  { nom: "The Hershey Company", ville: "Québec", km: 8.6, lecture: "Multinationale. Technicien en automatisation." },
  { nom: "AMETEK", ville: "Lévis", km: 9.4, lecture: "Poste d'expert technique, contenu à vérifier." },
  { nom: "Chantier Davie", ville: "Lévis", km: 9.8, lecture: "Plus gros chantier naval du Canada, 244 postes ouverts. Trois postes pertinents repérés. Milieu syndiqué." },
  { nom: "P.H. Tech", ville: "Lévis", km: 10.6, lecture: "Superviseur de maintenance, manufacturier établi." },
  { nom: "STERIS Canada", ville: "Québec (Beauport)", km: 11, lecture: "Multinationale médicale, rive nord sans pont. Équipe automatisation en expansion." },
  { nom: "Groupe ACE", ville: "Québec", km: 12, lecture: "Coordination de services techniques en télécom. Hors robotique et hors industrie : filet de sécurité, pas une cible." },
  { nom: "Robotiq", ville: "Saint-Nicolas", km: 15.1, lecture: "Environ 130 employés, en croissance. Contact RH établi, entrevue passée en mars 2025." },
  { nom: "Groupe Leclerc", ville: "Saint-Augustin-de-Desmaures", km: 15.4, lecture: "Deux postes : chargé de projets ingénierie automatisation (robotique, vision, servo) et coordonnateur fiabilité maintenance." },
  { nom: "JELD-WEN", ville: "Saint-Henri", km: 22.1, lecture: "Aucun poste coordination ou automatisation confirmé. À surveiller seulement." },
  { nom: "duBreton", ville: "Saint-Charles-de-Bellechasse", km: 27.6, lecture: "Gestionnaire maintenance, un cran au-dessus de superviseur. Offre de février, probablement pourvue." },
  { nom: "AutomaTech Robotik", ville: "Saint-Apollinaire", km: 29.9, lecture: "Ancien employeur (2023). Réseau interne exploitable même sans postuler." },
  { nom: "Intégration Robotronic", ville: "Pont-Rouge", km: 31.9, lecture: "Intégrateur de cellules robotisées sur mesure, petite structure." },
  { nom: "IEL Technologie agricole", ville: "Saint-Anselme", km: 33, lecture: "Le meilleur fit de la liste. Superviseur service technique : coordination des techniciens, support, indicateurs." },
  { nom: "Revtech Systèmes", ville: "Sainte-Marie (Beauce)", km: 44.4, lecture: "Intégrateur certifié ABB, multi-marques. Aucun poste repéré actuellement." },
  { nom: "Exo-s", ville: "Saint-Damien-de-Buckland", km: 51.7, lecture: "Bon fit sur le fond, mais dépasse le rayon de 50 km." },
  { nom: "Alstom", ville: "La Pocatière", km: 110.3, lecture: "À écarter : hors rayon, exige la résidence permanente ou la citoyenneté, et deux refus en 2025." },

  // ── Repérage automatique du 2026-07-29 ───────────────────────────────────────
  // Employeurs découverts par un balayage Indeed, chacun rattaché à une offre réelle du
  // jeu de données. Leur `km` est `null` — NON MESURÉ, et surtout pas estimé : la ville
  // ne donne pas la distance, et un chiffre « à peu près » s'afficherait ensuite avec la
  // même assurance qu'un relevé. Les 23 entrées ci-dessus, elles, sont mesurées.
  { nom: "Honeywell", ville: "Québec (Sainte-Foy)", km: null, lecture: "Automatisation du bâtiment (Building Automation). Poste de technicien en régulation : contenu technique dense, mais sans équipe à encadrer." },
  { nom: "APN", ville: "Québec", km: null, lecture: "Usinage de précision pour l'aéronautique et le médical, groupe Schivo. Coordination de la planification : encadrement réel, contenu logistique plutôt que technique." },
  { nom: "Dracon Automatisation", ville: "Lévis", km: null, lecture: "Intégrateur en automatisation et robotique. Poste de technicien contrôle qualité sur panneaux de contrôle : porte d'entrée du métier, pas de la coordination." },
  { nom: "Techsol Marine", ville: "Québec", km: null, lecture: "Électrification et décarbonisation maritime, lié au Groupe Océan. Coordination qualité et audits ISO 9001." },
  { nom: "Dexterra", ville: "Courcelette", km: null, lecture: "Gestion d'installations. Supervision technique d'un parc résidentiel sur la base de Valcartier : accès au site probablement conditionné à une habilitation." },
  { nom: "Spécialistes en Services", ville: "Québec", km: null, lecture: "Agence de placement : l'employeur final n'est pas nommé. Supervision d'entretien mécanique en milieu manufacturier, taux annoncé élevé à confirmer." },
  { nom: "Groupe Sani-Tech", ville: "Lévis", km: null, lecture: "Produits architecturaux (écoles, hôpitaux, centres aquatiques) depuis 1998, usine récemment agrandie. Le poste de superviseur technique y est annoncé 70 % leadership / 30 % technique — la répartition la plus proche du profil vue jusqu'ici." },
  { nom: "Groupe Robert", ville: "Lévis", km: null, lecture: "Transport et logistique québécois. Coordination qualité, formation et amélioration continue dans un centre de distribution : encadrement par l'influence plutôt que hiérarchique." },
  { nom: "Opsens", ville: "Québec", km: null, lecture: "Capteurs à fibre optique pour le médical (cardiologie), domaine réglementé. Deux postes de technicien en génie ouverts à 80 k$ et plus : contenu Lean et mise en route d'équipements, mais sans encadrement d'équipe." },
  { nom: "Domtar", ville: "Château-Richer", km: null, lecture: "Produits du bois à valeur ajoutée, grand manufacturier. Poste de superviseur entretien ouvert depuis mars : l'annonce est avare en détails, tout reste à valider en entretien." },
  { nom: "Groupe Mundial", ville: "Saint-Lambert-de-Lauzon", km: null, lecture: "Division Metal Bernard. Amélioration continue outillée (VSM, Kaizen, KPI) avec coordination transversale production, SST, qualité et maintenance." },
  { nom: "TARDIF", ville: "Saint-Augustin-de-Desmaures", km: null, lecture: "Solutions d'élévation sur mesure. Gestion de projets manufacturiers complexes à 75-95 k$, mais l'annonce exige un baccalauréat en ingénierie et l'appartenance à l'OIQ." },
  { nom: "Nutriart", ville: "Québec", km: null, lecture: "Chocolaterie (propriétaire de Laura Secord). Coordination du département de maintenance, mais le taux affiché part de 20 $/h — nettement sous le marché pour la responsabilité décrite." },
];

/**
 * ⚠️ LE SWOT A DÉMÉNAGÉ DANS `lib/profil.ts` (ADR-0009).
 *
 * Il décrit la POSITION de Marc — ce que ses années, ses langues et ses diplômes lui
 * ouvrent ou lui ferment — donc il appartient au profil, au même titre que le barème. Le
 * laisser ici en aurait fait un second exemplaire : deux analyses de position dans deux
 * fichiers, dont une seule serait mise à jour par un téléversement de CV.
 *
 * Ce qui RESTE ici est ce que le CV ne peut pas établir : des relevés de marché et des
 * entreprises repérées, avec leur date et leur source. Ce sont des constats sur le MONDE,
 * pas sur Marc.
 *
 * Ré-exporté pour ne pas casser les écrans qui l'affichaient — un alias, jamais une copie.
 *
 * Ce ré-export sert le profil PAR DÉFAUT. Les écrans qui doivent montrer le profil ACTIF
 * (celui qu'un CV validé a produit) le reçoivent en propriété depuis leur page, qui seule
 * peut lire la base — un module de constantes n'a pas à faire d'I/O.
 */
export { type QuadrantSwot } from "./profil";
export { PROFIL_DEFAUT as PROFIL_REFERENCE } from "./profil";

import { PROFIL_DEFAUT } from "./profil";

/** Analyse de position par défaut, telle qu'établie le 2026-07-27. */
export const SWOT = PROFIL_DEFAUT.swot;
