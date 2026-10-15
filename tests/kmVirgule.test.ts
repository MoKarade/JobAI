// tests/kmVirgule.test.ts — une distance s'écrit avec la virgule française.
import { describe, expect, it } from "vitest";
import { kmVirgule } from "@/lib/kmVirgule";

describe("kmVirgule", () => {
  it("remplace le point par une virgule", () => {
    expect(kmVirgule(12.3)).toBe("12,3 km");
  });

  it("laisse un entier sans virgule", () => {
    expect(kmVirgule(5)).toBe("5 km");
  });
});
