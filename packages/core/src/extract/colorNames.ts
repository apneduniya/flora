// Colour maths shared by extraction, the catalog validator and the compiler.
// Jev reads hex values poorly, so anything sent to it goes through `colorName`.

export interface Rgba {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

export interface Oklch {
  l: number; // 0-1
  c: number; // ~0-0.4
  h: number; // degrees
}

export function parseHex(hex: string): Rgba {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

/** Parses the forms getComputedStyle returns (rgb/rgba, color(srgb ...)) plus hex. */
export function parseCssColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();
  if (!v || v === "transparent" || v === "none") return null;
  if (v.startsWith("#")) return parseHex(v);
  let m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    return {
      r: +m[1],
      g: +m[2],
      b: +m[3],
      a: m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4],
    };
  }
  m = v.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    return {
      r: +m[1] * 255,
      g: +m[2] * 255,
      b: +m[3] * 255,
      a: m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4],
    };
  }
  return null;
}

export function toHex({ r, g, b }: Rgba): string {
  const c = (x: number) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const lin = (x: number) => {
  const v = x / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(c: Rgba): number {
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Alpha-composites `top` over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

export function toOklab(c: Rgba): [number, number, number] {
  const r = lin(c.r);
  const g = lin(c.g);
  const b = lin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function toOklch(c: Rgba): Oklch {
  const [l, a, b] = toOklab(c);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

/** Perceptual distance in OKLab, scaled so ~2 is barely noticeable and ~4 is a clear difference. */
export function deltaE(a: Rgba, b: Rgba): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

const HUES: [number, string][] = [
  [20, "pink-red"],
  [40, "red"],
  [70, "orange"],
  [100, "amber"],
  [115, "yellow"],
  [135, "lime"],
  [165, "green"],
  [190, "teal"],
  [225, "cyan"],
  [265, "blue"],
  [290, "indigo"],
  [320, "purple"],
  [350, "magenta"],
  [360, "pink-red"],
];

function hueName(h: number): string {
  for (const [limit, name] of HUES) if (h < limit) return name;
  return "red";
}

function lightnessWord(l: number): string {
  if (l < 0.22) return "near-black";
  if (l < 0.35) return "very dark";
  if (l < 0.5) return "dark";
  if (l < 0.65) return "medium";
  if (l < 0.8) return "light";
  if (l < 0.93) return "very light";
  return "near-white";
}

/** English name for a colour, e.g. "near-white", "dark gray", "vivid medium blue", "muted dark teal". */
export function colorName(c: Rgba): string {
  const { l, c: chroma, h } = toOklch(c);
  const light = lightnessWord(l);
  if (chroma < 0.02) {
    if (light === "near-black" || light === "near-white") return light;
    return `${light} gray`;
  }
  const hue = hueName(h);
  if (chroma < 0.05) {
    const temp = h > 30 && h < 120 ? "warm" : h > 180 && h < 300 ? "cool" : "tinted";
    return `${light} ${temp} gray (${hue} tint)`;
  }
  const sat = chroma < 0.1 ? "muted" : chroma < 0.17 ? "" : "vivid";
  const lightPart = light === "near-black" ? "very dark" : light === "near-white" ? "pale" : light;
  return [sat, lightPart, hue].filter(Boolean).join(" ");
}

export function isChromatic(c: Rgba, threshold = 0.06): boolean {
  return toOklch(c).c >= threshold;
}
