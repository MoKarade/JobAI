// tests/ingest-passe-suspension.test.ts — un balayage aveugle ne périme rien.
//
// ⚠️ LE VERROU DE L'INCIDENT DU 2026-08-12. Le bundle serverless n'embarquait pas
// `data/depot` : chaque cron lisait un dossier absent, le rendait comme « aucune offre »,
// et ajoutait +1 absence à tout le suivi — 40 offres périmées en trois jours par un
// empêchement d'INFRASTRUCTURE, pas par le marché. Deux correctifs conjoints, tous deux
// vérifiés ici : le dossier absent est une PANNE DITE (ok:false), et une passe dont AUCUNE
// source n'a répondu suspend le balayage — compteurs d'absences inchangés, suspension
// nommée dans le résumé. « Un mécanisme qui ne peut pas atteindre sa source doit le DIRE,
// pas rendre un résultat vide » — et ne surtout pas DÉCIDER sur ce vide.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEUIL_ABSENCES_PEREMPTION } from "@/lib/veille";
import { executerPasse } from "../lib/ingest/passe";
import type { Offre } from "../lib/types";

const OFFRE_SUIVIE: Offre = {
  id: "laserax-coordonnateur",
  source: "jobbank",
  dateReperage: "2026-08-01",
  entreprise: "Laserax",
  poste: "Coordonnateur",
  lien: "https://exemple.test/o",
  km: null,
  ville: "Québec",
  salaireAffiche: null,
  statut: "Identifiee",
  priorite: "Moyenne",
  dateEnvoi: "",
  userNote: "",
  score: 70,
  scoreSource: "calcule",
  raisons: [],
  notes: "",
  histo: false,
  perimeeLe: null,
};

describe("balayage suspendu quand aucune source ne répond", () => {
  it("ne compte AUCUNE absence, ne périme rien, et le dit dans le résumé", async () => {
    // Un répertoire SANS data/depot : la source dépôt tombe en panne dite (ok:false) —
    // exactement l'état de la production pendant l'incident.
    const tmp = mkdtempSync(join(tmpdir(), "jobai-passe-"));
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      // Une absence de moins que le seuil : la passe suivante DEVRAIT la périmer. Dérivé
      // de la constante, jamais écrit en dur — le seuil est passé de 3 à 5 le 2026-08-17
      // pour absorber la rotation des termes, et un 2 figé aurait fait tomber ce test sur
      // un changement légitime, en donnant l'impression d'une régression.
      const auBord = SEUIL_ABSENCES_PEREMPTION - 1;
      const journal = { [OFFRE_SUIVIE.id]: { absences: auBord, derniereVue: "2026-08-09", premiereVue: "2026-08-01" } };
      const rec = () => {
        throw new Error("réseau coupé");
      };
      const r = await executerPasse([OFFRE_SUIVIE], journal, [], 0, "2026-08-12", rec as never);

      // La panne est DITE, pas rendue comme un jour vide.
      expect(r.sources.every((s) => !s.ok)).toBe(true);
      // Au bord du seuil, un balayage appliqué aurait PÉRIMÉ l'offre. Suspendu :
      // rien ne bouge — c'est le discriminant, prouvé aussi en sens inverse ci-dessous.
      expect(r.perimees).toEqual([]);
      expect(r.journal).toEqual(journal);
      expect(r.resume).toContain("suspendu");
    } finally {
      process.chdir(cwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("discriminant inverse : dès qu'UNE source répond, le balayage s'applique", async () => {
    // Même montage, mais depuis le VRAI dépôt (data/depot présent, fenêtre vide à cette
    // date lointaine → source dépôt ok avec 0 offre). L'offre à absences=2 non revue DOIT
    // alors franchir le seuil : c'est la péremption honnête, intacte.
    const journal = {
      [OFFRE_SUIVIE.id]: {
        absences: SEUIL_ABSENCES_PEREMPTION - 1,
        derniereVue: "2027-05-01",
        premiereVue: "2027-04-01",
      },
    };
    const rec = () => {
      throw new Error("réseau coupé");
    };
    const r = await executerPasse([OFFRE_SUIVIE], journal, [], 0, "2027-06-01", rec as never);
    expect(r.sources.some((s) => s.ok)).toBe(true);
    expect(r.perimees).toEqual([OFFRE_SUIVIE.id]);
  });
});
