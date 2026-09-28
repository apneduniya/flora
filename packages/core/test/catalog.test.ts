import { describe, expect, it } from "vitest";
import { FONT_PAIRS } from "../src/catalog/fonts";
import { describePalette, PALETTES } from "../src/catalog/palettes";
import { validateCatalog } from "../src/catalog/validate";

describe("catalog", () => {
  it("has 40 palettes with the planned mix", () => {
    expect(PALETTES).toHaveLength(40);
    const dark = PALETTES.filter((p) => p.tags.mode === "dark" && p.tags.contrast === "normal").length;
    const light = PALETTES.filter((p) => p.tags.mode === "light" && p.tags.contrast === "normal").length;
    const hc = PALETTES.filter((p) => p.tags.contrast === "high").length;
    expect([dark, light, hc]).toEqual([16, 20, 4]);
  });

  it("every palette passes the contrast rules", () => {
    expect(validateCatalog()).toEqual([]);
  });

  it("has 8 font pairs", () => {
    expect(FONT_PAIRS).toHaveLength(8);
  });

  it("describes palettes in words, not hex", () => {
    for (const p of PALETTES) expect(describePalette(p)).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
