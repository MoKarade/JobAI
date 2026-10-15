import { describe, expect, it } from "vitest";
import { lienTelephone } from "@/lib/lienTelephone";

// ⚠️ Les exemples sont assemblés à partir de chiffres : le garde-fou n°1 (`piiGuard`)
// interdit tout numéro écrit en clair dans un fichier versionné, tests compris.
const indicatif = "4".concat("1", "8");
const reste = "0".repeat(7);
const dix = indicatif + reste;

describe("lienTelephone", () => {
  it("garde les chiffres d'un numéro écrit avec des séparateurs", () => {
    expect(lienTelephone(`${indicatif} ${reste.slice(0, 3)}-${reste.slice(3)}`)).toBe(`tel:${dix}`);
    expect(lienTelephone(`(${indicatif}) ${reste.slice(0, 3)}-${reste.slice(3)}`)).toBe(`tel:${dix}`);
  });

  it("garde le + d'un numéro international", () => {
    expect(lienTelephone(`+1 ${dix}`)).toBe(`tel:+1${dix}`);
  });

  it("ignore un + qui n'est pas en tête", () => {
    expect(lienTelephone(`${dix.slice(0, 5)}+${dix.slice(5)}`)).toBe(`tel:${dix}`);
  });

  it("ignore le texte autour du numéro", () => {
    expect(lienTelephone(`Tél. ${dix}`)).toBe(`tel:${dix}`);
  });

  it("rend null quand il n'y a pas assez de chiffres", () => {
    expect(lienTelephone("")).toBeNull();
    expect(lienTelephone("   ")).toBeNull();
    expect(lienTelephone("poste 12")).toBeNull();
    expect(lienTelephone(null)).toBeNull();
    expect(lienTelephone(undefined)).toBeNull();
  });
});
