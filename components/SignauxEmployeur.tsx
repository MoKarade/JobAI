// components/SignauxEmployeur.tsx — ce que le suivi sait d'un employeur, en quatre lignes.
//
// Présentation seule : tous les chiffres viennent de `lib/signauxEmployeur.ts` (pur, testé).
// Chaque ligne dit CE QUE LE SUIVI A VU, pas ce que l'employeur fait : « ouverte depuis au moins »,
// « intitulé repris », jamais « republie en boucle ».

import { dateLisible } from "@/lib/dateLisible";
import type { SignauxEmployeur as Signaux } from "@/lib/signauxEmployeur";

const s = (n: number) => (n > 1 ? "s" : "");

export function SignauxEmployeur({ signaux }: { signaux: Signaux }) {
  const { plusAncienneOuverte: ancienne, intitulesRepris } = signaux;
  return (
    <section className="signaux" aria-label="Ce que le suivi sait de cet employeur">
      <h3 className="signaux__titre">Ce que le suivi sait de cet employeur</h3>
      <ul className="signaux__liste">
        <li>
          {signaux.ouvertes} offre{s(signaux.ouvertes)} réputée{s(signaux.ouvertes)} ouverte
          {s(signaux.ouvertes)}, {signaux.fermees} fermée{s(signaux.fermees)}.
        </li>
        <li>
          {ancienne
            ? `La plus ancienne ouverte l'est depuis au moins ${ancienne.jours} jour${s(ancienne.jours)} (repérée le ${dateLisible(ancienne.repereeLe)}).`
            : "Durée d'ouverture inconnue : aucune offre ouverte n'a été suivie par la veille."}
        </li>
        <li>
          {signaux.dureeFermeeMedianeJours !== null
            ? `Offres fermées : durée médiane vue de ${signaux.dureeFermeeMedianeJours} jour${s(signaux.dureeFermeeMedianeJours)}, sur ${signaux.fermeesObservees}.`
            : `Offres fermées : trop peu pour une durée médiane (${signaux.fermeesObservees} suivie${s(signaux.fermeesObservees)}, il en faut 3).`}
        </li>
        <li>
          {intitulesRepris.length === 0
            ? "Aucun intitulé repris."
            : `Intitulé${s(intitulesRepris.length)} repris : ${intitulesRepris
                .map((i) => `« ${i.intitule} » ×${i.fois}`)
                .join(" · ")}${signaux.intitulesReprisTotal > intitulesRepris.reduce((n, i) => n + i.fois - 1, 0) ? " · …" : ""}.`}
        </li>
      </ul>
    </section>
  );
}
