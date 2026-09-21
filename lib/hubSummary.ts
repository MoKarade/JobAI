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
  type HubDetailSection,
  type HubMetric,
  type HubSummary,
} from "@mokarade/hub-contract";
import type { CoutPublie } from "./coutLlm";
import { alertesVeille, blocFraicheur, sectionVeille, type VeillePubliee } from "./fraicheurVeille";
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

/**
 * Le libellé du GROS CHIFFRE de la carte — et, chez le hub, la CLÉ de son historique.
 *
 * ⚠️ Exporté pour que la garde le vise sans le recopier : deux écritures du même libellé
 * divergent, et le jour où elles divergent la courbe repart de zéro sans que rien ne rougisse
 * (le hub n'a aucun moyen de savoir qu'une série et son successeur parlent du même sujet).
 * Le changer est une décision, pas un ajustement de formulation.
 */
export const LIBELLE_HEROS = "Nouvelles (7 j)";

/** Le contrat borne les libellés à 40 caractères ; on tronque proprement plutôt que d'être rejeté. */
function libelle(texte: string, max = 40): string {
  const t = texte.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Construit le summary à partir du résumé du suivi.
 *
 * LE GROS CHIFFRE DE LA CARTE EST L'ARRIVAGE — « Nouvelles (7 j) » (décision Marc,
 * 2026-09-21 : « la carte jobai je veux que ce soit le nombre de nouvelles offres le gros
 * chiffre et le graph »). Il REMPLACE la meilleure offre d'ADR-0001, voir ADR-0020.
 *
 * ⚠️ CE N'EST PAS QU'UNE PRÉFÉRENCE : L'ANCIEN HÉROS NE POUVAIT PAS AVOIR DE COURBE.
 * Le hub indexe l'historique d'une métrique PAR SON LIBELLÉ (`serieMetrique(historique,
 * elue.label)` dans `Hubperso/lib/historique.ts`). Le libellé de la meilleure offre porte
 * le nom de l'entreprise — il CHANGE dès que l'offre de tête change d'employeur, donc la
 * série repartait de zéro et la carte affichait « pas encore d'historique ». Le chiffre mis
 * en avant était structurellement le seul à ne pas pouvoir être tracé.
 *
 * ⚠️ CONSÉQUENCE DIRECTE : « Nouvelles (7 j) » EST DÉSORMAIS UNE CLÉ, pas un titre.
 * Le renommer — même « en mieux » — jette l'historique déjà accumulé côté hub et ramène la
 * carte à « pas encore d'historique ». Une garde l'interdit (`tests/hubSummary.test.ts`).
 *
 * L'ordre ET le drapeau `primary` disent la même chose, et c'est délibéré : un hub pinné sur
 * un contrat antérieur à v1.3 ignore `primary` et retombe sur la position 0.
 *
 * @param genereLe date de génération, au format ISO. Passée en paramètre : une fonction
 *   qui lit l'horloge ne se teste pas deux fois de la même façon.
 * @param cout ce que la comptabilité des appels de modèle permet de publier. Paramètre
 *   pour la même raison que la date : la lecture du compteur est impure et vit dans
 *   `lib/coutLlmStore.ts`. Absent ⇒ traité comme « aucun appel », donc pas de bloc `usage`.
 * @param veille ce que la dernière passe permet de dire de la FRAÎCHEUR. Même raison encore :
 *   la lecture vit dans `lib/fraicheurVeille.ts`. Absent ⇒ « jamais de passe », donc aucun
 *   `dataAsOf` — jamais une date fabriquée depuis l'horloge du serveur, qui dirait « à
 *   l'instant » sur un suivi vieux de trois jours.
 */
