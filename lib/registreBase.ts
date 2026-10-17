// lib/registreBase.ts — lecture, en comptes, du registre des entreprises déjà importé en base.
//
// Sert à la sonde des sources employeurs (JobAI#160) : pour des clés de nom (`cleNom`), combien de
// NEQ distincts les portent, dans les dénominations ET les établissements. Ne rend ni nom ni adresse.

import { count, inArray } from "drizzle-orm";
import { db } from "./db";
import { registreEtablissements, registreNoms } from "./db/schema";

/** Taille d'un lot de clés par requête (borne le nombre de paramètres liés). */
const LOT = 1000;

/** Pour chaque clé trouvée en base, le nombre de NEQ distincts qui la portent. */
export async function lireClesRegistre(cles: readonly string[]): Promise<ReadonlyMap<string, number>> {
  const neqParCle = new Map<string, Set<string>>();
  const noter = (cle: string, neq: string) => {
    const s = neqParCle.get(cle) ?? new Set<string>();
    s.add(neq);
    neqParCle.set(cle, s);
  };
  for (let i = 0; i < cles.length; i += LOT) {
    const lot = cles.slice(i, i + LOT);
    const [noms, etablissements] = await Promise.all([
      db
        .select({ cle: registreNoms.nomCle, neq: registreNoms.neq })
        .from(registreNoms)
        .where(inArray(registreNoms.nomCle, lot)),
      db
        .select({ cle: registreEtablissements.nomCle, neq: registreEtablissements.neq })
        .from(registreEtablissements)
        .where(inArray(registreEtablissements.nomCle, lot)),
    ]);
    for (const r of [...noms, ...etablissements]) noter(r.cle, r.neq);
  }
  return new Map([...neqParCle].map(([cle, neq]) => [cle, neq.size]));
}

/** Le nombre de lignes de chaque table du registre : dit si la base est vide ou bien remplie. */
export async function compterRegistre(): Promise<{ noms: number; etablissements: number }> {
  const [[n], [e]] = await Promise.all([
    db.select({ n: count() }).from(registreNoms),
    db.select({ n: count() }).from(registreEtablissements),
  ]);
  return { noms: n?.n ?? 0, etablissements: e?.n ?? 0 };
}
