// Tokens + Jev picks → one override stylesheet. Pure string building; no DOM.
// The stylesheet targets data-flora-* attributes stamped by compile/stamp.ts.
import { FONT_BY_ID } from "../catalog/fonts";
import { PALETTE_BY_ID, type Palette } from "../catalog/palettes";
import type { ColorRole, DesignTokens, RestylePicks } from "../types";

const ROLES: ColorRole[] = ["bg", "surface", "text", "muted", "accent", "accentText", "border", "link"];

export const LINE_HEIGHT: Record<RestylePicks["density"], number> = {
  compact: 1.3,
  default: 1.5,
  comfortable: 1.65,
  spacious: 1.85,
};

const RADIUS_PX = { sharp: "0px", soft: "6px", round: "14px" } as const;

/**
 * Adds (2,0,0) specificity so role rules beat site rules that also use !important
 * (e.g. `.meta__time { color: #a5a6a7 !important }` loaded after our stylesheet).
 */
const BOOST = ":not(#flora-x):not(#flora-y)";

export interface CompiledTheme {
  css: string;
  /** Whether the stamper should stamp font roles (only when a font is picked). */
  stampFonts: boolean;
  /** Whether the stamper should stamp colour roles (only when a palette is picked). */
  stampColors: boolean;
  paletteId: string;
  fontId: string;
}

export function compileTheme(tokens: Pick<DesignTokens, "cssVars" | "density">, picks: RestylePicks): CompiledTheme {
  const palette = picks.palette === "keep_original" ? undefined : PALETTE_BY_ID.get(picks.palette);
  const font = picks.font === "keep_original" ? undefined : FONT_BY_ID.get(picks.font);
  const out: string[] = [];

  if (font?.google.length) {
    out.push(`@import url("https://fonts.googleapis.com/css2?${font.google.map((g) => `family=${g}`).join("&")}&display=swap");`);
  }

  if (palette) out.push(...paletteRules(palette, tokens, picks));

  if (font) {
    out.push(
      `html, body { font-family: ${font.body} !important; }`,
      `[data-flora-font="body"]${BOOST} { font-family: ${font.body} !important; }`,
      `[data-flora-font="heading"]${BOOST}, h1, h2, h3 { font-family: ${font.heading} !important; }`,
    );
  }

  // Reading mode implies at least comfortable spacing.
  let density = picks.density;
  if (picks.readingMode > 0.6 && (density === "compact" || density === "default")) density = "comfortable";
  if (density !== tokens.density && density !== "default") {
    const lh = LINE_HEIGHT[density];
    const gap = density === "compact" ? "0.5em" : density === "comfortable" ? "0.9em" : "1.2em";
    out.push(
      `p, li, dd, dt, blockquote, td, figcaption { line-height: ${lh} !important; }`,
      `p { margin-block: ${gap} !important; }`,
    );
  }
  if (picks.readingMode > 0.6) {
    out.push(`p, li, dd, blockquote { font-size: max(1em, 17px) !important; }`);
  }

  if (picks.radius !== "keep") {
    const r = RADIUS_PX[picks.radius];
    out.push(`[data-flora-shape="box"], button, input, select, textarea { border-radius: ${r} !important; }`);
    if (picks.radius === "round") out.push(`button, [role="button"], input[type="submit"] { border-radius: 999px !important; }`);
  }

  return {
    css: out.join("\n"),
    stampColors: !!palette,
    stampFonts: !!font,
    paletteId: palette?.id ?? "keep_original",
    fontId: font?.id ?? "keep_original",
  };
}

function paletteRules(p: Palette, tokens: Pick<DesignTokens, "cssVars">, picks: RestylePicks): string[] {
  const c = p.colors;
  const link = picks.accentStrength < 0.5 ? `color-mix(in oklab, ${c.link} 70%, ${c.text})` : c.link;
  const vars = ROLES.map((r) => `--flora-${r}: ${r === "link" ? link : c[r]};`).join(" ");
  const rules = [
    `:root { ${vars} color-scheme: ${p.tags.mode}; }`,
    `html, body { background-color: var(--flora-bg) !important; color: var(--flora-text) !important; }`,
    // Site colour transitions would otherwise animate from the old colours (and leave screenshots mid-fade).
    `[data-flora-bg], [data-flora-fg], [data-flora-bd] { transition: none !important; }`,
    // Embedded frames (consent managers, ads, embeds) keep their own scheme; ours would leak into them.
    `iframe { color-scheme: normal !important; }`,
  ];

  // Highest-fidelity path: rewrite the site's own colour variables.
  const remaps = tokens.cssVars.filter((v) => v.role).map((v) => `${v.name}: var(--flora-${v.role}) !important;`);
  if (remaps.length) rules.push(`:root, html { ${remaps.join(" ")} }`);

  for (const role of ["bg", "surface", "accent"] as const) {
    rules.push(`[data-flora-bg="${role}"]${BOOST} { background-color: var(--flora-${role}) !important; }`);
  }
  for (const role of ["text", "muted", "accent", "accentText", "link"] as const) {
    rules.push(`[data-flora-fg="${role}"]${BOOST} { color: var(--flora-${role}) !important; }`);
  }
  for (const role of ["border", "accent"] as const) {
    rules.push(`[data-flora-bd="${role}"]${BOOST} { border-color: var(--flora-${role}) !important; }`);
  }
  // Photos: darkening blend modes would black them out on dark surfaces; "protect images" also keeps
  // a white backing tile so product photos look like they do on the original site.
  if (p.tags.mode === "dark" || picks.protectImages) {
    rules.push(`[data-flora-img="blend"] { mix-blend-mode: normal !important; }`);
  }
  if (picks.protectImages) {
    rules.push(
      `[data-flora-imgbox]${BOOST} { background-color: #ffffff !important; }`,
      `img, picture, video { filter: none !important; opacity: 1 !important; }`,
    );
  }
  rules.push(
    `::placeholder { color: var(--flora-muted) !important; }`,
    `::selection { background-color: var(--flora-accent) !important; color: var(--flora-accentText) !important; }`,
    `a:not([data-flora-fg]) { color: var(--flora-link); }`,
  );
  return rules;
}
