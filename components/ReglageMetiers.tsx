"use client";

// components/ReglageMetiers.tsx — choisir les métiers du flux, sans passer par moi.
//
// C'EST LA PIÈCE QUI REND MARC AUTONOME.
// Le flux complet du Guichet est trié par `noc2021`, un code de profession normalisé. Quels
// codes retenir est SA décision — mais jusqu'ici il fallait me demander de lancer le
// diagnostic et de lire un JSON de plusieurs centaines de lignes. Un réglage qui exige une
// session Claude n'est pas un réglage : c'est une dépendance.
//
// L'écran fait donc les deux moitiés du geste : il MESURE (le flux, en vrai, maintenant) et
// il montre chaque code avec son compte ET des titres réels — parce qu'un compte seul ne se
// tranche pas. Puis Marc coche.
//
// ⚠️ CE QU'IL DIT QUAND LA MESURE EST PARTIELLE COMPTE AUTANT QUE LE TABLEAU. Si la lecture
// s'arrête sur son budget, les comptes sont le DÉBUT d'une mesure, pas une mesure. Les
// montrer sans le dire ferait choisir sur un préfixe — la faute déjà payée trois fois en une
// journée sur ce dépôt.

import { useState, useTransition } from "react";
import { reglerMetiers } from "@/lib/actionsMetiers";
import { lireMesureMetiers, type LigneMetier, type MesureMetiers } from "@/lib/metiersMesure";
import { normaliserMetiers } from "@/lib/metiersRetenus";

/** Titres montrés par ligne. Trois suffisent à reconnaître un métier, dix ne se lisent pas. */
const TITRES_MONTRES = 3;

