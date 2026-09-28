import { describe, expect, it } from "vitest";
import { buildSuggestionPool, buildSuggestRequest, detectHideIdeas, pickSuggestions } from "../src/jev/suggest";
import type { Candidate } from "../src/types";

const cand = (id: string, region: Candidate["region"], description: string, h = 600): Candidate => ({ id, selector: `#${id}`, region, description, rect: { x: 0, y: 0, w: 300, h } });

describe("suggestions", () => {
  it("only offers hides for parts detected on the page", () => {
    const ideas = detectHideIdeas([
      cand("a", "overlay", '<div>; named "onetrust banner"; floating on top of the page; text starts: "We use cookies"', 150),
      cand("b", "left", "<aside>; a column on the left side; many links", 900),
      cand("c", "main", "<div>; contains an embedded frame from securepubads.g.doubleclick.net", 250),
    ]).map((i) => i.id);
    expect(ideas).toEqual(expect.arrayContaining(["h_cookie", "h_left", "h_ads"]));
    expect(ideas).not.toContain("h_comments");
  });

  it("drops dark mode on an already-dark page", () => {
    const ids = buildSuggestionPool({ scheme: "dark" }, []).map((s) => s.id);
    expect(ids).not.toContain("dark");
    expect(ids).toContain("light");
  });

  it("asks one noul per idea in a single request", () => {
    const pool = buildSuggestionPool({ scheme: "light" }, []);
    const req = buildSuggestRequest({ host: "x.com", title: "t", description: "", words: "some text", video: false, shopping: false, code: false, images: "few images", headings: [] }, { summary: "light page" }, pool);
    expect(Object.keys(req.questions)).toHaveLength(pool.length);
    expect(Object.values(req.questions).every((q) => q.type === "noul")).toBe(true);
  });

  it("picks 1 universal + 2 themed with at most one dark look, then hides", () => {
    const pool = buildSuggestionPool({ scheme: "light" }, [cand("b", "left", "many links", 900)]);
    const noul = (v: number) => ({ type: "noul" as const, noul: v });
    const answers = Object.fromEntries(pool.map((s) => [s.id, noul(0.1)]));
    Object.assign(answers, { dark: noul(0.9), calm: noul(0.8), devdark: noul(0.95), terminal: noul(0.9), newspaper: noul(0.7), h_left: noul(0.6) });
    const picked = pickSuggestions(pool, { answers }).map((s) => s.id);
    expect(picked).toEqual(["calm", "devdark", "newspaper", "h_left"]);
  });
});
