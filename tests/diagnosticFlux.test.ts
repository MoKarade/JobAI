// tests/diagnosticFlux.test.ts — l'instrument de `[VEILLE-42]` : la population NON PLACÉE.
//
// CE QUE CES TESTS PROTÈGENT, ET POURQUOI ILS VALENT LEUR PLACE
//
// `diagnostic_flux` inventorie onze champs, mais tous ses inventaires portent sur les offres
// RETENUES — celles qu'on a su placer dans la région. Concevoir une règle de tri géographique
// sur eux, c'est la concevoir sur la population inverse de celle qu'elle doit trier. Les deux
// comptes ajoutés ici (`lettresInconnues`, `regionsInconnues`) sont les SEULS du rapport qui
// décrivent les offres tombées en « lieu inconnu », et c'est sur eux que le remède se décidera.
//
// D'où trois gardes, et chacune ferme un mode de panne distinct :
//   1. le compte porte EXACTEMENT sur les « lieu inconnu » — ni les acceptées, ni les rejetées.
//      Un tally posé un cran trop haut décrirait tout le flux et se lirait pourtant comme une
//      mesure de la queue ;
//   2. une offre SANS code postal est comptée `(vide)`, jamais abandonnée. C'est le cas qui
//      décide si le remède est applicable : une bande postale ne peut rien trier si la moitié
//      des offres n'en porte pas, et une omission silencieuse ferait croire l'inverse ;
//   3. l'outil MCP RELAIE les deux champs (la garde est dans `tests/mcpServeur.test.ts`). Ce
//      dépôt a déjà payé la classe `[FERMETURE-03]` : calculé juste, jamais livré.

import { describe, it, expect } from "vitest";
import { diagnostiquerFlux } from "../lib/ingest/diagnosticFlux";

const enc = new TextEncoder();

function job(champs: Record<string, string>): string {
  const corps = Object.entries(champs)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
    .join("");
  return `<job>${corps}</job>`;
}

/** Une offre du flux, paramétrée par ce qui décide de son sort ici : la ville et le code. */
function offre(o: { ref: string; ville: string; code?: string }): string {
  return job({
    title: "Technicien en génie mécanique",
    date: "2026-08-18 09:12:00",
    referencenumber: o.ref,
    url: `https://www.guichetemplois.gc.ca/offre/${o.ref}`,
    company: "Employeur",
    city: o.ville,
    state: "QC",
    country: "CA",
    noc2021: "22301",
    ...(o.code === undefined ? {} : { postalcode: o.code }),
    description: "Poste en usine, quart de jour.",
  });
}

function sert(corps: string): typeof fetch {
  return async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(corps));
          c.close();
        },
      }),
      { status: 200 },
    );
}

/**
 * Un flux qui porte les TROIS verdicts, et deux « lieu inconnu » de bandes postales
 * différentes.
 *
 * ⚠️ Les villes inconnues sont choisies hors des DEUX listes de `lib/ingest/region.ts` : une
 * ville qui y figurerait rendrait le cas vacueux sans rien signaler — le compte serait à zéro
 * et l'égalité de la garde 1 tiendrait quand même (0 === 0).
 */
const FLUX = `<source>${[
  offre({ ref: "1", ville: "Québec", code: "G1V 2M2" }),
  offre({ ref: "2", ville: "Montréal", code: "H3B 1A1" }),
  offre({ ref: "3", ville: "Amos", code: "J9T 1A1" }),
  offre({ ref: "4", ville: "Kuujjuaq", code: "J0M 1C0" }),
  offre({ ref: "5", ville: "Gaspé" }),
].join("")}</source>`;

async function mesurer() {
  return diagnostiquerFlux(sert(FLUX));
}

function total(compte: readonly { nom: string; n: number }[]): number {
  return compte.reduce((s, c) => s + c.n, 0);
}

describe("diagnostic_flux — le code postal des offres NON PLACÉES", () => {
  it("compte exactement la population « lieu inconnu », pas le flux entier", async () => {
    const r = await mesurer();

    // Le témoin d'abord : sans lui, l'égalité ci-dessous serait satisfaite par un flux qui
    // n'aurait produit aucun lieu inconnu, et la garde ne mesurerait rien.
    expect(r.fin).toBe("flux-termine");
    expect(r.verdicts["lieu-inconnu"]).toBe(3);
    expect(r.verdicts["dans-la-region"]).toBe(1);
    expect(r.verdicts["hors-region"]).toBe(1);

    // ⚠️ L'ÉGALITÉ PORTE SUR `lettresInconnues`, ET C'EST DÉLIBÉRÉ : `regionsInconnues` est
    // tronqué au top 25, donc son total ne peut PAS servir de preuve de totalité — il serait
    // court dès que la queue s'allonge, c'est-à-dire exactement quand la mesure devient utile.
    expect(total(r.lettresInconnues)).toBe(r.verdicts["lieu-inconnu"]);
    expect(total(r.lettresInconnues)).toBeLessThan(r.vues);

    // Ni le code de l'offre acceptée (G1V) ni celui de la rejetée (H3B) n'y figurent : c'est
    // ce qui distingue ce compte des onze inventaires, qui décrivent les RETENUES.
    expect(r.lettresInconnues.map((c) => c.nom).sort()).toEqual(["(vide)", "J"]);
    expect(r.regionsInconnues.map((c) => c.nom).sort()).toEqual(["(vide)", "J0M", "J9T"]);
  });

  it("compte `(vide)` une offre sans code postal, au lieu de l'abandonner", async () => {
    // Le cas qui décide si le remède de `[VEILLE-42]` est seulement applicable : une bande
    // postale ne trie rien si les offres n'en portent pas. Une omission silencieuse ici
    // ferait conclure « toutes les inconnues ont un code » et bâtir la règle sur du vide.
    const r = await mesurer();
    expect(r.lettresInconnues.find((c) => c.nom === "(vide)")?.n).toBe(1);
    expect(r.regionsInconnues.find((c) => c.nom === "(vide)")?.n).toBe(1);
  });
});
