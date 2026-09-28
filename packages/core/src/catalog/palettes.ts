import { colorName, parseHex } from "../extract/colorNames";
import type { ColorRole } from "../types";

export type Mood =
  | "calm"
  | "warm"
  | "cool"
  | "playful"
  | "corporate"
  | "retro"
  | "nature"
  | "minimal"
  | "neon"
  | "sepia"
  | "reading"
  | "cozy"
  | "dramatic"
  | "creative"
  | "fresh"
  | "accessible";

export interface Palette {
  id: string;
  name: string;
  description: string;
  tags: {
    mode: "light" | "dark";
    contrast: "normal" | "high";
    temperature: "warm" | "cool" | "neutral";
    moods: Mood[];
  };
  colors: Record<ColorRole, string>;
}

type Row = [
  id: string,
  name: string,
  description: string,
  mode: "light" | "dark",
  contrast: "normal" | "high",
  temperature: "warm" | "cool" | "neutral",
  moods: Mood[],
  // bg, surface, text, muted, accent, accentText, border, link
  colors: [string, string, string, string, string, string, string, string],
];

const ROWS: Row[] = [
  // ---- dark ----
  ["midnight", "Midnight", "Plain neutral dark mode, easy on the eyes at night", "dark", "normal", "neutral", ["minimal", "calm"],
    ["#121212", "#1e1e1e", "#e8e8e8", "#a8a8a8", "#8ab4f8", "#0b1a33", "#333333", "#8ab4f8"]],
  ["slate_night", "Slate night", "Professional dark blue-gray, like a modern developer dashboard", "dark", "normal", "cool", ["corporate", "cool"],
    ["#0f172a", "#1e293b", "#e2e8f0", "#94a3b8", "#38bdf8", "#06202e", "#334155", "#7dd3fc"]],
  ["graphite_amber", "Graphite amber", "Warm charcoal dark mode with amber highlights", "dark", "normal", "warm", ["warm", "cozy"],
    ["#1c1917", "#292524", "#f5f5f4", "#a8a29e", "#f59e0b", "#1c1300", "#44403c", "#fbbf24"]],
  ["forest_night", "Forest night", "Deep green dark mode that feels like a forest at dusk", "dark", "normal", "cool", ["nature", "calm"],
    ["#0f1a14", "#18261d", "#e3efe6", "#9fb5a6", "#4ade80", "#062612", "#2a3d31", "#86efac"]],
  ["ocean_deep", "Ocean deep", "Deep navy dark mode with sea-blue accents", "dark", "normal", "cool", ["cool", "calm"],
    ["#0a1929", "#132f4c", "#e7f0fa", "#9fb3c8", "#5090d3", "#061526", "#1e3a5f", "#66b2ff"]],
  ["plum_velvet", "Plum velvet", "Dark purple mode with lilac accents, creative and moody", "dark", "normal", "cool", ["creative", "dramatic"],
    ["#1e1b2e", "#2a2640", "#f0ecff", "#b3abd1", "#c084fc", "#1a0833", "#3d3757", "#d8b4fe"]],
  ["nord_dark", "Nord dark", "Muted arctic blue-gray dark mode, soft and calm", "dark", "normal", "cool", ["calm", "cool", "minimal"],
    ["#2e3440", "#3b4252", "#eceff4", "#b6bdc9", "#88c0d0", "#1f2a33", "#4c566a", "#8fbcbb"]],
  ["solarized_dark", "Solarized dark", "Classic teal-black programmer theme with gold and cyan", "dark", "normal", "cool", ["retro", "calm"],
    ["#002b36", "#073642", "#e3e0d3", "#93a1a1", "#b58900", "#001f27", "#0e4a58", "#35c2b6"]],
  ["neon_cyber", "Neon cyber", "Near-black cyberpunk mode with hot pink and electric cyan", "dark", "normal", "cool", ["neon", "playful", "dramatic"],
    ["#0b0b14", "#151528", "#f2f2ff", "#a9a9d6", "#ff2e97", "#14000a", "#2a2a4a", "#3ef0ff"]],
  ["synthwave", "Synthwave", "Eighties retro purple night with pink and cyan neon", "dark", "normal", "cool", ["neon", "retro", "playful"],
    ["#1a1033", "#261a47", "#fbeaff", "#c7b3e6", "#ff7edb", "#2a0020", "#3e2c6b", "#72f1ff"]],
  ["coffee_dark", "Coffee dark", "Cozy espresso-brown dark mode with caramel accents", "dark", "normal", "warm", ["cozy", "warm"],
    ["#1f1a17", "#2b2420", "#f3e9dc", "#bfae9c", "#d4a373", "#2a1a0c", "#43372f", "#e6b98a"]],
  ["oled_black", "OLED black", "Pure black minimal dark mode for OLED screens", "dark", "normal", "neutral", ["minimal"],
    ["#000000", "#0d0d0d", "#f5f5f5", "#a3a3a3", "#e5e5e5", "#000000", "#262626", "#93c5fd"]],
  ["crimson_night", "Crimson night", "Dramatic dark mode with deep red tones", "dark", "normal", "warm", ["dramatic", "warm"],
    ["#1a0f12", "#26161b", "#f7e8ea", "#c2a3aa", "#f87171", "#2a0505", "#3d242b", "#fca5a5"]],
  ["teal_dusk", "Teal dusk", "Calm dark teal mode with aqua accents", "dark", "normal", "cool", ["calm", "nature", "cool"],
    ["#0d1f22", "#14302f", "#e0f2f1", "#9cc5c1", "#2dd4bf", "#042f2a", "#1f4744", "#5eead4"]],
  ["dim_reader", "Dim reader", "Soft low-glare dark gray for long reading sessions", "dark", "normal", "neutral", ["calm", "reading"],
    ["#22252a", "#2c3036", "#d7dae0", "#9aa0a8", "#7aa2f7", "#0f1830", "#3a3f46", "#9ab8f9"]],
  ["terminal_green", "Terminal green", "Retro hacker terminal: black with phosphor green text", "dark", "normal", "cool", ["retro", "neon"],
    ["#0c0f0a", "#141a12", "#c8f7c5", "#8fbf8a", "#39ff14", "#031400", "#243322", "#7dff6a"]],
  // ---- dark, high contrast ----
  ["hc_black_yellow", "High contrast black and yellow", "Maximum contrast for low vision: black background, white text, yellow highlights", "dark", "high", "neutral", ["accessible"],
    ["#000000", "#0a0a0a", "#ffffff", "#e0e0e0", "#ffd400", "#000000", "#ffffff", "#ffe45c"]],
  ["hc_black_cyan", "High contrast black and cyan", "Maximum contrast for low vision: black background, white text, cyan highlights", "dark", "high", "cool", ["accessible"],
    ["#000000", "#0b0b0b", "#ffffff", "#d6d6d6", "#00e5ff", "#000000", "#ffffff", "#7df9ff"]],
  // ---- light ----
  ["paper_white", "Paper white", "Clean bright minimal light theme with blue links", "light", "normal", "neutral", ["minimal", "corporate"],
    ["#ffffff", "#f6f7f9", "#1a1a1a", "#5c6370", "#2563eb", "#ffffff", "#e2e5ea", "#1d4ed8"]],
  ["sepia_reading", "Sepia reading", "Warm sepia paper for comfortable long-form reading", "light", "normal", "warm", ["sepia", "reading", "warm", "calm"],
    ["#f4ecd8", "#ece0c4", "#3b2f1e", "#6b5a41", "#a0522d", "#ffffff", "#d8c9a6", "#8b4513"]],
  ["cream_warm", "Cream warm", "Soft cream light theme with burnt-orange accents", "light", "normal", "warm", ["warm", "cozy"],
    ["#fdf8f0", "#f6ecdc", "#2d2418", "#6e5f4b", "#c2410c", "#ffffff", "#eadcc4", "#9a3412"]],
  ["calm_blue", "Calm blue", "Gentle pale-blue light theme, quiet and easy to read", "light", "normal", "cool", ["calm", "cool", "reading"],
    ["#f5f8fc", "#e9f0f8", "#1f2a37", "#536273", "#3b6fb6", "#ffffff", "#d3deeb", "#2f5d9e"]],
  ["mint_fresh", "Mint fresh", "Fresh pale-mint light theme with green accents", "light", "normal", "cool", ["fresh", "nature"],
    ["#f3fbf7", "#e3f5ec", "#15302a", "#4a6b60", "#0b7a53", "#ffffff", "#c9e8d8", "#0b6b49"]],
  ["lavender_mist", "Lavender mist", "Soft lavender light theme with violet accents", "light", "normal", "cool", ["calm", "creative"],
    ["#f8f5fd", "#efe8fa", "#2a2140", "#625780", "#7c3aed", "#ffffff", "#ddd2f2", "#6d28d9"]],
  ["candy_pop", "Candy pop", "Playful pink bubblegum light theme", "light", "normal", "warm", ["playful", "creative"],
    ["#fff7fb", "#ffe8f3", "#2b1330", "#6b4a70", "#c2187a", "#ffffff", "#f7cfe3", "#a3136a"]],
  ["sunny_day", "Sunny day", "Cheerful butter-yellow light theme with bright orange", "light", "normal", "warm", ["playful", "warm", "fresh"],
    ["#fffbea", "#fff1c2", "#2b2200", "#6b5a1e", "#c2410c", "#ffffff", "#f3e3a0", "#b8390a"]],
  ["ocean_light", "Ocean light", "Airy sky-blue light theme with deep sea-blue links", "light", "normal", "cool", ["cool", "fresh"],
    ["#f0f9ff", "#e0f2fe", "#0c2a3e", "#3f6178", "#0369a1", "#ffffff", "#bae6fd", "#075985"]],
  ["corporate_gray", "Corporate gray", "Neutral business light theme, like a productivity suite", "light", "normal", "neutral", ["corporate", "minimal"],
    ["#fafafa", "#f0f1f3", "#202124", "#5f6368", "#1967d2", "#ffffff", "#dadce0", "#1558b0"]],
  ["newsprint", "Newsprint", "Classic newspaper: off-white paper, black ink, red headlines", "light", "normal", "neutral", ["retro", "reading"],
    ["#f7f5f0", "#eeebe3", "#1b1b1b", "#555149", "#b91c1c", "#ffffff", "#d9d4c7", "#8f1414"]],
  ["sage_garden", "Sage garden", "Muted sage-green light theme, natural and calm", "light", "normal", "neutral", ["nature", "calm"],
    ["#f4f6f0", "#e7ecdf", "#232b1e", "#57624c", "#4d7c0f", "#ffffff", "#cfd8c1", "#3f6212"]],
  ["retro_70s", "Retro seventies", "Seventies retro: warm beige, brown and rust orange", "light", "normal", "warm", ["retro", "warm"],
    ["#fbf1e1", "#f3dfc1", "#3a1f0f", "#6f4a2c", "#b84a17", "#ffffff", "#e5c89c", "#9c3f12"]],
  ["nordic_snow", "Nordic snow", "Cool Scandinavian light gray-blue, minimal and quiet", "light", "normal", "cool", ["minimal", "calm", "cool"],
    ["#eceff4", "#e5e9f0", "#2e3440", "#4c566a", "#4c6f9c", "#ffffff", "#d8dee9", "#3b5f8c"]],
  ["rose_soft", "Rose soft", "Soft blush-pink light theme with deep rose accents", "light", "normal", "warm", ["warm", "playful"],
    ["#fff5f5", "#ffe4e6", "#3b1219", "#7a4450", "#be123c", "#ffffff", "#fecdd3", "#9f1239"]],
  ["mono_ink", "Mono ink", "Strict black-and-white monochrome, no colour at all", "light", "normal", "neutral", ["minimal"],
    ["#ffffff", "#f4f4f4", "#111111", "#595959", "#111111", "#ffffff", "#e0e0e0", "#111111"]],
  ["solarized_light", "Solarized light", "Classic warm-cream programmer theme with teal links", "light", "normal", "warm", ["retro", "calm"],
    ["#fdf6e3", "#eee8d5", "#073642", "#4f636a", "#b08400", "#000000", "#e0d8bd", "#1f6f8b"]],
  ["citrus_splash", "Citrus splash", "Zesty lime-tinted light theme with green and violet", "light", "normal", "warm", ["playful", "fresh"],
    ["#fbfff0", "#f0fad2", "#1f2a00", "#55612c", "#4a7300", "#ffffff", "#dbeaa8", "#6d28d9"]],
  ["rainbow_pop", "Rainbow pop", "Bright colourful light theme with magenta and indigo", "light", "normal", "neutral", ["playful", "creative"],
    ["#ffffff", "#f3f0ff", "#1e1b4b", "#4c4a7a", "#be185d", "#ffffff", "#e0dcff", "#4f46e5"]],
  ["earth_clay", "Earth clay", "Earthy terracotta light theme, warm and grounded", "light", "normal", "warm", ["nature", "warm", "cozy"],
    ["#f6efe9", "#ecdfd4", "#33241b", "#6a5244", "#9c4a2f", "#ffffff", "#dcc6b5", "#7f3a22"]],
  // ---- light, high contrast ----
  ["hc_white_black", "High contrast white and black", "Maximum contrast for low vision: white background, black text, blue links", "light", "high", "neutral", ["accessible"],
    ["#ffffff", "#f2f2f2", "#000000", "#1f1f1f", "#0000cc", "#ffffff", "#000000", "#0000ee"]],
  ["hc_cream_navy", "High contrast cream and navy", "High contrast warm reading: cream background, black text, navy links", "light", "high", "warm", ["accessible", "reading"],
    ["#fffdf5", "#f5f0dc", "#000000", "#1a1a1a", "#002c8a", "#ffffff", "#1a1a1a", "#00237a"]],
];

const ROLE_ORDER: ColorRole[] = ["bg", "surface", "text", "muted", "accent", "accentText", "border", "link"];

export const PALETTES: Palette[] = ROWS.map(([id, name, description, mode, contrast, temperature, moods, colors]) => ({
  id,
  name,
  description,
  tags: { mode, contrast, temperature, moods },
  colors: Object.fromEntries(ROLE_ORDER.map((r, i) => [r, colors[i]])) as Record<ColorRole, string>,
}));

export const PALETTE_BY_ID = new Map(PALETTES.map((p) => [p.id, p]));

/** Literal English description of a palette, used as Jev Choice criteria. */
export function describePalette(p: Palette): string {
  const n = (role: ColorRole) => colorName(parseHex(p.colors[role]));
  return (
    `${p.name}: ${p.description}. ${p.tags.mode === "dark" ? "Dark" : "Light"} mode` +
    `${p.tags.contrast === "high" ? ", maximum contrast" : ""}; ${n("bg")} background, ${n("text")} text, ` +
    `${n("accent")} accents, ${n("link")} links. Mood: ${p.tags.moods.join(", ")}.`
  );
}
