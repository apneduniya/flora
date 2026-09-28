// Runs inside the page (Playwright page.evaluate or the extension content script).
// Reads computed styles and turns them into design tokens plus an English summary for Jev.
import {
  colorName,
  composite,
  contrastRatio,
  deltaE,
  parseCssColor,
  toHex,
  toOklch,
  type Rgba,
} from "./colorNames";
import type { ColorCluster, ColorProperty, ColorRole, CssVarColor, Density, DesignTokens, RadiusStyle } from "../types";

const MAX_ELEMENTS = 3000;
const MERGE_DELTA_E = 3;
const MAX_CLUSTERS = 12;

let canvasCtx: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, Rgba | null>();

/** Normalises any CSS colour string (oklch, hsl, named...) to RGBA using a 1×1 canvas. */
export function resolveColor(value: string): Rgba | null {
  if (colorCache.has(value)) return colorCache.get(value)!;
  let rgba = parseCssColor(value);
  if (!rgba && typeof document !== "undefined") {
    canvasCtx ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, 1, 1);
      canvasCtx.fillStyle = "#000";
      canvasCtx.fillStyle = value;
      canvasCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvasCtx.getImageData(0, 0, 1, 1).data;
      rgba = a === 0 ? null : { r, g, b, a: a / 255 };
    }
  }
  if (rgba && rgba.a < 0.05) rgba = null;
  colorCache.set(value, rgba);
  return rgba;
}

export function isVisible(el: Element, cs: CSSStyleDeclaration, rect: DOMRect): boolean {
  if (rect.width < 1 || rect.height < 1) return false;
  if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
  if (parseFloat(cs.opacity) < 0.05) return false;
  return true;
}

function directTextLength(el: Element): number {
  let n = 0;
  for (const node of el.childNodes) if (node.nodeType === 3) n += (node.textContent ?? "").trim().length;
  return n;
}

const isLinkish = (el: Element) =>
  !!el.closest("a, button, [role=button], [role=link], input[type=submit], input[type=button]");

interface Sample {
  rgba: Rgba;
  bgArea: number;
  textWeight: number;
  borderWeight: number;
  linkWeight: number;
}

function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "") || "system default";
}

function topKey(m: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestV = -1;
  for (const [k, v] of m) if (v > bestV) [best, bestV] = [k, v];
  return best;
}

/** The effective opaque background behind an element (walks ancestors, composites alpha). */
export function effectiveBackground(el: Element | null): Rgba {
  const layers: Rgba[] = [];
  for (let cur = el; cur; cur = cur.parentElement) {
    const c = resolveColor(getComputedStyle(cur).backgroundColor);
    if (c) {
      layers.push(c);
      if (c.a >= 0.99) break;
    }
  }
  let out: Rgba = { r: 255, g: 255, b: 255, a: 1 }; // canvas default
  for (let i = layers.length - 1; i >= 0; i--) out = composite(layers[i], out);
  return out;
}

