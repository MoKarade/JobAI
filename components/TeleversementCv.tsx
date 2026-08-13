"use client";

// components/TeleversementCv.tsx — déposer un CV, et savoir ce qui s'est passé.
//
// ⚠️ LE RETOUR EST TOUT L'INTÉRÊT DE CE COMPOSANT. Un téléversement qui échoue en silence
// fait re-déposer le même fichier en boucle. Chaque cas d'échec de `lib/cv/texte.ts` porte
// une raison qui dit QUOI FAIRE (« ce PDF ne contient que des images, ré-exporte-le depuis
// ton traitement de texte ») : ce composant l'affiche telle quelle, sans la réduire à
// « une erreur est survenue ».

import { useRef, useState, useTransition } from "react";
import { televerserCv } from "@/lib/cv/actions";

export function TeleversementCv() {
  const formulaire = useRef<HTMLFormElement>(null);
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  function envoyer(donnees: FormData) {
    demarrer(async () => {
      const r = await televerserCv(donnees);
      setRetour(
        r.ok
          ? { ok: true, texte: r.message ?? "CV enregistré." }
          : { ok: false, texte: r.erreur },
      );
      if (r.ok) formulaire.current?.reset();
    });
  }

  return (
    <form ref={formulaire} action={envoyer} className="depot-cv">
      <label className="depot-cv__champ">
        <span>Fichier PDF ou texte, 8 Mo maximum</span>
        <input type="file" name="cv" accept=".pdf,.txt,application/pdf,text/plain" required />
      </label>

      <button type="submit" className="bouton" disabled={enCours}>
        {enCours ? "Lecture…" : "Déposer et analyser"}
      </button>

      <p className="hint">
        Le fichier reste dans ta base, il ne sort jamais de l’app. Ton nom, ton adresse et
        ton téléphone ne sont pas retenus dans le profil : seuls les faits professionnels le
        sont.
      </p>

      {retour ? (
        <p className={retour.ok ? "revue__retour" : "revue__retour revue__retour--echec"}>
          {retour.texte}
        </p>
      ) : null}
    </form>
  );
}
