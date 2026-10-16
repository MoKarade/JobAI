"use client";

// components/RevueProfil.tsx — l'écran où Marc décide, écart par écart.
//
// ⚠️ C'EST LE POINT DE CONTRÔLE DE TOUT LE CHANTIER. Marc a tranché « rien sans ma
// validation » (ADR-0009) : cet écran est l'endroit exact où cette règle devient vraie ou
// devient un slogan.
//
// TROIS PARTIS PRIS D'INTERFACE, ET CE QU'ILS EMPÊCHENT :
//
//   1. **Seul ce qui porte une PREUVE est coché d'avance** (ADR-0028, qui amende l'ADR-0009 :
//      avant, rien ne l'était). La preuve est décidée par `calculerEcarts` (`Ecart.preuve`),
//      jamais ici : un fait établi dont la source se lit à l'écran. Une supposition, un
//      « non établi » qui effacerait une valeur et toute conséquence sur le barème restent
//      décochés — Marc coche ceux-là lui-même. Un écran où TOUT serait pré-coché serait un
//      accusé de réception ; celui-ci laisse à Marc ce qui demande un jugement.
//   2. **La provenance est affichée à côté de la valeur**, et son ABSENCE est dite en
//      toutes lettres (« le modèle a supposé »). Sans ça, un chiffre deviné et un chiffre
//      lu dans le document se ressemblent — et c'est précisément le chiffre deviné qui
//      déplacerait toutes les notes.
//   3. **Les FAITS et les CONSÉQUENCES sont séparés visuellement.** Un fait se vérifie dans
//      le CV ; une conséquence est une déduction du code sur le barème. Les mélanger
//      ferait valider une modification du classement sous couvert de confirmer une date.

import { useState, useTransition } from "react";
import { retenusParDefaut, type Ecart } from "@/lib/cv/proposition";
import { validerProfil } from "@/lib/cv/actions";

export function RevueProfil({
  cvId,
  ecarts,
  nomFichier,
}: {
  cvId: number;
  ecarts: readonly Ecart[];
  nomFichier: string;
}) {
  // ⚠️ DÉPART = LES ÉCARTS QUI PORTENT UNE PREUVE, et rien d'autre. Voir le parti pris n°1.
  const [retenus, setRetenus] = useState<ReadonlySet<string>>(
    () => new Set(retenusParDefaut(ecarts)),
  );
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  const faits = ecarts.filter((e) => e.nature === "fait");
  const consequences = ecarts.filter((e) => e.nature === "consequence");

  function basculer(cle: string) {
    setRetenus((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });
  }

  function valider() {
    demarrer(async () => {
      // ⚠️ LE `try` N'EST PAS DÉCORATIF. Sans lui, une action serveur qui REJETTE (panne
      // réseau, exception non prévue) ne passe par aucun `setRetour` : le bandeau reste
      // vide, le bouton se débloque à la fin de la transition, et l'écran a l'air d'avoir
      // travaillé. Marc n'apprendrait qu'un profil a peut-être été activé à moitié qu'en
      // rechargeant la page — ou jamais.
      try {
        const r = await validerProfil(cvId, [...retenus]);
        setRetour(
          r.ok
            ? { ok: true, texte: `${r.message ?? "Appliqué."} ${r.valeur.resume}` }
            : { ok: false, texte: r.erreur },
        );
      } catch {
        // Phrase simple : le message technique de l'exception ne dit rien à Marc.
        setRetour({
          ok: false,
          texte:
            "La validation n'a pas abouti. Recharge la page pour voir l'état réel du profil avant de réessayer.",
        });
      }
    });
  }

  if (ecarts.length === 0) {
    return (
      <p className="hint">
        Ce CV ne propose rien que le profil ne sache déjà. Rien à valider — et c’est une
        réponse, pas un échec.
      </p>
    );
  }

  return (
    <div className="revue">
      <p className="hint">
        Lu dans <strong>{nomFichier}</strong>. Ce qui a une source à vérifier est coché
        d’avance ; le reste attend ton geste. Rien ne s’applique avant « Appliquer », et une
        note posée à la main n’est jamais recalculée.
      </p>

      {faits.length > 0 ? (
        <section className="revue__groupe">
          <h3>Ce que le CV établit</h3>
          <p className="hint">Vérifiable dans le document.</p>
          <ul className="revue__liste">
            {faits.map((e) => (
              <LigneEcart
                key={e.cle}
                ecart={e}
                coche={retenus.has(e.cle)}
                onBascule={() => basculer(e.cle)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {consequences.length > 0 ? (
        <section className="revue__groupe">
          <h3>Ce que ça changerait au barème</h3>
          <p className="hint">
            Déduit par l’app, pas lu dans le CV. Tu peux retenir un fait sans retenir ce
            qu’on en tire.
          </p>
          <ul className="revue__liste">
            {consequences.map((e) => (
              <LigneEcart
                key={e.cle}
                ecart={e}
                coche={retenus.has(e.cle)}
                onBascule={() => basculer(e.cle)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="revue__pied">
        <button type="button" className="bouton" onClick={valider} disabled={enCours}>
          {enCours
            ? "Application…"
            : `Appliquer ${retenus.size} changement${retenus.size > 1 ? "s" : ""}`}
        </button>
        <span className="hint">
          {retenus.size === 0
            ? "Rien de coché : appliquer ne changera aucune note."
            : "Les notes seront recalculées immédiatement."}
        </span>
      </div>

      {retour ? (
        <p className={retour.ok ? "revue__retour" : "revue__retour revue__retour--echec"}>
          {retour.texte}
        </p>
      ) : null}
    </div>
  );
}

function LigneEcart({
  ecart,
  coche,
  onBascule,
}: {
  ecart: Ecart;
  coche: boolean;
  onBascule: () => void;
}) {
  return (
    <li className={`ecart${coche ? " ecart--retenu" : ""}`}>
      <label className="ecart__choix">
        <input type="checkbox" checked={coche} onChange={onBascule} />
        <span className="ecart__libelle">{ecart.libelle}</span>
        {ecart.preuve ? <span className="ecart__preuve">source citée</span> : null}
      </label>
      <p className="ecart__valeurs">
        <span className="ecart__avant">{ecart.avant}</span>
        <span className="ecart__fleche" aria-hidden="true">
          {" → "}
        </span>
        <span className="ecart__apres">{ecart.apres}</span>
      </p>
      {/* Une provenance ABSENTE se dit. Un chiffre supposé et un chiffre lu dans le
          document ne doivent pas se ressembler à l'écran. */}
      <p className={`ecart__source${ecart.provenance ? "" : " ecart__source--suppose"}`}>
        {ecart.provenance || "Aucune source citée — le modèle a supposé. À vérifier."}
      </p>
    </li>
  );
}
