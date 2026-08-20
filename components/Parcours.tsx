// components/Parcours.tsx — le parcours et les compétences, tels que le CV les porte.
//
// ⚠️ AUCUN CONTENU EN DUR ICI. Ce composant ne connaît ni employeur, ni date, ni intitulé :
// il rend ce que le profil contient. Le dépôt est PUBLIC et `tests/piiGuard.test.ts` refuse
// ce genre de contenu dans un fichier versionné — mais surtout, un parcours écrit dans le
// code périmerait au premier changement de poste sans que rien ne le signale.

import type { Profil } from "@/lib/profil";

/** La période d'un poste, telle que le CV l'écrit. Jamais reconstruite. */
function periode(debut: string, fin: string): string | null {
  const d = debut.trim();
  const f = fin.trim();
  if (d === "" && f === "") return null;
  if (d !== "" && f !== "") return `${d} — ${f}`;
  return d !== "" ? `depuis ${d}` : `jusqu’à ${f}`;
}

function Groupe({ titre, valeurs }: { titre: string; valeurs: readonly string[] }) {
  if (valeurs.length === 0) return null;
  return (
    <div className="profil__groupe">
      <h3 className="profil__groupe-titre">{titre}</h3>
      <ul className="profil__etiquettes">
        {valeurs.map((v) => (
          <li key={v} className="etiquette">
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Parcours({ profil }: { profil: Profil }) {
  const f = profil.faits;
  const rien =
    f.parcours.length === 0 &&
    f.outils.length === 0 &&
    f.diplomes.length === 0 &&
    f.langues.length === 0;

  if (rien) {
    // ⚠️ UN ÉTAT VIDE QUI DIT COMMENT LE REMPLIR. Une page blanche ressemble à une panne ;
    // « aucun CV validé » est une situation normale, et la phrase donne le geste suivant.
    return (
      <p className="parcours__vide">
        Rien à afficher pour l’instant : cette page se remplit à partir d’un CV validé. Dépose
        le tien dans <strong>Profil</strong>, relis ce que l’extraction propose, et il
        apparaîtra ici.
      </p>
    );
  }

  return (
    <>
      {f.parcours.length > 0 ? (
        <section className="carte-info">
          <h2>Parcours</h2>
          <ol className="parcours">
            {f.parcours.map((e, i) => {
              const p = periode(e.debut, e.fin);
              return (
                <li key={`${e.titre}-${e.employeur}-${i}`} className="parcours__poste">
                  <div className="parcours__tete">
                    <h3 className="parcours__titre">{e.titre}</h3>
                    {p ? <span className="parcours__periode">{p}</span> : null}
                  </div>
                  {e.employeur !== "" ? (
                    <p className="parcours__employeur">{e.employeur}</p>
                  ) : null}
                  {e.faits.length > 0 ? (
                    <ul className="parcours__faits">
                      {e.faits.map((fait) => (
                        <li key={fait}>{fait}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="carte-info">
        <h2>Compétences</h2>
        <Groupe titre="Outils et méthodes" valeurs={f.outils} />
        <Groupe titre="Diplômes" valeurs={f.diplomes} />
        <Groupe titre="Langues" valeurs={f.langues} />
        {f.outils.length === 0 && f.diplomes.length === 0 && f.langues.length === 0 ? (
          <p className="parcours__vide">
            L’extraction n’a retenu aucune compétence de ton CV. Si c’est inattendu, relance
            l’analyse depuis <strong>Profil</strong>.
          </p>
        ) : null}
      </section>
    </>
  );
}
