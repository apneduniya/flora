export interface FontPair {
  id: string;
  name: string;
  description: string;
  body: string; // CSS font-family stack
  heading: string;
  /** Google Fonts css2 family params; empty for keep_original. */
  google: string[];
}

export const FONT_PAIRS: FontPair[] = [
  {
    id: "inter",
    name: "Inter",
    description: "Clean modern sans-serif for everything; neutral, professional, very readable on screens",
    body: '"Inter", system-ui, sans-serif',
    heading: '"Inter", system-ui, sans-serif',
    google: ["Inter:wght@400;600;700"],
  },
  {
    id: "source_serif_sans",
    name: "Source Serif + Source Sans",
    description: "Bookish serif body text with a matching sans for headings; calm long-form reading",
    body: '"Source Serif 4", Georgia, serif',
    heading: '"Source Sans 3", system-ui, sans-serif',
    google: ["Source+Serif+4:wght@400;600", "Source+Sans+3:wght@600;700"],
  },
  {
    id: "merriweather_open_sans",
    name: "Merriweather + Open Sans",
    description: "Sturdy newspaper-style serif headings with friendly sans body text; editorial and warm",
    body: '"Open Sans", system-ui, sans-serif',
    heading: '"Merriweather", Georgia, serif',
    google: ["Merriweather:wght@700", "Open+Sans:wght@400;600"],
  },
  {
    id: "playfair_lato",
    name: "Playfair + Lato",
    description: "Elegant high-contrast display serif headings with light sans body; stylish, magazine, luxury",
    body: '"Lato", system-ui, sans-serif',
    heading: '"Playfair Display", Georgia, serif',
    google: ["Playfair+Display:wght@600;700", "Lato:wght@400;700"],
  },
  {
    id: "ibm_plex",
    name: "IBM Plex Sans + Mono",
    description: "Technical engineered sans with monospace headings; developer, terminal, retro-computer feel",
    body: '"IBM Plex Sans", system-ui, sans-serif',
    heading: '"IBM Plex Mono", ui-monospace, monospace',
    google: ["IBM+Plex+Sans:wght@400;600", "IBM+Plex+Mono:wght@500;600"],
  },
  {
    id: "atkinson",
    name: "Atkinson Hyperlegible",
    description: "Font designed for low-vision readers; maximum legibility and clearly distinct letters; accessibility",
    body: '"Atkinson Hyperlegible", system-ui, sans-serif',
    heading: '"Atkinson Hyperlegible", system-ui, sans-serif',
    google: ["Atkinson+Hyperlegible:wght@400;700"],
  },
  {
    id: "nunito",
    name: "Nunito",
    description: "Rounded friendly sans-serif; soft, playful, cheerful, approachable",
    body: '"Nunito", system-ui, sans-serif',
    heading: '"Nunito", system-ui, sans-serif',
    google: ["Nunito:wght@400;700;800"],
  },
  {
    id: "space_grotesk_inter",
    name: "Space Grotesk + Inter",
    description: "Quirky geometric headings with clean body text; modern startup, bold, futuristic",
    body: '"Inter", system-ui, sans-serif',
    heading: '"Space Grotesk", system-ui, sans-serif',
    google: ["Space+Grotesk:wght@500;700", "Inter:wght@400;600"],
  },
];

export const FONT_BY_ID = new Map(FONT_PAIRS.map((f) => [f.id, f]));

export function describeFont(f: FontPair): string {
  return `${f.name}: ${f.description}`;
}
