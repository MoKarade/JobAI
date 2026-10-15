// app/not-found.tsx — la page « introuvable », en français.
//
// Sans ce fichier, Next affiche son texte anglais par défaut (« This page could not be
// found ») quand `notFound()` est appelé, par exemple pour une offre qui n'existe plus.

import Link from "next/link";

export default function Introuvable() {
  return (
    <main className="etat">
      <h1>Page introuvable</h1>
      <p>Cette offre ou cette page n’existe plus, ou l’adresse est incorrecte.</p>
      <Link href="/" className="retour">
        ← Toutes les offres
      </Link>
    </main>
  );
}
