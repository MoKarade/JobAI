import type { MetadataRoute } from "next";

/**
 * Manifeste d'application web — c'est lui qui rend JobAI INSTALLABLE (téléphone et PC).
 *
 * Servi par Next sur `/manifest.webmanifest`. Aucune ressource externe : les icônes sont
 * dans `public/`, générées depuis `app/icon.svg` (l'invite de terminal `>_` de l'app).
 *
 * ⚠️ ACCESSIBLE SANS SESSION, ET C'EST NÉCESSAIRE. Le navigateur récupère le manifeste
 * SANS cookies ; derrière le garde, il recevrait la redirection vers `/connexion` et
 * l'app cesserait d'être installable — en silence, sans erreur nulle part. Deux filets
 * l'autorisent déjà : le matcher du middleware exclut `manifest.webmanifest`, et
 * `estCheminPublic` le laisse passer. Un test verrouille les deux.
 *
 * Ce manifeste ne contient AUCUNE donnée : ni offre, ni adresse, ni statut. C'est un
 * fichier de présentation. La règle « ne jamais ouvrir une route qui affiche des
 * données » n'est donc pas entamée.
 *
 * `display: standalone` : lancée depuis l'écran d'accueil, l'app s'ouvre sans barre
 * d'URL. `start_url: "/"` renvoie vers `/connexion` si la session a expiré — c'est
 * voulu, JobAI reste privée.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobAI",
    short_name: "JobAI",
    description: "Suivi et analyse de recherche d’emploi — région de Québec.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // `--bg` de globals.css, converti depuis son OKLCH. Le manifeste ne connaît pas
    // `prefers-color-scheme`, mais depuis ADR-0008 (révisé le 2026-08-13) l'app n'a plus
    // qu'un thème : la question ne se pose plus. C'est cette couleur que l'écran de
    // démarrage Android affiche AVANT que le CSS ne charge — une valeur claire ici
    // produirait un flash blanc à chaque ouverture de l'app installée.
    background_color: "#141209",
    theme_color: "#141209",
    lang: "fr-CA",
    dir: "ltr",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Variante MASKABLE : Android rogne l'icône selon la forme du lanceur (cercle,
      // goutte…). Sans elle, le chevron du `>_` se fait manger sur les bords.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
