// Contrast rules every catalog palette must satisfy. Maths stays in code, never in Jev.
import { contrastRatio, parseHex } from "../extract/colorNames";
import { PALETTES, type Palette } from "./palettes";

export interface PaletteIssue {
  palette: string;
  rule: string;
  ratio: number;
  min: number;
}

export function validatePalette(p: Palette): PaletteIssue[] {
  const c = (a: keyof Palette["colors"], b: keyof Palette["colors"]) => contrastRatio(parseHex(p.colors[a]), parseHex(p.colors[b]));
  const textMin = p.tags.contrast === "high" ? 7 : 4.5;
  const rules: [string, number, number][] = [
    ["text/bg", c("text", "bg"), textMin],
    ["text/surface", c("text", "surface"), textMin],
    ["muted/bg", c("muted", "bg"), 4.5],
    ["muted/surface", c("muted", "surface"), 4.5],
    ["link/bg", c("link", "bg"), 4.5],
    ["link/surface", c("link", "surface"), 4.5],
    ["accent/bg", c("accent", "bg"), 3],
    ["accentText/accent", c("accentText", "accent"), 4.5],
  ];
  return rules
    .filter(([, ratio, min]) => ratio < min)
    .map(([rule, ratio, min]) => ({ palette: p.id, rule, ratio: Math.round(ratio * 100) / 100, min }));
}

export function validateCatalog(palettes: Palette[] = PALETTES): PaletteIssue[] {
  const ids = new Set<string>();
  const issues: PaletteIssue[] = [];
  for (const p of palettes) {
    if (ids.has(p.id)) issues.push({ palette: p.id, rule: "duplicate id", ratio: 0, min: 0 });
    ids.add(p.id);
    issues.push(...validatePalette(p));
  }
  return issues;
}
