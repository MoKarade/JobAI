// tests/ingest-passe-suspension.test.ts — un balayage aveugle ne périme rien.
//
// ⚠️ LE VERROU DE L'INCIDENT DU 2026-08-12. Le bundle serverless n'embarquait pas
// `data/depot` : chaque cron lisait un dossier absent, le rendait comme « aucune offre »,
// et ajoutait +1 absence à tout le suivi — 40 offres périmées en trois jours par un
// empêchement d'INFRASTRUCTURE, pas par le marché. Le correctif vérifié ici : une passe
// dont AUCUNE source n'a répondu suspend le balayage — compteurs d'absences inchangés,
// suspension nommée dans le résumé. « Un mécanisme qui ne peut pas atteindre sa source
// doit le DIRE, pas rendre un résultat vide » — et ne surtout pas DÉCIDER sur ce vide.
//
// ⚠️ LA SOURCE DU MONTAGE A CHANGÉ LE 2026-09-18, PAS CE QU'IL DÉFEND. Ces cas étaient bâtis
// sur des lots `data/depot/*.json` écrits dans un répertoire temporaire, parce que le dépôt
// de fichiers était alors la source la plus facile à faire répondre ou taire à volonté. Le
// dépôt a été supprimé (il ne rendait plus rien depuis le 21/08) ; le flux du Guichet est
// désormais la seule source, et il s'injecte par son `recuperer`. Aucun invariant n'a bougé :
// ce qui se lisait « le dossier est absent » se lit maintenant « le flux est injoignable »,
// et le montage n'a plus besoin de toucher au disque ni au répertoire courant.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEUIL_ABSENCES_PEREMPTION } from "@/lib/veille";
import { executerPasse } from "../lib/ingest/passe";
import { TAMPON_MAX } from "../lib/ingest/guichetFlux";
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

/** Les métiers du montage. Ils ne filtrent plus l'ingestion — ils nomment le domaine. */
const METIERS = ["22"] as const;

const enc = new TextEncoder();

/** Un bloc `<job>` du flux, à la forme exacte de ce que publie le Guichet. */
function jobFlux(o: { ref: string; entreprise: string; titre: string; ville: string }): string {
  const champs: Record<string, string> = {
    title: o.titre,
    date: "2026-08-18 09:12:00",
    referencenumber: o.ref,
    url: `https://www.guichetemplois.gc.ca/offre/${o.ref}`,
    company: o.entreprise,
    city: o.ville,
    state: "QC",
    country: "CA",
    noc2021: "22301",
    description: "Poste en usine, quart de jour.",
  };
  const corps = Object.entries(champs)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
    .join("");
  return `<job>${corps}</job>`;
}

/** Un flux qui RÉPOND, servi en un morceau : la lecture va jusqu'au bout. */
function fluxQuiSert(corps: string): { metiers: readonly string[]; recuperer: typeof fetch } {
  return {
    metiers: METIERS,
    recuperer: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(corps));
            c.close();
          },
        }),
        { status: 200 },
      ),
  };
}

/**
 * Un flux qui répond PUIS déborde le tampon : la lecture s'arrête en cours de route.
 *
 * C'est le seul moyen de fabriquer une couverture INCOMPLÈTE sans toucher au code de
 * production : les deux autres fins partielles dépendent d'un plafond de retenues et d'un
 * budget de temps, ni l'un ni l'autre réglable depuis `executerPasse`. Ce que le cas éprouve
 * n'est pas le débordement lui-même — c'est qu'une offre lue AVANT l'arrêt compte quand même,
 * et que la passe le sache incomplète.
 */
function fluxTronque(corps: string): { metiers: readonly string[]; recuperer: typeof fetch } {
  return {
    metiers: METIERS,
    recuperer: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(corps));
            // Aucune balise ouvrante ici : le tampon grossit sans jamais rien livrer.
            c.enqueue(enc.encode("x".repeat(TAMPON_MAX + 1_024)));
            c.close();
          },
        }),
        { status: 200 },
      ),
  };
}