function Tableau({
  titre,
  aide,
  lignes,
  retenus,
  basculer,
  gele,
}: {
  titre: string;
  aide: string;
  lignes: LigneMetier[];
  retenus: Set<string>;
  basculer: (code: string) => void;
  gele: boolean;
}) {
  if (lignes.length === 0) return null;
  return (
    <div className="metiers__bloc">
      <h3 className="metiers__soustitre">{titre}</h3>
      <p className="metiers__aide">{aide}</p>
      <ul className="metiers__table">
        {lignes.map((l) => (
          <li key={l.code} className="metiers__ligne">
            <label className="metiers__choix">
              <input
                type="checkbox"
                checked={retenus.has(l.code)}
                onChange={() => basculer(l.code)}
                disabled={gele}
              />
              <span className="metiers__code">{l.code}</span>
            </label>
            <span className="metiers__n">{l.offres}</span>
            <span className="metiers__titres">
              {l.titres.length === 0
                ? "aucun titre retenu pour ce code"
                : l.titres.slice(0, TITRES_MONTRES).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReglageMetiers({ metiersInitiaux }: { metiersInitiaux: string[] }) {
  // ⚠️ UNE SEULE SOURCE DE VÉRITÉ : LA SAISIE. Le premier jet gardait un `Set` d'un côté et
  // dérivait le champ texte de lui — donc chaque frappe passait par `normaliserMetiers`, qui
  // jette ce qui n'a pas deux ou cinq chiffres : taper « 21301 » perdait les caractères
  // intermédiaires et le champ était inutilisable. Les cases à cocher RÉÉCRIVENT la saisie,
  // et les codes valides s'en dérivent — jamais l'inverse.
  const [saisie, setSaisie] = useState(metiersInitiaux.join(" "));
  const [enregistres, setEnregistres] = useState<string[]>(metiersInitiaux);
  const [mesure, setMesure] = useState<MesureMetiers | null>(null);
  const [mesureEnCours, setMesureEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const codes = normaliserMetiers(saisie).codes;
  const retenus = new Set(codes);
  const modifie = codes.join(" ") !== [...enregistres].sort().join(" ");

  function basculer(code: string) {
    const apres = new Set(codes);
    if (apres.has(code)) apres.delete(code);
    else apres.add(code);
    setSaisie([...apres].sort().join(" "));
  }

  async function mesurer() {
    setMesureEnCours(true);
    setErreur(null);
    try {
      const r = await fetch("/api/diagnostic/flux-guichet", { cache: "no-store" });
      const lu = lireMesureMetiers(await r.json());
      if (lu === null) {
        // ⚠️ « Je n'ai pas su lire » ≠ « le flux ne porte aucun métier ». Un tableau vide
        // ferait conclure que la source ne vaut rien.
        setErreur(
          r.ok
            ? "Le flux a répondu, mais sa mesure n’est pas exploitable. Voir les journaux."
            : `Le flux n’a pas pu être lu (HTTP ${r.status}).`,
        );
        return;
      }
      setMesure(lu);
    } catch (e) {
      setErreur(`Mesure impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMesureEnCours(false);
    }
  }

  function enregistrer() {
    setMessage(null);
    setErreur(null);
    demarrer(async () => {
      // La saisie BRUTE part à l'action, pas les codes déjà filtrés : c'est elle qui porte
      // les fragments mal formés, et c'est leur liste que Marc doit voir revenir.
      const r = await reglerMetiers(saisie);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setEnregistres(r.codes);
      setSaisie(r.codes.join(" "));
      const parts = [
        r.active
          ? `${r.codes.length} métier(s) retenu(s) — le flux complet du Guichet est actif à la prochaine passe.`
          : "Aucun métier retenu : le flux complet du Guichet n’est pas interrogé.",
      ];
      if (r.rejets.length > 0) parts.push(`Refusés (mal formés) : ${r.rejets.join(", ")}.`);
      if (r.redondants.length > 0) {
        parts.push(
          `Déjà couverts par un préfixe, donc sans effet : ${r.redondants.join(", ")}.`,
        );
      }
      setMessage(parts.join(" "));
    });
  }

  const gele = enCours || mesureEnCours;

  return (
    <div className="metiers">
      <p className="metiers__aide">
        Le flux complet du Guichet publie tout le Canada. Il est trié par code de profession
        (NOC 2021), un classement normalisé — donc lisible même sur des annonces en anglais,
        là où le barème par mots-clés ne l’est pas. Tant qu’aucun code n’est retenu, ce flux
        n’est pas interrogé du tout.
      </p>

      <div className="metiers__actuels">
        <span className="metiers__label">Retenus</span>
        <span className="metiers__valeur">
          {enregistres.length === 0 ? "aucun — source éteinte" : enregistres.join(" · ")}
        </span>
      </div>

      <div className="metiers__ligne-actions">
        <button type="button" className="bouton" onClick={mesurer} disabled={gele}>
          {mesureEnCours ? "Lecture du flux…" : "Mesurer le flux"}
        </button>
        <button type="button" className="bouton" onClick={enregistrer} disabled={gele || !modifie}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {mesureEnCours ? (
        <p className="metiers__aide">
          Le flux fait environ 130 Mo. La lecture prend une dizaine de secondes et ne fait
          entrer aucune offre : elle mesure, elle n’ingère rien.
        </p>
      ) : null}

      {mesure !== null ? (
        <>
          <p className={mesure.concluante ? "metiers__aide" : "metiers__alerte"}>
            {mesure.concluante
              ? `Lecture complète : ${mesure.regionales} offre(s) régionale(s) classée(s).`
              : `⚠️ Lecture PARTIELLE (${mesure.fin}) sur ${mesure.regionales} offre(s) régionale(s). Les comptes ci-dessous sont le début d’une mesure, pas une mesure : ils ne permettent pas de conclure qu’un code est rare.`}
          </p>
          <Tableau
            titre="Par domaine et niveau"
            aide="Deux chiffres. C’est l’unité utile : « sciences et génie, niveau universitaire » sans énumérer les quarante codes qui s’y rangent."
            lignes={mesure.niveaux}
            retenus={retenus}
            basculer={basculer}
            gele={gele}
          />
          <Tableau
            titre="Métiers précis"
            aide="Cinq chiffres. Pour retenir un métier seul, ou l’ajouter malgré son voisinage."
            lignes={mesure.metiers}
            retenus={retenus}
            basculer={basculer}
            gele={gele}
          />
        </>
      ) : null}

      <label className="metiers__label" htmlFor="metiers-saisie">
        Ou à la main
      </label>
      <input
        id="metiers-saisie"
        className="metiers__champ"
        type="text"
        inputMode="numeric"
        value={saisie}
        placeholder="21 22 72301"
        onChange={(e) => setSaisie(e.target.value)}
        disabled={gele}
      />

      <p className="metiers__message" role="status">
        {erreur ?? message ?? ""}
      </p>
    </div>
  );
}
