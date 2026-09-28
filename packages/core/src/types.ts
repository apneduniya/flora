export type ColorRole =
  | "bg"
  | "surface"
  | "text"
  | "muted"
  | "accent"
  | "accentText"
  | "border"
  | "link";

export type ColorProperty = "bg" | "fg" | "border";

export interface ColorCluster {
  id: string; // "k0", "k1", ...
  hex: string;
  name: string; // English, sent to Jev
  lightness: number; // OKLCH L
  chroma: number;
  hue: number;
  bgArea: number; // px² of visible background using this colour
  textWeight: number; // characters of text drawn in this colour
  borderWeight: number;
  linkWeight: number; // text/bg usage on links and buttons
}

export interface CssVarColor {
  name: string; // "--color-bg"
  hex: string;
  clusterId: string | null;
  role: ColorRole | null;
}

export type Density = "compact" | "default" | "comfortable" | "spacious";
export type RadiusStyle = "sharp" | "soft" | "round";

export interface DesignTokens {
  url: string;
  title: string;
  scheme: "light" | "dark";
  clusters: ColorCluster[];
  /** Cluster id per headline role; null if the page doesn't use that role. */
  roles: Record<"bg" | "surface" | "text" | "muted" | "accent" | "border", string | null>;
  cssVars: CssVarColor[];
  fonts: { body: string; heading: string };
  typography: { baseSizePx: number; lineHeightRatio: number };
  radius: { dominantPx: number; style: RadiusStyle };
  density: Density;
  /** English description of the current design; this is the state Jev sees. */
  summary: string;
  stats: { elementsScanned: number; pageArea: number; ms: number };
}

export interface RestylePicks {
  palette: string; // palette id or "keep_original"
  paletteTop: { id: string; p: number }[];
  paletteConfidence: number;
  font: string; // font id or "keep_original"
  fontTop: { id: string; p: number }[];
  fontConfidence: number;
  density: Density;
  densityScore: number;
  radius: "keep" | RadiusStyle;
  accentStrength: number; // 0 (subtle) .. 2 (bold)
  readingMode: number; // probability
  outOfCatalog: number; // probability
  /** Keep photos looking like photos: no darkening blend modes, white backing tiles. */
  protectImages?: boolean;
}

export interface Candidate {
  id: string; // "c12"
  selector: string;
  description: string;
  region: Region;
  rect: { x: number; y: number; w: number; h: number };
}

export type Region = "header" | "nav" | "left" | "main" | "right" | "footer" | "overlay";

export type PickAction = "hide" | "restyle" | "make_sticky" | "enlarge" | "shrink" | "move" | "none";
