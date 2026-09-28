// In-page: tag elements with the palette role their original colour maps to, inject the
// compiled stylesheet, and keep stamping new nodes. No model call is involved, so a saved
// theme can re-apply on every visit for free.
import { contrastRatio, toHex, toOklch, type Rgba } from "../extract/colorNames";
import { effectiveBackground, isVisible, nearestCluster, resolveColor, roleFor } from "../extract/tokens";
import type { ColorCluster, ColorProperty, DesignTokens } from "../types";
import type { CompiledTheme } from "./css";

const STYLE_ID = "flora-theme";
const MAX_STAMP = 8000;
const ATTRS = ["data-flora-bg", "data-flora-fg", "data-flora-bd", "data-flora-font", "data-flora-shape", "data-flora-skip", "data-flora-img", "data-flora-imgbox"];

// Sites often draw product photos with `mix-blend-mode: multiply` so white photo backgrounds melt into a
// light tile. On a dark tile that turns the whole photo dark, so these get flagged and neutralised.
const DARKENING_BLEND = new Set(["multiply", "darken", "color-burn", "luminosity", "hard-light", "soft-light", "overlay"]);
function stampImageBlend(el: Element) {
  if (!el.matches("img, picture, video, canvas")) return;
  let cur: Element | null = el;
  for (let i = 0; cur && i < 4; i++, cur = cur.parentElement) {
    if (DARKENING_BLEND.has(getComputedStyle(cur).mixBlendMode)) {
      cur.setAttribute("data-flora-img", "blend");
      // The tile the photo was designed to blend into: nearest ancestor with its own background.
      let box: Element | null = cur.parentElement;
      for (let j = 0; box && j < 6; j++, box = box.parentElement) {
        const b = resolveColor(getComputedStyle(box).backgroundColor);
        if (b && b.a >= 0.9) break;
      }
      (box ?? cur.parentElement)?.setAttribute("data-flora-imgbox", "");
      return;
    }
  }
}

let observer: MutationObserver | null = null;

interface StampOptions {
  colors: boolean;
  fonts: boolean;
}

function firstFamily(stack: string) {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
}

/**
 * True when text sits on something other than a plain colour: an ancestor background image/gradient
 * before the first solid background, or text that is nearly invisible against the solid colour behind it
 * (which only happens when an image or video is actually showing through, e.g. white text on a video hero).
 */
let mediaRects: { el: Element; r: DOMRect }[] | null = null;
/** Large visible images/videos/canvases, collected once per stamping pass. */
function largeMedia() {
  if (mediaRects) return mediaRects;
  mediaRects = [];
  for (const m of document.querySelectorAll("img, video, canvas, picture, iframe")) {
    const r = m.getBoundingClientRect();
    if (r.width * r.height >= 15000 && getComputedStyle(m).visibility !== "hidden") mediaRects.push({ el: m, r });
  }
  return mediaRects;
}

function overMedia(el: Element, cs: CSSStyleDeclaration): boolean {
  // Nearest ancestor with a solid background: the surface the text is actually drawn on. If a translucent
  // layer (scrim, caption overlay) comes first, we don't repaint it, so its text keeps its colour too.
  let surface: Element | null = null;
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const b = resolveColor(getComputedStyle(cur).backgroundColor);
    if (b && b.a < 0.9) return true;
    if (b) { surface = cur; break; }
  }
  // Text inside a large image/video that shares its surface (a hero headline, a promo card). A card or modal
  // with its own solid background floating above an image doesn't count: that surface doesn't contain the media.
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const pageLevel = !surface || surface === document.body || surface === document.documentElement;
  if (largeMedia().some(({ el: m, r: mr }) => cx >= mr.left && cx <= mr.right && cy >= mr.top && cy <= mr.bottom && (pageLevel || surface!.contains(m)))) return true;
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const s = getComputedStyle(cur);
    if (s.backgroundImage !== "none") return true;
    const b = resolveColor(s.backgroundColor);
    if (b && b.a >= 0.9) break;
  }
  const fg = resolveColor(cs.color);
  return !!fg && contrastRatio({ ...fg, a: 1 }, effectiveBackground(el)) < 1.6;
}

/** A one-off cluster for colours outside the top clusters, so they still get a sensible role. */
function syntheticCluster(c: Rgba): ColorCluster {
  const lch = toOklch(c);
  return { id: "x", hex: toHex(c), name: "", lightness: lch.l, chroma: lch.c, hue: lch.h, bgArea: 0, textWeight: 0, borderWeight: 0, linkWeight: 0 };
}