/** Un flux INJOIGNABLE : l'échec porte son nom jusqu'au rapport de passe. */
function fluxEnPanne(): { metiers: readonly string[]; recuperer: typeof fetch } {
  return {
    metiers: METIERS,
    recuperer: async () => {
      throw new Error("réseau coupé");
    },
  };
}

/** Le flux qui re-publie l'offre suivie — donc la confirme vivante. */
function fluxAvecOffreSuivie(): string {
  return `<source>${jobFlux({
    ref: "1",
    entreprise: OFFRE_SUIVIE.entreprise,
    titre: OFFRE_SUIVIE.poste,
    ville: "Québec",
  })}</source>`;
}

/** Le `Recuperateur` du contrat `Source` : le flux ne doit JAMAIS s'en servir. */
const recuperateurInterdit = (() => {
  throw new Error("le flux ne passe pas par le Recuperateur (130 Mo en mémoire)");
}) as never;

describe("balayage suspendu quand aucune source ne répond", () => {
  it("ne compte AUCUNE absence, ne périme rien, et le dit dans le résumé", async () => {
    // Une absence de moins que le seuil : la passe suivante DEVRAIT la périmer. Dérivé
    // de la constante, jamais écrit en dur — le seuil est passé de 3 à 5 le 2026-08-17
    // pour absorber la rotation des termes, et un 2 figé aurait fait tomber ce test sur
    // un changement légitime, en donnant l'impression d'une régression.
    const auBord = SEUIL_ABSENCES_PEREMPTION - 1;
    const journal = {
      [OFFRE_SUIVIE.id]: { absences: auBord, derniereVue: "2026-08-09", premiereVue: "2026-08-01" },
    };

    const r = await executerPasse(
      [OFFRE_SUIVIE],
      journal,
      0,
      "2026-08-12",
      recuperateurInterdit,
      undefined,
      fluxEnPanne(),
    );

    // ⚠️ ANTI-VACUITÉ, ET ELLE N'EST PAS DÉCORATIVE. `sources.every(s => !s.ok)` est VRAI
    // sur un tableau vide : sans ce cas, un montage qui n'interrogerait plus rien du tout
    // rendrait ce test vert en ne mesurant rien. Une source, en échec, et nommée.
    expect(r.sources).toHaveLength(1);
    expect(r.sources.every((s) => !s.ok)).toBe(true);
    expect(r.sources[0]?.erreur).toContain("réseau coupé");
    // Au bord du seuil, un balayage appliqué aurait PÉRIMÉ l'offre. Suspendu :
    // rien ne bouge — c'est le discriminant, prouvé aussi en sens inverse ci-dessous.
    expect(r.perimees).toEqual([]);
    expect(r.journal).toEqual(journal);
    expect(r.resume).toContain("suspendu");
  });

  it("discriminant inverse : dès qu'UNE source répond, le balayage s'applique", async () => {
    // Même montage, mais le flux répond — avec une offre qui n'est PAS celle qu'on suit.
    // L'offre à absences = seuil−1, non revue, DOIT alors franchir le seuil : c'est la
    // péremption honnête, intacte.
    const journal = {
      [OFFRE_SUIVIE.id]: {
        absences: SEUIL_ABSENCES_PEREMPTION - 1,
        derniereVue: "2027-05-01",
        premiereVue: "2027-04-01",
      },
    };
    const autre = `<source>${jobFlux({
      ref: "9",
      entreprise: "Autre Employeur",
      titre: "Technicien en génie mécanique",
      ville: "Québec",
    })}</source>`;

    const r = await executerPasse(
      [OFFRE_SUIVIE],
      journal,
      0,
      "2027-06-01",
      recuperateurInterdit,
      undefined,
      fluxQuiSert(autre),
    );
    expect(r.sources.some((s) => s.ok)).toBe(true);
    expect(r.perimees).toEqual([OFFRE_SUIVIE.id]);
  });

  it("⚠️ une passe SANS source demandée suspend aussi — échec fermé, et c'est neuf", async () => {
    // Depuis le 2026-09-18, le flux est la SEULE source et il est OPTIONNEL : un appelant
    // qui ne le demande pas n'interroge plus rien. Avant, le dépôt de fichiers était toujours
    // là, donc le cas « zéro source interrogée » n'existait pas. Il existe maintenant, et la
    // seule réponse sûre est celle-ci : n'avoir rien regardé ne conclut rien.
    const journal = {
      [OFFRE_SUIVIE.id]: {
        absences: SEUIL_ABSENCES_PEREMPTION - 1,
        derniereVue: "2026-08-09",
        premiereVue: "2026-08-01",
      },
    };
    const r = await executerPasse([OFFRE_SUIVIE], journal, 0, "2026-08-12", recuperateurInterdit);
    expect(r.sources).toEqual([]);
    expect(r.perimees).toEqual([]);
    expect(r.journal).toEqual(journal);
    expect(r.resume).toContain("suspendu");
  });
});

