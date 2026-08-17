/** @type {import('next').NextConfig} */

/**
 * En-têtes de sécurité. JobAI est le dépôt le plus sensible de l'écosystème — il porte
 * l'adresse du domicile, le statut migratoire et des noms de personnes tierces (garde-fou
 * n°1 du CLAUDE.md) — et il n'avait AUCUN en-tête de sécurité jusqu'ici.
 *
 * CSP en REPORT-ONLY volontairement (2026-07-31). La politique ci-dessous est celle qu'on
 * VEUT, mais elle n'a pas encore été vérifiée dans un vrai navigateur : une CSP trop stricte
 * casse SILENCIEUSEMENT (carte vide, page blanche) et ça ne se voit ni au build ni aux tests.
 * En Report-Only, elle ne bloque rien et signale ses violations dans la console.
 *
 * ➜ POUR PASSER EN ENFORCÉ : ouvrir l'app (accueil, /carte, /offre/[id], /references),
 *   vérifier qu'aucune violation CSP n'apparaît dans la console, puis renommer la clé
 *   `Content-Security-Policy-Report-Only` en `Content-Security-Policy`. Tant que ce n'est
 *   pas fait, la CSP OBSERVE — elle ne protège pas.
 *
 * Ce qui a guidé la politique :
 * - `img-src` inclut `tile.openstreetmap.org` : la carte Leaflet charge ses tuiles depuis
 *   le NAVIGATEUR. Sans ça, la carte serait vide — c'est LE risque de cette CSP.
 * - `connect-src 'self'` suffit : tous les appels tiers (Nominatim, Greenhouse, Lever,
 *   SmartRecruiters, Indeed…) partent du SERVEUR, jamais du navigateur, et le server-side
 *   n'est pas soumis à la CSP.
 * - `'unsafe-inline'` sur script/style : Next.js App Router injecte l'hydratation et les
 *   styles en ligne. Un nonce demanderait un middleware qui réécrit chaque réponse —
 *   disproportionné ici. Même ainsi, la CSP bloque le chargement d'un script DISTANT et
 *   l'exfiltration vers un domaine tiers.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Tuiles de la carte + images encodées.
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,

  /**
   * ⚠️ LA LIGNE QUI FAIT EXISTER LES DÉPÔTS EN PRODUCTION. Incident du 2026-08-12.
   *
   * Le cron `/api/cron/veille` lit `data/depot/*.json` par `readdir(process.cwd())`. Or le
   * traceur de Next n'embarque dans une fonction serverless QUE les fichiers qu'il voit
   * IMPORTÉS — un `readdir` à l'exécution lui est invisible. Prouvé par les traces du
   * build : `route.js.nft.json` liste 91 fichiers, AUCUN dépôt. En production, le dossier
   * était donc ABSENT, et `sourceDepotFichier` rendait ce vide comme un jour sans dépôt.
   *
   * Conséquence mesurée : aucun dépôt fichier jamais ingéré, et — pire — chaque cron
   * quotidien « ne voyait plus » les offres ingérées par la route POST du 31/07, qui ont
   * TOUTES été périmées en trois balayages. Le stock est retombé de ~78 à ~30 pendant que
   * tous les voyants restaient verts. Un fichier commité n'existe pas en serverless tant
   * que cette clé ne le déclare pas.
   */
  outputFileTracingIncludes: {
    "/api/cron/veille": ["./data/depot/**"],
    // ⚠️ LE CHEMIN DE REPRISE LIT LE MÊME DOSSIER, ET IL A SON PROPRE BUNDLE.
    // Depuis [VEILLE-10], la passe vit dans `lib/veilleComplete.ts` et ce cron-ci la reprend
    // quand elle est en retard. Une entrée de traçage est posée PAR ROUTE : oublier celle-ci
    // ferait tourner la reprise avec `data/depot` ABSENT de son bundle — c'est-à-dire
    // exactement la panne du 2026-08-12, réintroduite par la porte qu'on vient d'ouvrir.
    // Règle : tout appelant de `executerVeilleComplete` s'ajoute ICI, dans le même commit.
    "/api/cron/geocodage": ["./data/depot/**"],
    // ⚠️ ET LA RÈGLE CI-DESSUS A ÉTÉ VIOLÉE PAR CELUI QUI L'AVAIT ÉCRITE — [VEILLE-24].
    //
    // Le bouton « Lancer la veille » de `/sources` est un TROISIÈME appelant. Une Server
    // Action est empaquetée avec la ROUTE qui l'utilise, pas avec le module qui la déclare :
    // `/sources` avait donc besoin de son entrée, et ne l'a pas eue. Mesuré en production le
    // 2026-08-17, dans le compte rendu du bouton lui-même : « depot-fichier EN ÉCHEC —
    // dossier data/depot introuvable ». La seule source vivante de Marc, morte sur ce
    // chemin, trois jours après qu'on ait fermé la même panne.
    //
    // Ce qui l'a rattrapée n'est aucun test — aucun ne peut voir un bundle serverless — mais
    // le fait que la source DISE son empêchement au lieu de rendre un vide. Sans cette
    // honnêteté, le bouton aurait affiché « 0 nouvelle » et rien n'aurait paru anormal.
    "/sources": ["./data/depot/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Report-Only : lire l'explication ci-dessus AVANT de passer en enforcé.
          { key: "Content-Security-Policy-Report-Only", value: CSP },
          // HSTS : l'app est 100 % HTTPS (Vercel). Le navigateur refusera tout downgrade.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Rien n'a de raison d'être mis en cadre : app privée mono-utilisateur.
          { key: "X-Frame-Options", value: "DENY" },
          // Évite de fuiter l'URL complète (qui porte des ids d'offres) vers un site tiers
          // quand on clique le lien d'une offre.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
