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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      const r = await executerPasse([OFFRE_SUIVIE], journal, 0, "2026-08-12", rec as never);

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
    const r = await executerPasse([OFFRE_SUIVIE], journal, 0, "2027-06-01", rec as never);
    expect(r.sources.some((s) => s.ok)).toBe(true);
    expect(r.perimees).toEqual([OFFRE_SUIVIE.id]);
  });
});

describe("fermeture d'office — la passe l'applique vraiment", () => {
  /**
   * ⚠️ UN TEST QUI TRAVERSE, PAS UN TEST DE MODULE.
   *
   * `tests/fermetureAuto.test.ts` prouve que la RÈGLE est juste ; il ne prouve pas que la
   * passe l'appelle, ni qu'elle écrit `perimeeLe` sur ce qu'elle rend. C'est exactement le
   * genre de trou qui laisse un lot vert de bout en bout ne rien changer à l'écran : les
   * deux moitiés sont gardées, et le chaînon n'est le sujet d'aucun fichier.
   */
  // ⚠️ DES EMPLOYEURS DISTINCTS, ET C'EST UNE CONDITION DU TEST, PAS DU DÉCOR. La passe
  // résout une annonce vers une offre STOCKÉE par la clé canonique (entreprise + poste) :
  // avec le même employeur partout, le lot déposé « confirmait » une offre au hasard — et
  // la première version de ce fichier a vu la candidate marquée vue, donc jamais fermée,
  // pour cette seule raison.
  function suiviAvecDureeMesurable(): { offres: Offre[]; journal: Record<string, { premiereVue: string; derniereVue: string; absences: number }> } {
    const offres: Offre[] = [];
    const journal: Record<string, { premiereVue: string; derniereVue: string; absences: number }> = {};
    // Douze offres fermées observées 5 jours : la survie tombe à zéro au jour 5.
    for (let i = 0; i < 12; i++) {
      const id = `fermee-${i}`;
      offres.push({ ...OFFRE_SUIVIE, id, entreprise: `Fermee ${i}`, perimeeLe: "2026-08-20T00:00:00.000Z" });
      journal[id] = { premiereVue: "2026-08-10", derniereVue: "2026-08-15", absences: 4 };
    }
    // Douze vivantes confirmées, vues un seul jour : le journal reste majoritaire sans
    // diluer l'événement de fermeture (voir `tests/fermetureAuto.test.ts`).
    for (let i = 0; i < 12; i++) {
      const id = `vivante-${i}`;
      offres.push({ ...OFFRE_SUIVIE, id, entreprise: `Vivante ${i}`, dateReperage: "2026-09-10" });
      journal[id] = { premiereVue: "2026-09-13", derniereVue: "2026-09-13", absences: 0 };
    }
    return { offres, journal };
  }

  /** Un lot déposé qui RE-PUBLIE une offre connue et PROUVE sa couverture. */
  function ecrireLot(racine: string, jour: string) {
    mkdirSync(join(racine, "data", "depot"), { recursive: true });
    writeFileSync(
      join(racine, "data", "depot", `${jour}.json`),
      JSON.stringify({
        source: "indeed",
        jour,
        couverture: { demandes: 3, balayes: 3 },
        offres: [
          {
            titre: OFFRE_SUIVIE.poste,
            entreprise: OFFRE_SUIVIE.entreprise,
            ville: "Québec",
            adresse: "",
            adresseSource: null,
            adresseUrl: null,
            lien: OFFRE_SUIVIE.lien,
            description: "",
            publieeLe: jour,
            refSource: "",
          },
        ],
      }),
      "utf8",
    );
  }

  it("ferme l'offre jamais confirmée, la NOMME, et laisse le reste intact", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "jobai-fermeture-"));
    const cwd = process.cwd();
    try {
      const jour = "2026-09-14";
      ecrireLot(tmp, jour);
      process.chdir(tmp);

      const { offres, journal } = suiviAvecDureeMesurable();
      // La candidate : absente du journal, repérée il y a bien plus que le seuil mesuré.
      const jamais: Offre = { ...OFFRE_SUIVIE, id: "jamais-vue", entreprise: "Jamais Vue inc.", dateReperage: "2026-07-01" };
      // Le témoin : absente du journal AUSSI, mais Marc a posté sa candidature.
      const travaillee: Offre = {
        ...OFFRE_SUIVIE,
        id: "travaillee",
        entreprise: "Travaillee inc.",
        // ⚠️ LA PLUS VIEILLE DE TOUTES, ET C'EST CE QUI REND LE TÉMOIN VALABLE. Avec le même
        // âge que « jamais-vue », la borne du nombre de vues la protégeait par accident : la
        // mutation « retirer la protection du travail de Marc » restait verte, et le test
        // mesurait le tri au lieu de la garde.
        dateReperage: "2026-05-01",
        statut: "CVenvoye",
      };
      // Le second témoin : celle que le lot re-publie, donc confirmée par CETTE passe.
      //
      // ⚠️ ELLE EST LA PLUS VIEILLE DU LOT, ET C'EST CE QUI REND LE TÉMOIN VALABLE. Jugée
      // sur le journal d'AVANT la passe, elle serait candidate — et comme la borne ne garde
      // que les plus vieilles, elle partirait la PREMIÈRE. Avec un âge égal à celui de
      // « jamais-vue », la borne la protégeait par accident et la mutation « juger sur
      // l'ancien journal » restait verte : le test mesurait le tri, pas le journal.
      const revue: Offre = { ...OFFRE_SUIVIE, id: OFFRE_SUIVIE.id, dateReperage: "2026-06-01" };

      const r = await executerPasse(
        [...offres, jamais, travaillee, revue],
        journal,
        0,
        jour,
        (() => {
          throw new Error("aucun réseau nécessaire");
        }) as never,
      );

      expect(r.couvertureComplete).toBe(true);
      expect(r.fermetureAuto.motifAbstention).toBeNull();
      // ⚠️ ET LE CAS QUI COMPTE VRAIMENT EST CELUI D'EN DESSOUS : la fermeture d'office NE
      // DÉPEND PAS de cette couverture. Mesuré le 2026-09-14, aucun lot n'était déposé
      // depuis le 2026-08-21, donc la production tourne en couverture INCOMPLÈTE — un
      // mécanisme gaté dessus n'aurait jamais tiré.
      expect(r.fermetureAuto.fermetures.map((f) => f.id)).toEqual(["jamais-vue"]);
      // Le rapport la NOMME : « 1 fermée » ne se vérifie pas, « Jamais Vue inc. » si.
      expect(r.fermetureAuto.fermetures[0]?.entreprise).toBe("Jamais Vue inc.");
      expect(r.resume).toContain("fermée");

      const par = new Map(r.offres.map((o) => [o.id, o]));
      // Le chaînon : la passe a bien ÉCRIT la fermeture sur ce qu'elle rend.
      expect(par.get("jamais-vue")?.perimeeLe).toBe(`${jour}T00:00:00.000Z`);
      // Le travail de Marc, intact malgré le même âge et la même absence.
      expect(par.get("travaillee")?.perimeeLe).toBeNull();
      // Et celle que le lot vient de republier : confirmée, donc jamais candidate.
      expect(par.get(OFFRE_SUIVIE.id)?.perimeeLe).toBeNull();
    } finally {
      process.chdir(cwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ferme MÊME en couverture incomplète — c'est l'âge qui décide, pas le silence du jour", async () => {
    // Un lot SANS bloc `couverture` : exactement ce que porte la production (aucun lot
    // déposé depuis le 2026-08-21, et les lots existants sont antérieurs au champ). Gatée
    // sur `couvertureComplete`, la règle n'aurait jamais tiré : livrée verte, testée, et
    // morte à l'arrivée.
    const tmp = mkdtempSync(join(tmpdir(), "jobai-fermeture-partielle-"));
    const cwd = process.cwd();
    try {
      const jour = "2026-09-14";
      mkdirSync(join(tmp, "data", "depot"), { recursive: true });
      writeFileSync(
        join(tmp, "data", "depot", `${jour}.json`),
        JSON.stringify({
          source: "indeed",
          jour,
          offres: [
            {
              titre: OFFRE_SUIVIE.poste,
              entreprise: OFFRE_SUIVIE.entreprise,
              ville: "Québec",
              adresse: "",
              adresseSource: null,
              adresseUrl: null,
              lien: OFFRE_SUIVIE.lien,
              description: "",
              publieeLe: jour,
              refSource: "",
            },
          ],
        }),
        "utf8",
      );
      process.chdir(tmp);

      const { offres, journal } = suiviAvecDureeMesurable();
      const jamais: Offre = { ...OFFRE_SUIVIE, id: "jamais-vue", entreprise: "Jamais Vue inc.", dateReperage: "2026-07-01" };
      const r = await executerPasse([...offres, jamais], journal, 0, jour, (() => {
        throw new Error("aucun réseau nécessaire");
      }) as never);

      expect(r.couvertureComplete).toBe(false);
      expect(r.fermetureAuto.fermetures.map((f) => f.id)).toEqual(["jamais-vue"]);
      expect(r.offres.find((o) => o.id === "jamais-vue")?.perimeeLe).toBe(
        `${jour}T00:00:00.000Z`,
      );
    } finally {
      process.chdir(cwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ne ferme rien, et DIT pourquoi, quand aucune source ne répond", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "jobai-fermeture-vide-"));
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { offres, journal } = suiviAvecDureeMesurable();
      const jamais: Offre = { ...OFFRE_SUIVIE, id: "jamais-vue", entreprise: "Jamais Vue inc.", dateReperage: "2026-07-01" };
      const r = await executerPasse([...offres, jamais], journal, 0, "2026-09-14", (() => {
        throw new Error("réseau coupé");
      }) as never);

      expect(r.fermetureAuto.fermetures).toEqual([]);
      expect(r.fermetureAuto.motifAbstention).not.toBeNull();
      expect(r.offres.find((o) => o.id === "jamais-vue")?.perimeeLe).toBeNull();
      expect(r.resume).toContain("suspendu");
    } finally {
      process.chdir(cwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
