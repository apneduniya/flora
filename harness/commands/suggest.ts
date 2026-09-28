import { buildSuggestionPool, buildSuggestRequest, pickSuggestions, type DesignTokens, type PageFacts } from "@flora/core";
import { join } from "node:path";
import type { Args } from "../lib/args";
import { launch, openSite } from "../lib/browser";
import { extractCandidates } from "../lib/flora";
import { readJson, writeJson } from "../lib/io";
import { harnessJev } from "../lib/jev";
import { REPORT_DIR, siteDir } from "../lib/paths";

/** Site-aware suggestions for each snapshot: code builds the ideas, one Jev call ranks them. */
export async function run(a: Args) {
  const jev = harnessJev();
  const { browser, context } = await launch();
  const all: Record<string, unknown> = {};
  for (const site of a.sites()) {
    const page = await context.newPage();
    await openSite(page, site, a.live);
    const tokens = readJson<DesignTokens>(siteDir(site.id, "tokens.json"));
    const cands = await extractCandidates(page);
    const facts = (await page.evaluate(() => window.__flora.gatherPageFacts())) as PageFacts;
    facts.host = new URL(site.url).hostname; // replay pages report file:// hosts
    const pool = buildSuggestionPool(tokens, cands);
    const res = await jev.decide(buildSuggestRequest(facts, tokens, pool));
    const picked = pickSuggestions(pool, res);
    all[site.id] = { picked, detectedHides: pool.filter((p) => p.kind === "hide").map((p) => p.text), latencyMs: res.latencyMs, inputTokens: res.usage.input_tokens };
    console.log(`▶ ${site.id} (${pool.length} ideas, ${res.usage.input_tokens} tok, ${res.latencyMs}ms)\n   ${picked.map((s) => `${s.kind === "hide" ? "🙈" : "🎨"} ${s.text} ${s.p?.toFixed(2)}`).join("\n   ")}`);
    await page.close();
  }
  await browser.close();
  writeJson(join(REPORT_DIR, "suggestions.json"), all);
}
