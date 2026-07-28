// lib/export.ts — export du suivi en CSV.
//
// Fonction PURE : elle prend des offres et rend une chaîne. Aucun accès au navigateur ici,
// donc elle se teste sans harnais de rendu.
//
// Deux pièges traités, et le second est une vraie faille :
//   1. Les accents. Sans BOM UTF-8 en tête, Excel lit le fichier en ANSI et affiche
//      « Chargé de projets » comme « ChargÃ© de projets ».
//   2. L'INJECTION DE FORMULE. Une cellule qui commence par `=`, `+`, `-` ou `@` est
//      interprétée comme une formule par Excel, LibreOffice et Google Sheets. Une note
//      personnelle commençant par « =2+2 » — ou pire, par une formule appelant une URL —
//      s'exécuterait à l'ouverture du fichier. Le contenu vient de Marc, donc le risque est
//      faible ici ; il ne le sera plus quand la V3 fera écrire ces champs par un LLM à
//      partir d'offres publiques. On neutralise maintenant, pas après.

import type { Offre } from "./types";

const COLONNES = [
  "Note",
  "Provenance note",
  "Repérée le",
  "Entreprise",
  "Poste",
  "Distance km",
  "Salaire affiché",
  "Lien",
  "Priorité",
  "Statut",
  "Date envoi",
  "Périmée le",
  "Historique",
  "Notes de recherche",
  "Ma note",
] as const;

const LIBELLE_STATUT: Record<Offre["statut"], string> = {
  Identifiee: "Identifiée",
  CVenvoye: "CV envoyé",
  Relance: "Relance faite",
  Entrevue: "Entrevue",
  Refusee: "Refusée",
  Offre: "Offre reçue",
};

/**
 * Neutralise une cellule qui serait interprétée comme une formule.
 * Le préfixe apostrophe est la convention reconnue par Excel et LibreOffice : la valeur
 * s'affiche telle quelle, sans être évaluée.
 */
function neutraliserFormule(valeur: string): string {
  return /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
}

/** Échappe une cellule : guillemets doublés, le tout entre guillemets. */
function cellule(valeur: string | number | null | undefined): string {
  if (valeur === null || valeur === undefined) return '""';
  const texte = neutraliserFormule(String(valeur));
  return `"${texte.replace(/"/g, '""')}"`;
}

/**
 * Rend le contenu CSV complet, BOM inclus.
 * L'ordre des lignes est celui reçu : c'est l'appelant qui décide (et donc l'export suit
 * ce que Marc voit à l'écran, filtres compris).
 */
export function versCsv(offres: readonly Offre[]): string {
  const lignes = [COLONNES.map(cellule).join(",")];

  for (const o of offres) {
    lignes.push(
      [
        o.score ?? "",
        o.scoreSource === "manuel"
          ? "vérifiée à la main"
          : o.scoreSource === "calcule"
            ? "calculée"
            : "",
        o.dateReperage,
        o.entreprise,
        o.poste,
        // Décimale à la française : un tableur en locale fr lit « 3,5 » comme un nombre.
        o.km === null ? "" : String(o.km).replace(".", ","),
        o.salaireAffiche ?? "",
        o.lien,
        o.priorite,
        LIBELLE_STATUT[o.statut],
        o.dateEnvoi,
        o.perimeeLe ? o.perimeeLe.slice(0, 10) : "",
        o.histo ? "oui" : "non",
        o.notes,
        o.userNote,
      ]
        .map(cellule)
        .join(","),
    );
  }

  // CRLF : c'est ce qu'attend Excel. BOM en tête pour que les accents survivent.
  return `﻿${lignes.join("\r\n")}\r\n`;
}

/** Nom de fichier daté. La date est un paramètre — une fonction qui lit l'horloge ne se teste pas. */
export function nomFichierExport(aujourdhui: string): string {
  return `suivi-emploi-${aujourdhui.slice(0, 10)}.csv`;
}