export function extractTokens(doc: Document = document): DesignTokens {
  const t0 = performance.now();
  const win = doc.defaultView!;
  const pageW = Math.max(doc.documentElement.scrollWidth, win.innerWidth);
  const pageH = Math.max(doc.documentElement.scrollHeight, win.innerHeight);
  const pageArea = pageW * pageH;

  const samples = new Map<string, Sample>();
  const add = (value: string, kind: keyof Omit<Sample, "rgba">, weight: number, backdrop?: Rgba) => {
    let c = resolveColor(value);
    if (!c || weight <= 0) return;
    if (c.a < 0.99) c = composite(c, backdrop ?? { r: 255, g: 255, b: 255, a: 1 });
    const hex = toHex(c);
    let s = samples.get(hex);
    if (!s) samples.set(hex, (s = { rgba: c, bgArea: 0, textWeight: 0, borderWeight: 0, linkWeight: 0 }));
    s[kind] += weight;
  };

  const bodyFonts = new Map<string, number>();
  const headingFonts = new Map<string, number>();
  const sizes = new Map<string, number>();
  const lineHeights: [number, number][] = [];
  const radii = new Map<number, number>();

  // Canvas background: html/body background or white.
  const rootBg =
    resolveColor(getComputedStyle(doc.documentElement).backgroundColor) ??
    (doc.body ? resolveColor(getComputedStyle(doc.body).backgroundColor) : null) ?? { r: 255, g: 255, b: 255, a: 1 };
  add(toHex(rootBg), "bgArea", pageArea);

  const all = doc.body ? doc.body.querySelectorAll("*") : [];
  let scanned = 0;
  for (const el of all) {
    if (scanned >= MAX_ELEMENTS) break;
    if (el.closest("svg, script, style, noscript, template, [data-flora-ui]")) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, cs, rect)) continue;
    scanned++;
    const area = Math.min(rect.width, pageW) * Math.min(rect.height, pageH);
    const link = isLinkish(el);

    const bg = resolveColor(cs.backgroundColor);
    if (bg) {
      const backdrop = bg.a < 0.99 ? effectiveBackground(el.parentElement) : undefined;
      add(cs.backgroundColor, "bgArea", area, backdrop);
      if (link) add(cs.backgroundColor, "linkWeight", 40, backdrop);
    }

    const text = directTextLength(el);
    if (text > 0) {
      add(cs.color, "textWeight", text);
      if (link) add(cs.color, "linkWeight", text);
      const family = firstFamily(cs.fontFamily);
      const isHeading = /^H[1-3]$/.test(el.tagName) || !!el.closest("h1,h2,h3");
      (isHeading ? headingFonts : bodyFonts).set(family, ((isHeading ? headingFonts : bodyFonts).get(family) ?? 0) + text);
      if (!isHeading) {
        const fs = parseFloat(cs.fontSize);
        sizes.set(String(Math.round(fs)), (sizes.get(String(Math.round(fs))) ?? 0) + text);
        const lh = cs.lineHeight === "normal" ? 1.2 : parseFloat(cs.lineHeight) / fs;
        if (Number.isFinite(lh)) lineHeights.push([lh, text]);
      }
    }

    const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    if (bw > 0 && cs.borderTopStyle !== "none") {
      add(cs.borderTopColor, "borderWeight", (rect.width + rect.height) * 2);
    }

    const r = parseFloat(cs.borderTopLeftRadius);
    if ((bg || bw > 0) && Number.isFinite(r) && rect.width < pageW * 0.9) {
      const key = Math.min(Math.round(r), 999);
      radii.set(key, (radii.get(key) ?? 0) + 1);
    }
  }

  const clusters = clusterSamples([...samples.values()]);
  const roles = assignRoles(clusters, pageArea);
  const cssVars = collectCssVars(doc, clusters, roles);

  const body = topKey(bodyFonts) ?? "system default";
  const heading = topKey(headingFonts) ?? body;
  const baseSizePx = Number(topKey(sizes) ?? 16);
  const totalLh = lineHeights.reduce((s, [, w]) => s + w, 0) || 1;
  const lineHeightRatio = lineHeights.reduce((s, [lh, w]) => s + lh * w, 0) / totalLh || 1.4;
  let dominantPx = 0;
  let best = -1;
  for (const [k, v] of radii) if (v > best && k < 999) [dominantPx, best] = [k, v];
  const radiusStyle: RadiusStyle = dominantPx <= 2 ? "sharp" : dominantPx <= 10 ? "soft" : "round";
  const density: Density =
    lineHeightRatio < 1.3 || baseSizePx <= 13 ? "compact" : lineHeightRatio < 1.5 ? "default" : lineHeightRatio < 1.7 ? "comfortable" : "spacious";

  const bgCluster = clusters.find((c) => c.id === roles.bg);
  const scheme = bgCluster && bgCluster.lightness < 0.5 ? "dark" : "light";

  const tokens: DesignTokens = {
    url: win.location.href,
    title: doc.title,
    scheme,
    clusters,
    roles,
    cssVars,
    fonts: { body, heading },
    typography: { baseSizePx, lineHeightRatio: Math.round(lineHeightRatio * 100) / 100 },
    radius: { dominantPx, style: radiusStyle },
    density,
    summary: "",
    stats: { elementsScanned: scanned, pageArea, ms: 0 },
  };
  tokens.summary = summarize(tokens);
  tokens.stats.ms = Math.round(performance.now() - t0);
  return tokens;
}