// ⚠️ DES EMPLOYEURS DISTINCTS, ET C'EST UNE CONDITION DU TEST, PAS DU DÉCOR. La passe
// résout une annonce vers une offre STOCKÉE par la clé canonique (entreprise + poste) :
// avec le même employeur partout, le lot publié « confirmait » une offre au hasard — et
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

describe("fermeture d'office — la passe l'applique vraiment", () => {
  /**
   * ⚠️ UN TEST QUI TRAVERSE, PAS UN TEST DE MODULE.
   *
   * `tests/fermetureAuto.test.ts` prouve que la RÈGLE est juste ; il ne prouve pas que la
   * passe l'appelle, ni qu'elle écrit `perimeeLe` sur ce qu'elle rend. C'est exactement le
   * genre de trou qui laisse un lot vert de bout en bout ne rien changer à l'écran : les
   * deux moitiés sont gardées, et le chaînon n'est le sujet d'aucun fichier.
   */
  it("ferme l'offre jamais confirmée, la NOMME, et laisse le reste intact", async () => {
    const jour = "2026-09-14";
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
    // Le second témoin : celle que le flux re-publie, donc confirmée par CETTE passe.
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
      recuperateurInterdit,
      undefined,
      fluxQuiSert(fluxAvecOffreSuivie()),
    );

    expect(r.couvertureComplete).toBe(true);
    expect(r.fermetureAuto.motifAbstention).toBeNull();
    // ⚠️ ET LE CAS QUI COMPTE VRAIMENT EST CELUI D'EN DESSOUS : la fermeture d'office NE
    // DÉPEND PAS de cette couverture. Mesuré le 2026-09-14, aucun lot n'était déposé
    // depuis le 2026-08-21, donc la production tournait en couverture INCOMPLÈTE — un
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
    // Et celle que le flux vient de republier : confirmée, donc jamais candidate.
    expect(par.get(OFFRE_SUIVIE.id)?.perimeeLe).toBeNull();
  });

  it("ferme MÊME en couverture incomplète — c'est l'âge qui décide, pas le silence du jour", async () => {
    // Une lecture ARRÊTÉE EN COURS DE ROUTE : le flux a livré son offre, puis s'est mis à
    // remplir le tampon sans jamais refermer de balise. Gatée sur `couvertureComplete`, la
    // règle n'aurait jamais tiré en production : livrée verte, testée, et morte à l'arrivée.
    const jour = "2026-09-14";
    const { offres, journal } = suiviAvecDureeMesurable();
    const jamais: Offre = { ...OFFRE_SUIVIE, id: "jamais-vue", entreprise: "Jamais Vue inc.", dateReperage: "2026-07-01" };

    const r = await executerPasse(
      [...offres, jamais],
      journal,
      0,
      jour,
      recuperateurInterdit,
      undefined,
      fluxTronque(fluxAvecOffreSuivie()),
    );

    // Anti-vacuité : la source a bien RÉPONDU (sinon on mesurerait la suspension, pas la
    // couverture) et elle a bien vu passer l'offre qui confirme le suivi.
    expect(r.sources.every((s) => s.ok)).toBe(true);
    expect(r.couvertureComplete).toBe(false);
    expect(r.fermetureAuto.fermetures.map((f) => f.id)).toEqual(["jamais-vue"]);
    expect(r.offres.find((o) => o.id === "jamais-vue")?.perimeeLe).toBe(
      `${jour}T00:00:00.000Z`,
    );
  });

  it("ne ferme rien, et DIT pourquoi, quand aucune source ne répond", async () => {
    const { offres, journal } = suiviAvecDureeMesurable();
    const jamais: Offre = { ...OFFRE_SUIVIE, id: "jamais-vue", entreprise: "Jamais Vue inc.", dateReperage: "2026-07-01" };
    const r = await executerPasse(
      [...offres, jamais],
      journal,
      0,
      "2026-09-14",
      recuperateurInterdit,
      undefined,
      fluxEnPanne(),
    );

    expect(r.sources).toHaveLength(1);
    expect(r.fermetureAuto.fermetures).toEqual([]);
    expect(r.fermetureAuto.motifAbstention).not.toBeNull();
    expect(r.offres.find((o) => o.id === "jamais-vue")?.perimeeLe).toBeNull();
    expect(r.resume).toContain("suspendu");
  });
});

