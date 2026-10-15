// Flat config natif : eslint-config-next 16 exporte enfin ses configurations au format flat
// (`eslint-config-next/core-web-vitals`, `/typescript`) — plus de FlatCompat ni de
// @eslint/eslintrc, qui ne savait pas relire la config 16 (plantage « circular structure »,
// Dependabot #30). Toutes les règles d'avant sont conservées, plus celles du React Compiler
// apportées par eslint-plugin-react-hooks 7. eslint reste en 9 : eslint-plugin-react, embarqué
// ici, plante sur eslint 10 (cf. .github/dependabot.yml).
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  // `next lint` ignorait ces dossiers implicitement ; l'ESLint CLI, non. Sans cette
  // liste, `eslint .` scanne node_modules et .next et rend des milliers de faux positifs.
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  ...nextVitals,
  ...nextTs,

  // ⚠️ UN IMPORT INUTILISÉ EST UNE ERREUR, PAS UN AVERTISSEMENT — incident du 2026-08-17.
  //
  // Un remplacement de texte a posé l'IMPORT d'un composant dans `app/sources/page.tsx`
  // sans poser la section qui le rend : le motif de recherche ne correspondait plus après
  // un reformatage, et un `replace` qui ne trouve rien ne dit rien. Le gate est passé au
  // vert — typecheck, tests, build — et la page est partie en production avec le bouton
  // manquant. C'est Marc qui l'a vu, pas la chaîne.
  //
  // En avertissement, la ligne était bien là, noyée parmi six autres. En erreur, elle
  // aurait bloqué le commit : « ce composant est importé et n'apparaît nulle part » est
  // exactement le symptôme d'une édition qui n'a fait que la moitié du travail.
  //
  // Les variables préfixées `_` restent tolérées : c'est la convention pour un paramètre
  // qu'une signature impose mais dont le corps n'a que faire.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
