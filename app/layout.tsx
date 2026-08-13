import type { Metadata, Viewport } from "next";
import { Manrope, DM_Mono } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
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
  // Rend l'app installable (cf. app/manifest.ts). Next pose le <link rel="manifest">.
  manifest: "/manifest.webmanifest",
  // iOS ignore le manifeste pour l'icône d'accueil : il lui faut celle-ci, OPAQUE
  // (Safari ne gère pas la transparence et la remplacerait par du noir).
  appleWebApp: {
    capable: true,
    title: "JobAI",
    // « default » garde la barre d'état lisible dans les deux thèmes ;
    // « black-translucent » ferait passer le contenu SOUS l'encoche.
    statusBarStyle: "default",
  },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // Contrairement au manifeste (une seule couleur possible), la balise meta accepte des
  // media queries : la teinte de la barre système SUIT donc le thème. Les deux valeurs
  // sont les `--bg` de globals.css, converties depuis leur OKLCH.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#090b10" },
  ],
  // Installée, l'app doit occuper l'écran jusque sous l'encoche.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA" className={`${manrope.variable} ${dmMono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
