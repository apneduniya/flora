import type { Mood, PickAction } from "@flora/core";

/** What the chosen palette must satisfy for a prompt to count as "semantically right". */
export interface Expect {
  mode?: "light" | "dark";
  contrast?: "normal" | "high";
  temperature?: ("warm" | "cool" | "neutral")[];
  moodsAny?: Mood[];
}

export interface Prompt {
  id: string;
  text: string;
  expect: Expect;
}

export interface PickTask {
  id: string;
  text: string;
  action: PickAction;
  /** true when the target does not exist on the page (the right answer is none_of_these). */
  negative?: boolean;
}

export interface Site {
  id: string;
  url: string;
  category: string;
  backup?: boolean;
  prompt: Prompt; // site-specific 6th prompt
  picks: PickTask[];
}

export const STANDARD_PROMPTS: Prompt[] = [
  { id: "dark", text: "dark mode", expect: { mode: "dark" } },
  { id: "calm", text: "make it calm and easy to read", expect: { contrast: "normal", moodsAny: ["calm", "reading", "minimal"] } },
  { id: "hc", text: "high contrast for low vision", expect: { contrast: "high" } },
  { id: "sepia", text: "warm sepia reading mode", expect: { mode: "light", temperature: ["warm"], moodsAny: ["sepia", "reading"] } },
  { id: "playful", text: "playful and colourful", expect: { moodsAny: ["playful", "neon", "creative"] } },
];

const p = (id: string, text: string, action: PickAction, negative = false): PickTask => ({ id, text, action, negative });

