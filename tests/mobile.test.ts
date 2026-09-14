// tests/mobile.test.ts — l'app tient-elle encore dans un téléphone ?
//
// ⚠️ CE GARDE NAÎT D'UNE MESURE, PAS D'UNE INTUITION (demande de Marc, 2026-09-13 : « pas
// adapté pour téléphone […] gros boutons, pas de scroll sur le côté »). Le rendu réel de
// l'accueil, mesuré au navigateur à trois largeurs avant la refonte :
//
//   · défilement latéral de 94 px sur un écran de 390 — les groupes de seuils de la barre
//     de filtres faisaient 472 px de large et ne se repliaient pas ;
//   · 26 contrôles sous la cible de 44 px, dont les seize boutons de filtre (40 px) et le
//     lien d'une relance en retard (26 px) ;
//   · sept textes rendus à 11,2 px et cinq à 12,5 px ;
//   · la première offre à 1 267 px du haut, soit un écran et demi de défilement.
//
// Après : zéro débordement, une seule cible sous 44 px, plancher de police à 13 px, la
// liste à 690 px. Ce test existe pour que ça le RESTE — rien de tout ça n'échoue au build,
// et le défaut ne se voit qu'à l'œil, sur le téléphone de Marc, des jours plus tard.
//
// CE QU'IL NE FAIT PAS : rendre la page. Playwright n'est pas une dépendance de ce dépôt et
// l'ajouter pour un test de style coûterait plus cher que le défaut qu'il attrape. Il vise
// donc les CAUSES qui ont produit ces mesures — une largeur intrinsèque plus grande qu'un
// écran, une cible écrite en dur, un corps de texte sous le plancher — et pas le symptôme.
// Un garde qui mesurerait l'effet serait d'ailleurs satisfait par le `overflow-x: clip` du
// filet, qui masque le débordement sans le corriger.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
/** La feuille sans ses commentaires : ils citent des valeurs retirées, à dessein. */
const regles = css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * L'écran de référence : un iPhone SE, le plus étroit encore en service.
 *
 * ⚠️ EN REM, PARCE QUE C'EST L'UNITÉ DE LA FEUILLE. 375 px à la taille de police par
 * défaut du navigateur (16 px) font 23,4375 rem.
 */
const ECRAN_REM = 375 / 16;

/** Un bloc de règle : ses sélecteurs, et le corps de ses déclarations. */
interface Bloc {
  selecteurs: string;
  corps: string;
}

/**
 * Découpe la feuille en blocs de règles.
 *
 * Volontairement naïf — il n'y a pas d'analyseur CSS dans ce dépôt et en ajouter un pour
 * ceci serait disproportionné. Ce qu'il faut savoir de sa limite : une `@media` produit un
 * bloc dont le corps est vide (son contenu devient les blocs suivants), ce qui ne gêne
 * aucune des vérifications ci-dessous — elles portent toutes sur des déclarations.
 */
function blocs(): Bloc[] {
  const sortie: Bloc[] = [];
  for (const brut of regles.split("}")) {
    const i = brut.indexOf("{");
    if (i === -1) continue;
    sortie.push({ selecteurs: brut.slice(0, i).trim(), corps: brut.slice(i + 1) });
  }
  return sortie;
}

