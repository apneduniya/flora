// In-page: list the page's landmark/block elements and describe each one in English,
// so Jev can pick "the sidebar" from a numbered list.
import type { Candidate, Region } from "../types";
import { isVisible } from "./tokens";

const SEMANTIC = "header, nav, aside, main, section, article, footer, dialog, form, [role], [aria-label]";
const MAX_CANDIDATES = 400;

export interface CandidateOptions {
  minArea?: number; // px², for non-semantic boxes
  max?: number;
}

/** A reasonably stable CSS path: nearest unique id, then tag:nth-of-type steps. */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
    if (cur.id && /^[A-Za-z][\w-]{0,40}$/.test(cur.id) && !/\d{4,}/.test(cur.id) && document.querySelectorAll(`#${CSS.escape(cur.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      return parts.join(" > ");
    }
    const tag = cur.tagName.toLowerCase();
    if (tag === "body") {
      parts.unshift("body");
      break;
    }
    const parent: Element | null = cur.parentElement;
    const sameTag = parent ? [...parent.children].filter((c) => c.tagName === cur!.tagName) : [];
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(cur) + 1})` : tag);
  }
  return parts.join(" > ");
}

function iou(a: DOMRect, b: DOMRect): number {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const inter = x * y;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

export function rectIoU(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return iou(new DOMRect(a.x, a.y, a.w, a.h), new DOMRect(b.x, b.y, b.w, b.h));
}

function pageRect(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  return new DOMRect(r.left + window.scrollX, r.top + window.scrollY, r.width, r.height);
}

export function regionOf(r: DOMRect, fixed: boolean, pageW: number, pageH: number, viewH: number): Region {
  // Fixed/sticky things are overlays unless they're a slim bar pinned to the top (a sticky header).
  if (fixed && (r.height > viewH * 0.5 || !(r.top <= 5 && r.width > pageW * 0.6))) return "overlay";
  // Near the top (sites often put a leaderboard ad above the real header), full-width, bar-shaped.
  if (r.top < viewH * 0.45 && r.height < 260 && r.width > pageW * 0.6) return "header";
  if (r.bottom > pageH - 400 && r.top > viewH && r.width > pageW * 0.6) return "footer";
  if (r.right <= pageW * 0.38 && r.height > 200) return "left";
  if (r.left >= pageW * 0.62 && r.height > 200) return "right";
  if (r.width < pageW * 0.3 && r.height < 120 && r.top < 200) return "nav";
  return "main";
}

const POSITION_WORDS: Record<Region, string> = {
  header: "a bar across the top of the page",
  nav: "a small area near the top",
  left: "a column on the left side",
  right: "a column on the right side",
  main: "in the main content area",
  footer: "at the bottom of the page",
  overlay: "floating on top of the page",
};

function sizeWord(area: number, viewArea: number): string {
  const f = area / viewArea;
  if (f > 1.5) return "very large (bigger than the screen)";
  if (f > 0.4) return "large";
  if (f > 0.1) return "medium";
  if (f > 0.02) return "small";
  return "tiny";
}

function linkWord(n: number): string {
  if (n === 0) return "no links";
  if (n <= 3) return "a few links";
  if (n <= 15) return "several links";
  if (n <= 60) return "many links";
  return "a very large number of links";
}

function classWords(el: Element): string {
  const words = new Set<string>();
  const raw = `${el.id} ${typeof el.className === "string" ? el.className : ""}`;
  for (const w of raw.split(/[\s_\-]+|(?=[A-Z])/)) {
    const t = w.toLowerCase();
    if (t.length >= 3 && t.length <= 20 && !/\d{2,}/.test(t) && !/^(css|jsx|sc|js)$/.test(t)) words.add(t);
    if (words.size >= 8) break;
  }
  return [...words].join(" ");
}

/** Masks emails, URLs and long digit runs before text leaves the browser (unclutter pattern). */
export function redact(t: string): string {
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\d[\d\s-]{5,}\d/g, "[number]");
}

