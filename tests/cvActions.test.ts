// tests/cvActions.test.ts — les écritures du chantier CV : qui a le droit, et ce qui survit
// à un échec.
//
// CE QUE CES TESTS PROTÈGENT, ET POURQUOI ILS VALENT LEUR PLACE (`[CV-09]`)
//
// 1. **La session est revérifiée par CHAQUE action.** L'en-tête de `lib/cv/actions.ts`
//    l'affirme — « un point d'entrée POST généré par Next est appelable directement, le
//    middleware ne le couvre pas ». C'était une PROMESSE écrite en commentaire, et rien ne
//    la tenait : les deux fichiers d'écriture du chantier n'avaient aucun test. Une
//    régression y serait muette et ouvrirait un chemin qui manipule un document personnel.
// 2. **Un échec d'extraction NE JETTE PAS le fichier ; un échec de LECTURE, si.** Deux
//    comportements opposés à trois lignes d'écart, et la justification de chacun est écrite
//    dans le code. Les inverser ne casserait rien de visible : ça punirait Marc d'une panne
//    de clé API en perdant son CV, ou stockerait un fichier dont on ne pourra jamais rien
//    tirer.
// 3. **« Proposition absente » ≠ « proposition illisible ».** Le module le dit en toutes
//    lettres : le second se répare par une ré-analyse, le premier non.

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Ce que la session répond. Basculé par test — c'est le levier de la garde n°1. */
let sessionValide = true;
/** Ce que `extraireTexte` et `extraireFaits` rendent, réglés par test. */
let lecture: { ok: true; texte: string } | { ok: false; raison: string } = {
  ok: true,
  texte: "Coordonnateur de projets. ".repeat(20),
};
let faits: { ok: true; brut: unknown } | { ok: false; raison: string } = { ok: true, brut: {} };

/** Tout ce que le dépôt a été prié de faire — c'est l'observation, pas le retour d'action. */
const appels: string[] = [];

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  exigerSession: async () => {
    if (!sessionValide) throw new Error("pas de session");
  },
}));
vi.mock("@/lib/donnees", () => ({ lireOffres: async () => [] }));
vi.mock("@/lib/db", () => ({ db: { update: () => ({ set: () => ({ where: async () => {} }) }) } }));
vi.mock("@/lib/cv/texte", async () => {
  const reel = await vi.importActual<typeof import("@/lib/cv/texte")>("@/lib/cv/texte");
  return { ...reel, extraireTexte: async () => lecture };
});
vi.mock("@/lib/cv/extraction", async () => {
  const reel = await vi.importActual<typeof import("@/lib/cv/extraction")>("@/lib/cv/extraction");
  return { ...reel, extraireFaits: async () => faits };
});
vi.mock("@/lib/cv/depot", () => ({
  enregistrerCv: async (e: { erreur: string | null }) => {
    appels.push(`enregistrerCv(erreur=${e.erreur ?? "null"})`);
    return 7;
  },
  lireContenuPourAnalyse: async () => {
    appels.push("lireContenuPourAnalyse");
    return { texte: "Coordonnateur de projets. ".repeat(20), contenu: "" };
  },
  majExtraction: async () => {
    appels.push("majExtraction");
  },
  supprimerCv: async (id: number) => {
    appels.push(`supprimerCv(${id})`);
  },
  profilActif: async () => {
    appels.push("profilActif");
    const { PROFIL_DEFAUT } = await import("@/lib/profil");
    return PROFIL_DEFAUT;
  },
  propositionDe: async () => {
    appels.push("propositionDe");
    return propositionRendue;
  },
  activerProfil: async () => {
    appels.push("activerProfil");
  },
}));

let propositionRendue: unknown = null;

const { televerserCv, reanalyserCv, validerProfil, retirerCv } = await import("@/lib/cv/actions");

/** Un `FormData` porteur d'un fichier, comme le formulaire l'envoie. */
function formulaire(octets: number, nom = "cv.pdf"): FormData {
  const f = new FormData();
  f.append("cv", new File([new Uint8Array(octets).fill(0x25)], nom, { type: "application/pdf" }));
  return f;
}

