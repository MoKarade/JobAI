// lib/hubSummary.ts — traduction du résumé interne vers le contrat du hub.
//
// Séparation volontaire en deux moitiés :
//   - `construireSummary` est PURE : elle transforme un `ResumeSuivi` en `HubSummary` et
//     se teste sans base, sans réseau et sans horloge (la date est un paramètre) ;
//   - `getTrackerState` est le seul point IMPUR, et le seul endroit qui décide si l'app a
//     quelque chose de réel à publier.
//
// HONNÊTETÉ (garde-fou n°3) : tant qu'aucune donnée réelle n'existe, on publie
// `status: "building"` — jamais des compteurs à zéro, qui se liraient comme « recherche
// à l'arrêt » alors que le sens est « pas encore branché ». Un zéro affirme, une absence
// admet.

import {
  CONTRACT_VERSION,
  type HubAlert,
  type HubMetric,
  type HubSummary,
} from "@mokarade/hub-contract";
import type { ResumeSuivi } from "./types";

/** Identité publiée au hub. L'`id` doit rester égal à l'entrée de `Hubperso/lib/sources.ts`. */
export const APP: HubSummary["app"] = {
  id: "jobai",
  name: "JobAI",
  url: "https://emploi.hubperso.com",
  color: "#f2a31b",
};

/** Le contrat borne les libellés à 40 caractères ; on tronque proprement plutôt que d'être rejeté. */
function libelle(texte: string, max = 40): string {
  const t = texte.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Construit le summary à partir du résumé du suivi.
 *
 * La métrique en position 0 devient le gros chiffre du widget : c'est la MEILLEURE OFFRE
 * du moment (décision Marc, ADR-0001). Le widget répond ainsi à « qu'est-ce qui vaut le
 * coup en ce moment » plutôt qu'à « combien j'en ai » — la seconde question ne bouge
 * presque jamais, et un widget figé cesse d'être regardé.
 *
 * @param genereLe date de génération, au format ISO. Passée en paramètre : une fonction
 *   qui lit l'horloge ne se teste pas deux fois de la même façon.
 */
export function construireSummary(resume: ResumeSuivi, genereLe: string): HubSummary {
  const metrics: HubMetric[] = [];

  if (resume.meilleure) {
    metrics.push({
      label: libelle(`Meilleure : ${resume.meilleure.entreprise}`),
      value: resume.meilleure.score,
      format: "number",
      // Une offre de palier A mérite d'être remarquée dans la grille du hub.
      severity: resume.meilleure.score >= 80 ? "ok" : undefined,
    });
  }

  metrics.push(
    { label: "Offres suivies", value: resume.actives, format: "number" },
    { label: "Notées 80+", value: resume.notees80Plus, format: "number" },
    { label: "CV envoyés", value: resume.cvEnvoyes, format: "number" },
    { label: "Réponses", value: resume.reponses, format: "number" },
  );

  // Le contrat plafonne à 6 métriques. On ajoute les entrevues seulement s'il reste de la
  // place — et il en reste, sauf si une métrique est ajoutée ici sans compter.
  if (metrics.length < 6) {
    metrics.push({ label: "Entrevues", value: resume.entrevues, format: "number" });
  }

  const alerts: HubAlert[] = [];
  if (resume.actives === 0) {
    alerts.push({ label: "Aucune offre active suivie", severity: "info" });
  }

  return {
    contractVersion: CONTRACT_VERSION,
    app: APP,
    generatedAt: genereLe,
    status: "ok",
    metrics: metrics.slice(0, 6),
    alerts,
    actions: [{ label: "Ouvrir JobAI", kind: "link", href: APP.url }],
  };
}