export const SITES: Site[] = [
  // Docs and reference
  { id: "wikipedia", url: "https://en.wikipedia.org/wiki/Coffee", category: "encyclopedia article",
    prompt: { id: "site", text: "make it look like an old printed encyclopedia", expect: { mode: "light", moodsAny: ["retro", "reading", "sepia"] } },
    picks: [p("sidebar", "hide the Appearance panel on the right", "hide"), p("toc", "hide the table of contents", "hide"), p("video", "hide the video player", "hide", true)] },
  { id: "mdn", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/color", category: "developer documentation",
    prompt: { id: "site", text: "retro terminal theme, green on black", expect: { mode: "dark", moodsAny: ["retro", "neon"] } },
    picks: [p("sidebar", "hide the left sidebar", "hide"), p("header", "make the header sticky", "make_sticky"), p("cart", "hide the shopping cart", "hide", true)] },
  { id: "stackoverflow", url: "https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array", category: "Q&A forum",
    prompt: { id: "site", text: "cozy dark theme with warm colours", expect: { mode: "dark", temperature: ["warm"] } },
    picks: [p("right", "hide the right sidebar", "hide"), p("cookie", "hide the cookie banner", "hide"), p("comments", "make the question text bigger", "enlarge")] },
  { id: "github", url: "https://github.com/microsoft/playwright", category: "code repository",
    prompt: { id: "site", text: "cyberpunk neon look", expect: { mode: "dark", moodsAny: ["neon"] } },
    picks: [p("about", "hide the About sidebar on the right", "hide"), p("header", "hide the top navigation bar", "hide"), p("ads", "hide the ads", "hide", true)] },
  { id: "devto", url: "https://dev.to/", category: "developer blog feed",
    prompt: { id: "site", text: "minimal black and white, no colour", expect: { moodsAny: ["minimal"] } },
    picks: [p("left", "hide the left sidebar", "hide"), p("right", "hide the right sidebar", "hide"), p("header", "make the header sticky", "make_sticky")] },
  // News
  { id: "bbc", url: "https://www.bbc.com/news", category: "news homepage",
    prompt: { id: "site", text: "calm newspaper look for reading", expect: { mode: "light", moodsAny: ["reading", "retro", "calm"] } },
    picks: [p("nav", "hide the section menu", "hide"), p("footer", "hide the footer", "hide"), p("sidebar", "hide the left sidebar", "hide", true)] },
  { id: "guardian", url: "https://www.theguardian.com/international", category: "news homepage",
    prompt: { id: "site", text: "dark mode but keep it warm", expect: { mode: "dark", temperature: ["warm"] } },
    picks: [p("header", "hide the big header", "hide"), p("consent", "hide the cookie consent pop-up", "hide"), p("footer", "hide the footer", "hide")] },
  { id: "toi", url: "https://timesofindia.indiatimes.com/", category: "news homepage",
    prompt: { id: "site", text: "clean and minimal, less clutter", expect: { moodsAny: ["minimal", "calm"] } },
    picks: [p("ads", "hide the ads", "hide"), p("header", "hide the top header", "hide"), p("footer", "hide the footer", "hide")] },
  { id: "hn", url: "https://news.ycombinator.com/", category: "link aggregator",
    prompt: { id: "site", text: "cozy warm dark theme", expect: { mode: "dark", temperature: ["warm"] } },
    picks: [p("header", "hide the orange top bar", "hide"), p("footer", "hide the footer links", "hide"), p("sidebar", "hide the sidebar", "hide", true)] },
  { id: "espn", url: "https://www.espn.com/", category: "sports news",
    prompt: { id: "site", text: "sporty bold dark theme", expect: { mode: "dark" } },
    picks: [p("header", "make the header sticky", "make_sticky"), p("right", "hide the right column", "hide"), p("cookie", "hide the cookie banner", "hide")] },
  // Community and media
  { id: "theverge", url: "https://www.theverge.com/", category: "tech news magazine",
    prompt: { id: "site", text: "neon night mode", expect: { mode: "dark", moodsAny: ["neon"] } },
    picks: [p("header", "hide the header", "hide"), p("consent", "hide the cookie consent banner", "hide"), p("footer", "hide the footer", "hide")] },
  { id: "youtube", url: "https://www.youtube.com/", category: "video platform",
    prompt: { id: "site", text: "cinema dark mode, pure black", expect: { mode: "dark", moodsAny: ["minimal", "dramatic"] } },
    picks: [p("guide", "hide the left menu", "hide"), p("header", "hide the top search bar", "hide"), p("comments", "hide the comments", "hide", true)] },
  { id: "bbcfood", url: "https://www.bbc.co.uk/food", category: "recipe site",
    prompt: { id: "site", text: "warm kitchen colours", expect: { temperature: ["warm"] } },
    picks: [p("header", "hide the BBC top bar", "hide"), p("footer", "hide the footer", "hide"), p("scores", "hide the sports scores", "hide", true)] },
  { id: "wired", url: "https://www.wired.com/", category: "tech news magazine",
    prompt: { id: "site", text: "retro computer terminal", expect: { mode: "dark", moodsAny: ["retro"] } },
    picks: [p("header", "make the header sticky", "make_sticky"), p("footer", "hide the footer", "hide"), p("cart", "hide the shopping cart", "hide", true)] },
  // Commerce and brand
  { id: "amazonin", url: "https://www.amazon.in/", category: "online shop homepage",
    prompt: { id: "site", text: "simple calm shopping, less visual noise", expect: { moodsAny: ["calm", "minimal"] } },
    picks: [p("nav", "hide the top navigation", "hide"), p("footer", "hide the footer", "hide"), p("comments", "hide the comments section", "hide", true)] },
  { id: "flipkart", url: "https://www.flipkart.com/", category: "online marketplace",
    prompt: { id: "site", text: "fresh and bright colours", expect: { mode: "light", moodsAny: ["fresh", "playful"] } },
    picks: [p("header", "hide the header", "hide"), p("footer", "hide the footer", "hide"), p("comments", "hide the comments", "hide", true)] },
  { id: "stripe", url: "https://stripe.com/", category: "company marketing site",
    prompt: { id: "site", text: "corporate and serious", expect: { moodsAny: ["corporate", "minimal"] } },
    picks: [p("nav", "make the navigation bar sticky", "make_sticky"), p("footer", "hide the footer", "hide"), p("comments", "hide the comments", "hide", true)] },
  { id: "apple", url: "https://www.apple.com/", category: "company marketing site",
    prompt: { id: "site", text: "dark and dramatic", expect: { mode: "dark", moodsAny: ["dramatic"] } },
    picks: [p("nav", "hide the top menu bar", "hide"), p("footer", "hide the footer", "hide"), p("sidebar", "hide the sidebar", "hide", true)] },
  { id: "notion", url: "https://www.notion.com/", category: "company marketing site",
    prompt: { id: "site", text: "nature-inspired greens", expect: { moodsAny: ["nature"] } },
    picks: [p("nav", "hide the top navigation", "hide"), p("footer", "hide the footer", "hide"), p("cookie", "hide the cookie banner", "hide")] },
  { id: "booking", url: "https://www.booking.com/", category: "travel booking site",
    prompt: { id: "site", text: "relaxing ocean vacation colours", expect: { moodsAny: ["cool", "calm", "fresh"] } },
    picks: [p("header", "hide the blue header", "hide"), p("footer", "hide the footer", "hide"), p("popup", "hide the sign-in pop-up", "hide")] },
  // Backups (recon 2026-09-28: reddit, imdb, medium, amazon.com/dp, ebay, allrecipes, arstechnica blocked automated browsers)
  { id: "npr", url: "https://www.npr.org/", category: "news homepage", backup: true,
    prompt: { id: "site", text: "calm reading mode", expect: { moodsAny: ["calm", "reading"] } },
    picks: [p("header", "hide the header", "hide"), p("footer", "hide the footer", "hide"), p("video", "hide the video player", "hide", true)] },
  { id: "pydocs", url: "https://docs.python.org/3/tutorial/index.html", category: "developer documentation", backup: true,
    prompt: { id: "site", text: "developer dark theme", expect: { mode: "dark" } },
    picks: [p("sidebar", "hide the sidebar", "hide"), p("header", "hide the top navigation bar", "hide"), p("cart", "hide the shopping cart", "hide", true)] },
  { id: "nasa", url: "https://www.nasa.gov/", category: "agency homepage", backup: true,
    prompt: { id: "site", text: "deep space dark theme", expect: { mode: "dark" } },
    picks: [p("header", "hide the header", "hide"), p("footer", "hide the footer", "hide"), p("sidebar", "hide the left sidebar", "hide", true)] },
  { id: "w3schools", url: "https://www.w3schools.com/css/", category: "developer tutorial", backup: true,
    prompt: { id: "site", text: "calm dark theme for coding", expect: { mode: "dark" } },
    picks: [p("sidebar", "hide the left sidebar", "hide"), p("right", "hide the right column", "hide"), p("header", "hide the top bar", "hide")] },
  { id: "nytimes", url: "https://www.nytimes.com/", category: "news homepage", backup: true,
    prompt: { id: "site", text: "old newspaper look", expect: { mode: "light", moodsAny: ["retro", "reading"] } },
    picks: [p("header", "hide the masthead", "hide"), p("footer", "hide the footer", "hide"), p("sidebar", "hide the left sidebar", "hide", true)] },
];

/** The 20 sites the spike measures, after recon swaps any broken ones for backups (see data/sites.lock.json). */
export function activeSites(lock?: string[]): Site[] {
  if (lock?.length) return lock.map((id) => SITES.find((s) => s.id === id)!).filter(Boolean);
  return SITES.filter((s) => !s.backup);
}

export function promptsFor(site: Site): Prompt[] {
  return [...STANDARD_PROMPTS, site.prompt];
}

export function matchesExpect(tags: { mode: string; contrast: string; temperature: string; moods: string[] }, e: Expect): boolean {
  if (e.mode && tags.mode !== e.mode) return false;
  if (e.contrast && tags.contrast !== e.contrast) return false;
  if (e.temperature && !e.temperature.includes(tags.temperature as never)) return false;
  if (e.moodsAny && !e.moodsAny.some((m) => tags.moods.includes(m))) return false;
  return true;
}