beforeEach(() => {
  sessionValide = true;
  lecture = { ok: true, texte: "Coordonnateur de projets. ".repeat(20) };
  faits = { ok: true, brut: {} };
  propositionRendue = null;
  appels.length = 0;
});

describe("la session — une promesse écrite en commentaire, désormais tenue par un test", () => {
  it("LES QUATRE actions refusent, et AUCUNE ne touche au dépôt avant de refuser", async () => {
    // ⚠️ Les deux moitiés comptent. Un refus qui arrive APRÈS l'écriture serait un refus
    // décoratif : le fichier serait déjà stocké, le CV déjà supprimé. C'est pour ça que
    // l'assertion porte aussi sur `appels`, et pas seulement sur la valeur rendue.
    sessionValide = false;

    for (const r of [
      await televerserCv(formulaire(10)),
      await reanalyserCv(1),
      await validerProfil(1, []),
      await retirerCv(1),
    ]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erreur).toBe("Authentification requise.");
    }
    expect(appels).toEqual([]);
  });
});

describe("televerserCv — ce qui survit à un échec, et ce qui n'y survit pas", () => {
  it("refuse sans fichier, et refuse un fichier trop lourd — sans rien stocker", async () => {
    const vide = new FormData();
    expect(await televerserCv(vide)).toEqual({ ok: false, erreur: "Aucun fichier reçu." });

    const { TAILLE_MAX_OCTETS } = await import("@/lib/cv/texte");
    const lourd = await televerserCv(formulaire(TAILLE_MAX_OCTETS + 1));
    expect(lourd.ok).toBe(false);
    if (!lourd.ok) expect(lourd.erreur).toContain("trop lourd");

    expect(appels).toEqual([]);
  });

  it("⚠️ une LECTURE ratée ne stocke RIEN — sans texte, il n'y aurait rien à ré-analyser", () => {
    // La moitié « négative » de la paire. L'inverser stockerait un fichier dont on ne peut
    // rien tirer, et que la ré-analyse ne pourrait jamais sauver.
    lecture = { ok: false, raison: "PDF illisible (scanné ?)." };
    return televerserCv(formulaire(10)).then((r) => {
      expect(r).toEqual({ ok: false, erreur: "PDF illisible (scanné ?)." });
      expect(appels).toEqual([]);
    });
  });

  it("⚠️ une EXTRACTION ratée stocke QUAND MÊME, avec sa raison", async () => {
    // La moitié « positive », et c'est celle qui protège Marc : jeter le fichier parce que
    // le modèle n'a pas répondu le punirait d'une panne qui n'est pas la sienne. Le CV reste
    // ré-analysable d'un clic une fois la clé posée.
    faits = { ok: false, raison: "ANTHROPIC_API_KEY absente." };
    const r = await televerserCv(formulaire(10));

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toContain("ANTHROPIC_API_KEY absente.");
    // Le fichier est bien passé au dépôt, et la RAISON est stockée avec lui.
    expect(appels).toEqual(["enregistrerCv(erreur=ANTHROPIC_API_KEY absente.)"]);
  });
});

describe("validerProfil — « absente » et « illisible » ne se disent pas pareil", () => {
  it("une proposition ABSENTE : il n'y a rien à valider", async () => {
    propositionRendue = null;
    const r = await validerProfil(1, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toBe("Ce CV n'a pas de proposition à valider.");
    // Et on n'a pas touché au profil : le refus vient AVANT toute lecture de barème.
    expect(appels).toEqual(["propositionDe"]);
  });

  it("⚠️ une proposition ILLISIBLE dit COMMENT la réparer — c'est ce qui les distingue", async () => {
    // Les confondre laisserait l'écran muet sur un cas qui se répare en un clic.
    propositionRendue = { ok: false, raison: "La proposition enregistrée est corrompue." };
    const r = await validerProfil(1, []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreur).toContain("corrompue");
      expect(r.erreur).toContain("Relance l'analyse");
    }
  });
});

describe("retirerCv", () => {
  it("supprime bien le CV demandé", async () => {
    const r = await retirerCv(42);
    expect(r.ok).toBe(true);
    expect(appels).toEqual(["supprimerCv(42)"]);
  });
});
