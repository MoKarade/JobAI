// lib/annonce.ts — reconnaître qu'un lien désigne la MÊME annonce, quel que soit le nom de l'employeur.
//
// Demande (JobAI#195) : le Guichet-Emplois renomme parfois l'employeur d'une annonce entre deux passages
// (« Harvey's » devient « Harvey's 2538 »). L'identité d'une offre suivie est (employeur, intitulé) : la même
// annonce entre alors deux fois dans le suivi, et tout ce qui compte des offres par employeur compte double.
// Le numéro d'annonce du lien, lui, ne change pas.
//
// ⚠️ SEULS LES LIENS DU GUICHET (et de son nom anglais, Job Bank) SONT LUS. Le numéro d'un autre site n'a pas la
// même portée : deux sites peuvent attribuer le même nombre à deux annonces sans rapport. Un lien qui ne se lit
// pas rend `null`, et `null` veut dire « je ne sais pas », jamais « annonce distincte à coup sûr » ni
// « annonce identique » : l'offre garde alors son identité d'avant.
//
// Fonction PURE.

/** Hôtes qui publient les annonces du Guichet-Emplois (français) et de Job Bank (anglais). */
function hoteDuGuichet(hote: string): boolean {
  const h = hote.toLowerCase();
  return (
    h === "guichetemplois.gc.ca" ||
    h.endsWith(".guichetemplois.gc.ca") ||
    h === "jobbank.gc.ca" ||
    h.endsWith(".jobbank.gc.ca")
  );
}

/**
 * Le numéro d'annonce d'un lien du Guichet (`/jobsearch/jobposting/49765163`), ou `null`.
 * Les paramètres, le fragment et un éventuel `;jsessionid=…` ne changent pas le numéro.
 */
export function numeroAnnonce(lien: string | null | undefined): string | null {
  if (typeof lien !== "string" || lien.trim() === "") return null;
  let u: URL;
  try {
    u = new URL(lien.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!hoteDuGuichet(u.hostname)) return null;
  const m = /\/jobsearch\/jobposting\/(\d{4,12})(?![\d])/i.exec(u.pathname);
  return m ? m[1]! : null;
}