describe("l'app tient dans un téléphone", () => {
  const tous = blocs();

  it("lit bien la feuille de style", () => {
    // Un scan sur une chaîne vide passerait à vide : protection nulle, et silencieuse.
    expect(regles.length).toBeGreaterThan(20_000);
    expect(tous.length).toBeGreaterThan(150);
    expect(regles).toContain("--touche:");
  });

  it("la cible tactile est un jeton, et il atteint le minimum", () => {
    // ⚠️ LA VALEUR SE LIT DANS LA FEUILLE, ELLE NE SE RECOPIE PAS ICI. Un test qui écrirait
    // « 3rem » à la main deviendrait faux au premier rajustement, en affirmant le contraire.
    const m = regles.match(/--touche:\s*([\d.]+)rem/);
    expect(m, "`--touche` doit être déclaré en rem").not.toBeNull();

    const rem = Number(m?.[1]);
    // 44 px est le minimum de WCAG 2.5.5 et la recommandation d'Apple comme de Google.
    expect(rem * 16).toBeGreaterThanOrEqual(44);
  });

  it("aucun bloc n'est plus large qu'un écran de téléphone", () => {
    // ⚠️ C'EST LA CAUSE MESURÉE DU DÉFILEMENT LATÉRAL : un `min-width` plus grand que
    // l'écran ne se replie pas, quel que soit le `flex-wrap` au-dessus.
    const trop: string[] = [];

    for (const { selecteurs, corps } of tous) {
      for (const m of corps.matchAll(/min-width:\s*([\d.]+)(rem|px)/g)) {
        const valeur = Number(m[1]);
        const rem = m[2] === "px" ? valeur / 16 : valeur;
        if (rem > ECRAN_REM) trop.push(`${selecteurs} { min-width: ${m[1]}${m[2]} }`);
      }
      // `minmax(24rem, …)` dans une grille est un `min-width` déguisé : il impose la même
      // largeur de piste, et c'est ce qui a fait déborder le plan de la carte.
      for (const m of corps.matchAll(/minmax\(\s*([\d.]+)rem/g)) {
        if (Number(m[1]) > ECRAN_REM) trop.push(`${selecteurs} { minmax(${m[1]}rem, …) }`);
      }
    }

    // ⚠️ DEUX EXEMPTIONS, NOMMÉES UNE PAR UNE ET VÉRIFIÉES — jamais un motif. Une exemption
    // large s'applique pour toujours, et à tout ce qu'on ajoutera ensuite : ce dépôt l'a
    // déjà payé sur le garde des données personnelles, qui s'excluait d'un dossier entier.
    //
    // `.table-marche` : un tableau de chiffres qui vit dans son propre conteneur défilant
    // (`.table-enveloppe { overflow-x: auto }`) — c'est LUI qui défile, pas la page.
    // `.plan-ecran` : sa seconde colonne ne s'applique qu'au-dessus de 56 rem ; en dessous,
    // une règle le replie en une seule colonne. L'exemption ne vaut donc que si cette règle
    // existe encore — on la VÉRIFIE plutôt que de la croire.
    expect(regles).toMatch(
      /@media\s*\(max-width:\s*56rem\)\s*{\s*\.plan-ecran\s*{\s*grid-template-columns:\s*1fr/,
    );
    expect(regles).toMatch(/\.table-enveloppe\s*{\s*overflow-x:\s*auto/);

    const EXEMPTES = [".table-marche", ".plan-ecran"];
    const restants = trop.filter((r) => !EXEMPTES.some((e) => r.startsWith(e)));

    expect(restants, "à replier (flex-wrap) ou à mettre dans un conteneur défilant").toEqual(
      [],
    );
  });

  it("les groupes de filtres se replient", () => {
    // La cause n°1, mesurée : `.controles__groupe` était en `inline-flex` SANS `wrap`, donc
    // il gardait la largeur de ses boutons mis bout à bout — 472 px sur un écran de 375.
    const groupe = tous.find((b) => b.selecteurs === ".controles__groupe");
    expect(groupe, "`.controles__groupe` doit exister").toBeDefined();
    expect(groupe?.corps).toMatch(/flex-wrap:\s*wrap/);
  });

  it("aucun degré de l'échelle typographique ne passe sous le plancher", () => {
    // 0,8125 rem = 13 px. En dessous, sur un téléphone tenu à bout de bras, on ne lit plus :
    // sept textes étaient rendus à 11,2 px avant la refonte, tous sur l'accueil.
    const degres = [...regles.matchAll(/--t-[\w-]+:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    expect(degres.length).toBeGreaterThanOrEqual(6);
    expect(Math.min(...degres) * 16).toBeGreaterThanOrEqual(13);
  });

  it("les champs de saisie sont à 16 px au moins — sinon iOS zoome tout seul", () => {
    // ⚠️ CE N'EST PAS UN CHOIX DE STYLE. Sous 16 px, Safari agrandit la page quand on touche
    // un champ, et n'en revient pas : la page reste décalée, et c'est exactement le
    // défilement latéral que cette refonte supprime. La règle vaut pour ce qui se SAISIT,
    // pas pour ce qui s'affiche.
    const SAISIES = [".select,", ".zone-note", ".controles__recherche", ".ajout__grille input"];
    const fautifs: string[] = [];

    for (const { selecteurs, corps } of tous) {
      if (!SAISIES.some((s) => selecteurs.startsWith(s))) continue;
      for (const m of corps.matchAll(/font-size:\s*var\(--t-([\w-]+)\)/g)) {
        const degre = regles.match(new RegExp(`--t-${m[1]}:\\s*([\\d.]+)rem`));
        if (degre && Number(degre[1]) * 16 < 16) {
          fautifs.push(`${selecteurs} { font-size: var(--t-${m[1]}) }`);
        }
      }
      for (const m of corps.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) {
        const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16;
        if (px < 16) fautifs.push(`${selecteurs} { font-size: ${m[1]}${m[2]} }`);
      }
    }

    expect(fautifs, "un champ de saisie sous 16 px fait zoomer iOS").toEqual([]);
  });

  it("les cinq destinations sont dans la barre sur grand écran", () => {
    // ⚠️ CE GARDE NAÎT D'UN DÉFAUT LIVRÉ (signalé par Marc, 2026-09-14 : « je vois que
    // suivi et carte sur pc »). Trois onglets avaient disparu de l'écran d'ordinateur, et
    // la cause n'est pas une faute de frappe : UNE `@media` N'AJOUTE AUCUNE SPÉCIFICITÉ.
    // `.barre__secondaires { display: contents }` écrit dans la requête (0,1,0) perdait
    // contre `.barre__secondaires[data-ouvert="non"] { display: none }` écrit plus haut
    // (0,2,0) — la règle du téléphone continuait donc de s'appliquer sur 1 920 px, et le
    // bouton « Plus », masqué là-haut par conception, ne donnait plus aucun accès.
    //
    // C'est une classe de défaut invisible à tout le reste : le CSS est valide, le build
    // passe, aucune classe n'est orpheline, et la page s'affiche — avec trois liens en
    // moins. Ce qui l'a rendue possible, c'est que ma mesure d'alors lisait « conteneur à
    // 0×0 » et concluait « display: contents, donc pas de boîte » : les deux valeurs
    // rendent exactement la même mesure. On vérifie donc la RÈGLE, faute de pouvoir
    // compter les liens rendus sans navigateur.
    const desktop = regles.slice(regles.indexOf("@media (min-width: 56rem)"));
    const remise = desktop.match(
      /(\.barre__secondaires[^{}]*){\s*display:\s*contents/,
    );
    expect(remise, "la barre doit remettre ses secondaires dans le flux").not.toBeNull();
    // Le sélecteur de la remise doit peser au moins autant que celui qui masque : il porte
    // donc lui aussi l'attribut.
    expect(
      remise?.[1],
      "une @media n'ajoute pas de spécificité : le sélecteur doit répéter [data-ouvert]",
    ).toContain("[data-ouvert=");
  });

  it("la barre de navigation réserve sa place au bas de la page", () => {
    // ⚠️ TROIS ENDROITS DOIVENT CONNAÎTRE SA HAUTEUR, et c'est pour ça que c'est un jeton :
    // la barre elle-même, la réserve de bas de page (sinon la barre recouvre la dernière
    // offre — et on ne le voit qu'en descendant jusqu'en bas, donc jamais en développant),
    // et la hauteur de la page pleine de `/carte`. Un chiffre recopié trois fois est
    // exactement ce que ce dépôt a déjà payé quatre fois sur des listes de colonnes.
    expect(regles).toMatch(/--barre-h:\s*calc\(/);
    // La réserve du bas de page.
    expect(regles).toMatch(/\.page\s*{[^}]*padding:[^;]*var\(--barre-h\)/);
    // La carte plein écran s'en retranche la hauteur.
    expect(regles).toMatch(/height:\s*calc\(100dvh\s*-\s*var\(--barre-h\)\)/);
    // Et la barre tient compte du bas d'un iPhone sans bouton, sinon son dernier onglet
    // tombe sous le trait d'accueil et ne se touche plus.
    expect(regles).toContain("env(safe-area-inset-bottom");
  });
});