function clusterSamples(samples: Sample[]): ColorCluster[] {
  const score = (s: Sample) => s.bgArea / 1000 + s.textWeight * 5 + s.borderWeight / 50 + s.linkWeight * 5;
  samples.sort((a, b) => score(b) - score(a));
  const groups: { rep: Rgba; members: Sample[] }[] = [];
  for (const s of samples) {
    const g = groups.find((g) => deltaE(g.rep, s.rgba) < MERGE_DELTA_E);
    if (g) g.members.push(s);
    else groups.push({ rep: s.rgba, members: [s] });
  }
  const sum = (ms: Sample[], k: keyof Omit<Sample, "rgba">) => ms.reduce((t, m) => t + m[k], 0);
  return groups
    .map((g) => ({ g, total: g.members.reduce((t, m) => t + score(m), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_CLUSTERS)
    .map(({ g }, i) => {
      const lch = toOklch(g.rep);
      return {
        id: `k${i}`,
        hex: toHex(g.rep),
        name: colorName(g.rep),
        lightness: Math.round(lch.l * 1000) / 1000,
        chroma: Math.round(lch.c * 1000) / 1000,
        hue: Math.round(lch.h),
        bgArea: Math.round(sum(g.members, "bgArea")),
        textWeight: sum(g.members, "textWeight"),
        borderWeight: Math.round(sum(g.members, "borderWeight")),
        linkWeight: sum(g.members, "linkWeight"),
      };
    });
}

export function assignRoles(clusters: ColorCluster[], pageArea: number): DesignTokens["roles"] {
  const by = (k: keyof ColorCluster, pool = clusters) =>
    [...pool].sort((a, b) => (b[k] as number) - (a[k] as number))[0];
  const bg = by("bgArea");
  const rgb = (c: ColorCluster) => ({ ...hexToRgb(c.hex), a: 1 });
  const surfacePool = clusters.filter(
    (c) => c !== bg && c.bgArea > pageArea * 0.01 && Math.abs(c.lightness - bg.lightness) < 0.15 && c.chroma < 0.08,
  );
  const surface = surfacePool.length ? by("bgArea", surfacePool) : null;
  const textPool = clusters.filter((c) => c.textWeight > 0);
  // Primary text: the most-used readable (≥4.5:1) neutral text colour; lower-contrast ones become muted.
  const readable = textPool.filter((c) => c.chroma < 0.06 && contrastRatio(rgb(c), rgb(bg)) >= 4.5);
  const text = readable.length ? by("textWeight", readable) : textPool.length ? by("textWeight", textPool) : null;
  const accentScore = (c: ColorCluster) => (c.linkWeight * 5 + c.bgArea / 1000) * c.chroma;
  const accentPool = clusters.filter((c) => c.chroma >= 0.06 && (c.linkWeight > 0 || c.bgArea > 0));
  const accent = accentPool.length ? [...accentPool].sort((a, b) => accentScore(b) - accentScore(a))[0] : null;
  const totalText = textPool.reduce((s, c) => s + c.textWeight, 0) || 1;
  const mutedPool = textPool.filter(
    (c) =>
      c !== text &&
      c !== accent &&
      c.chroma < 0.06 &&
      c.textWeight > totalText * 0.02 &&
      text !== null &&
      // Secondary text drawn on the page background: visible on it, but clearly lighter than primary text.
      contrastRatio(rgb(c), rgb(bg)) >= 2.5 &&
      contrastRatio(rgb(c), rgb(bg)) < 0.8 * contrastRatio(rgb(text), rgb(bg)),
  );
  const muted = mutedPool.length ? by("textWeight", mutedPool) : null;
  const borderPool = clusters.filter((c) => c.borderWeight > 0);
  const border = borderPool.length ? by("borderWeight", borderPool) : null;
  return {
    bg: bg?.id ?? null,
    surface: surface?.id ?? null,
    text: text?.id ?? null,
    muted: muted?.id ?? null,
    accent: accent?.id ?? null,
    border: border?.id ?? null,
  };
}

export function hexToRgb(hex: string): Rgba {
  const n = parseInt(hex.slice(1, 7), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

/** Nearest cluster to a colour, or null if nothing is within `maxDelta`. */
export function nearestCluster(c: Rgba, clusters: ColorCluster[], maxDelta = 8): ColorCluster | null {
  let best: ColorCluster | null = null;
  let bestD = Infinity;
  for (const k of clusters) {
    const d = deltaE(c, hexToRgb(k.hex));
    if (d < bestD) [best, bestD] = [k, d];
  }
  return bestD <= maxDelta ? best : null;
}

/**
 * Which palette role an element's colour should be remapped to.
 * Pure function of the original tokens, so it can re-run on every page load without a model call.
 */
export function roleFor(
  prop: ColorProperty,
  cluster: ColorCluster,
  tokens: Pick<DesignTokens, "roles" | "clusters">,
  ctx: { linkish: boolean; onAccent: boolean },
): ColorRole {
  const r = tokens.roles;
  const bgK = tokens.clusters.find((k) => k.id === r.bg);
  if (prop === "border") return cluster.chroma >= 0.08 ? "accent" : "border";
  if (prop === "bg") {
    if (cluster.id === r.bg) return "bg";
    if (cluster.chroma >= 0.08) return "accent";
    return "surface";
  }
  // fg
  if (ctx.onAccent) return "accentText";
  if (cluster.chroma >= 0.08) return ctx.linkish ? "link" : "accent";
  if (cluster.id === r.muted) return "muted";
  if (bgK) {
    const cr = contrastRatio(hexToRgb(cluster.hex), hexToRgb(bgK.hex));
    if (cr < 4.5 && cluster.id !== r.text) return "muted";
  }
  return "text";
}

function collectCssVars(doc: Document, clusters: ColorCluster[], roles: DesignTokens["roles"]): CssVarColor[] {
  const names = new Set<string>();
  const rootCs = getComputedStyle(doc.documentElement);
  for (let i = 0; i < rootCs.length; i++) {
    const p = rootCs[i];
    if (p.startsWith("--")) names.add(p);
  }
  for (const sheet of doc.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin
    }
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && /(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)) {
        for (let i = 0; i < rule.style.length; i++) if (rule.style[i].startsWith("--")) names.add(rule.style[i]);
      }
    }
  }
  const out: CssVarColor[] = [];
  const looksColor = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\()/i;
  for (const name of names) {
    const value = rootCs.getPropertyValue(name).trim();
    if (!looksColor.test(value)) continue;
    const c = resolveColor(value);
    if (!c) continue;
    const k = nearestCluster(c, clusters, 5);
    let role: ColorRole | null = null;
    if (k) {
      const isBgLike = k.bgArea > k.textWeight * 200;
      role = roleFor(isBgLike ? "bg" : "fg", k, { roles, clusters }, { linkish: k.linkWeight > 0, onAccent: false });
    }
    out.push({ name, hex: toHex(c), clusterId: k?.id ?? null, role });
    if (out.length >= 200) break;
  }
  return out;
}

function summarize(t: DesignTokens): string {
  const name = (id: string | null) => t.clusters.find((c) => c.id === id)?.name;
  const parts = [
    `${t.scheme} page`,
    name(t.roles.bg) && `${name(t.roles.bg)} background`,
    name(t.roles.surface) && `${name(t.roles.surface)} panels`,
    name(t.roles.text) && `${name(t.roles.text)} text`,
    name(t.roles.muted) && `${name(t.roles.muted)} secondary text`,
    name(t.roles.accent) && `${name(t.roles.accent)} links and buttons`,
  ].filter(Boolean);
  const sizeWord = t.typography.baseSizePx <= 13 ? "small" : t.typography.baseSizePx <= 16 ? "medium" : "large";
  const fonts =
    t.fonts.heading === t.fonts.body
      ? `font ${t.fonts.body} throughout`
      : `body font ${t.fonts.body}, headings ${t.fonts.heading}`;
  return `${parts.join(", ")}; ${fonts}; ${sizeWord} text; ${t.density} spacing; ${t.radius.style} corners`;
}