/**
 * `initial` = first pass, before the theme CSS exists (every computed colour is the site's own).
 * Later passes (MutationObserver) skip colours that merely inherit an already-themed parent.
 */
function stampElement(el: Element, tokens: DesignTokens, opts: StampOptions, pageW: number, initial = true) {
  if (el.closest("[data-flora-ui]")) return;
  if (opts.colors) stampImageBlend(el);
  const cs = getComputedStyle(el);
  const parent = el.parentElement;
  const pcs = parent ? getComputedStyle(parent) : null;
  const linkish = !!el.closest("a, button, [role=button], [role=link]");

  const stamp = (prop: ColorProperty, value: string) => {
    const c = resolveColor(value);
    if (!c) return null;
    const solid = c.a < 0.99 ? { ...c, a: 1 } : c;
    const k = nearestCluster(solid, tokens.clusters) ?? syntheticCluster(solid);
    // Text sits "on accent" only if its nearest stamped background is an accent one.
    const onAccent = prop === "fg" && el.closest("[data-flora-bg]")?.getAttribute("data-flora-bg") === "accent";
    return roleFor(prop, k, tokens, { linkish, onAccent });
  };

  if (opts.colors) {
    // Translucent backgrounds (modal backdrops, scrims, tints) stay as they are: repainting them with an
    // opaque palette colour would blank out everything behind the dialog.
    const rawBg = resolveColor(cs.backgroundColor);
    const bg = rawBg && rawBg.a >= 0.9 ? stamp("bg", cs.backgroundColor) : null;
    if (bg) el.setAttribute("data-flora-bg", bg);
    // Text-bearing elements are always stamped (a child can explicitly set the same colour as its
    // parent, which would otherwise look inherited). Pure containers only when their colour differs.
    let hasText = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent!.trim()) { hasText = true; break; }
    const sameAsParent = !!pcs && cs.color === pcs.color;
    if (initial ? hasText || !sameAsParent || el.matches("a, button") : !sameAsParent) {
      if (initial && (hasText || el.matches("a, button")) && overMedia(el, cs)) {
        // Text drawn over an image/video/gradient/pseudo-element: its real backdrop isn't a colour we
        // control, so pin its original colour (it must not inherit the theme either).
        el.setAttribute("data-flora-skip", "media");
        (el as HTMLElement).style?.setProperty("color", cs.color, "important");
      } else if (!el.closest("[data-flora-skip]")) {
        const fg = stamp("fg", cs.color);
        if (fg) el.setAttribute("data-flora-fg", fg);
      }
    }
    if (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) > 0 && cs.borderTopStyle !== "none") {
      const bd = stamp("border", cs.borderTopColor);
      if (bd) el.setAttribute("data-flora-bd", bd === "accent" ? "accent" : "border");
    }
    const rect = el.getBoundingClientRect();
    if ((cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.borderTopStyle !== "none") && rect.width > 0 && rect.width < pageW * 0.9) {
      el.setAttribute("data-flora-shape", "box");
    }
  }

  if (opts.fonts && (!pcs || cs.fontFamily !== pcs.fontFamily)) {
    const fam = firstFamily(cs.fontFamily);
    if (fam === tokens.fonts.heading.toLowerCase() && fam !== tokens.fonts.body.toLowerCase()) el.setAttribute("data-flora-font", "heading");
    else if (fam === tokens.fonts.body.toLowerCase()) el.setAttribute("data-flora-font", "body");
    else if (/^h[1-6]$/i.test(el.tagName)) el.setAttribute("data-flora-font", "heading");
    // Anything else (icon fonts, code fonts) is left alone.
  }
}

