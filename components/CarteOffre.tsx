// components/CarteOffre.tsx — une offre dans la liste.
//
// Composant de PRÉSENTATION pur : il reçoit une offre et l'affiche. Aucune logique de
// notation ni de filtrage ici — elles vivent dans `lib/scoring.ts`, testées.
//
// La justification s'affiche depuis `raisons` (un ton, un texte). L'artifact d'origine
// stockait du HTML et l'injectait tel quel ; React échappe tout par défaut, donc même si
// un texte contenait des chevrons, ils s'afficheraient au lieu d'être interprétés.

import Link from "next/link";
import type { Offre } from "@/lib/types";
import { palier } from "@/lib/scoring";
import { ControlesOffre } from "./ControlesOffre";

/** Les distances s'écrivent à la française : 3,5 km. */
function formaterKm(km: number): string {
  return `${km.toString().replace(".", ",")} km`;
}

/**
 * Un lien n'est rendu cliquable que s'il est en http(s) — même règle que le hub.
 * Un `javascript:` ou un `data:` dans un champ de données ne doit jamais devenir un lien.
 */
function lienSur(brut: string): string | null {
  if (!brut) return null;
  try {
    const u = new URL(brut);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function CarteOffre({ offre }: { offre: Offre }) {
  const p = palier(offre.score);
  const href = lienSur(offre.lien);
  const perimee = offre.perimeeLe !== null;

  return (
    <article
      className={`carte carte--${p}${offre.histo ? " carte--histo" : ""}${
        perimee ? " carte--perimee" : ""
      }`}
    >
      <div className={`note note--${p}`} title="Note de fit sur 100 — voir le barème">
        {offre.score ?? "–"}
        <small>{offre.score === null ? "histo" : "/100"}</small>
      </div>

      <div className="carte__tete">
        {/* L'entreprise mène au détail interne ; « offre ↗ » mène à l'annonce externe.
            Deux destinations différentes, donc deux liens distincts — un seul lien qui
            fait les deux selon le contexte serait un piège. */}
        <Link href={`/offre/${offre.id}`} className="carte__entreprise">
          {offre.entreprise}
        </Link>
        <span className="carte__poste">{offre.poste}</span>
        {/* L'état « périmée » se voit AVANT le contenu : sans ça, on lit une offre
            fermée comme une piste ouverte. */}
        {perimee ? <span className="badge-perimee">périmée</span> : null}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            offre ↗
          </a>
        ) : null}
      </div>

      {offre.raisons.length > 0 ? (
        <ul className="carte__raisons">
          {offre.raisons.map((r, i) => (
            <li key={i} className={`raison raison--${r.ton}`}>
              {r.texte}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="carte__meta">
        {offre.km !== null ? (
          <span className="etiquette etiquette--km">{formaterKm(offre.km)}</span>
        ) : null}
        {offre.salaireAffiche ? (
          <span className="etiquette etiquette--salaire">{offre.salaireAffiche}</span>
        ) : null}
        <span className="carte__date">
          {offre.histo ? "envoyée" : "vue"} {offre.dateEnvoi || offre.dateReperage}
        </span>
      </div>

      {offre.notes ? <p className="carte__notes">{offre.notes}</p> : null}

      <ControlesOffre offre={offre} />
    </article>
  );
}
