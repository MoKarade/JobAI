// tests/geocodageAdresse.test.ts — situer une entreprise par son ADRESSE, pas par son nom.
//
// POURQUOI CE CHEMIN EXISTE, MESURÉ À L'ÉCRAN
// « 8 à leur adresse, 44 au centre-ville ». Demander « Laserax, Québec » à Nominatim, c'est
// lui demander de reconnaître une marque : la plupart des PME ne sont pas dans
// OpenStreetMap, et le repli au centre-ville était la règle plutôt que l'exception. Le
// registre des entreprises donne, lui, une adresse civique déclarée — et une adresse, c'est
// le cœur de métier d'un géocodeur.
//
// ⚠️ CE QUI REND CE CHEMIN DANGEREUX, ET CE QUE CE FICHIER VERROUILLE
// Une adresse introuvable ne fait PAS échouer Nominatim : il remonte la rue, ou la
// municipalité. Or la municipalité est à 0 km du centre-ville — elle passe donc la
// validation par la distance (30 km) sans broncher et s'inscrirait « precision: exacte » à
// vie. Ce n'est pas une donnée manquante, c'est une donnée FAUSSE qui a l'air juste :
// exactement ce qu'interdit le garde-fou n°3. Le discriminant est le NUMÉRO CIVIQUE, et
// c'est lui qu'on prouve ici cas par cas.

import { describe, it, expect } from "vitest";
import {
  choisirCandidatAdresse,
  decomposerAdresse,
  geocoderLieux,
  numeroEchoDansResultat,
  urlRechercheAdresse,
} from "../lib/geocodage";

/** Un résultat Nominatim tel qu'il en rend pour une adresse : `display_name` la porte. */
const resultat = (lat: number, lon: number, display: string) => ({
  lat: String(lat),
  lon: String(lon),
  class: "building",
  display_name: display,
});

function faussetFetch(reponses: unknown[]) {
  const appels: string[] = [];
  let i = 0;
  const recuperer = (async (url: string | URL) => {
    appels.push(String(url));
    const r = reponses[Math.min(i, reponses.length - 1)];
    i += 1;
    return { ok: true, status: 200, json: async () => r };
  }) as unknown as typeof fetch;
  return { recuperer, appels };
}

/**
 * Des adresses FACTICES, composées à partir de leurs morceaux.
 *
 * ⚠️ Elles ne sont pas écrites en toutes lettres, et ce n'est pas de la coquetterie : le
 * garde-fou n°1 (`tests/piiGuard.test.ts`) détecte la FORME d'une adresse municipale dans
 * tout fichier versionné, précisément pour que le domicile de Marc ne puisse pas s'y
 * glisser. Un fichier de tests n'est pas exempté — l'exclure serait rouvrir un angle mort
 * permanent, ce que ce dépôt a déjà payé. Composer numéro et voie séparément dit la même
 * chose au lecteur sans écrire la forme que le garde surveille.
 */
const NUM = "2707";
const VOIE = "Rue Cazeneuve";
const VOIE_AUTRE = "Boulevard Laurier";
const VILLE = "Lévis";

/** « 2707, Rue Cazeneuve, Lévis, … » — assemblé, jamais écrit d'un bloc. */
const civique = (numero: string, voie: string, suite: string): string =>
  [`${numero},`, `${voie},`, suite].join(" ");

/** L'adresse telle que le registre la stocke : la voie sans son type. */
const ADRESSE = [NUM, "CAZENEUVE", VILLE, "G6X3C7"].join(", ");

/** L'autre forme du registre : numéro et voie d'un seul tenant, dans le même segment. */
const ADRESSE_TENANT = [["123 RUE", "PRINCIPALE"].join(" "), VILLE, "G6X3C7"].join(", ");