export function stampAll(tokens: DesignTokens, opts: StampOptions, root: ParentNode = document) {
  mediaRects = null;
  const pageW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  let n = 0;
  for (const el of root.querySelectorAll("body *")) {
    if (n++ >= MAX_STAMP) break;
    if (el.closest("svg, script, style, noscript, template")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" && !el.matches("img, picture, video, canvas")) continue;
    stampElement(el, tokens, opts, pageW);
  }
  return n;
}

export function applyTheme(tokens: DesignTokens, theme: CompiledTheme, { observe = true } = {}) {
  removeTheme();
  const opts = { colors: theme.stampColors, fonts: theme.stampFonts };
  const t0 = performance.now();
  // Stamp before injecting: stamping reads the site's original computed colours.
  const stamped = opts.colors || opts.fonts ? stampAll(tokens, opts) : 0;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-flora-ui", "");
  style.textContent = theme.css;
  // Last in the document so equal-specificity ties go to us.
  document.documentElement.appendChild(style);

  if (observe && (opts.colors || opts.fonts)) {
    const pageW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    let pending: Element[] = [];
    let scheduled = false;
    observer = new MutationObserver((muts) => {
      for (const m of muts) for (const node of m.addedNodes) if (node.nodeType === 1) pending.push(node as Element);
      if (scheduled || !pending.length) return;
      scheduled = true;
      requestAnimationFrame(() => {
        const batch = pending;
        pending = [];
        scheduled = false;
        for (const root of batch) {
          if (!root.isConnected) continue;
          stampElement(root, tokens, opts, pageW, false);
          for (const el of root.querySelectorAll("*")) stampElement(el, tokens, opts, pageW, false);
        }
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  return { stamped, ms: Math.round(performance.now() - t0) };
}

export function removeTheme() {
  for (const el of document.querySelectorAll("[data-flora-skip]")) (el as HTMLElement).style?.removeProperty("color");
  observer?.disconnect();
  observer = null;
  document.getElementById(STYLE_ID)?.remove();
  for (const a of ATTRS) for (const el of document.querySelectorAll(`[${a}]`)) el.removeAttribute(a);
}

/** Injects an arbitrary extra stylesheet (e.g. element hides) under its own id. */
export function applyExtraCss(id: string, css: string) {
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    style.setAttribute("data-flora-ui", "");
    (document.head ?? document.documentElement).appendChild(style);
  }
  style.textContent = css;
}

export interface BreakageReport {
  textSampled: number;
  lowContrast: number; // below 4.5:1 (3:1 for large text)
  invisible: number; // below 1.5:1
  lowContrastShare: number;
  coverage: number; // share of own-coloured visible elements that got a colour stamp
  worst: { text: string; ratio: number; fgRole: string | null; bgRole: string | null; fg: string; bg: string }[];
}

/** Post-injection checks, computed in code (Jev doesn't do maths). */
export function measureBreakage(maxSamples = 600): BreakageReport {
  let sampled = 0;
  let low = 0;
  let invisible = 0;
  let own = 0;
  let covered = 0;
  const worst: BreakageReport["worst"] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("svg, script, style, noscript, template, [data-flora-ui]")) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, cs, rect)) continue;
    const hasBg = cs.backgroundColor !== "rgba(0, 0, 0, 0)";
    if (hasBg) {
      own++;
      if (el.hasAttribute("data-flora-bg")) covered++;
    }
    let text = "";
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent ?? "";
    text = text.trim();
    if (!text || sampled >= maxSamples) continue;
    // Skip text over images/gradients where the backdrop colour is unknowable here.
    let overImage = false;
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const s = getComputedStyle(cur);
      if (s.backgroundImage !== "none") { overImage = true; break; }
      if (s.backgroundColor !== "rgba(0, 0, 0, 0)") break;
    }
    if (overImage || el.closest("[data-flora-skip]")) continue;
    const fg = resolveColor(cs.color);
    if (!fg) continue;
    sampled++;
    const bg = effectiveBackground(el);
    const ratio = contrastRatio({ ...fg, a: 1 }, bg);
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      low++;
      let bgEl: Element | null = el;
      while (bgEl && getComputedStyle(bgEl).backgroundColor === "rgba(0, 0, 0, 0)") bgEl = bgEl.parentElement;
      worst.push({
        text: text.slice(0, 60),
        ratio: Math.round(ratio * 100) / 100,
        fgRole: el.closest("[data-flora-fg]")?.getAttribute("data-flora-fg") ?? null,
        bgRole: bgEl?.getAttribute("data-flora-bg") ?? null,
        fg: cs.color,
        bg: bgEl ? `${bgEl.tagName.toLowerCase()} ${getComputedStyle(bgEl).backgroundColor}` : "canvas",
      });
    }
    if (ratio < 1.5) invisible++;
  }
  worst.sort((a, b) => a.ratio - b.ratio);
  return {
    textSampled: sampled,
    lowContrast: low,
    invisible,
    lowContrastShare: sampled ? low / sampled : 0,
    coverage: own ? covered / own : 1,
    worst: worst.slice(0, 8),
  };
}

