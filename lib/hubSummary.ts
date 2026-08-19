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
import type { CoutPublie } from "./coutLlm";
import type { ResumeSuivi } from "./types";

/** Identité publiée au hub. L'`id` doit rester égal à l'entrée de `Hubperso/lib/sources.ts`. */
export const APP: HubSummary["app"] = {
  id: "jobai",
  name: "JobAI",
  url: "https://emploi.hubperso.com",
  color: "#f2a31b",
};

/**
 * Le bloc `usage` du contrat, ou rien. PURE, et le SEUL endroit qui décide.
 *
 * ⚠️ UN SEUL EXEMPLAIRE, PARCE QU'IL Y A DEUX CONSOMMATEURS. Le summary complet le porte,
 * et le summary « en construction » aussi — un CV peut être analysé avant la première offre
 * suivie, et le coût est alors bien réel pendant que le suivi n'est pas branché. Recopier la
 * règle des deux côtés est exactement la classe de faute que ce dépôt a payée six fois : la
 * seconde copie oublie l'arrondi, ou publie un `0` là où il faut une absence.
 *
 * `amount: 0` sur zéro appel AFFIRME « JobAI ne coûte rien » ; l'absence de bloc ADMET
 * « non suivie », ce qui est vrai tant que rien n'a été dépensé. Un montant mesuré qui tombe
 * à 0,00 $ après arrondi, lui, se publie : c'est une mesure, pas une absence de mesure.
 */
export function blocUsage(cout: CoutPublie): Pick<HubSummary, "usage"> | Record<string, never> {
  if (cout.etat !== "mesure") return {};
  return { usage: { cost: { amount: cout.montantUsd, currency: "USD", period: "total" } } };
}

/**
 * Les alertes que la comptabilité impose. PURE, et partagée pour la même raison que
 * `blocUsage` : « pas de montant » se lit « non suivie » au hub, donc exactement comme une
 * app qui n'a jamais appelé de modèle. L'alerte est ce qui sépare les deux.
 */
export function alertesCout(cout: CoutPublie): HubAlert[] {
  if (cout.etat === "illisible") {
    return [{ label: "Compteur de coût LLM illisible", severity: "warn" }];
  }
  if (cout.etat === "non-mesure") {
    return [{ label: `${cout.appelsNonMesures} appel(s) LLM non mesuré(s)`, severity: "warn" }];
  }
  if (cout.etat === "mesure" && cout.appelsNonMesures > 0) {
    return [
      {
        label: libelle(`Coût sous-estimé : ${cout.appelsNonMesures} appel(s) non mesuré(s)`),
        severity: "warn",
      },
    ];
  }
  return [];
}

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
 * @param cout ce que la comptabilité des appels de modèle permet de publier. Paramètre
 *   pour la même raison que la date : la lecture du compteur est impure et vit dans
 *   `lib/coutLlmStore.ts`. Absent ⇒ traité comme « aucun appel », donc pas de bloc `usage`.
 */
export function construireSummary(
  resume: ResumeSuivi,
  genereLe: string,
  cout: CoutPublie = { etat: "aucun-appel" },
): HubSummary {
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

  // ⚠️ LE CONTRAT PLAFONNE À SIX MÉTRIQUES, ET L'ORDRE EST DONC UNE DÉCISION.
  //
  // Ce qui suit est trié par ce que Marc regarde en premier, pas par ancienneté du code :
  // la meilleure offre, puis l'arrivage du jour (demande de Marc 2026-08-14 — « le nombre de
  // nouvelles offres et leur note à peu près »), puis le stock, puis l'entonnoir de
  // candidature. `slice(0, 6)` tranche à la fin : sans cet ordre, c'est lui qui déciderait
  // en silence, et il ferait tomber précisément ce qui vient d'être demandé.
  //
  // Pour tenir dans six créneaux, « CV envoyés » et « Réponses » sont FUSIONNÉS en un seul.
  // On n'y perd rien — les deux chiffres restent lisibles côte à côte — et ça libère la
  // place d'une information qui, elle, n'existait pas.
  metrics.push({ label: "Nouvelles (7 j)", value: resume.nouvelles, format: "number" });

  // La moyenne ne se publie QUE s'il y a quelque chose à moyenner. Un « 0 » se lirait
  // « ces offres ne valent rien » alors que la vérité est « aucune n'est notée » — et le
  // compteur juste au-dessus dit déjà zéro quand il n'y a rien (garde-fou n°3).
  if (resume.noteMoyenneNouvelles !== null) {
    metrics.push({
      label: "Note moyenne des nouvelles",
      value: resume.noteMoyenneNouvelles,
      format: "number",
      severity: resume.noteMoyenneNouvelles >= 80 ? "ok" : undefined,
    });
  }

  metrics.push(
    { label: "Offres suivies", value: resume.actives, format: "number" },
    { label: "Notées 80+", value: resume.notees80Plus, format: "number" },
    {
      label: "CV envoyés · réponses",
      value: `${resume.cvEnvoyes} · ${resume.reponses}`,
      format: "text",
    },
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

  // Ce qui ne se mesure pas se DIT, plutôt que de s'arrondir à zéro (voir `alertesCout`).
  alerts.push(...alertesCout(cout));

  return {
    contractVersion: CONTRACT_VERSION,
    app: APP,
    generatedAt: genereLe,
    status: "ok",
    metrics: metrics.slice(0, 6),
    alerts,
    actions: [{ label: "Ouvrir JobAI", kind: "link", href: APP.url }],
    ...blocUsage(cout),
  };
}
