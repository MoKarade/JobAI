import type { Metadata } from "next";
import { Manrope, DM_Mono } from "next/font/google";
import "./globals.css";

/**
 * Deux voix, et c'est l'idée typographique de la direction visuelle (choix de Marc,
 * 2026-08-05) : la LANGUE et la MESURE ne se disent pas pareil.
 *
 * Manrope pour ce qui se lit — géométrique, aux formes rondes, ce que Marc a demandé
 * (« plus rond, plus propre »). DM Mono pour tout ce qui se MESURE : note, kilomètres,
 * salaires, dates, compteurs. Le mot-symbole `>_` est déjà une invite de terminal ; la
 * seconde voix en découle au lieu d'être plaquée.
 *
 * ⚠️ `next/font` télécharge AU BUILD et sert les fichiers depuis notre propre domaine :
 * aucune requête vers Google à l'exécution, donc aucune adresse IP de visiteur qui parte
 * vers un tiers à chaque affichage, et rien à ajouter à une politique de sécurité de
 * contenu. Vérifié plutôt que supposé : le build produit bien les `.woff2` sous
 * `.next/static/media`.
 */
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--police-texte",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--police-mesure",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JobAI",
  description: "Suivi et analyse de recherche d'emploi — région de Québec.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA" className={`${manrope.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