function visibleText(el: Element, max = 80): string {
  const t = redact(((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim());
  const chars = Array.from(t); // slice by code point so emoji aren't split
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : t;
}

export interface RawCandidate {
  el: Element;
  rect: DOMRect;
  fixed: boolean;
  region: Region;
  priority: number;
}

export function collectCandidateElements(opts: CandidateOptions = {}): RawCandidate[] {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const pageW = Math.max(document.documentElement.scrollWidth, viewW);
  const pageH = Math.max(document.documentElement.scrollHeight, viewH);
  const minArea = opts.minArea ?? viewW * viewH * 0.03;
  const out: RawCandidate[] = [];

  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("script, style, noscript, template, svg, [data-flora-ui]")) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, cs, rect)) continue;
    const fixed = cs.position === "fixed" || cs.position === "sticky";
    const area = rect.width * rect.height;
    const semantic = el.matches(SEMANTIC);
    const isBlock = cs.display !== "inline" && cs.display !== "contents";
    if (!isBlock) continue;
    // Visual boxes: an own background colour that differs from the parent's (e.g. a coloured bar in a table layout).
    const ownBg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && el.parentElement && cs.backgroundColor !== getComputedStyle(el.parentElement).backgroundColor;
    if (!(fixed && area > 2000) && !(semantic && area > 3000) && !(area >= minArea && el.children.length > 0) && !(ownBg && area > 8000 && rect.width > 200)) continue;
    const pr = pageRect(el);
    const priority = (semantic ? 2 : 0) + (fixed ? 2 : 0) + (ownBg ? 1 : 0) + Math.log10(Math.max(area, 1)) / 2;
    out.push({ el, rect: pr, fixed, region: regionOf(pr, fixed, pageW, pageH, viewH), priority });
  }

  // Drop wrappers that cover nearly the same box as their nearest kept ancestor; keep the outermost.
  const kept: RawCandidate[] = [];
  for (const c of out) {
    const dupe = kept.some((k) => k.el.contains(c.el) && iou(k.rect, c.rect) > 0.9);
    if (!dupe) kept.push(c);
  }
  // Over the cap, keep the most landmark-like/largest boxes (not the first N in page order), then restore page order.
  const max = opts.max ?? MAX_CANDIDATES;
  if (kept.length <= max) return kept;
  const top = new Set([...kept].sort((a, b) => b.priority - a.priority).slice(0, max));
  return kept.filter((c) => top.has(c));
}

/** Embedded frames say a lot (ad networks, consent managers) when there is no visible text (typesafe-adblock pattern). */
function iframeHosts(el: Element): string {
  const hosts = new Set<string>();
  const frames = el.tagName === "IFRAME" ? [el] : [...el.querySelectorAll("iframe")];
  for (const f of frames) {
    const src = f.getAttribute("src") || "";
    try {
      const host = src && !src.startsWith("about:") ? new URL(src, location.href).hostname : "";
      if (host) hosts.add(host);
    } catch {}
    const id = (f.id || "").toLowerCase();
    if (!src && /ads|google_ads|gpt/.test(id)) hosts.add("an ad server (google ads frame)");
    if (hosts.size >= 3) break;
  }
  return frames.length ? `contains an embedded frame${hosts.size ? ` from ${[...hosts].join(", ")}` : ""}` : "";
}

export function describeCandidate(c: RawCandidate): string {
  const el = c.el;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  const label = el.getAttribute("aria-label");
  const viewArea = window.innerWidth * window.innerHeight;
  const links = el.querySelectorAll("a[href]").length;
  const parts = [
    `<${tag}>${role ? ` role "${role}"` : ""}${label ? ` labelled "${label.slice(0, 60)}"` : ""}`,
    classWords(el) && `named "${classWords(el)}"`,
    POSITION_WORDS[c.region],
    sizeWord(c.rect.width * c.rect.height, viewArea),
    c.fixed ? "stays fixed on screen while scrolling" : "",
    linkWord(links),
    el.querySelector("input, textarea, select") ? "contains form fields" : "",
    el.querySelector("img, video, picture") ? "contains images" : "",
    iframeHosts(el),
  ].filter(Boolean);
  const text = visibleText(el);
  return `${parts.join("; ")}${text ? `; text starts: "${text}"` : "; no visible text"}`;
}

export function extractCandidates(opts: CandidateOptions = {}): Candidate[] {
  return collectCandidateElements(opts).map((c, i) => ({
    id: `c${i + 1}`,
    selector: cssPath(c.el),
    description: describeCandidate(c),
    region: c.region,
    rect: { x: Math.round(c.rect.x), y: Math.round(c.rect.y), w: Math.round(c.rect.width), h: Math.round(c.rect.height) },
  }));
}

/** Rects of the largest blocks, for before/after layout-shift checks. */
export function blockRects(n = 30): { selector: string; rect: { x: number; y: number; w: number; h: number } }[] {
  return collectCandidateElements()
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .slice(0, n)
    .map((c) => ({ selector: cssPath(c.el), rect: { x: c.rect.x, y: c.rect.y, w: c.rect.width, h: c.rect.height } }));
}