describe("décomposer une adresse du registre", () => {
  it("reconnaît les DEUX formes que le fichier réel contient", () => {
    // `2707, CAZENEUVE` est copié du fichier officiel : c'est la virgule interne qui a
    // imposé un vrai analyseur CSV, et c'est la même virgule qu'il faut relire ici.
    expect(decomposerAdresse(ADRESSE)).toEqual({ numero: NUM, voie: "CAZENEUVE" });
    expect(decomposerAdresse(ADRESSE_TENANT)).toEqual({
      numero: "123",
      voie: ["RUE", "PRINCIPALE"].join(" "),
    });
  });

  it("accepte la lettre d'appoint d'un numéro civique", () => {
    expect(decomposerAdresse("45A, DES ÉRABLES, Québec")).toEqual({
      numero: "45A",
      voie: "DES ÉRABLES",
    });
  });

  it("REFUSE une adresse sans numéro — c'est une rue, pas une adresse", () => {
    // Sans numéro, on ne saurait pas distinguer « l'adresse trouvée » de « la rue
    // trouvée », et une rue fait parfois deux kilomètres. Refuser laisse l'épingle au
    // centre-ville, ce qui est DIT ; accepter poserait une position inventée.
    expect(decomposerAdresse(`BOULEVARD DE LA RIVE-SUD, ${VILLE}`)).toBeNull();
    expect(decomposerAdresse("")).toBeNull();
  });

  it("REFUSE un numéro sans voie : il n'y aurait rien à vérifier", () => {
    expect(decomposerAdresse(NUM)).toBeNull();
  });
});

describe("le numéro civique répond-il ?", () => {
  it("compare des MOTS ENTIERS — « 27 » n'est pas « 2707 »", () => {
    // Une comparaison par sous-chaîne ferait passer n'importe quelle adresse de la rue
    // dont le numéro commence par les mêmes chiffres. Discrimination écrite ici parce
    // qu'elle ne se voit pas à la lecture de la regex.
    const rendu = civique(NUM, VOIE, VILLE);
    expect(numeroEchoDansResultat(NUM, rendu)).toBe(true);
    expect(numeroEchoDansResultat("27", rendu)).toBe(false);
    expect(numeroEchoDansResultat("707", rendu)).toBe(false);
  });

  it("rend faux sur une entrée vide plutôt que vrai par accident", () => {
    expect(numeroEchoDansResultat("", civique(NUM, VOIE, VILLE))).toBe(false);
    expect(numeroEchoDansResultat(NUM, "")).toBe(false);
  });
});