export function construireSummary(
  resume: ResumeSuivi,
  genereLe: string,
  cout: CoutPublie = { etat: "aucun-appel" },
  veille: VeillePubliee = { etat: "jamais" },
): HubSummary {
  const metrics: HubMetric[] = [];

  // ⚠️ LE CONTRAT PLAFONNE À SIX MÉTRIQUES, ET L'ORDRE EST DONC UNE DÉCISION.
  //
  // Ce qui suit est trié par ce que Marc regarde en premier, pas par ancienneté du code :
  // l'arrivage (le héros, voir l'en-tête), puis la meilleure offre, puis le stock, puis
  // l'entonnoir de candidature. `slice(0, 6)` tranche à la fin : sans cet ordre, c'est lui
  // qui déciderait en silence, et il ferait tomber précisément ce qui vient d'être demandé.
  //
  // Pour tenir dans six créneaux, « CV envoyés » et « Réponses » sont FUSIONNÉS en un seul.
  // On n'y perd rien — les deux chiffres restent lisibles côte à côte — et ça libère la
  // place d'une information qui, elle, n'existait pas.
  metrics.push({
    label: LIBELLE_HEROS,
    value: resume.nouvelles,
    format: "number",
    // ⚠️ INCONDITIONNEL, et c'est ce qui remplace l'ancien repli. `resume.nouvelles` existe
    // TOUJOURS, et un zéro y est une information VRAIE (« rien n'est arrivé cette semaine »),
    // pas un chiffre inventé (garde-fou n°3). L'ancien héros, lui, disparaissait dès qu'aucune
    // offre n'était notée — d'où le repli d'alors, devenu sans objet.
    primary: true,
  });

  if (resume.meilleure) {
    metrics.push({
      label: libelle(`Meilleure : ${resume.meilleure.entreprise}`),
      value: resume.meilleure.score,
      format: "number",
      // Une offre de palier A mérite d'être remarquée dans la grille du hub. Elle reste
      // publiée — elle passe en métrique secondaire, elle ne disparaît pas de la carte.
      severity: resume.meilleure.score >= 80 ? "ok" : undefined,
    });
  }

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
  // Ce qui n'a pas de DATE se dit aussi : « jamais de passe » et « fraîcheur illisible » ne
  // sont pas le même message, et aucun des deux ne se déduit de l'absence de `dataAsOf`.
  alerts.push(...alertesVeille(veille));

  return {
    contractVersion: CONTRACT_VERSION,
    app: APP,
    generatedAt: genereLe,
    // `dataAsOf` + `expectedMaxAgeSec`, ou aucun des deux. Voir `blocFraicheur`.
    ...blocFraicheur(veille),
    status: "ok",
    metrics: metrics.slice(0, 6),
    alerts: alerts.slice(0, 10),
    actions: [{ label: "Ouvrir JobAI", kind: "link", href: APP.url }],
    ...blocUsage(cout),
    ...blocDetails(resume, veille),
  };
}

/**
 * Le bloc `details` du contrat v1.3, ou rien. PURE.
 *
 * ── POURQUOI L'ENTONNOIR PASSE EN DÉTAIL PLUTÔT QU'EN MÉTRIQUE ──────────────────────
 *
 * « CV envoyés · réponses » est une métrique TEXTE, née du plafond de six créneaux : deux
 * chiffres collés dans une chaîne pour libérer une place. Ça reste lisible, mais le hub ne
 * peut en tracer aucune courbe — une valeur texte n'entre pas dans une série (`serieMetrique`
 * écarte tout ce qui n'est pas un nombre). Le détail les republie donc SÉPARÉS et en nombres.
 * La métrique fusionnée reste : la retirer changerait ce que Marc voit aujourd'hui pour un
 * rendu qui n'existe pas encore côté hub.
 *
 * ⚠️ Rien de personnel ici (garde-fou n°1, dépôt PUBLIC) : que des comptes.
 */
function blocDetails(
  resume: ResumeSuivi,
  veille: VeillePubliee,
): Pick<HubSummary, "details"> | Record<string, never> {
  const sections: HubDetailSection[] = [];

  const passe = sectionVeille(veille);
  if (passe) sections.push(passe);

  sections.push({
    title: "Entonnoir de candidature",
    items: [
      { label: "CV envoyés", value: resume.cvEnvoyes, format: "number" },
      { label: "Réponses", value: resume.reponses, format: "number" },
      { label: "Entrevues", value: resume.entrevues, format: "number" },
      {
        label: "Offres suivies",
        value: resume.actives,
        format: "number",
        hint: `dont ${resume.notees80Plus} notée(s) 80+`,
      },
    ],
  });

  return { details: sections };
}