describe("ce que la passe FERME, elle le met dans la liste que la base écrit", () => {
  // ⚠️ L'INVARIANT QUI MANQUAIT, ET IL A COÛTÉ UNE JOURNÉE. La fermeture d'office livrée le
  // 2026-09-14 calculait juste, rendait juste, et passait un test d'intégration qui vérifiait
  // `rapport.offres` — ce que la passe REND. Or `lib/veilleComplete.ts` n'écrit en base que
  // les identifiants listés dans `rapport.perimees` : les fermetures n'y étaient pas, donc
  // rien n'atteignait la base. Mesuré le lendemain : `perimees` 606 → 624 (la péremption
  // ordinaire, persistée) pendant que `jamaisConfirmees` restait à 21, inchangé.
  //
  // Le test d'avant regardait le bon objet au mauvais endroit. Celui-ci défend le CONTRAT
  // dont l'écriture dépend : toute offre que la passe rend avec un `perimeeLe` que l'entrée
  // n'avait pas DOIT figurer dans `rapport.perimees`. Il vaut pour la péremption ordinaire,
  // pour la fermeture d'office, et pour le prochain mécanisme qu'on ajoutera.
  function fermeturesNonListees(
    avant: readonly Offre[],
    rapport: { offres: readonly Offre[]; perimees: readonly string[] },
  ): string[] {
    const etait = new Map(avant.map((o) => [o.id, o.perimeeLe]));
    return rapport.offres
      .filter((o) => o.perimeeLe !== null && (etait.get(o.id) ?? null) === null)
      .map((o) => o.id)
      .filter((id) => !rapport.perimees.includes(id));
  }

  it("une offre fermée d'office est dans `perimees`, sinon la base ne la verra jamais", async () => {
    const jour = "2026-09-14";
    const { offres, journal } = suiviAvecDureeMesurable();
    const jamais: Offre = {
      ...OFFRE_SUIVIE,
      id: "jamais-vue",
      entreprise: "Jamais Vue inc.",
      dateReperage: "2026-07-01",
    };
    const avant = [...offres, jamais];
    const r = await executerPasse(
      avant,
      journal,
      0,
      jour,
      recuperateurInterdit,
      undefined,
      fluxQuiSert(fluxAvecOffreSuivie()),
    );

    // Anti-vacuité : sans fermeture, l'invariant serait vrai pour rien.
    expect(r.fermetureAuto.fermetures.map((f) => f.id)).toEqual(["jamais-vue"]);
    expect(fermeturesNonListees(avant, r)).toEqual([]);
    expect(r.perimees).toContain("jamais-vue");
  });

  it("`lib/veilleComplete.ts` écrit bien depuis cette liste-là", () => {
    // L'autre bout du contrat. Si la persistance cessait de parcourir `rapport.perimees`,
    // l'invariant ci-dessus resterait vrai et ne protégerait plus rien.
    const code = readFileSync(resolve(process.cwd(), "lib/veilleComplete.ts"), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(code.length).toBeGreaterThan(5_000);
    expect(code).toContain("for (const id of rapport.perimees)");
  });
});
