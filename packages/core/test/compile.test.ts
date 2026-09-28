import { describe, expect, it } from "vitest";
import { compileTheme } from "../src/compile/css";
import { buildRestyleRequest, parseRestyle } from "../src/jev/restyle";
import { colorName, parseCssColor, contrastRatio, parseHex } from "../src/extract/colorNames";
import type { RestylePicks } from "../src/types";

const picks = (over: Partial<RestylePicks> = {}): RestylePicks => ({
  palette: "midnight",
  paletteTop: [],
  paletteConfidence: 0.9,
  font: "keep_original",
  fontTop: [],
  fontConfidence: 0.9,
  density: "default",
  densityScore: 1,
  radius: "keep",
  accentStrength: 1,
  readingMode: 0,
  outOfCatalog: 0,
  ...over,
});

const tokens = { density: "default" as const, cssVars: [{ name: "--bg", hex: "#ffffff", clusterId: "k0", role: "bg" as const }] };

describe("compileTheme", () => {
  it("emits palette variables, role rules and css-var remaps", () => {
    const t = compileTheme(tokens, picks());
    expect(t.stampColors).toBe(true);
    expect(t.stampFonts).toBe(false);
    expect(t.css).toContain("--flora-bg: #121212");
    expect(t.css).toContain('[data-flora-bg="surface"]');
    expect(t.css).toContain("--bg: var(--flora-bg) !important");
    expect(t.css).toContain("color-scheme: dark");
  });

  it("keep_original palette emits no colour rules", () => {
    const t = compileTheme(tokens, picks({ palette: "keep_original" }));
    expect(t.stampColors).toBe(false);
    expect(t.css).not.toContain("--flora-bg");
  });

  it("font pick adds a Google Fonts import first", () => {
    const t = compileTheme(tokens, picks({ font: "atkinson" }));
    expect(t.css.startsWith('@import url("https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible')).toBe(true);
    expect(t.stampFonts).toBe(true);
  });

  it("reading mode bumps density and font size", () => {
    const t = compileTheme(tokens, picks({ readingMode: 0.9 }));
    expect(t.css).toContain("line-height: 1.65");
    expect(t.css).toContain("font-size: max(1em, 17px)");
  });

  it("radius picks override corners", () => {
    expect(compileTheme(tokens, picks({ radius: "round" })).css).toContain("border-radius: 999px");
    expect(compileTheme(tokens, picks({ radius: "keep" })).css).not.toContain("border-radius");
  });
});

describe("restyle request", () => {
  it("asks all seven questions in one call with escape options", () => {
    const r = buildRestyleRequest({ request: "dark mode", site: { currentDesign: "light page" } });
    expect(Object.keys(r.questions)).toEqual(["palette", "font", "density", "radius", "accent_strength", "reading_mode", "out_of_catalog"]);
    const palette = r.questions.palette;
    expect(palette.type === "choice" && Object.keys(palette.criteria)).toHaveLength(41);
    expect(JSON.stringify(r)).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("parses answers", () => {
    const p = parseRestyle({
      answers: {
        palette: { type: "choice", choice: "midnight", probabilities: { midnight: 0.8, oled_black: 0.2 }, confidence: 0.7 },
        density: { type: "score", score: 2.4, legend: {}, probabilities: {}, confidence: 0.5 },
        reading_mode: { type: "noul", noul: 0.2 },
      },
    });
    expect(p.palette).toBe("midnight");
    expect(p.paletteTop[0]).toEqual({ id: "midnight", p: 0.8 });
    expect(p.density).toBe("comfortable");
    expect(p.font).toBe("keep_original");
  });
});

describe("colour helpers", () => {
  it("parses computed-style colours", () => {
    expect(parseCssColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor("rgba(0, 0, 0, 0)")?.a).toBe(0);
    expect(parseCssColor("color(srgb 1 1 1)")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });
  it("names colours in words", () => {
    expect(colorName(parseHex("#ffffff"))).toBe("near-white");
    expect(colorName(parseHex("#000000"))).toBe("near-black");
    expect(colorName(parseHex("#2563eb"))).toMatch(/blue/);
  });
  it("computes WCAG contrast", () => {
    expect(contrastRatio(parseHex("#000"), parseHex("#fff"))).toBeCloseTo(21, 0);
  });
});

describe("images and follow-ups", () => {
  it("neutralises darkening blend modes on dark palettes, and backs tiles when protecting images", () => {
    expect(compileTheme(tokens, picks()).css).toContain('[data-flora-img="blend"] { mix-blend-mode: normal !important; }');
    expect(compileTheme(tokens, picks({ palette: "sepia_reading" })).css).not.toContain("mix-blend-mode");
    const protect = compileTheme(tokens, picks({ protectImages: true })).css;
    expect(protect).toContain("[data-flora-imgbox]");
    expect(protect).toContain("background-color: #ffffff !important");
  });

  it("routes in the same call and offers refine only when there is a previous look", () => {
    const first = buildRestyleRequest({ request: "dark mode", withRoute: true });
    const route = first.questions.route;
    expect(route.type === "choice" && Object.keys(route.criteria)).not.toContain("refine_look");
    const follow = buildRestyleRequest({ request: "a bit warmer", previous: "dark mode", withRoute: true });
    const r2 = follow.questions.route;
    expect(r2.type === "choice" && Object.keys(r2.criteria)).toContain("refine_look");
    expect(follow.state).toMatchObject({ previous_request: "dark mode" });
    expect(JSON.stringify(follow.questions.palette.instructions)).toContain("follow_up_rule");
  });
});