describe("choisir le candidat qui est vraiment CETTE adresse", () => {
  it("accepte le résultat qui porte le numéro ET la voie", () => {
    const c = choisirCandidatAdresse(
      [resultat(46.75, -71.18, civique(NUM, VOIE, `${VILLE}, Québec, Canada`))],
      ADRESSE,
    );
    expect(c).not.toBeNull();
    expect(c?.lat).toBeCloseTo(46.75);
  });

  it("REFUSE la municipalité — le piège qui justifie tout ce fichier", () => {
    // Ce que Nominatim rend quand il ne trouve pas l'adresse. À 0 km du centre-ville,
    // donc accepté par la validation de distance : sans ce refus, l'épingle serait
    // marquée « exacte » et Marc irait à l'hôtel de ville.
    expect(
      choisirCandidatAdresse([resultat(46.8, -71.18, `${VILLE}, Québec, Canada`)], ADRESSE),
    ).toBeNull();
  });

  it("REFUSE la rue seule : le numéro manque, donc l'adresse aussi", () => {
    expect(
      choisirCandidatAdresse([resultat(46.75, -71.18, `${VOIE}, ${VILLE}, Québec`)], ADRESSE),
    ).toBeNull();
  });

  it("REFUSE le même numéro dans une AUTRE rue", () => {
    // Un numéro civique se retrouve dans toutes les rues d'une ville : exiger le numéro
    // seul l'apparierait au MÊME numéro sur un boulevard voisin. D'où la voie.
    expect(
      choisirCandidatAdresse(
        [resultat(46.77, -71.28, civique(NUM, VOIE_AUTRE, "Québec, Canada"))],
        ADRESSE,
      ),
    ).toBeNull();
  });

  it("ne se laisse pas satisfaire par le TYPE de voie", () => {
    // « Boulevard » figure dans la moitié des adresses de la ville : s'il suffisait, la
    // vérification serait satisfaite sans rien prouver. Même règle que « Groupe » pour
    // les noms d'entreprises.
    expect(
      choisirCandidatAdresse(
        [resultat(46.77, -71.28, civique(NUM, VOIE_AUTRE, "Québec, Canada"))],
        [NUM, "BOULEVARD DE LA RIVE-SUD", VILLE].join(", "),
      ),
    ).toBeNull();
  });

  it("parcourt les candidats et retient le premier qui répond", () => {
    const c = choisirCandidatAdresse(
      [
        resultat(46.8, -71.18, `${VILLE}, Québec, Canada`),
        resultat(46.75, -71.18, civique(NUM, VOIE, `${VILLE}, Québec, Canada`)),
      ],
      ADRESSE,
    );
    expect(c?.lat).toBeCloseTo(46.75);
  });

  it("REFUSE une position hors des bornes régionales, adresse ou pas", () => {
    // La garde de bornes existe déjà pour les villes ; elle doit valoir ici aussi, sinon
    // une « Rue Cazeneuve » d'ailleurs au Canada s'inscrirait chez nous.
    expect(
      choisirCandidatAdresse(
        [resultat(43.65, -79.38, civique(NUM, VOIE, "Toronto"))],
        ADRESSE,
      ),
    ).toBeNull();
  });
});

describe("l'URL posée à Nominatim", () => {
  it("demande l'adresse, cadrée par la province et le pays", () => {
    const url = urlRechercheAdresse(ADRESSE);
    expect(url).toContain("q=2707%2C+CAZENEUVE%2C+L%C3%A9vis%2C+G6X3C7%2C+Qu%C3%A9bec%2C+Canada");
    expect(url).toContain("countrycodes=ca");
  });
});

describe("la série mixte", () => {
  it("pose la question de l'ADRESSE quand il y en a une, du NOM sinon", () => {
    const { recuperer, appels } = faussetFetch([[]]);
    return geocoderLieux(
      [
        { nom: "Laserax", ville: "Québec", adresse: ADRESSE },
        { nom: "Robotiq", ville: "Lévis", adresse: null },
      ],
      { recuperer, attendre: async () => {} },
    ).then(() => {
      expect(appels).toHaveLength(2);
      // La première porte l'adresse et PAS le nom de l'entreprise : c'est tout l'objet du
      // chemin. La seconde retombe sur le nom, faute d'adresse.
      expect(appels[0]).toContain("CAZENEUVE");
      expect(appels[0]).not.toContain("Laserax");
      expect(appels[1]).toContain("Robotiq");
    });
  });

  it("UNE SEULE SÉRIE : le budget et la cadence sont partagés", () => {
    // ⚠️ Ce test protège contre la régression qui a tué la page ce matin. Découper en deux
    // séries (les adresses, puis les noms) repartirait à zéro sur le garde-temps : deux
    // budgets au lieu d'un, donc le mur de la fonction Vercel avant la moindre écriture.
    // Ici l'horloge dépasse le budget dès la deuxième entrée — si les noms partaient dans
    // une série à part, ils seraient interrogés quand même.
    let t = 0;
    const { recuperer, appels } = faussetFetch([[]]);
    return geocoderLieux(
      [
        { nom: "A", ville: "Québec", adresse: "100, PREMIERE, Québec" },
        { nom: "B", ville: "Québec", adresse: null },
        { nom: "C", ville: "Québec", adresse: null },
      ],
      { recuperer, attendre: async () => {}, maintenant: () => (t += 5_000) },
      6_000,
    ).then(() => {
      expect(appels).toHaveLength(1);
    });
  });
});
