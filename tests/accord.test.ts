// tests/accord.test.ts — le singulier et le pluriel s'écrivent selon le nombre, en français.
import { describe, expect, it } from "vitest";
import { accord } from "@/lib/accord";

describe("accord", () => {
  it("met le singulier pour 0 et 1 (usage français)", () => {
    expect(accord(0, "nouvelle")).toBe("nouvelle");
    expect(accord(1, "nouvelle")).toBe("nouvelle");
  });

  it("ajoute un s dès 2", () => {
    expect(accord(3, "nouvelle")).toBe("nouvelles");
  });

  it("prend le pluriel donné quand il n'est pas régulier", () => {
    expect(accord(2, "lieu inconnu", "lieux inconnus")).toBe("lieux inconnus");
    expect(accord(1, "lieu inconnu", "lieux inconnus")).toBe("lieu inconnu");
  });
});
