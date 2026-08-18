// tests/rayon.test.ts — le rayon réglable, et ce qu'il périme.
//
// Ce que ces tests protègent : qu'élargir le rayon LIBÈRE vraiment les villes qu'il vient
// d'englober. Le registre des lieux est consulté AVANT toute nouvelle mesure ; un verdict
// rendu sous l'ancien rayon et laissé en place n'aurait jamais été revu. Marc aurait réglé
// son rayon et rien n'aurait changé, sans qu'aucune erreur ne s'affiche.

import { describe, it, expect } from "vitest";
import {
  RAYON_DEFAUT_KM,
  RAYON_MAX_REGLABLE_KM,
  RAYON_MIN_KM,
  compterBascules,
  normaliserRayon,
  profilAvecRayon,
  rejugerRegistre,
} from "../lib/rayon";
import { MARGE_LIEU_KM, deciderLieu, type RegistreLieux } from "../lib/ingest/lieux";
import { PROFIL_DEFAUT } from "../lib/profil";
import { scoreDistance } from "../lib/scoring";

const juge = (verdict: "dans-la-region" | "hors-region" | "introuvable", km: number | null) => ({
  verdict,
  km,
  le: "2026-08-10",
  essais: 1,
});

describe("normaliserRayon — une saisie illisible se DIT, elle ne se remplace pas", () => {
  it("accepte un nombre dans les bornes, arrondi", () => {
    expect(normaliserRayon("75")).toBe(75);
    expect(normaliserRayon(120.4)).toBe(120);
    expect(normaliserRayon("90,7")).toBe(91); // la virgule décimale québécoise
  });

  it("rend null hors des bornes plutôt que de rogner en silence", () => {
    // Rogner à la borne appliquerait un rayon que Marc n'a pas demandé et qu'il croirait
    // être le sien : c'est exactement le genre de défaut qu'on ne voit jamais.
    expect(normaliserRayon(RAYON_MIN_KM - 1)).toBeNull();
    expect(normaliserRayon(RAYON_MAX_REGLABLE_KM + 1)).toBeNull();
    expect(normaliserRayon("beaucoup")).toBeNull();
    expect(normaliserRayon(null)).toBeNull();
    expect(normaliserRayon(Number.NaN)).toBeNull();
  });

  it("accepte EXACTEMENT les bornes — cas dérivés des constantes, jamais écrits en dur", () => {
    expect(normaliserRayon(RAYON_MIN_KM)).toBe(RAYON_MIN_KM);
    expect(normaliserRayon(RAYON_MAX_REGLABLE_KM)).toBe(RAYON_MAX_REGLABLE_KM);
  });
});

describe("rejugerRegistre — élargir le rayon LIBÈRE, et sans une requête", () => {
  it("fait basculer une ville que le nouveau rayon englobe", () => {
    // Baie-Comeau à 250 km : hors région à 75, dans la région à 300. Le verdict se re-dérive
    // de la DISTANCE déjà stockée — c'est pour ça qu'`appliquerJugements` la conserve.
    const avant: RegistreLieux = { "baie-comeau": juge("hors-region", 250) };
    const apres = rejugerRegistre(avant, 300);
    expect(apres["baie-comeau"]?.verdict).toBe("dans-la-region");
  });

  it("fait basculer dans l'autre sens quand le rayon se resserre", () => {
    const avant: RegistreLieux = { montmagny: juge("dans-la-region", 60) };
    expect(rejugerRegistre(avant, 20)["montmagny"]?.verdict).toBe("hors-region");
  });

  it("DISCRIMINANT : sans re-jugement, le verdict périmé resterait", () => {
    // Preuve que la fonction fait quelque chose. Le registre d'origine, laissé tel quel,
    // porte encore le verdict rendu sous l'ancien rayon.
    const avant: RegistreLieux = { "baie-comeau": juge("hors-region", 250) };
    expect(avant["baie-comeau"]?.verdict).toBe("hors-region");
    expect(rejugerRegistre(avant, 300)["baie-comeau"]?.verdict).not.toBe(
      avant["baie-comeau"]?.verdict,
    );
  });

  it("respecte la marge d'échelle, dérivée de la constante", () => {
    // On mesure le CENTRE d'une municipalité ; l'employeur est quelque part dedans.
    const r = 100;
    expect(deciderLieu(r + MARGE_LIEU_KM, r)).toBe("dans-la-region");
    expect(deciderLieu(r + MARGE_LIEU_KM + 0.1, r)).toBe("hors-region");
  });

  it("laisse un INTROUVABLE tel quel — son problème n'est pas la distance", () => {
    // Le re-juger depuis un `km` nul inventerait un verdict. Il repassera par le géocodeur
    // à son palier de retente, comme toujours.
    const avant: RegistreLieux = { remote: juge("introuvable", null) };
    expect(rejugerRegistre(avant, 300)["remote"]).toEqual(avant["remote"]);
  });

  it("CONSERVE la date et le compte d'essais : re-juger n'est pas re-mesurer", () => {
    // Remettre la date à aujourd'hui ferait croire à une mesure fraîche ; remettre les
    // essais à zéro rendrait son palier de retente à un nom qui ne l'a pas gagné.
    const avant: RegistreLieux = { amos: juge("hors-region", 500) };
    const apres = rejugerRegistre(avant, 300);
    expect(apres["amos"]?.le).toBe("2026-08-10");
    expect(apres["amos"]?.essais).toBe(1);
  });
});

describe("compterBascules — « 0 » a deux sens opposés, l'écran doit pouvoir les distinguer", () => {
  it("compte les verdicts qui changent, pas les entrées", () => {
    const registre: RegistreLieux = {
      levis: juge("dans-la-region", 8),
      "baie-comeau": juge("hors-region", 250),
      amos: juge("hors-region", 600),
      remote: juge("introuvable", null),
    };
    // À 300 km, seule Baie-Comeau bascule : Lévis était déjà dedans, Amos reste dehors,
    // l'introuvable n'est pas touché.
    expect(compterBascules(registre, 300)).toBe(1);
    // Au rayon courant, rien ne change — et c'est un « 0 » qui ne veut pas dire « vide ».
    expect(compterBascules(registre, RAYON_DEFAUT_KM)).toBe(0);
    expect(Object.keys(registre).length).toBe(4);
  });
});

describe("le rayon réglé atteint AUSSI la note, pas seulement l'acceptation", () => {
  it("une distance au-delà du rayon vaut zéro, en deçà elle vaut mieux", () => {
    // Sans ça, le réglage ne ferait que la moitié du chemin : la ville entrerait dans la
    // région élargie et l'offre garderait une note de distance nulle.
    const large = profilAvecRayon(300);
    expect(scoreDistance(200, PROFIL_DEFAUT)).toBe(0);
    expect(scoreDistance(200, large)).toBeGreaterThan(0);
  });

  it("ne touche à RIEN d'autre dans le profil", () => {
    const large = profilAvecRayon(300);
    expect(large.rayonMaxKm).toBe(300);
    expect({ ...large, rayonMaxKm: PROFIL_DEFAUT.rayonMaxKm }).toEqual(PROFIL_DEFAUT);
  });
});
